import { beforeEach, describe, expect, it } from 'vitest';
import {
  StatusReportScheduler,
  buildStatusReportIdempotencyKey,
  resolveWeeklyReportingWindow,
} from './StatusReportScheduler.js';

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
                const idempotency = payload?.idempotency_key;
                const found = state.tasks.find((task) => {
                  const taskPayload = task.payload as Record<string, unknown> | undefined;
                  return task.organization_id === filters.organization_id
                    && task.domain_action === filters.domain_action
                    && taskPayload?.idempotency_key === idempotency;
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

describe('StatusReportScheduler', () => {
  let state: SchedulerState;

  beforeEach(() => {
    state = {
      organizations: [{ id: 'org-1' }],
      tasks: [],
      inserted: [],
    };
  });

  it('queues a status.report task at the reporting trigger window', async () => {
    const now = new Date('2026-03-13T17:00:00.000Z'); // Friday
    const scheduler = new StatusReportScheduler({
      now: () => now,
      supabaseClient: createMockSupabase(state),
    });

    await scheduler.checkAndTriggerReports();

    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toEqual(
      expect.objectContaining({
        organization_id: 'org-1',
        domain_action: 'status.report',
        status: 'queued',
        topic: 'Relancing',
      }),
    );
  });

  it('skips queueing when an idempotent task already exists for the same window', async () => {
    const now = new Date('2026-03-13T17:00:00.000Z');
    const window = resolveWeeklyReportingWindow(now);
    const key = buildStatusReportIdempotencyKey('org-1', window.start, window.end);

    state.tasks.push({
      id: 'task-existing',
      organization_id: 'org-1',
      domain_action: 'status.report',
      payload: { idempotency_key: key },
    });

    const scheduler = new StatusReportScheduler({
      now: () => now,
      supabaseClient: createMockSupabase(state),
    });

    await scheduler.checkAndTriggerReports();

    expect(state.inserted).toHaveLength(0);
  });

  it('does not queue outside the configured reporting slot', async () => {
    const now = new Date('2026-03-12T17:00:00.000Z'); // Thursday
    const scheduler = new StatusReportScheduler({
      now: () => now,
      supabaseClient: createMockSupabase(state),
    });

    await scheduler.checkAndTriggerReports();

    expect(state.inserted).toHaveLength(0);
  });
});
