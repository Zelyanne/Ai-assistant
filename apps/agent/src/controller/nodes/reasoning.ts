import { z, ZodType } from 'zod';
import { AgentState } from '../graph.js';
import * as SharedSchemas from '@ai-assistant/shared';
import { Citation } from '@ai-assistant/shared';
import { AuditLogger } from '../../services/AuditLogger.js';
import { mcpService } from '../../services/mcp.js';
import { PerimeterGuard } from '../../guards/PerimeterGuard.js';
import { ChatMistralAI } from '@langchain/mistralai';
import { createAgent } from 'langchain';
import { config } from '../../config/index.js';
import { tracingService } from '../../services/llm/tracing.js';
import { CONFIDENCE_THRESHOLD } from '../escalation.js';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// Strict filter: never allow side-effecting tools in the reasoning node.
// Confidence gating must happen BEFORE any side-effecting tool call.
function isReadOnlyToolName(name: string): boolean {
  const normalized = name.trim().toLowerCase();

  // Allowlist: common read-only verbs.
  if (
    normalized.startsWith('get_')
    || normalized.startsWith('list_')
    || normalized.startsWith('search_')
    || normalized.startsWith('fetch_')
    || normalized.startsWith('read_')
    || normalized.startsWith('lookup_')
  ) {
    return true;
  }

  // Denylist: common mutation verbs.
  if (
    normalized.startsWith('create_')
    || normalized.startsWith('send_')
    || normalized.startsWith('update_')
    || normalized.startsWith('delete_')
    || normalized.startsWith('remove_')
    || normalized.startsWith('archive_')
    || normalized.startsWith('cancel_')
    || normalized.startsWith('approve_')
    || normalized.startsWith('write_')
    || normalized.startsWith('post_')
    || normalized.startsWith('put_')
    || normalized.startsWith('patch_')
  ) {
    return false;
  }

  // Default-deny: if we can't classify it, treat as unsafe.
  return false;
}

const AgenticAssessmentSchema = z.object({
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  ambiguity_detected: z.boolean().default(false),
});

// Registry of available schemas for structured reasoning
const SCHEMA_REGISTRY: Record<string, ZodType> = {};

// Auto-register all shared schemas
Object.entries(SharedSchemas).forEach(([key, value]) => {
  if (key.endsWith('Schema') && value instanceof z.ZodType) {
    SCHEMA_REGISTRY[key] = value;
  }
});

// Add local-only schemas
SCHEMA_REGISTRY['default_analysis'] = z.object({
  summary: z.string(),
  key_points: z.array(z.string()),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  confidence: z.number().min(0).max(1),
  ambiguity_detected: z.boolean().default(false)
});

interface ReasoningResultData {
  confidence?: number;
  ambiguity_detected?: boolean;
  citations?: unknown[];
  [key: string]: unknown;
}

/**
 * Reasoning node: Executes LLM calls with structured output and logging.
 * This node is intended to be called as part of a task execution flow.
 */
