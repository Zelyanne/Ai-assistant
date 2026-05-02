import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopicWatchAlertService } from './TopicWatchAlertService.js';
import { supabase } from './supabase.js';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('../config/index.js', () => ({
  config: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  },
}));

vi.mock('./supabase.js', () => ({
  supabase: {
    from: mocks.from,
  },
}));

interface MockState {
  commandMessages: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  telegramThreadId: string | null;
}

function queryResult(data: unknown): Record<string, unknown> {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

function setupSupabaseMock(state: MockState): void {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'command_messages') {
      return {
        ...queryResult(null),
        insert: vi.fn().mockImplementation((values: Record<string, unknown>) => {
          state.commandMessages.push(values);
          return Promise.resolve({ error: null });
        }),
      } as unknown as ReturnType<typeof supabase.from>;
    }

    if (table === 'command_conversations') {
      return {
        ...queryResult({ id: 'conversation-1' }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'conversation-created' }, error: null }),
        }),
      } as unknown as ReturnType<typeof supabase.from>;
    }

    if (table === 'messaging_channel_links') {
      return queryResult(state.telegramThreadId ? { external_thread_id: state.telegramThreadId } : null) as unknown as ReturnType<typeof supabase.from>;
    }

    if (table === 'tasks') {
      return {
        ...queryResult(null),
        insert: vi.fn().mockImplementation((values: Record<string, unknown>) => {
          state.tasks.push(values);
          return Promise.resolve({ error: null });
        }),
      } as unknown as ReturnType<typeof supabase.from>;
    }

    return queryResult(null) as unknown as ReturnType<typeof supabase.from>;
  });
}

describe('TopicWatchAlertService', () => {
  let service: TopicWatchAlertService;
  let state: MockState;

  beforeEach(() => {
    vi.clearAllMocks();
    state = { commandMessages: [], tasks: [], telegramThreadId: null };
    setupSupabaseMock(state);
    service = new TopicWatchAlertService();
  });

  it('builds concise ask-then-act alert text without full email bodies', () => {
    const text = service.buildAlertText(
      {
        id: 'thread-1',
        subject: 'Long body subject',
        metadata: { from: 'alice@example.com', snippet: 'A concise snippet about APSEC and the requested review.' },
        summary: null,
        summary_json: null,
      },
      {
        matches: [{ topic: 'APSEC', reason: 'Relevant', priority_score: 80 }],
        overall_priority_score: 80,
        is_highlighted: true,
      },
    );

    expect(text).toContain('APSEC-related email');
    expect(text).toContain('draft a reply');
    expect(text).toContain('summarize the full thread');
  });

  it('creates a web alert and skips Telegram when no active link exists', async () => {
    const result = await service.alertForMatchedThread({
      organizationId: 'org-1',
      userId: 'user-1',
      sourceTaskId: 'task-1',
      thread: {
        id: 'thread-1',
        subject: 'APSEC update',
        metadata: { from: 'alice@example.com', snippet: 'Please review the APSEC document.' },
        summary: null,
        summary_json: null,
      },
      classification: {
        matches: [{ topic: 'APSEC', reason: 'Relevant', priority_score: 80 }],
        overall_priority_score: 80,
        is_highlighted: true,
      },
    });

    expect(result.webMessageCreated).toBe(true);
    expect(result.telegramTaskQueued).toBe(false);
    expect(state.commandMessages).toHaveLength(1);
    expect(state.commandMessages[0]).toMatchObject({
      role: 'assistant',
      channel: 'web',
      thread_id: 'thread-1',
    });
    expect(String(state.commandMessages[0]?.content)).toContain('connect Telegram');
    expect(state.tasks).toEqual([]);
  });

  it('queues Telegram channel.send when a link exists', async () => {
    state.telegramThreadId = 'telegram-chat-1';

    const result = await service.alertForMatchedThread({
      organizationId: 'org-1',
      userId: 'user-1',
      sourceTaskId: 'task-1',
      thread: {
        id: 'thread-1',
        subject: 'APSEC update',
        metadata: { from: 'alice@example.com', snippet: 'Please review the APSEC document.' },
        summary: null,
        summary_json: null,
      },
      classification: {
        matches: [{ topic: 'APSEC', reason: 'Relevant', priority_score: 80 }],
        overall_priority_score: 80,
        is_highlighted: true,
      },
    });

    expect(result.telegramTaskQueued).toBe(true);
    expect(state.tasks[0]).toMatchObject({
      domain_action: 'channel.send',
      status: 'queued',
      topic: 'APSEC',
    });
    expect(state.tasks[0]?.payload).toMatchObject({
      channel: 'telegram',
      thread_id: 'telegram-chat-1',
    });
  });
});
