import { describe, expect, it } from 'vitest';
import type { Task } from '@ai-assistant/shared';
import { syncScheduledTaskCompletion } from './ScheduledTaskLifecycle.js';

type ScheduleRow = {
  id: string;
  organization_id: string;
  failure_count: number;
  is_active: boolean;
  last_run: string | null;
  next_run: string;
  updated_at?: string;
  last_error?: string | null;
};

function createScheduledTask(triggerTime: string): Task {
  return {
    id: 'task-1',
    organization_id: 'org-1',
    user_id: 'user-1',
    domain_action: 'email.check',
    status: 'queued',
    payload: {
      scheduled: true,
      schedule_id: 'schedule-1',
      cron_expression: '0 * * * *',
      timezone: 'UTC',
      trigger_time: triggerTime,
    },
  };
}

function createMockSupabase(row: ScheduleRow) {
  return {
    from: (table: string) => {
      if (table !== 'user_schedules') {
        throw new Error(`Unhandled table: ${table}`);
      }

      return {
        select: () => {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq: (column: string, value: unknown) => {
              filters[column] = value;
              return chain;
            },
            maybeSingle: async () => ({
              data: row.id === filters.id && row.organization_id === filters.organization_id ? row : null,
              error: null,
            }),
          };

          return chain;
        },
        update: (patch: Record<string, unknown>) => ({
          eq: async (_column: string, id: string) => {
            if (row.id === id) {
              Object.assign(row, patch);
            }

            return { error: null };
          },
        }),
      };
    },
  };
}

describe('syncScheduledTaskCompletion', () => {
  it('updates last_run and next_run after successful completion', async () => {
    const row: ScheduleRow = {
      id: 'schedule-1',
      organization_id: 'org-1',
      failure_count: 2,
      is_active: true,
      last_run: null,
      next_run: '2026-03-20T09:00:00.000Z',
      last_error: 'previous failure',
    };

    await syncScheduledTaskCompletion(
      createScheduledTask('2026-03-20T09:00:00.000Z'),
      'done',
      null,
      {
        now: () => new Date('2026-03-20T09:05:00.000Z'),
        supabaseClient: createMockSupabase(row),
      },
    );

    expect(row.last_run).toBe('2026-03-20T09:00:00.000Z');
    expect(row.next_run).toBe('2026-03-20T10:00:00.000Z');
    expect(row.failure_count).toBe(0);
    expect(row.last_error).toBeNull();
  });

  it('increments failure count, advances next_run, and disables at the max failure threshold', async () => {
    const row: ScheduleRow = {
      id: 'schedule-1',
      organization_id: 'org-1',
      failure_count: 2,
      is_active: true,
      last_run: '2026-03-20T08:00:00.000Z',
      next_run: '2026-03-20T09:00:00.000Z',
      last_error: null,
    };

    await syncScheduledTaskCompletion(
      createScheduledTask('2026-03-20T09:00:00.000Z'),
      'error',
      'processor execution failed',
      {
        maxFailures: 3,
        now: () => new Date('2026-03-20T09:05:00.000Z'),
        supabaseClient: createMockSupabase(row),
      },
    );

    expect(row.failure_count).toBe(3);
    expect(row.is_active).toBe(false);
    expect(row.last_error).toBe('processor execution failed');
    expect(row.next_run).toBe('2026-03-20T10:00:00.000Z');
  });

  it('does not reactivate schedules that were already inactive', async () => {
    const row: ScheduleRow = {
      id: 'schedule-1',
      organization_id: 'org-1',
      failure_count: 0,
      is_active: false,
      last_run: '2026-03-20T08:00:00.000Z',
      next_run: '2026-03-20T09:00:00.000Z',
      last_error: null,
    };

    await syncScheduledTaskCompletion(
      createScheduledTask('2026-03-20T09:00:00.000Z'),
      'done',
      null,
      {
        now: () => new Date('2026-03-20T09:05:00.000Z'),
        supabaseClient: createMockSupabase(row),
      },
    );

    expect(row.is_active).toBe(false);
    expect(row.last_run).toBe('2026-03-20T09:00:00.000Z');
    expect(row.next_run).toBe('2026-03-20T10:00:00.000Z');
  });
});