export async function reasoningNode(state: AgentState): Promise<Partial<AgentState>> {
  if (state.error) return {};

  const { task } = state;
  const langfuseHandler = tracingService.getHandler();
  const callbacks = langfuseHandler ? [langfuseHandler] : [];
  
  // Extract prompt and schema key from payload
  const { prompt: basePrompt, schemaKey } = task.payload as { prompt?: string; schemaKey?: string };

  if (!basePrompt) {
    return { error: 'No prompt provided for reasoning node' };
  }

  // Incorporate active protocol rules if available (AC 4)
  let prompt = state.active_protocol_rules
    ? `SPECIFIC LEADERSHIP PROTOCOL RULES:\n${state.active_protocol_rules}\n\nTASK:\n${basePrompt}`
    : basePrompt;

  // Incorporate workspace context if available (AC 6.3)
  if (state.workspace_context_items && state.workspace_context_items.length > 0) {
    const contextLines = state.workspace_context_items.map(
      (item) => `--- DOCUMENT: ${item.reference.title || item.reference.file_id} ---\n${item.content}`
    );
    prompt = `WORKSPACE CONTEXT (READ-ONLY):\n${contextLines.join('\n\n')}\n\n${prompt}`;
  }

  // Task 8: Update reasoningNode to support dynamic tool injection
  const taskPayload = task.payload as any;
  if (taskPayload.tools) {
    try {
      const guard = new PerimeterGuard();
      const rawTools = await mcpService.getLangChainTools(task.organization_id);
      const safeTools = rawTools.filter((t) => isReadOnlyToolName(t.name));

      if (safeTools.length === 0) {
        const step = AuditLogger.createStep('Agentic Reasoning', 'Escalated: requested tools include unsafe mutations', {
          confidence_score: 0,
          confidence_threshold: CONFIDENCE_THRESHOLD,
          ambiguity_detected: true,
          input_summary: guard.redactPII(prompt.substring(0, 200) + '...'),
          output_summary: 'No safe tools available for reasoning node.',
        });

        return {
          result: {
            summary: 'Tool-enabled reasoning is unavailable for this request.',
            confidence: 0,
            ambiguity_detected: true,
          },
          trace: [step],
          citations: [],
        };
      }

      const securedTools = safeTools.map((t) => PerimeterGuard.wrapToolWithSecurity(t, guard));

      const llm = new ChatMistralAI({
        apiKey: config.MISTRAL_API_KEY,
        model: config.DEFAULT_LLM_MODEL,
        temperature: 0,
        callbacks,
      });

      const agent = createAgent({
        model: llm,
        tools: securedTools,
        systemPrompt: 'You are a reasoning node. Use the provided tools to fulfill the request.',
      });

      const result = await agent.invoke({
        messages: [{ role: 'user', content: prompt }],
      }, { callbacks });

      tracingService.handleSuccess();
      const output = String(result.messages?.at(-1)?.content || '');

      // Post-hoc confidence/ambiguity assessment (tools are filtered to read-only).
      const assessor = new ChatMistralAI({
        apiKey: config.MISTRAL_API_KEY,
        model: config.DEFAULT_LLM_MODEL,
        temperature: 0,
        callbacks,
      }).withStructuredOutput(AgenticAssessmentSchema, { name: 'agentic_assessment' });

      const assessmentResponse = await assessor.invoke(
        [
          'Assess the assistant output quality for human escalation gating.',
          'Return ONLY JSON matching this schema:',
          '{ summary: string, confidence: number (0..1), ambiguity_detected: boolean }',
          '',
          'Assistant output:',
          output,
        ].join('\n'),
      );

      const assessment = AgenticAssessmentSchema.parse(assessmentResponse);

      const step = AuditLogger.createStep('Agentic Reasoning', `Executed with ${securedTools.length} tools`, {
        confidence_score: clamp01(assessment.confidence),
        confidence_threshold: CONFIDENCE_THRESHOLD,
        ambiguity_detected: assessment.ambiguity_detected,
        input_summary: guard.redactPII(prompt.substring(0, 100) + '...'),
        output_summary: guard.redactPII(output.substring(0, 100) + '...'),
      });

      return {
        result: output,
        trace: [step],
        citations: []
      };
    } catch (err: any) {
      tracingService.handleFailure(err);
      console.error(`[ReasoningNode][Agentic] failed: ${err.message}`);
      return { error: `Agentic reasoning failed: ${err.message}` };
    }
  }

  try {
    let result;
    
    // Select schema: usage strategy
    // 1. If schemaKey provided, verify it exists in registry
    // 2. If no schemaKey, default to text generation (unstructured)
    
    if (schemaKey) {
      const targetSchema = SCHEMA_REGISTRY[schemaKey];
      if (!targetSchema) {
        throw new Error(`Requested schema '${schemaKey}' not found in registry`);
      }
      
      const structuredLlm = new ChatMistralAI({
        apiKey: config.MISTRAL_API_KEY,
        model: config.DEFAULT_LLM_MODEL,
        temperature: 0,
        callbacks,
      }).withStructuredOutput(targetSchema, { name: schemaKey });

      const response = await structuredLlm.invoke(prompt);
      tracingService.handleSuccess();
      await tracingService.flush();
      result = { data: response };
    } else {
      const llm = new ChatMistralAI({
        apiKey: config.MISTRAL_API_KEY,
        model: config.DEFAULT_LLM_MODEL,
        temperature: 0,
        callbacks,
      });
      const response = await llm.invoke(prompt);
      tracingService.handleSuccess();
      await tracingService.flush();
      result = { data: response.content };
    }

    const data = result.data as ReasoningResultData;
    // content is unknown, so we cast to unknown first then to the target type to satisfy the compiler
    const rawCitations = data?.citations || [];
    const citations = rawCitations as unknown as Citation[];
    
    const guard = new PerimeterGuard();
    const step = AuditLogger.createStep('LLM Reasoning', `Generated ${schemaKey || 'unstructured'} response`, {
      confidence_score: data?.confidence ?? 0.9,
      confidence_threshold: CONFIDENCE_THRESHOLD,
      ambiguity_detected: data?.ambiguity_detected ?? false,
      input_summary: guard.redactPII(prompt.substring(0, 100) + '...'),
      output_summary: guard.redactPII(JSON.stringify(result.data).substring(0, 100) + '...')
    });

    return {
      result: result.data,
      trace: [step],
      citations: citations
    };
  } catch (err: unknown) {
    tracingService.handleFailure(err);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ReasoningNode][${task.id}] failed: ${message}`);
    const errorStep = AuditLogger.createStep('LLM Reasoning', `Reasoning failed: ${message}`);
    return { 
      error: `Reasoning failed: ${message}`,
      trace: [errorStep]
    };
  }
}
