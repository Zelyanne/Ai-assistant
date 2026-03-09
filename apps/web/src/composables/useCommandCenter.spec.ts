import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Profile } from '@ai-assistant/shared';

import { useCommandCenter } from './useCommandCenter';

async function waitFor(callback: () => void, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      callback();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  callback(); // One last try to throw the actual error
}

const { supabaseFromMock, resetSupabaseMock } = vi.hoisted(() => {
  let currentTable = '';
  let action: 'select' | 'insert' | 'update' = 'select';
  let insertRows: unknown = null;
  let updatePatch: unknown = null;

  const mockChain = {
    select: vi.fn((_columns?: string) => mockChain),
    eq: vi.fn((_key: string, _value: unknown) => mockChain),
    order: vi.fn((_column: string, _opts?: unknown) => mockChain),
    limit: vi.fn((_n: number) => mockChain),
    insert: vi.fn((rows: unknown) => {
      action = 'insert';
      insertRows = rows;
      return mockChain;
    }),
    update: vi.fn((patch: unknown) => {
      action = 'update';
      updatePatch = patch;
      return mockChain;
    }),
    single: vi.fn(async () => {
      if (currentTable === 'command_conversations' && action === 'insert') {
        return { data: { id: 'conv-1' }, error: null };
      }
      return { data: null, error: null };
    }),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    then: vi.fn((resolve: (value: unknown) => unknown) => {
      if (currentTable === 'command_messages' && action === 'insert') {
        const rows = Array.isArray(insertRows) ? insertRows : [];
        const data = rows.map((row: unknown, idx: number) => {
          const record = (row && typeof row === 'object' && !Array.isArray(row))
            ? (row as Record<string, unknown>)
            : {};
          return {
          id: `msg-${idx + 1}`,
          metadata: (record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata))
            ? record.metadata
            : {},
          };
        });
        return Promise.resolve(resolve({ data, error: null }));
      }

      if (currentTable === 'command_messages' && action === 'select') {
        return Promise.resolve(resolve({ data: [], error: null }));
      }

      if (currentTable === 'command_messages' && action === 'update') {
        return Promise.resolve(resolve({ data: updatePatch ?? null, error: null }));
      }

      if (currentTable === 'command_conversations' && action === 'select') {
        return Promise.resolve(resolve({ data: null, error: null }));
      }

      return Promise.resolve(resolve({ data: null, error: null }));
    }),
  };

  const supabaseFromMock = vi.fn((table: string) => {
    currentTable = table;
    action = 'select';
    insertRows = null;
    updatePatch = null;
    return mockChain;
  });

  function resetSupabaseMock(): void {
    supabaseFromMock.mockClear();
    mockChain.select.mockClear();
    mockChain.eq.mockClear();
    mockChain.order.mockClear();
    mockChain.limit.mockClear();
    mockChain.insert.mockClear();
    mockChain.update.mockClear();
    mockChain.single.mockClear();
    mockChain.maybeSingle.mockClear();
    mockChain.then.mockClear();
  }

  return { supabaseFromMock, resetSupabaseMock };
});

vi.mock('../services/supabase', () => ({
  supabase: {
    from: supabaseFromMock,
  },
}));

const submitTaskMock = vi.fn();
const subscribeToTableMock = vi.fn();

vi.mock('./useAgent', () => ({
  useAgent: () => ({
    submitTask: submitTaskMock,
    subscribeToTable: subscribeToTableMock,
  }),
}));

