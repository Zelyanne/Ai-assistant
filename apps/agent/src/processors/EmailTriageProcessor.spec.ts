import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailTriageProcessor } from './EmailTriageProcessor.js';
import { supabase } from '../services/supabase.js';
import { LLMProviderFactory } from '../services/llm/factory.js';

interface MockThread {
  id: string;
  subject: string | null;
  metadata: Record<string, unknown> | null;
  summary: string | null;
  summary_json: Record<string, unknown> | null;
  classification?: Record<string, unknown>;
  body?: string;
}

interface MockTopic {
  topic: string;
  priority: string;
}

interface SupabaseMockState {
  threads: MockThread[];
  topics: MockTopic[];
  updateCalls: Array<{ table: string; values: Record<string, unknown>; threadId: string }>;
  insertCalls: Array<{ table: string; values: Record<string, unknown> }>;
}

const mocks = vi.hoisted(() => ({
  generateStructured: vi.fn(),
  generateText: vi.fn(),
  from: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
  createStep: vi.fn((step_name: string, message: string, extra?: Record<string, unknown>) => ({
    step_name,
    message,
    ...extra,
  })),
}));

vi.mock('../config/index.js', () => ({
  config: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    MISTRAL_API_KEY: 'test-mistral-key',
    DEFAULT_LLM_MODEL: 'mistral-small-latest',
  },
}));

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: mocks.from,
  },
}));

vi.mock('../services/llm/factory.js', () => ({
  LLMProviderFactory: {
    getProvider: vi.fn(() => ({
      generateStructured: mocks.generateStructured,
      generateText: mocks.generateText,
    })),
  },
}));

vi.mock('../services/AuditLogger.js', () => ({
  AuditLogger: {
    flush: mocks.flush,
    createStep: mocks.createStep,
  },
}));

vi.mock('../guards/PerimeterGuard.js', () => {
  class MockPerimeterGuard {
    redactPII(text: string): string {
      return text;
    }

    recoverPII(text: string): string {
      return text;
    }
  }

  return {
    PerimeterGuard: MockPerimeterGuard,
  };
});

function buildSupabaseMock(state: SupabaseMockState): void {
  const fromMock = vi.mocked(supabase.from);

  fromMock.mockImplementation((table: string) => {
    const queryState: {
      mode: 'select' | 'update';
      values: Record<string, unknown> | null;
      threadId: string | null;
    } = {
      mode: 'select',
      values: null,
      threadId: null,
    };

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation((column: string, value: unknown) => {
        if (queryState.mode === 'update' && column === 'id' && typeof value === 'string') {
          queryState.threadId = value;
          state.updateCalls.push({
            table,
            values: queryState.values ?? {},
            threadId: value,
          });

          return Promise.resolve({ error: null });
        }

        return chain;
      }),
      or: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      update: vi.fn().mockImplementation((values: Record<string, unknown>) => {
        queryState.mode = 'update';
        queryState.values = values;
        return chain;
      }),
      insert: vi.fn().mockImplementation((values: Record<string, unknown>) => {
        state.insertCalls.push({ table, values });
        return Promise.resolve({ error: null });
      }),
      then: (resolve: (value: { data: unknown; error: unknown }) => unknown) => {
        if (table === 'ingested_threads') {
          return resolve({ data: state.threads, error: null });
        }

        if (table === 'watch_topics') {
          return resolve({ data: state.topics, error: null });
        }

        return resolve({ data: [], error: null });
      },
      catch: (_reject: (reason: unknown) => unknown) => chain,
    };

    return chain;
  });
}

