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

import { ThreadSummarizer } from './ThreadSummarizer.js';
import { supabase } from "../services/supabase.js";
import { LLMProviderFactory } from '../services/llm/factory.js';
import { PerimeterGuard } from '../guards/PerimeterGuard.js';

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: vi.fn()
  }
}));

vi.mock('../services/llm/factory.js');

// Mock PerimeterGuard to verify integration
vi.mock('../guards/PerimeterGuard.js', () => {
  return {
    PerimeterGuard: vi.fn().mockImplementation(function() {
      return {
        redactPII: vi.fn((text: string) => `redacted(${text})`),
        recoverPII: vi.fn((text: string) => text.replace(/redacted\((.*?)\)/g, '$1')),
      };
    })
  };
});

describe('ThreadSummarizer', () => {
  let processor: ThreadSummarizer;
  let mockLLM: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLLM = {
      generateStructured: vi.fn().mockResolvedValue({
        data: {
          context: 'redacted(Discussion about Project X)',
          decisions: ['redacted(Approved budget)'],
          action_items: ['redacted(Schedule meeting with Alice)']
        },
        model: 'mistral-small-latest',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20, latencyMs: 100 }
      })
    };
    (LLMProviderFactory.getProvider as any).mockReturnValue(mockLLM);
    processor = new ThreadSummarizer();
  });

  const createMockChain = (data: any) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => Promise.resolve({ data, error: null })),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      // To handle the final call in update().eq() or insert()
      then: (resolve: any) => resolve({ data, error: null }),
    };
    return chain;
  };

  it('should successfully summarize a thread with PII redaction and recovery', async () => {
    const mockThread = {
      id: 'thread-1',
      subject: 'Project X Update',
      external_id: 'gmail-123',
      metadata: {
        thread_raw: {
          messages: [
            {
              payload: { headers: [{ name: 'From', value: 'Alice <alice@example.com>' }] },
              snippet: 'Hi, can we approve the budget for Project X?'
            }
          ]
        }
      }
    };

    const mockIngestedThreadsChain = createMockChain(mockThread);
    const mockActivityLogChain = createMockChain(null);

    const mockFrom = vi.mocked(supabase.from);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'ingested_threads') return mockIngestedThreadsChain as any;
      if (table === 'agent_activity_log') return mockActivityLogChain as any;
      return createMockChain(null) as any;
    });

    const task = {
      id: 'task-123',
      organization_id: 'org-1',
      user_id: 'user-1',
      payload: { thread_id: 'thread-1' }
    };

    const result = await processor.process(task as any);

    expect(result.thread_id).toBe('thread-1');
    expect(result.summary.context).toBe('Discussion about Project X');
    expect(result.summary.action_items[0]).toBe('Schedule meeting with Alice');
    
    // Verify DB updates (AC 2)
    expect(mockFrom).toHaveBeenCalledWith('ingested_threads');
    expect(mockFrom).toHaveBeenCalledWith('agent_activity_log');

    // Verify trace steps
    const trace = processor.getTrace();
    expect(trace).toHaveLength(4);
    expect(trace[0].step_name).toBe('Input Ingestion');
    expect(trace[1].step_name).toBe('Perimeter Check');
    expect(trace[2].step_name).toBe('LLM Reasoning');
    expect(trace[3].step_name).toBe('PII Recovery');

    // Verify citation link
    expect(mockActivityLogChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      citations: [
        expect.objectContaining({
          link: 'https://mail.google.com/mail/u/0/#all/gmail-123'
        })
      ]
    }));
  });

  it('should throw error if thread_id is missing', async () => {
    const task = {
      id: 'task-123',
      organization_id: 'org-1',
      payload: {}
    };

    await expect(processor.process(task as any)).rejects.toThrow("thread_id is required");
  });
});
