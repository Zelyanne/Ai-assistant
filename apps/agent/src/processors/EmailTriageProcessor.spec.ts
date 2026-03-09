import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config before any other imports
vi.mock('../config/index.js', () => ({
  config: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    MISTRAL_API_KEY: 'test-mistral-key',
    DEFAULT_LLM_MODEL: 'mistral-small-latest'
  }
}));

import { EmailTriageProcessor } from './EmailTriageProcessor.js';
import { supabase } from "../services/supabase.js";

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: vi.fn()
  }
}));

vi.mock('../services/mcp.js', () => ({
  mcpService: {
    getLangChainTools: vi.fn().mockResolvedValue([])
  }
}));

vi.mock('../guards/PerimeterGuard.js', () => {
  const MockPerimeterGuard = class {
    redactPII(text: string) {
      return text;
    }
    recoverPII(text: string) {
      return text;
    }
    static wrapToolWithSecurity(tool: any) {
      return tool;
    }
  };
  return { PerimeterGuard: MockPerimeterGuard };
});

describe('EmailTriageProcessor', () => {
  let processor: EmailTriageProcessor;
  let mockAgent: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAgent = {
      invoke: vi.fn().mockResolvedValue({
        messages: [{
          role: 'assistant',
          content: JSON.stringify({
            matches: [{ topic: 'Urgent', reason: 'Contains word urgent', priority_score: 90 }],
            overall_priority_score: 90,
            is_highlighted: true
          })
        }]
      })
    };
    processor = new EmailTriageProcessor();
    // @ts-expect-error - access protected method for mocking
    vi.spyOn(processor, 'createAgentInstance').mockReturnValue(mockAgent);
  });

  const createMockChain = (data: any) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      // Final result
      then: (resolve: any) => resolve({ data, error: null }),
      catch: (reject: any) => reject(null)
    };
    // Support direct data access if awaited without .then
    (chain as any).data = data;
    (chain as any).error = null;
    return chain;
  };

  it('should successfully triage threads when watch topics exist', async () => {
    const mockThreads = [
      { id: 'thread-1', subject: 'Urgent: Feedback needed', metadata: { snippet: 'This is urgent' } }
    ];
    const mockTopics = [
      { topic: 'Urgent', priority: 'High' }
    ];

    const mockFrom = vi.mocked(supabase.from);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'ingested_threads') return createMockChain(mockThreads) as any;
      if (table === 'watch_topics') return createMockChain(mockTopics) as any;
      return createMockChain([]) as any;
    });

    const task = {
      id: 'task-123',
      organization_id: 'org-1',
      user_id: 'user-1',
      domain_action: 'email.triage'
    };

    const result = await processor.process(task as any);

    expect(result.processed_count).toBe(1);
    expect(mockAgent.invoke).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith('ingested_threads');
    expect(mockFrom).toHaveBeenCalledWith('watch_topics');
  });

  it('should return 0 processed threads if no unclassified threads found', async () => {
    const mockFrom = vi.mocked(supabase.from);
    mockFrom.mockImplementation(() => createMockChain([]) as any);

    const task = {
      id: 'task-123',
      organization_id: 'org-1',
      domain_action: 'email.triage'
    };

    const result = await processor.process(task as any);
    expect(result.processed_count).toBe(0);
    expect(result.message).toContain('No unclassified threads found');
  });

  it('should fallback to body or summary_json if metadata.snippet is missing', async () => {
    const mockThreads = [
      { id: 'thread-body', subject: 'Body only', metadata: {}, body: 'Snippet from body' },
      { id: 'thread-summary', subject: 'Summary only', metadata: {}, summary_json: { snippet: 'Snippet from summary' } }
    ];
    const mockTopics = [{ topic: 'Urgent', priority: 'High' }];

    const mockFrom = vi.mocked(supabase.from);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'ingested_threads') return createMockChain(mockThreads) as any;
      if (table === 'watch_topics') return createMockChain(mockTopics) as any;
      return createMockChain([]) as any;
    });

    const task = {
      id: 'task-123',
      organization_id: 'org-1',
      domain_action: 'email.triage'
    };

    await processor.process(task as any);

    // Verify first thread used body
    expect(mockAgent.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining('EMAIL SNIPPET: Snippet from body')
          })
        ]
      }),
      expect.anything()
    );

    // Verify second thread used summary_json.snippet
    expect(mockAgent.invoke).toHaveBeenNthCalledWith(2,
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining('EMAIL SNIPPET: Snippet from summary')
          })
        ]
      }),
      expect.anything()
    );
  });
});