describe('EmailTriageProcessor', () => {
  let processor: EmailTriageProcessor;
  let state: SupabaseMockState;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TRIAGE_BATCH_CONCURRENCY;
    delete process.env.TRIAGE_BATCH_INPUT_TOKENS;
    delete process.env.TRIAGE_BATCH_OUTPUT_TOKENS;

    state = {
      threads: [],
      topics: [],
      updateCalls: [],
      insertCalls: [],
    };

    buildSupabaseMock(state);
    processor = new EmailTriageProcessor();
  });

  it('triages multiple threads in one structured batch and persists by thread_id', async () => {
    state.threads = [
      {
        id: 'thread-1',
        subject: 'Urgent customer escalation',
        metadata: { snippet: 'Customer needs a response today' },
        summary: null,
        summary_json: null,
      },
      {
        id: 'thread-2',
        subject: 'Weekly digest',
        metadata: { snippet: 'Automated weekly update' },
        summary: null,
        summary_json: null,
      },
    ];
    state.topics = [{ topic: 'Customer Escalation', priority: 'High' }];

    mocks.generateStructured.mockResolvedValueOnce({
      data: [
        {
          thread_id: 'thread-1',
          classification: {
            matches: [
              {
                topic: 'Customer Escalation',
                reason: 'Urgent external blocker',
                priority_score: 90,
              },
            ],
            overall_priority_score: 90,
            is_highlighted: true,
          },
        },
        {
          thread_id: 'thread-2',
          classification: {
            matches: [],
            overall_priority_score: 15,
            is_highlighted: false,
          },
        },
      ],
      usage: {
        promptTokens: 800,
        completionTokens: 240,
        totalTokens: 1040,
        latencyMs: 120,
      },
      model: 'mistral-small-latest',
    });

    const task = {
      id: 'task-123',
      organization_id: 'org-1',
      user_id: 'user-1',
      domain_action: 'email.triage',
      payload: {},
    };

    const result = await processor.process(task as any);

    expect(result.processed_count).toBe(2);
    expect(mocks.generateStructured).toHaveBeenCalledTimes(1);

    const prompt = String(mocks.generateStructured.mock.calls[0][0]);
    expect(prompt).toContain('THREAD_ID: thread-1');
    expect(prompt).toContain('THREAD_ID: thread-2');

    expect(state.updateCalls).toHaveLength(2);
    expect(state.updateCalls.map((call) => call.threadId)).toEqual(
      expect.arrayContaining(['thread-1', 'thread-2']),
    );

    const summarizeTaskInserts = state.insertCalls.filter(
      (call) => call.table === 'tasks',
    );
    expect(summarizeTaskInserts).toHaveLength(1);
    expect(summarizeTaskInserts[0].values).toMatchObject({
      domain_action: 'email.summarize',
      payload: { thread_id: 'thread-1' },
    });
  });

  it('uses summary and legacy summary_json snippet fallbacks when metadata.snippet is missing', async () => {
    state.threads = [
      {
        id: 'thread-summary',
        subject: 'Summary fallback test',
        metadata: {},
        summary: 'Plain summary fallback',
        summary_json: null,
        body: 'encrypted-body-ciphertext',
      },
      {
        id: 'thread-legacy-summary-json',
        subject: 'Legacy summary_json fallback test',
        metadata: {},
        summary: null,
        summary_json: { snippet: 'Legacy summary_json snippet fallback' },
      },
    ];
    state.topics = [{ topic: 'General', priority: 'Low' }];

    mocks.generateStructured.mockResolvedValueOnce({
      data: [
        {
          thread_id: 'thread-summary',
          classification: {
            matches: [],
            overall_priority_score: 20,
            is_highlighted: false,
          },
        },
        {
          thread_id: 'thread-legacy-summary-json',
          classification: {
            matches: [],
            overall_priority_score: 12,
            is_highlighted: false,
          },
        },
      ],
      usage: {
        promptTokens: 300,
        completionTokens: 100,
        totalTokens: 400,
        latencyMs: 80,
      },
      model: 'mistral-small-latest',
    });

    const task = {
      id: 'task-fallback',
      organization_id: 'org-1',
      user_id: 'user-1',
      domain_action: 'email.triage',
      payload: {},
    };

    await processor.process(task as any);

    const prompt = String(mocks.generateStructured.mock.calls[0][0]);
    expect(prompt).toContain('SNIPPET: Plain summary fallback');
    expect(prompt).toContain('SNIPPET: Legacy summary_json snippet fallback');
    expect(prompt).not.toContain('encrypted-body-ciphertext');
  });

  it('continues processing unaffected batches when one batch fails', async () => {
    state.threads = [
      {
        id: 'thread-ok',
        subject: 'Large thread ok',
        metadata: { snippet: 'x'.repeat(30_000) },
        summary: null,
        summary_json: null,
      },
      {
        id: 'thread-fail',
        subject: 'Large thread fail',
        metadata: { snippet: 'y'.repeat(30_000) },
        summary: null,
        summary_json: null,
      },
    ];

    state.topics = [{ topic: 'Operations', priority: 'High' }];

    mocks.generateStructured.mockImplementation(async (prompt: string) => {
      if (prompt.includes('THREAD_ID: thread-fail')) {
        throw new Error('forced non-retryable failure');
      }

      return {
        data: [
          {
            thread_id: 'thread-ok',
            classification: {
              matches: [
                {
                  topic: 'Operations',
                  reason: 'Operational request',
                  priority_score: 70,
                },
              ],
              overall_priority_score: 70,
              is_highlighted: true,
            },
          },
        ],
        usage: {
          promptTokens: 1600,
          completionTokens: 180,
          totalTokens: 1780,
          latencyMs: 100,
        },
        model: 'mistral-small-latest',
      };
    });

    const task = {
      id: 'task-partial',
      organization_id: 'org-1',
      user_id: 'user-1',
      domain_action: 'email.triage',
      payload: {},
    };

    const result = await processor.process(task as any);

    expect(result.processed_count).toBe(1);
    expect(result.skipped_thread_ids).toEqual(['thread-fail']);
    expect(String(result.message)).toContain('re-queued for retry');
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].threadId).toBe('thread-ok');
    expect(mocks.generateStructured).toHaveBeenCalledTimes(2);

    const retryTaskInsert = state.insertCalls.find(
      (call) => call.table === 'tasks' && call.values.domain_action === 'email.triage',
    );

    expect(retryTaskInsert?.values.payload).toEqual({
      thread_ids: ['thread-fail'],
      retry_reason: 'missing_batch_classification',
    });
  });

  it('retries missing batch classifications with single-thread fallback before marking unresolved', async () => {
    state.threads = [
      {
        id: 'thread-recoverable',
        subject: 'Recoverable missing classification',
        metadata: { snippet: 'Need classification recovery' },
        summary: null,
        summary_json: null,
      },
    ];

    state.topics = [{ topic: 'General', priority: 'Low' }];

    mocks.generateStructured
      .mockResolvedValueOnce({
        data: [],
        usage: {
          promptTokens: 180,
          completionTokens: 40,
          totalTokens: 220,
          latencyMs: 45,
        },
        model: 'mistral-small-latest',
      })
      .mockResolvedValueOnce({
        data: [
          {
            thread_id: 'thread-recoverable',
            classification: {
              matches: [],
              overall_priority_score: 10,
              is_highlighted: false,
            },
          },
        ],
        usage: {
          promptTokens: 110,
          completionTokens: 35,
          totalTokens: 145,
          latencyMs: 30,
        },
        model: 'mistral-small-latest',
      });

    const task = {
      id: 'task-recoverable',
      organization_id: 'org-1',
      user_id: 'user-1',
      domain_action: 'email.triage',
      payload: {},
    };

    const result = await processor.process(task as any);

    expect(result.processed_count).toBe(1);
    expect(result.skipped_thread_ids).toEqual([]);
    expect(mocks.generateStructured).toHaveBeenCalledTimes(2);

    const retryTaskInsert = state.insertCalls.find(
      (call) => call.table === 'tasks' && call.values.domain_action === 'email.triage',
    );
    expect(retryTaskInsert).toBeUndefined();
  });

  it('returns zero when no unclassified threads are found', async () => {
    state.threads = [];
    state.topics = [];

    const task = {
      id: 'task-empty',
      organization_id: 'org-1',
      domain_action: 'email.triage',
      payload: {},
    };

    const result = await processor.process(task as any);

    expect(result.processed_count).toBe(0);
    expect(result.message).toContain('No unclassified threads found');
    expect(mocks.generateStructured).not.toHaveBeenCalled();
  });

  it('uses shared LLM provider factory', async () => {
    state.threads = [
      {
        id: 'thread-provider',
        subject: 'Provider test',
        metadata: { snippet: 'Provider test snippet' },
        summary: null,
        summary_json: null,
      },
    ];

    state.topics = [{ topic: 'General', priority: 'Low' }];

    mocks.generateStructured.mockResolvedValueOnce({
      data: [
        {
          thread_id: 'thread-provider',
          classification: {
            matches: [],
            overall_priority_score: 10,
            is_highlighted: false,
          },
        },
      ],
      usage: {
        promptTokens: 200,
        completionTokens: 60,
        totalTokens: 260,
        latencyMs: 50,
      },
      model: 'mistral-small-latest',
    });

    const task = {
      id: 'task-provider',
      organization_id: 'org-1',
      domain_action: 'email.triage',
      payload: {},
    };

    await processor.process(task as any);

    expect(LLMProviderFactory.getProvider).toHaveBeenCalledTimes(1);
  });
});
