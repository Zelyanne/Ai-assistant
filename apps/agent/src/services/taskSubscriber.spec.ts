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

const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
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

vi.mock('./llm/factory.js', () => ({
  LLMProviderFactory: {
    getProvider: () => ({
      generateText: mockGenerateText,
    }),
  },
}));

describe('processQueuedTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    mockGetHandler.mockReturnValue(null);
    mockFlush.mockResolvedValue(undefined);
    mockGenerateText.mockResolvedValue({
      data: 'Compressed session: user is iterating on a Telegram Gmail draft; preserve recipient and latest constraints.',
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120, latencyMs: 1 },
      model: 'test-model',
    });
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

  it('marks the task and command message as error when graph execution fails', async () => {
    const taskId = '66666666-6666-4666-8666-666666666666';
    mockInvoke.mockRejectedValueOnce(new Error('planner exploded'));

    const taskEq = vi.fn().mockResolvedValue({ error: null });
    const taskUpdate = vi.fn(() => ({ eq: taskEq }));
    const messageEqRole = vi.fn().mockResolvedValue({ error: null });
    const messageEqTask = vi.fn(() => ({ eq: messageEqRole }));
    const messageUpdate = vi.fn(() => ({ eq: messageEqTask }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'tasks') return { update: taskUpdate };
      if (table === 'command_messages') return { update: messageUpdate };
      throw new Error(`Unexpected table: ${table}`);
    });

    await processQueuedTask({
      id: taskId,
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      domain_action: 'assistant.command',
      status: 'queued',
      payload: {
        command: 'research something current',
      },
      result: {},
      topic: 'Command Center',
    });

    expect(taskUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      result: expect.objectContaining({
        summary: 'Command execution failed before it could finish. Please retry.',
        error: expect.stringContaining('planner exploded'),
      }),
    }));
    expect(taskEq).toHaveBeenCalledWith('id', taskId);
    expect(messageUpdate).toHaveBeenCalledWith(expect.objectContaining({
      state: 'error',
      content: 'Command execution failed before it could finish. Please retry.',
    }));
    expect(messageEqTask).toHaveBeenCalledWith('source_task_id', taskId);
    expect(messageEqRole).toHaveBeenCalledWith('role', 'assistant');
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
      gte?: (key: string, value: unknown) => SupabaseQueryMock;
      lt?: (key: string, value: unknown) => SupabaseQueryMock;
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

    const tasksEqSpy = vi.fn((_key: string, _value: unknown) => tasksQuery);
    const tasksGteSpy = vi.fn((_key: string, _value: unknown) => tasksQuery);
    const tasksLtSpy = vi.fn((_key: string, _value: unknown) => tasksQuery);

    const tasksQuery: SupabaseQueryMock = {
      select: () => tasksQuery,
      eq: tasksEqSpy,
      gte: tasksGteSpy,
      lt: tasksLtSpy,
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
      created_at: '2026-04-03T12:00:00.000Z',
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
    expect(tasksGteSpy).toHaveBeenCalledWith('created_at', '2026-04-03T00:00:00.000Z');
    expect(tasksLtSpy).toHaveBeenCalledWith('created_at', '2026-04-04T00:00:00.000Z');
  });

  it('compresses long telegram thread history while keeping recent turns verbatim', async () => {
    const organizationId = '11111111-1111-1111-1111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const currentTaskId = '99999999-9999-4999-8999-999999999999';
    const updateSpy = vi.fn(() => ({
      eq: vi.fn().mockReturnThis(),
    }));

    type SupabaseQueryMock = {
      select: (columns: string) => SupabaseQueryMock;
      eq: (key: string, value: unknown) => SupabaseQueryMock;
      gte?: (key: string, value: unknown) => SupabaseQueryMock;
      lt?: (key: string, value: unknown) => SupabaseQueryMock;
      in?: (key: string, values: unknown[]) => SupabaseQueryMock;
      neq?: (key: string, value: unknown) => SupabaseQueryMock;
      order?: (key: string, options?: { ascending?: boolean }) => SupabaseQueryMock;
      limit?: (count: number) => SupabaseQueryMock;
      update?: (values: Record<string, unknown>) => { eq: (key: string, value: unknown) => unknown };
      then?: (resolve: (value: { data: unknown; error: null }) => unknown) => Promise<unknown>;
    };

    const longText = 'Older telegram turn with Gmail drafting constraints. '.repeat(450);
    const taskRows = Array.from({ length: 22 }, (_, index) => ({
      id: `prev-${index}`,
      domain_action: index % 2 === 0 ? 'assistant.command' : 'channel.send',
      status: 'done',
      payload: {
        channel: 'telegram',
        thread_id: 'tg-thread-long',
        message_text: index < 4 ? `${longText}${index}` : `Recent turn ${index}`,
        correlation_id: `c-${index}`,
        ...(index === 0 ? { conversation_summary: 'Previous compacted summary.' } : {}),
      },
      created_at: `2026-04-03T10:${String(index).padStart(2, '0')}:00.000Z`,
    })).reverse();

    const tasksQuery: SupabaseQueryMock = {
      select: () => tasksQuery,
      eq: () => tasksQuery,
      gte: () => tasksQuery,
      lt: () => tasksQuery,
      in: () => tasksQuery,
      neq: () => tasksQuery,
      order: () => tasksQuery,
      limit: () => tasksQuery,
      update: updateSpy,
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
        message_text: 'Continue the Telegram thread',
        channel: 'telegram',
        source: 'telegram-webhook',
        user_initiated: true,
        thread_id: 'tg-thread-long',
        external_message_id: 'tg-msg-long',
      },
      result: {},
      topic: undefined,
      created_at: '2026-04-03T12:00:00.000Z',
    });

    expect(mockGenerateText).toHaveBeenCalledOnce();
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          conversation_summary: expect.stringContaining('Compressed session'),
        }),
      }),
    );
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.objectContaining({
          payload: expect.objectContaining({
            conversation_context: expect.arrayContaining([
              expect.objectContaining({ role: 'system', state: 'compressed' }),
              expect.objectContaining({ content: 'Recent turn 21' }),
            ]),
          }),
        }),
      }),
      expect.any(Object),
    );
  });

  it('compresses telegram day history when the context message limit is exceeded', async () => {
    const organizationId = '11111111-1111-1111-1111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const currentTaskId = '99999999-9999-4999-8999-999999999998';
    const updateSpy = vi.fn(() => ({
      eq: vi.fn().mockReturnThis(),
    }));

    type SupabaseQueryMock = {
      select: (columns: string) => SupabaseQueryMock;
      eq: (key: string, value: unknown) => SupabaseQueryMock;
      gte?: (key: string, value: unknown) => SupabaseQueryMock;
      lt?: (key: string, value: unknown) => SupabaseQueryMock;
      in?: (key: string, values: unknown[]) => SupabaseQueryMock;
      neq?: (key: string, value: unknown) => SupabaseQueryMock;
      order?: (key: string, options?: { ascending?: boolean }) => SupabaseQueryMock;
      limit?: (count: number) => SupabaseQueryMock;
      update?: (values: Record<string, unknown>) => { eq: (key: string, value: unknown) => unknown };
      then?: (resolve: (value: { data: unknown; error: null }) => unknown) => Promise<unknown>;
    };

    const taskRows = Array.from({ length: 45 }, (_, index) => ({
      id: `daily-prev-${index}`,
      domain_action: index % 2 === 0 ? 'assistant.command' : 'channel.send',
      status: 'done',
      payload: {
        channel: 'telegram',
        thread_id: 'tg-thread-daily-limit',
        message_text: `Same-day Telegram turn ${index}`,
        correlation_id: `daily-c-${index}`,
      },
      created_at: `2026-04-03T10:${String(index).padStart(2, '0')}:00.000Z`,
    })).reverse();

    const tasksQuery: SupabaseQueryMock = {
      select: () => tasksQuery,
      eq: () => tasksQuery,
      gte: () => tasksQuery,
      lt: () => tasksQuery,
      in: () => tasksQuery,
      neq: () => tasksQuery,
      order: () => tasksQuery,
      limit: () => tasksQuery,
      update: updateSpy,
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
        message_text: 'Continue the same-day Telegram thread',
        channel: 'telegram',
        source: 'telegram-webhook',
        user_initiated: true,
        thread_id: 'tg-thread-daily-limit',
        external_message_id: 'tg-msg-daily-limit',
      },
      result: {},
      topic: undefined,
      created_at: '2026-04-03T12:00:00.000Z',
    });

    const invokedTask = (mockInvoke.mock.calls[0]?.[0] as { task?: { payload?: { conversation_context?: unknown[] } } }).task;
    const context = invokedTask?.payload?.conversation_context ?? [];

    expect(mockGenerateText).toHaveBeenCalledOnce();
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          conversation_summary: expect.stringContaining('Compressed session'),
        }),
      }),
    );
    expect(context).toHaveLength(19);
    expect(context).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'system', state: 'compressed' }),
      expect.objectContaining({ content: 'Same-day Telegram turn 44' }),
    ]));
    expect(context).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ content: 'Same-day Telegram turn 0' }),
    ]));
  });
});
