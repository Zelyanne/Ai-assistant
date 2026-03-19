import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EODScheduler } from './EODScheduler.js';

type SchedulerState = {
  organizations: Array<{ id: string }>;
  tasks: Array<Record<string, unknown>>;
  inserted: Array<Record<string, unknown>>;
};

function createMockSupabase(state: SchedulerState): { from: (table: string) => any } {
  return {
    from: (table: string) => {
      if (table === 'organizations') {
        return {
          select: async () => ({ data: state.organizations, error: null }),
        };
      }

      if (table === 'tasks') {
        return {
          select: () => {
            const filters: Record<string, unknown> = {};
            const chain = {
              eq: (column: string, value: unknown) => {
                filters[column] = value;
                return chain;
              },
              contains: (_column: string, value: Record<string, unknown>) => {
                filters.payload = value;
                return chain;
              },
              order: () => chain,
              limit: () => chain,
              maybeSingle: async () => {
                const payload = filters.payload as Record<string, unknown> | undefined;
                const eodDate = payload?.eod_date;
                const found = state.tasks.find((task) => {
                  const taskPayload = task.payload as Record<string, unknown> | undefined;
                  return task.organization_id === filters.organization_id
                    && task.domain_action === filters.domain_action
                    && taskPayload?.eod_date === eodDate;
                });

                return { data: found ? { id: String(found.id ?? 'task-existing') } : null, error: null };
              },
            };

            return chain;
          },
          insert: async (payload: Record<string, unknown>) => {
            state.inserted.push(payload);
            state.tasks.push({ ...payload, id: `task-${state.tasks.length + 1}` });
            return { error: null };
          },
        };
      }

      throw new Error(`Unhandled table: ${table}`);
    },
  };
}

describe('EODScheduler', () => {
  let state: SchedulerState;

  beforeEach(() => {
    vi.useFakeTimers();
    state = {
      organizations: [{ id: 'org-1' }, { id: 'org-2' }],
      tasks: [],
      inserted: [],
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('queues one eod.memory.rotate task per organization at the default trigger time', async () => {
    vi.setSystemTime(new Date('2026-03-19T23:00:00.000Z'));

    const scheduler = new EODScheduler({
      triggerTimeUtc: '23:00',
      supabaseClient: createMockSupabase(state),
    });

    await scheduler.checkAndTriggerEOD();

    expect(state.inserted).toHaveLength(2);
    expect(state.inserted[0]).toEqual(
      expect.objectContaining({
        organization_id: 'org-1',
        domain_action: 'eod.memory.rotate',
        status: 'queued',
        topic: 'Memory',
      }),
    );
    expect((state.inserted[0].payload as Record<string, unknown>).eod_date).toBe('2026-03-19');
  });

  it('respects per-organization trigger time overrides', async () => {
    vi.setSystemTime(new Date('2026-03-19T22:30:00.000Z'));

    const scheduler = new EODScheduler({
      triggerTimeUtc: '23:00',
      organizationTriggerTimeOverrides: {
        'org-2': '22:30',
      },
      supabaseClient: createMockSupabase(state),
    });

    await scheduler.checkAndTriggerEOD();

    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0].organization_id).toBe('org-2');
    expect((state.inserted[0].payload as Record<string, unknown>).trigger_time_utc).toBe('22:30');
  });

  it('skips queueing when an idempotent eod task already exists for org and date', async () => {
    state.tasks.push({
      id: 'task-existing',
      organization_id: 'org-1',
      domain_action: 'eod.memory.rotate',
      payload: { eod_date: '2026-03-19' },
    });
    vi.setSystemTime(new Date('2026-03-19T23:00:00.000Z'));

    const scheduler = new EODScheduler({
      triggerTimeUtc: '23:00',
      supabaseClient: createMockSupabase(state),
    });

    await scheduler.checkAndTriggerEOD();

    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0].organization_id).toBe('org-2');
  });

  it('polls on an interval without double-queueing the same trigger slot', async () => {
    vi.setSystemTime(new Date('2026-03-19T22:59:00.000Z'));

    const scheduler = new EODScheduler({
      checkIntervalMs: 60 * 1000,
      triggerTimeUtc: '23:00',
      supabaseClient: createMockSupabase(state),
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(60 * 1000);
    await vi.advanceTimersByTimeAsync(60 * 1000);
    scheduler.stop();

    expect(state.inserted).toHaveLength(2);
  });
});
