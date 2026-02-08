import { z, ZodType } from 'zod';
import { AgentState } from '../graph.js';
import { LLMProviderFactory } from '../../services/llm/factory.js';
import * as SharedSchemas from '@ai-assistant/shared';
import { Citation } from '@ai-assistant/shared';
import { AuditLogger } from '../../services/AuditLogger.js';
import { mcpService } from '../../services/mcp.js';
import { PerimeterGuard } from '../../guards/PerimeterGuard.js';
import { ChatMistralAI } from '@langchain/mistralai';
import { createAgent } from 'langchain';
import { config } from '../../config/index.js';
import { tracingService } from '../../services/llm/tracing.js';

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
  const prompt = state.active_protocol_rules
    ? `SPECIFIC LEADERSHIP PROTOCOL RULES:\n${state.active_protocol_rules}\n\nTASK:\n${basePrompt}`
    : basePrompt;

  // Task 8: Update reasoningNode to support dynamic tool injection
  const taskPayload = task.payload as any;
  if (taskPayload.tools) {
    try {
      const guard = new PerimeterGuard();
      const rawTools = await mcpService.getLangChainTools(task.organization_id);
      const securedTools = rawTools.map(t => PerimeterGuard.wrapToolWithSecurity(t, guard));

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

      const step = AuditLogger.createStep('Agentic Reasoning', `Executed with ${securedTools.length} tools`, {
        input_summary: prompt.substring(0, 100) + '...',
        output_summary: output.substring(0, 100) + '...',
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
    
    const step = AuditLogger.createStep('LLM Reasoning', `Generated ${schemaKey || 'unstructured'} response`, {
      confidence_score: data?.confidence ?? 0.9,
      ambiguity_detected: data?.ambiguity_detected ?? false,
      input_summary: prompt.substring(0, 100) + '...',
      output_summary: JSON.stringify(result.data).substring(0, 100) + '...'
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
