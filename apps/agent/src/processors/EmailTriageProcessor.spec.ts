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
import { LLMProviderFactory } from '../services/llm/factory.js';
import { PerimeterGuard } from '../guards/PerimeterGuard.js';

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: vi.fn()
  }
}));

vi.mock('../services/llm/factory.js');
vi.mock('../guards/PerimeterGuard.js', () => {
  class MockPerimeterGuard {
    redactPII(text: string) {
      return text;
    }
    recoverPII(text: string) {
      return text;
    }
  }
  return { PerimeterGuard: MockPerimeterGuard };
});

describe('EmailTriageProcessor', () => {
  let processor: EmailTriageProcessor;
  let mockLLM: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLLM = {
      generateStructured: vi.fn().mockResolvedValue({
        data: {
          matches: [{ topic: 'Urgent', reason: 'Contains word urgent', priority_score: 90 }],
          overall_priority_score: 90,
          is_highlighted: true
        },
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20, latencyMs: 100 }
      })
    };
    (LLMProviderFactory.getProvider as any).mockReturnValue(mockLLM);
    processor = new EmailTriageProcessor();
  });

  const createMockChain = (data: any) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
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
    expect(mockLLM.generateStructured).toHaveBeenCalled();
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
});
