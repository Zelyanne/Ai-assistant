import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reasoningNode } from './reasoning.js';
import { LLMProviderFactory } from '../../services/llm/factory.js';
import { supabase } from '../../services/supabase.js';

vi.mock('../../services/llm/factory.js', () => ({
  LLMProviderFactory: {
    getProvider: vi.fn(),
  },
}));

vi.mock('../../services/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

describe('reasoningNode', () => {
  const mockTask = {
    id: 'task-1',
    organization_id: 'org-1',
    domain_action: 'system.analyze',
    payload: { prompt: 'Who are you?' },
  };

  const mockState: any = {
    task: mockTask,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call generateText and append to trace', async () => {
    const mockProvider = {
      generateText: vi.fn().mockResolvedValue({
        data: 'I am the AI assistant',
        usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15, latencyMs: 100 },
        model: 'mistral-small',
      }),
    };

    (LLMProviderFactory.getProvider as any).mockReturnValue(mockProvider);

    const result = await reasoningNode(mockState);

    expect(result.result).toBe('I am the AI assistant');
    expect(mockProvider.generateText).toHaveBeenCalledWith('Who are you?');
    expect(result.trace).toHaveLength(1);
    expect(result.trace![0].step_name).toBe('LLM Reasoning');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('should return error if prompt is missing', async () => {
    const invalidState: any = {
      task: { ...mockTask, payload: {} },
    };

    const result = await reasoningNode(invalidState);

    expect(result.error).toBe('No prompt provided for reasoning node');
  });

  it('should call generateStructured when valid schemaKey is provided', async () => {
    const mockProvider = {
      generateStructured: vi.fn().mockResolvedValue({
        data: { summary: 'Test summary', key_points: ['A', 'B'], confidence: 0.9 },
        usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15, latencyMs: 100 },
        model: 'mistral-small',
      }),
    };

    (LLMProviderFactory.getProvider as any).mockReturnValue(mockProvider);

    const structuredState: any = {
      task: {
        ...mockTask,
        payload: { prompt: 'Analyze', schemaKey: 'default_analysis' },
      },
    };

    const result = await reasoningNode(structuredState);

    expect(result.result).toEqual({ summary: 'Test summary', key_points: ['A', 'B'], confidence: 0.9 });
    expect(mockProvider.generateStructured).toHaveBeenCalled();
  });

  it('should require confidence and ambiguity_detected in structured output', async () => {
    const mockProvider = {
      generateStructured: vi.fn().mockResolvedValue({
        data: { 
          summary: 'Test summary', 
          key_points: ['A'], 
          confidence: 0.95, 
          ambiguity_detected: false 
        },
        usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15, latencyMs: 100 },
        model: 'mistral-small',
      }),
    };

    (LLMProviderFactory.getProvider as any).mockReturnValue(mockProvider);

    const structuredState: any = {
      task: {
        ...mockTask,
        payload: { prompt: 'Analyze deep', schemaKey: 'default_analysis' },
      },
    };

    const result = await reasoningNode(structuredState);

    expect(result.result).toHaveProperty('confidence', 0.95);
    expect(result.result).toHaveProperty('ambiguity_detected', false);
    expect(result.trace![0]).toHaveProperty('confidence_score', 0.95);
  });

  it('should return error when invalid schemaKey is provided', async () => {
    const mockProvider = {
      generateText: vi.fn(),
    };
    (LLMProviderFactory.getProvider as any).mockReturnValue(mockProvider);

    const invalidSchemaState: any = {
      task: {
        ...mockTask,
        payload: { prompt: 'Analyze', schemaKey: 'non_existent_schema' },
      },
    };

    const result = await reasoningNode(invalidSchemaState);

    expect(result.error).toContain("Requested schema 'non_existent_schema' not found");
  });
});
