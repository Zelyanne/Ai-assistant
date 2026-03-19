import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reasoningNode } from './reasoning.js';
import { supabase } from '../../services/supabase.js';
import { z } from 'zod';

const { getLangChainToolsMock, createAgentMock } = vi.hoisted(() => ({
  getLangChainToolsMock: vi.fn(),
  createAgentMock: vi.fn(),
}));

vi.mock('../../services/mcp.js', () => ({
  mcpService: {
    getLangChainTools: getLangChainToolsMock,
  },
}));

vi.mock('langchain', () => ({
  createAgent: (...args: unknown[]) => createAgentMock(...args),
}));

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
  class ChatMistralAI {
    invoke = mockInvoke;
    withStructuredOutput(...args: unknown[]) {
      mockWithStructuredOutput(...args);
      return this;
    }
  }
  return {
    ChatMistralAI,
  };
});

// Mock tracing service
vi.mock('../../services/llm/tracing.js', () => ({
  tracingService: {
    getHandler: vi.fn().mockReturnValue(null),
    handleSuccess: vi.fn(),
    handleFailure: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
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
    getLangChainToolsMock.mockReset();
    createAgentMock.mockReset();
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

  it('prepends layered memory context to the reasoning prompt when available', async () => {
    mockInvoke.mockResolvedValue({
      content: 'Memory-aware response',
      additional_kwargs: {},
      response_metadata: {},
    });

    const memoryState: any = {
      task: mockTask,
      persona_memory: '# Persona\n\n- Tone: Crisp',
      weekly_memory: '# Weekly Memory\n\n- Focus: Launch',
      short_term_memory: '# Short-Term Memory\n\n- Draft in progress',
      long_term_memory: '# Long-Term Memory\n\n- Prefers concise updates',
      memory_task_state: { current_node: 'load_memory', status: 'processing' },
    };

    await reasoningNode(memoryState);

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.stringContaining('PERSONA MEMORY:\n# Persona\n\n- Tone: Crisp'),
    );
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.stringContaining('TASK STATE MEMORY:\n{\n  "current_node": "load_memory"'),
    );
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

  it('filters unsafe tools and escalates when no safe tools are available', async () => {
    getLangChainToolsMock.mockResolvedValueOnce([
      {
        name: 'create_calendar_event',
        description: 'Creates calendar event',
        schema: z.object({}),
        invoke: vi.fn(),
      },
    ]);

    const toolState: any = {
      task: {
        ...mockTask,
        payload: { prompt: 'Analyze this', tools: true },
      },
    };

    const result = await reasoningNode(toolState);

    expect(createAgentMock).not.toHaveBeenCalled();
    expect(result.trace).toHaveLength(1);
    expect(result.trace![0].step_name).toBe('Agentic Reasoning');
    expect(result.trace![0].confidence_score).toBe(0);
    expect(result.trace![0].ambiguity_detected).toBe(true);
  });

  it('uses only read-only tools and records assessed confidence', async () => {
    getLangChainToolsMock.mockResolvedValueOnce([
      {
        name: 'get_gmail_thread',
        description: 'Fetches a gmail thread',
        schema: z.object({}),
        invoke: vi.fn().mockResolvedValue({ ok: true }),
      },
      {
        name: 'create_gmail_draft',
        description: 'Creates a draft (unsafe)',
        schema: z.object({}),
        invoke: vi.fn(),
      },
    ]);

    const agentInvoke = vi.fn().mockResolvedValue({
      messages: [{ role: 'assistant', content: 'Result mentions test@example.com' }],
    });
    createAgentMock.mockReturnValueOnce({ invoke: agentInvoke });

    // Confidence assessment call (post-hoc, no tools)
    mockInvoke.mockResolvedValueOnce({ summary: 'ok', confidence: 0.7, ambiguity_detected: false });

    const toolState: any = {
      task: {
        ...mockTask,
        payload: { prompt: 'Analyze and reference test@example.com', tools: true },
      },
    };

    const result = await reasoningNode(toolState);

    expect(createAgentMock).toHaveBeenCalledTimes(1);
    const agentArgs = createAgentMock.mock.calls[0]?.[0] as { tools?: Array<{ name?: string }> };
    expect(agentArgs.tools?.map((t) => t.name)).toEqual(['get_gmail_thread']);

    expect(result.trace).toHaveLength(1);
    expect(result.trace![0].confidence_score).toBe(0.7);
    expect(result.trace![0].ambiguity_detected).toBe(false);
    expect(result.trace![0].input_summary).not.toContain('test@example.com');
    expect(result.trace![0].output_summary).not.toContain('test@example.com');
  });
});