describe('useCommandCenter', () => {
  const subscriptions = new Map<string, (payload: { eventType?: string; new?: unknown }) => void>();
  const unsubs = new Map<string, ReturnType<typeof vi.fn>>();

  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    submitTaskMock.mockReset();
    subscribeToTableMock.mockReset();
    resetSupabaseMock();
    subscriptions.clear();
    unsubs.clear();

    subscribeToTableMock.mockImplementation((table: string, cb: (payload: { eventType?: string; new?: unknown }) => void) => {
      subscriptions.set(table, cb);
      const stop = vi.fn();
      unsubs.set(table, stop);
      return stop;
    });
  });

  it('queues low-risk command via assistant.command task', async () => {
    submitTaskMock.mockResolvedValue({ id: 'task-low-risk-1' });
    const center = useCommandCenter();

    const result = await center.submitCommand('Draft project summary');

    expect(result.queued).toBe(true);
    expect(result.requiresConfirmation).toBe(false);
    expect(submitTaskMock).toHaveBeenCalledWith(
      'assistant.command',
      expect.objectContaining({
        command: 'Draft project summary',
        source: 'dashboard-command-center',
        high_risk: false,
      }),
      'Command Center'
    );
  });

  it('requires confirmation for high-risk command before enqueue', async () => {
    const center = useCommandCenter();

    const result = await center.submitCommand('Send email update to leadership');

    expect(result.requiresConfirmation).toBe(true);
    expect(result.queued).toBe(false);
    expect(submitTaskMock).not.toHaveBeenCalled();
  });

  it('queues high-risk command after confirmation force option', async () => {
    submitTaskMock.mockResolvedValue({ id: 'task-high-risk-1' });
    const center = useCommandCenter();

    const result = await center.submitCommand('Send email update to leadership', { force: true });

    expect(result.requiresConfirmation).toBe(false);
    expect(result.queued).toBe(true);
    expect(submitTaskMock).toHaveBeenCalledWith(
      'assistant.command',
      expect.objectContaining({
        high_risk: true,
      }),
      'Command Center'
    );
  });

  it('marks assistant entry as error when queue insert fails', async () => {
    submitTaskMock.mockResolvedValue(null);
    const center = useCommandCenter();

    const result = await center.submitCommand('Draft project summary');

    const lastEntry = center.timeline.value[center.timeline.value.length - 1];
    expect(result.queued).toBe(false);
    expect(lastEntry.state).toBe('error');
    expect(lastEntry.content).toContain('enqueue failed');
  });

  it('applies realtime task updates and cleans up subscriptions', async () => {
    submitTaskMock.mockResolvedValue({ id: 'task-realtime-1' });
    const center = useCommandCenter();

    const { useUserStore } = await import('../stores/user');
    const userStore = useUserStore();
    userStore.profile = {
      id: '123e4567-e89b-12d3-a456-426614174002',
      organization_id: '123e4567-e89b-12d3-a456-426614174001',
    } as Profile;

    center.startRealtimeSync();

    await waitFor(() => {
      expect(subscribeToTableMock).toHaveBeenCalledWith('tasks', expect.any(Function));
      expect(subscribeToTableMock).toHaveBeenCalledWith('command_messages', expect.any(Function));
    });

    await center.submitCommand('Draft project summary');

    const taskCallback = subscriptions.get('tasks');
    expect(taskCallback).toBeDefined();

    taskCallback?.({
      eventType: 'UPDATE',
      new: {
        id: 'task-realtime-1',
        status: 'processing',
        result: {},
      },
    });

    await waitFor(() => {
      const latestAssistantEntry = center.timeline.value.find((entry) => entry.taskId === 'task-realtime-1');
      expect(latestAssistantEntry?.state).toBe('processing');
    });

    center.stopRealtimeSync();
    expect(unsubs.get('tasks')).toHaveBeenCalledTimes(1);
    expect(unsubs.get('command_messages')).toHaveBeenCalledTimes(1);
  });

  it('supports submit -> queued -> processing -> done timeline progression', async () => {
    submitTaskMock.mockResolvedValue({ id: 'task-flow-1' });
    const center = useCommandCenter();

    const { useUserStore } = await import('../stores/user');
    const userStore = useUserStore();
    userStore.profile = {
      id: '123e4567-e89b-12d3-a456-426614174002',
      organization_id: '123e4567-e89b-12d3-a456-426614174001',
    } as Profile;

    center.startRealtimeSync();
    
    await waitFor(() => {
      expect(subscribeToTableMock).toHaveBeenCalledWith('tasks', expect.any(Function));
    });

    await center.submitCommand('Draft project summary');

    const taskCallback = subscriptions.get('tasks');
    taskCallback?.({
      eventType: 'UPDATE',
      new: {
        id: 'task-flow-1',
        status: 'processing',
        result: {},
      },
    });

    taskCallback?.({
      eventType: 'UPDATE',
      new: {
        id: 'task-flow-1',
        status: 'done',
        result: {
          summary: 'Status report generated successfully.',
        },
      },
    });

    await waitFor(() => {
      const assistantEntry = center.timeline.value.find((entry) => entry.taskId === 'task-flow-1');
      expect(assistantEntry?.state).toBe('done');
      expect(assistantEntry?.content).toContain('Status report generated successfully.');
    });

    center.stopRealtimeSync();
  });
});
