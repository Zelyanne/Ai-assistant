import { z, ZodType } from 'zod';
import { AgentState } from '../graph.js';
import { LLMProviderFactory } from '../../services/llm/factory.js';
import * as SharedSchemas from '@ai-assistant/shared';
import { Citation } from '@ai-assistant/shared';
import { AuditLogger } from '../../services/AuditLogger.js';

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
  const provider = LLMProviderFactory.getProvider();
  
  // Extract prompt and schema key from payload
  const { prompt: basePrompt, schemaKey } = task.payload as { prompt?: string; schemaKey?: string };

  if (!basePrompt) {
    return { error: 'No prompt provided for reasoning node' };
  }

  // Incorporate active protocol rules if available (AC 4)
  const prompt = state.active_protocol_rules
    ? `SPECIFIC LEADERSHIP PROTOCOL RULES:\n${state.active_protocol_rules}\n\nTASK:\n${basePrompt}`
    : basePrompt;

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
      result = await provider.generateStructured(prompt, targetSchema);
    } else {
      result = await provider.generateText(prompt);
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
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ReasoningNode][${task.id}] failed: ${message}`);
    const errorStep = AuditLogger.createStep('LLM Reasoning', `Reasoning failed: ${message}`);
    return { 
      error: `Reasoning failed: ${message}`,
      trace: [errorStep]
    };
  }
}
