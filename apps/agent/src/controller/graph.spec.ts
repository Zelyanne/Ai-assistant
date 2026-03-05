import { describe, it, expect, vi, beforeEach } from 'vitest';
import { graph } from './graph.js';

// Mock SafetyControlsService
vi.mock('../services/SafetyControlsService.js', () => ({
  SafetyControlsService: {
    isEmergencyBrakeEnabled: vi.fn().mockResolvedValue(false),
  },
}));

type GraphInput = Parameters<typeof graph.invoke>[0];

// Mock Config
vi.mock('../config/index.js', () => ({
  config: {
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-key',
    MISTRAL_API_KEY: 'mock-mistral-key',
    DEFAULT_LLM_MODEL: 'mistral-small-latest',
    CONFIDENCE_THRESHOLD: 0.8,
    ENCRYPTION_SECRET: '0123456789abcdef0123456789abcdef' // 32 chars
  }
}));

// Mock LangChain Mistral
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
vi.mock('../services/llm/tracing.js', () => ({
  tracingService: {
    getHandler: vi.fn().mockReturnValue(null),
    handleSuccess: vi.fn(),
    handleFailure: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock LLMProviderFactory (kept for other processors that might still use it)
const mockProvider = {
  generateText: vi.fn().mockResolvedValue({
    data: 'Mocked response',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    model: 'mistral-small'
  }),
  generateStructured: vi.fn().mockResolvedValue({
    data: { summary: 'Mocked response', confidence: 0.9, ambiguity_detected: false },
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    model: 'mistral-small'
  })
};

vi.mock('../services/llm/factory.js', () => ({
  LLMProviderFactory: {
    getProvider: vi.fn(() => mockProvider)
  }
}));

// Mock Supabase
type MockChain = {
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
};

const mockChain: MockChain = {
  update: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(() => Promise.resolve({ data: { tier: 'Public' }, error: null })),
  then: vi.fn((resolve) => resolve({ data: null, error: null }))
};

// Ensure eq always returns mockChain to allow chaining
mockChain.eq.mockReturnValue(mockChain);

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => mockChain)
  }
}));

// Remove Mistral mock since we mock the factory now
// vi.mock('mistralai', ...);

// Mock ProtocolService
vi.mock('../services/ProtocolService.js', () => ({
  ProtocolService: {
    fetchProtocol: vi.fn().mockResolvedValue('# Mock Protocol'),
    extractRules: vi.fn().mockResolvedValue('1. Rule One')
  }
}));

// Mock MCPService to avoid subprocess spawning during graph tests
const { mockExecuteTool } = vi.hoisted(() => ({
  mockExecuteTool: vi.fn().mockResolvedValue({ message: 'Success' })
}));

vi.mock('../services/mcp.js', () => ({
  MCPService: class {
    executeTool = mockExecuteTool;
  },
  mcpService: {
    executeTool: mockExecuteTool
  }
}));

