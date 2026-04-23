import { describe, expect, it, vi, beforeEach } from 'vitest';
import { processQueuedTask } from './taskSubscriber.js';

const { mockInvoke, mockGetHandler, mockFlush } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockGetHandler: vi.fn(),
  mockFlush: vi.fn(),
}));

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

const { mockGetByTaskId } = vi.hoisted(() => ({
  mockGetByTaskId: vi.fn(),
}));

vi.mock('../controller/graph.js', () => ({
  graph: {
    invoke: mockInvoke,
  },
}));

vi.mock('./supabase.js', () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock('./llm/tracing.js', () => ({
  tracingService: {
    getHandler: mockGetHandler,
    flush: mockFlush,
  },
}));

vi.mock('./ExecutionRunService.js', () => ({
  executionRunService: {
    getByTaskId: mockGetByTaskId,
  },
}));

describe('processQueuedTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    mockGetHandler.mockReturnValue(null);
    mockFlush.mockResolvedValue(undefined);
    mockGetByTaskId.mockResolvedValue(null);
    mockFrom.mockReset();
  });

  it('invokes graph with metadata/tags for queued channel tasks', async () => {
    await processQueuedTask({
      id: '44444444-4444-4444-8444-444444444444',
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      domain_action: 'thread.action',
      status: 'queued',
      payload: {
        channel: 'telegram',
        external_message_id: 'TG123',
        thread_id: 'chat-999',
      },
      result: {},
      topic: undefined,
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.objectContaining({ domain_action: 'thread.action' }),
        execution_run: null,
      }),
      expect.objectContaining({
        runName: 'Graph: thread.action',
        metadata: expect.objectContaining({
          domain_action: 'thread.action',
          taskId: '44444444-4444-4444-8444-444444444444',
        }),
        tags: ['thread.action', 'langgraph'],
      }),
    );
    expect(mockFlush).toHaveBeenCalledOnce();
  });

  it('passes an existing execution run into graph state', async () => {
    mockGetByTaskId.mockResolvedValue({
      id: 'run-1',
      status: 'processing',
    });

    await processQueuedTask({
      id: '55555555-5555-4555-8555-555555555555',
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      domain_action: 'assistant.command',
      status: 'queued',
      payload: {
        command: 'resume planner run',
      },
      result: {},
      topic: undefined,
    });

    expect(mockGetByTaskId).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555');
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        execution_run: expect.objectContaining({
          id: 'run-1',
          status: 'processing',
        }),
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          executionRunId: 'run-1',
          executionRunStatus: 'processing',
        }),
      }),
    );
  });

  it('hydrates command conversation context from Supabase when conversation_id is provided', async () => {
    const organizationId = '11111111-1111-1111-1111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const conversationId = '33333333-3333-4333-8333-333333333333';

    type SupabaseQueryMock = {
      select: (columns: string) => SupabaseQueryMock;
      eq: (key: string, value: unknown) => SupabaseQueryMock;
      maybeSingle?: () => Promise<{ data: unknown; error: null }>;
      order?: (key: string, options?: { ascending?: boolean }) => SupabaseQueryMock;
      limit?: (count: number) => SupabaseQueryMock;
      then?: (resolve: (value: { data: unknown; error: null }) => unknown) => Promise<unknown>;
    };

    const conversationQuery: SupabaseQueryMock = {
      select: () => conversationQuery,
      eq: () => conversationQuery,
      maybeSingle: async () => ({
        data: {
          id: conversationId,
          organization_id: organizationId,
          created_by: userId,
        },
        error: null,
      }),
    };

    const messageRows = [
      {
        role: 'assistant',
        content: 'Queued for asynchronous execution.',
        state: 'queued',
        created_at: '2026-04-02T10:00:01.000Z',
        source_task_id: '44444444-4444-4444-8444-444444444444',
        correlation_id: 'c-1',
      },
      {
        role: 'user',
        content: 'in 30 minutes do X',
        state: 'done',
        created_at: '2026-04-02T10:00:00.000Z',
        source_task_id: null,
        correlation_id: 'c-1',
      },
    ];

    const messagesQuery: SupabaseQueryMock = {
      select: () => messagesQuery,
      eq: () => messagesQuery,
      order: () => messagesQuery,
      limit: () => messagesQuery,
      then: (resolve) => Promise.resolve({ data: messageRows, error: null }).then(resolve),
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'command_conversations') return conversationQuery;
      if (table === 'command_messages') return messagesQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    await processQueuedTask({
      id: '55555555-5555-4555-8555-555555555555',
      organization_id: organizationId,
      user_id: userId,
      domain_action: 'assistant.command',
      status: 'queued',
      payload: {
        command: 'confirm',
        conversation_id: conversationId,
      },
      result: {},
      topic: 'Command Center',
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.objectContaining({
          payload: expect.objectContaining({
            conversation_context: [
              expect.objectContaining({ role: 'user', content: 'in 30 minutes do X' }),
              expect.objectContaining({ role: 'assistant', content: 'Queued for asynchronous execution.' }),
            ],
          }),
        }),
      }),
      expect.any(Object),
    );
  });

  it('hydrates channel thread conversation context for user-initiated telegram commands', async () => {
    const organizationId = '11111111-1111-1111-1111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const currentTaskId = '88888888-8888-4888-8888-888888888888';

    type SupabaseQueryMock = {
      select: (columns: string) => SupabaseQueryMock;
      eq: (key: string, value: unknown) => SupabaseQueryMock;
      in?: (key: string, values: unknown[]) => SupabaseQueryMock;
      neq?: (key: string, value: unknown) => SupabaseQueryMock;
      order?: (key: string, options?: { ascending?: boolean }) => SupabaseQueryMock;
      limit?: (count: number) => SupabaseQueryMock;
      maybeSingle?: () => Promise<{ data: unknown; error: null }>;
      then?: (resolve: (value: { data: unknown; error: null }) => unknown) => Promise<unknown>;
    };

    const taskRows = [
      {
        id: 'prev-assistant-1',
        domain_action: 'channel.send',
        status: 'done',
        payload: {
          channel: 'telegram',
          thread_id: 'tg-thread-1',
          message_text: 'Brouillon prêt. Veux-tu que je l’ajuste ?',
          correlation_id: 'c-assistant',
        },
        created_at: '2026-04-03T10:00:10.000Z',
      },
      {
        id: 'prev-user-1',
        domain_action: 'assistant.command',
        status: 'done',
        payload: {
          channel: 'telegram',
          thread_id: 'tg-thread-1',
          message_text: 'Draft an email update to alexis@example.com',
          correlation_id: 'c-user',
        },
        created_at: '2026-04-03T10:00:00.000Z',
      },
    ];

    let tasksQuery!: SupabaseQueryMock;
    const tasksEqSpy = vi.fn((_key: string, _value: unknown) => tasksQuery);

    tasksQuery = {
      select: () => tasksQuery,
      eq: tasksEqSpy,
      in: () => tasksQuery,
      neq: () => tasksQuery,
      order: () => tasksQuery,
      limit: () => tasksQuery,
      then: (resolve) => Promise.resolve({ data: taskRows, error: null }).then(resolve),
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'tasks') return tasksQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    await processQueuedTask({
      id: currentTaskId,
      organization_id: organizationId,
      user_id: userId,
      domain_action: 'assistant.command',
      status: 'queued',
      payload: {
        message_text: 'Can you update the recipient to team@example.com?',
        channel: 'telegram',
        source: 'telegram-webhook',
        user_initiated: true,
        thread_id: 'tg-thread-1',
        external_message_id: 'tg-msg-2',
      },
      result: {},
      topic: undefined,
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.objectContaining({
          payload: expect.objectContaining({
            conversation_context: [
              expect.objectContaining({ role: 'user', content: 'Draft an email update to alexis@example.com' }),
              expect.objectContaining({ role: 'assistant', content: 'Brouillon prêt. Veux-tu que je l’ajuste ?' }),
            ],
          }),
        }),
      }),
      expect.any(Object),
    );
    expect(tasksEqSpy).toHaveBeenCalledWith('user_id', userId);
  });
});
