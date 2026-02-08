import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reasoningNode } from './reasoning.js';
import { supabase } from '../../services/supabase.js';

// Mock Config
vi.mock('../../config/index.js', () => ({
  config: {
    MISTRAL_API_KEY: 'mock-key',
    DEFAULT_LLM_MODEL: 'mistral-small-latest',
  },
}));

const { mockInvoke, mockWithStructuredOutput } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockWithStructuredOutput: vi.fn(),
}));

vi.mock('@langchain/mistralai', () => {
  return {
    ChatMistralAI: vi.fn().mockImplementation(() => ({
      invoke: mockInvoke,
      withStructuredOutput: mockWithStructuredOutput.mockReturnThis(),
    })),
  };
});

// Mock tracing service
vi.mock('../../services/llm/tracing.js', () => ({
  tracingService: {
    getHandler: vi.fn().mockReturnValue(null),
    handleSuccess: vi.fn(),
    handleFailure: vi.fn(),
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
    mockInvoke.mockReset();
    mockWithStructuredOutput.mockClear();
  });

  it('should call generateText (via invoke) and append to trace', async () => {
    mockInvoke.mockResolvedValue({
      content: 'I am the AI assistant',
      additional_kwargs: {},
      response_metadata: {},
    });

    const result = await reasoningNode(mockState);

    expect(result.result).toBe('I am the AI assistant');
    expect(mockInvoke).toHaveBeenCalled();
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

  it('should call generateStructured (via withStructuredOutput) when valid schemaKey is provided', async () => {
    mockInvoke.mockResolvedValue({ summary: 'Test summary', key_points: ['A', 'B'], confidence: 0.9 });

    const structuredState: any = {
      task: {
        ...mockTask,
        payload: { prompt: 'Analyze', schemaKey: 'default_analysis' },
      },
    };

    const result = await reasoningNode(structuredState);

    expect(result.result).toEqual({ summary: 'Test summary', key_points: ['A', 'B'], confidence: 0.9 });
    expect(mockWithStructuredOutput).toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalled();
  });

  it('should require confidence and ambiguity_detected in structured output', async () => {
    mockInvoke.mockResolvedValue({ 
      summary: 'Test summary', 
      key_points: ['A'], 
      confidence: 0.95, 
      ambiguity_detected: false 
    });

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