describe('Agent Controller Graph Routing', () => {

  const baseTask = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organization_id: '123e4567-e89b-12d3-a456-426614174001',
    status: 'queued',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockReset();
    mockWithStructuredOutput.mockClear();
    
    // Default chain behavior
    mockChain.update.mockReturnThis();
    mockChain.insert.mockReturnThis();
    mockChain.select.mockReturnThis();
    mockChain.eq.mockReturnThis();
    mockChain.single.mockReset();
    mockChain.single.mockResolvedValue({ data: { tier: 'Public' }, error: null });
    
    // Mock then for promise-like behavior in updates/inserts
    mockChain.then.mockImplementation((resolve: (value: { data: null; error: null }) => void) => resolve({ data: null, error: null }));
  });

  it('should route email.draft to EmailDraftProcessor and accept tracing config', async () => {
    const mockTask = { 
      ...baseTask, 
      domain_action: 'email.draft', 
      payload: { recipient: 'test@example.com', subject: 'Test', body: 'Hello' } 
    };
    
    // Test that invoke accepts metadata and tags (for LangSmith)
    const result = await graph.invoke(
      { task: mockTask } as GraphInput,
      {
        metadata: {
          task_id: mockTask.id,
          organization_id: mockTask.organization_id,
          domain_action: mockTask.domain_action,
        },
        tags: [mockTask.domain_action],
      }
    ) as any;

    expect(result.error).toBeUndefined();
    expect(result.result.message).toContain('Email draft created');
  });


  it('should route calendar.create to CalendarCreateProcessor', async () => {
    const mockTask = { 
      ...baseTask, 
      domain_action: 'calendar.create', 
      payload: { summary: 'Meeting', startTime: '2026-01-18T10:00:00Z', endTime: '2026-01-18T11:00:00Z' } 
    };

    const result = await graph.invoke({ task: mockTask } as GraphInput) as any;

    expect(result.error).toBeUndefined();
    expect(result.result.message).toContain('Calendar event created');
  });

  it('should escalate calendar.create when payload confidence is below threshold (no tool execution)', async () => {
    const mockTask = {
      ...baseTask,
      domain_action: 'calendar.create',
      payload: {
        summary: 'Meeting',
        startTime: '2026-01-18T10:00:00Z',
        endTime: '2026-01-18T11:00:00Z',
        confidence_score: 0.5,
      },
    };

    const result = await graph.invoke({ task: mockTask } as GraphInput) as any;

    expect(result.task.status).toBe('escalation');
    expect(result.task.result.escalation).toBe(true);
    expect(result.task.result.confidence_score).toBe(0.5);
    expect(result.task.result.confidence_threshold).toBe(0.8);
    expect(result.task.result.escalation_trigger).toBe('low_confidence');
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it('should route system.analyze to reasoning node', async () => {
    mockInvoke.mockResolvedValueOnce({
      content: 'Mocked response',
      additional_kwargs: {},
      response_metadata: {},
    });

    const mockTask = { ...baseTask, domain_action: 'system.analyze', payload: { prompt: "Analyze this" } };

    const result = await graph.invoke({ task: mockTask } as GraphInput) as any;

    expect(result.error).toBeUndefined();
    expect(result.result).toBe('Mocked response');
  });

  it('should pause proxy execution tasks when Emergency Brake is enabled', async () => {
    const { SafetyControlsService } = await import('../services/SafetyControlsService.js');
    vi.mocked(SafetyControlsService.isEmergencyBrakeEnabled).mockResolvedValueOnce(true);

    const mockTask = {
      ...baseTask,
      domain_action: 'calendar.create',
      payload: { summary: 'Meeting', startTime: '2026-01-18T10:00:00Z', endTime: '2026-01-18T11:00:00Z' },
    };

    const result = await graph.invoke({ task: mockTask } as GraphInput) as any;

    expect(result.task.status).toBe('paused');
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it('should handle unsupported domain.action', async () => {
    const mockTask = { ...baseTask, domain_action: 'unknown.action', payload: {} };

    const result = await graph.invoke({ task: mockTask } as GraphInput) as any;

    expect(result.error).toBe('Unsupported domain.action: unknown.action');
  });

  it('should execute thread.action by drafting an email when Public and high-confidence', async () => {
    mockProvider.generateStructured.mockResolvedValueOnce({
      data: {
        action: 'email.draft',
        confidence: 0.95,
        ambiguity_detected: false,
        email: {
          subject: 'Re: Subject',
          body: 'Draft body',
        },
      },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'mistral-small'
    });

    mockChain.single
      .mockResolvedValueOnce({ data: { tier: 'Public' }, error: null })
      .mockResolvedValueOnce({
        data: {
          id: 'thread-1',
          subject: 'Subject',
          external_id: 'ext-1',
          summary_json: { context: 'c', decisions: [], action_items: [] },
          metadata: {
            thread_raw: {
              messages: [
                {
                  payload: {
                    headers: [{ name: 'From', value: 'Someone <someone@example.com>' }]
                  }
                }
              ]
            }
          }
        },
        error: null
      });

    const mockTask = {
      ...baseTask,
      domain_action: 'thread.action',
      topic: 'General',
      payload: { source_type: 'thread', source_id: 'thread-1' }
    };

    const result = await graph.invoke({ task: mockTask } as GraphInput) as any;

    expect(result.error).toBeUndefined();
    expect(result.result.summary).toContain('Silent Win');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      mockTask.organization_id,
      'create_gmail_draft',
      expect.any(Object),
    );
  });

  it('should execute thread.action by creating a calendar event when planner chooses calendar.create', async () => {
    mockProvider.generateStructured.mockResolvedValueOnce({
      data: {
        action: 'calendar.create',
        confidence: 0.93,
        ambiguity_detected: false,
        calendar: {
          summary: 'Project sync',
          startTime: '2026-02-20T10:00:00Z',
          endTime: '2026-02-20T10:30:00Z',
          description: 'Weekly project alignment',
        },
      },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'mistral-small'
    });

    mockChain.single
      .mockResolvedValueOnce({ data: { tier: 'Public' }, error: null })
      .mockResolvedValueOnce({
        data: {
          id: 'thread-1',
          subject: 'Schedule a sync',
          external_id: 'ext-1',
          summary_json: { context: 'c', decisions: [], action_items: [] },
          metadata: {
            thread_raw: {
              messages: [
                {
                  payload: {
                    headers: [{ name: 'From', value: 'Someone <someone@example.com>' }]
                  }
                }
              ]
            }
          }
        },
        error: null
      });

    const mockTask = {
      ...baseTask,
      domain_action: 'thread.action',
      topic: 'General',
      payload: { source_type: 'thread', source_id: 'thread-1' }
    };

    const result = await graph.invoke({ task: mockTask } as GraphInput) as any;

    expect(result.error).toBeUndefined();
    expect(result.result.action).toBe('calendar.create');
    expect(result.result.summary).toContain('Silent Win');
    expect(mockExecuteTool).toHaveBeenCalledWith(
      mockTask.organization_id,
      'create_calendar_event',
      expect.any(Object),
    );
  });

  it('should escalate thread.action at the lower boundary (0.79 < 0.8)', async () => {
    mockProvider.generateStructured.mockResolvedValueOnce({
      data: {
        action: 'email.draft',
        confidence: 0.79,
        ambiguity_detected: false,
        email: {
          subject: 'Re: Subject',
          body: 'Draft body',
        },
      },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'mistral-small'
    });

    mockChain.single
      .mockResolvedValueOnce({ data: { tier: 'Public' }, error: null })
      .mockResolvedValueOnce({
        data: {
          id: 'thread-1',
          subject: 'Subject',
          external_id: 'ext-1',
          summary_json: { context: 'c', decisions: [], action_items: [] },
          metadata: {
            thread_raw: {
              messages: [
                {
                  payload: {
                    headers: [{ name: 'From', value: 'Someone <someone@example.com>' }]
                  }
                }
              ]
            }
          }
        },
        error: null
      });

    const mockTask = {
      ...baseTask,
      domain_action: 'thread.action',
      topic: 'General',
      payload: { source_type: 'thread', source_id: 'thread-1' }
    };

    const result = await graph.invoke({ task: mockTask } as GraphInput) as any;

    expect(result.task.status).toBe('escalation');
    expect(result.task.result.escalation).toBe(true);
    expect(result.task.result.confidence_score).toBe(0.79);
    expect(result.task.result.confidence_threshold).toBe(0.8);
    expect(result.task.result.escalation_trigger).toBe('low_confidence');
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it('should allow thread.action execution at exact threshold boundary (0.80)', async () => {
    mockProvider.generateStructured.mockResolvedValueOnce({
      data: {
        action: 'email.draft',
        confidence: 0.8,
        ambiguity_detected: false,
        email: {
          subject: 'Re: Subject',
          body: 'Draft body',
        },
      },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'mistral-small'
    });

    mockChain.single
      .mockResolvedValueOnce({ data: { tier: 'Public' }, error: null })
      .mockResolvedValueOnce({
        data: {
          id: 'thread-1',
          subject: 'Subject',
          external_id: 'ext-1',
          summary_json: { context: 'c', decisions: [], action_items: [] },
          metadata: {
            thread_raw: {
              messages: [
                {
                  payload: {
                    headers: [{ name: 'From', value: 'Someone <someone@example.com>' }]
                  }
                }
              ]
            }
          }
        },
        error: null
      });

    const mockTask = {
      ...baseTask,
      domain_action: 'thread.action',
      topic: 'General',
      payload: { source_type: 'thread', source_id: 'thread-1' }
    };

    const result = await graph.invoke({ task: mockTask } as GraphInput) as any;

    expect(result.error).toBeUndefined();
    expect(result.task.status).toBe('processing');
    expect(result.result.action).toBe('email.draft');
    expect(mockExecuteTool).toHaveBeenCalledTimes(1);
  });

  it('should allow thread.action execution above threshold boundary (0.81)', async () => {
    mockProvider.generateStructured.mockResolvedValueOnce({
      data: {
        action: 'email.draft',
        confidence: 0.81,
        ambiguity_detected: false,
        email: {
          subject: 'Re: Subject',
          body: 'Draft body',
        },
      },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'mistral-small'
    });

    mockChain.single
      .mockResolvedValueOnce({ data: { tier: 'Public' }, error: null })
      .mockResolvedValueOnce({
        data: {
          id: 'thread-1',
          subject: 'Subject',
          external_id: 'ext-1',
          summary_json: { context: 'c', decisions: [], action_items: [] },
          metadata: {
            thread_raw: {
              messages: [
                {
                  payload: {
                    headers: [{ name: 'From', value: 'Someone <someone@example.com>' }]
                  }
                }
              ]
            }
          }
        },
        error: null
      });

    const mockTask = {
      ...baseTask,
      domain_action: 'thread.action',
      topic: 'General',
      payload: { source_type: 'thread', source_id: 'thread-1' }
    };

    const result = await graph.invoke({ task: mockTask } as GraphInput) as any;

    expect(result.error).toBeUndefined();
    expect(result.task.status).toBe('processing');
    expect(result.result.action).toBe('email.draft');
    expect(mockExecuteTool).toHaveBeenCalledTimes(1);
  });

  it('should escalate thread.action for ambiguity even when confidence meets threshold', async () => {
    mockProvider.generateStructured.mockResolvedValueOnce({
      data: {
        action: 'email.draft',
        confidence: 0.92,
        ambiguity_detected: true,
        email: {
          subject: 'Re: Subject',
          body: 'Draft body',
        },
      },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'mistral-small'
    });

    mockChain.single
      .mockResolvedValueOnce({ data: { tier: 'Public' }, error: null })
      .mockResolvedValueOnce({
        data: {
          id: 'thread-1',
          subject: 'Subject',
          external_id: 'ext-1',
          summary_json: { context: 'c', decisions: [], action_items: [] },
          metadata: {
            thread_raw: {
              messages: [
                {
                  payload: {
                    headers: [{ name: 'From', value: 'Someone <someone@example.com>' }]
                  }
                }
              ]
            }
          }
        },
        error: null
      });

    const mockTask = {
      ...baseTask,
      domain_action: 'thread.action',
      topic: 'General',
      payload: { source_type: 'thread', source_id: 'thread-1' }
    };

    const result = await graph.invoke({ task: mockTask } as GraphInput) as any;

    expect(result.task.status).toBe('escalation');
    expect(result.task.result.escalation).toBe(true);
    expect(result.task.result.confidence_score).toBe(0.92);
    expect(result.task.result.confidence_threshold).toBe(0.8);
    expect(result.task.result.escalation_trigger).toBe('ambiguity_detected');
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it('should escalate thread.action when topic is Controlled', async () => {
    mockChain.single
      .mockResolvedValueOnce({ data: { tier: 'Controlled' }, error: null })
      .mockResolvedValueOnce({
        data: {
          id: 'thread-1',
          subject: 'Subject',
          external_id: 'ext-1',
          summary_json: { context: 'c', decisions: [], action_items: [] },
          metadata: {
            thread_raw: {
              messages: [
                {
                  payload: {
                    headers: [{ name: 'From', value: 'Someone <someone@example.com>' }]
                  }
                }
              ]
            }
          }
        },
        error: null
      });

    mockProvider.generateStructured.mockResolvedValueOnce({
      data: {
        action: 'email.draft',
        confidence: 0.92,
        ambiguity_detected: false,
        email: {
          subject: 'Re: Subject',
          body: 'Draft body',
        },
      },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'mistral-small'
    });

    const mockTask = {
      ...baseTask,
      domain_action: 'thread.action',
      topic: 'Finance',
      payload: { source_type: 'thread', source_id: 'thread-1' }
    };

    const result = await graph.invoke({ task: mockTask } as GraphInput) as any;

    expect(result.task.status).toBe('escalation');
    expect(result.task.result.escalation).toBe(true);
    expect(result.task.result.reason).toContain('Controlled topic requires human approval');
    expect(result.task.result.prompt).toContain('Approve & Send');
    expect(result.task.result.draft).toBeDefined();
    expect(result.task.result.draft.to).toBe('someone@example.com');
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it('should apply protocol tier override for thread.action perimeter evaluation', async () => {
    const { ProtocolService } = await import('../services/ProtocolService.js');
    vi.mocked(ProtocolService.extractRules).mockResolvedValueOnce('Required Agency Tier: Controlled');

    mockProvider.generateStructured.mockResolvedValueOnce({
      data: {
        action: 'email.draft',
        confidence: 0.95,
        ambiguity_detected: false,
        email: {
          subject: 'Re: Subject',
          body: 'Draft body',
        },
      },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'mistral-small'
    });

    mockChain.single
      .mockResolvedValueOnce({ data: { tier: 'Public' }, error: null })
      .mockResolvedValueOnce({
        data: {
          id: 'thread-1',
          subject: 'Subject',
          external_id: 'ext-1',
          summary_json: { context: 'c', decisions: [], action_items: [] },
          metadata: {
            thread_raw: {
              messages: [
                {
                  payload: {
                    headers: [{ name: 'From', value: 'Someone <someone@example.com>' }]
                  }
                }
              ]
            }
          }
        },
        error: null
      });

    const mockTask = {
      ...baseTask,
      domain_action: 'thread.action',
      topic: 'General',
      payload: { source_type: 'thread', source_id: 'thread-1' }
    };

    const result = await graph.invoke({ task: mockTask } as GraphInput) as any;

    expect(result.error).toBeUndefined();
    expect(result.result.action).toBe('email.draft');
    expect(result.trace.some((s: { input_summary?: string }) => s.input_summary?.includes('ReqTier: Controlled') === true)).toBe(true);
  });

  it('should escalate to user when agency tier is Restricted', async () => {
    const mockTask = { ...baseTask, domain_action: 'email.draft', payload: { sensitive: 'data' } };
    
    // Mock Restricted tier
    mockChain.single.mockResolvedValueOnce({ data: { tier: 'Restricted' }, error: null });

    const result = await graph.invoke({ task: mockTask } as GraphInput) as any;

    expect(result.task.status).toBe('escalation');
    expect(result.task.result.escalation).toBe(true);
    expect(result.error).toContain('Restricted topic requires human intervention');
  });

  it('should load protocol rules and pass them to reasoning', async () => {
    mockInvoke.mockResolvedValueOnce({
      content: 'Mocked response',
      additional_kwargs: {},
      response_metadata: {},
    });

    const mockTask = { ...baseTask, domain_action: 'system.analyze', payload: { prompt: "Analyze this" } };

    const result = await graph.invoke({ task: mockTask } as GraphInput) as any;

    expect(result.active_protocol_rules).toBe('1. Rule One');
    expect(result.citations).toBeDefined();
    expect(result.citations.some((c: { source_type?: string }) => c.source_type === 'protocol')).toBe(true);
  });

  it('should escalate when confidence is below threshold', async () => {
    mockInvoke.mockResolvedValueOnce({ 
      summary: 'Low confidence', 
      confidence: 0.5, 
      ambiguity_detected: false 
    });

    const mockTask = { ...baseTask, domain_action: 'system.analyze', payload: { prompt: "Analyze this" } };
    
    const result = await graph.invoke({ task: { ...mockTask, payload: { ...mockTask.payload, schemaKey: 'default_analysis' } } } as GraphInput) as any;

    expect(result.task.status).toBe('escalation');
    expect(result.task.result.escalation).toBe(true);
    expect(result.task.result.confidence_score).toBe(0.5);
    expect(result.task.result.confidence_threshold).toBe(0.8);
    expect(result.task.result.escalation_trigger).toBe('low_confidence');
    expect(result.trace.some((s: { step_name?: string }) => s.step_name === 'Escalation')).toBe(true);
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it('should escalate when ambiguity is detected', async () => {
    mockInvoke.mockResolvedValueOnce({ 
      summary: 'Ambiguous', 
      confidence: 0.9, 
      ambiguity_detected: true 
    });

    const mockTask = { ...baseTask, domain_action: 'system.analyze', payload: { prompt: "Analyze this" } };
    
    const result = await graph.invoke({ task: { ...mockTask, payload: { ...mockTask.payload, schemaKey: 'default_analysis' } } } as GraphInput) as any;

    expect(result.task.status).toBe('escalation');
    expect(result.task.result.escalation).toBe(true);
    expect(result.task.result.confidence_score).toBe(0.9);
    expect(result.task.result.confidence_threshold).toBe(0.8);
    expect(result.task.result.escalation_trigger).toBe('ambiguity_detected');
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });
});
