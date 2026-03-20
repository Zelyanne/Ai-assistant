import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CronSchedulerService,
  computeNextRunFromCron,
} from './CronSchedulerService.js';

type ScheduleRow = {
  id: string;
  organization_id: string;
  user_id: string;
  task_type: string;
  task_payload: Record<string, unknown>;
  cron_expression: string;
  timezone: string;
  is_active: boolean;
  next_run: string;
  last_run: string | null;
  failure_count: number;
  last_error: string | null;
};

type DispatchRow = {
  id: string;
  organization_id: string;
  schedule_id: string;
  dispatch_window_start: string;
  dispatch_window_end: string;
  task_id: string | null;
};

type MockState = {
  schedules: ScheduleRow[];
  dispatches: DispatchRow[];
  tasks: Array<Record<string, unknown>>;
};

function createMockSupabase(state: MockState, options?: { failTaskInsert?: boolean }) {
  return {
    from: (table: string) => {
      if (table === 'user_schedules') {
        return {
          select: () => {
            const filters: Record<string, unknown> = {};
            const chain = {
              eq: (column: string, value: unknown) => {
                filters[column] = value;
                return chain;
              },
              lte: async (_column: string, value: string) => {
                const due = state.schedules.filter((row) =>
                  row.is_active === true
                  && new Date(row.next_run).getTime() <= new Date(value).getTime());
                return { data: due, error: null };
              },
            };
            return chain;
          },
          update: (payload: Record<string, unknown>) => ({
            eq: async (_column: string, id: string) => {
              state.schedules = state.schedules.map((row) => (row.id === id ? { ...row, ...payload } : row));
              return { error: null };
            },
          }),
        };
      }

      if (table === 'user_schedule_dispatches') {
        return {
          select: () => {
            const filters: Record<string, unknown> = {};
            const chain = {
              eq: (column: string, value: unknown) => {
                filters[column] = value;
                return chain;
              },
              maybeSingle: async () => {
                const found = state.dispatches.find((row) =>
                  row.schedule_id === filters.schedule_id
                  && row.dispatch_window_start === filters.dispatch_window_start);
                return { data: found ? { id: found.id } : null, error: null };
              },
            };
            return chain;
          },
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const duplicate = state.dispatches.find((row) =>
                  row.schedule_id === payload.schedule_id
                  && row.dispatch_window_start === payload.dispatch_window_start);
                if (duplicate) {
                  return { data: null, error: { message: 'duplicate', code: '23505' } };
                }

                const inserted: DispatchRow = {
                  id: crypto.randomUUID(),
                  organization_id: String(payload.organization_id),
                  schedule_id: String(payload.schedule_id),
                  dispatch_window_start: String(payload.dispatch_window_start),
                  dispatch_window_end: String(payload.dispatch_window_end),
                  task_id: null,
                };
                state.dispatches.push(inserted);
                return { data: { id: inserted.id }, error: null };
              },
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async (_column: string, id: string) => {
              state.dispatches = state.dispatches.map((row) => (row.id === id ? { ...row, ...payload } : row));
              return { error: null };
            },
          }),
          delete: () => ({
            eq: async (_column: string, id: string) => {
              state.dispatches = state.dispatches.filter((row) => row.id !== id);
              return { error: null };
            },
          }),
        };
      }

      if (table === 'tasks') {
        return {
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                if (options?.failTaskInsert) {
                  return { data: null, error: { message: 'insert failed' } };
                }

                const id = crypto.randomUUID();
                state.tasks.push({ ...payload, id });
                return { data: { id }, error: null };
              },
            }),
          }),
        };
      }

      throw new Error(`Unhandled table ${table}`);
    },
  };
}

describe('CronSchedulerService', () => {
  const now = new Date('2026-03-20T10:00:00.000Z');
  let state: MockState;

  beforeEach(() => {
    state = {
      schedules: [],
      dispatches: [],
      tasks: [],
    };
  });

  it('queues tasks for due active schedules without mutating schedule timestamps before completion', async () => {
    state.schedules.push({
      id: '11111111-1111-4111-8111-111111111111',
      organization_id: '22222222-2222-4222-8222-222222222222',
      user_id: '33333333-3333-4333-8333-333333333333',
      task_type: 'email.check',
      task_payload: { source: 'scheduler' },
      cron_expression: '0 * * * *',
      timezone: 'UTC',
      is_active: true,
      next_run: '2026-03-20T09:59:00.000Z',
      last_run: null,
      failure_count: 0,
      last_error: null,
    });

    const scheduler = new CronSchedulerService({
      now: () => now,
      supabaseClient: createMockSupabase(state),
      auditLogger: {
        flush: vi.fn(async () => undefined),
      },
      maxFailures: 3,
    });

    await scheduler.runCycle();

    expect(state.tasks).toHaveLength(2);
    expect(state.tasks[0].domain_action).toBe('email.check');
    expect((state.tasks[0].payload as Record<string, unknown>).schedule_id).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect((state.tasks[0].payload as Record<string, unknown>).trigger_time).toBe('2026-03-20T09:59:00.000Z');
    expect((state.tasks[1].payload as Record<string, unknown>).trigger_time).toBe('2026-03-20T10:00:00.000Z');
    expect(state.schedules[0].last_run).toBeNull();
    expect(state.schedules[0].next_run).toBe('2026-03-20T09:59:00.000Z');
    expect(state.dispatches).toHaveLength(2);
  });

  it('queues one task per missed schedule window during catch-up', async () => {
    const catchUpNow = new Date('2026-03-20T10:30:00.000Z');

    state.schedules.push({
      id: '11111111-1111-4111-8111-111111111111',
      organization_id: '22222222-2222-4222-8222-222222222222',
      user_id: '33333333-3333-4333-8333-333333333333',
      task_type: 'email.check',
      task_payload: { source: 'scheduler' },
      cron_expression: '0 * * * *',
      timezone: 'UTC',
      is_active: true,
      next_run: '2026-03-20T08:00:00.000Z',
      last_run: null,
      failure_count: 0,
      last_error: null,
    });

    const scheduler = new CronSchedulerService({
      now: () => catchUpNow,
      supabaseClient: createMockSupabase(state),
      auditLogger: {
        flush: vi.fn(async () => undefined),
      },
      maxFailures: 3,
    });

    await scheduler.runCycle();

    expect(state.tasks).toHaveLength(3);
    expect(state.tasks.map((task) => (task.payload as Record<string, unknown>).trigger_time)).toEqual([
      '2026-03-20T08:00:00.000Z',
      '2026-03-20T09:00:00.000Z',
      '2026-03-20T10:00:00.000Z',
    ]);
  });

  it('does not create duplicate tasks for the same dispatch window', async () => {
    state.schedules.push({
      id: '11111111-1111-4111-8111-111111111111',
      organization_id: '22222222-2222-4222-8222-222222222222',
      user_id: '33333333-3333-4333-8333-333333333333',
      task_type: 'email.check',
      task_payload: {},
      cron_expression: '0 * * * *',
      timezone: 'UTC',
      is_active: true,
      next_run: '2026-03-20T09:59:00.000Z',
      last_run: null,
      failure_count: 0,
      last_error: null,
    });

    state.dispatches.push({
      id: '44444444-4444-4444-8444-444444444444',
      organization_id: '22222222-2222-4222-8222-222222222222',
      schedule_id: '11111111-1111-4111-8111-111111111111',
      dispatch_window_start: '2026-03-20T09:59:00.000Z',
      dispatch_window_end: '2026-03-20T10:00:00.000Z',
      task_id: '55555555-5555-4555-8555-555555555555',
    });

    const scheduler = new CronSchedulerService({
      now: () => now,
      supabaseClient: createMockSupabase(state),
      auditLogger: {
        flush: vi.fn(async () => undefined),
      },
    });

    await scheduler.runCycle();

    expect(state.tasks).toHaveLength(1);
    expect((state.tasks[0].payload as Record<string, unknown>).trigger_time).toBe('2026-03-20T10:00:00.000Z');
  });

  it('increments failure_count and deactivates schedule at max failures', async () => {
    state.schedules.push({
      id: '11111111-1111-4111-8111-111111111111',
      organization_id: '22222222-2222-4222-8222-222222222222',
      user_id: '33333333-3333-4333-8333-333333333333',
      task_type: 'email.check',
      task_payload: {},
      cron_expression: '0 * * * *',
      timezone: 'UTC',
      is_active: true,
      next_run: '2026-03-20T09:59:00.000Z',
      last_run: null,
      failure_count: 2,
      last_error: null,
    });

    const scheduler = new CronSchedulerService({
      now: () => now,
      supabaseClient: createMockSupabase(state, { failTaskInsert: true }),
      auditLogger: {
        flush: vi.fn(async () => undefined),
      },
      maxFailures: 3,
    });

    await scheduler.runCycle();

    expect(state.schedules[0].failure_count).toBe(3);
    expect(state.schedules[0].is_active).toBe(false);
    expect(state.schedules[0].last_error).toContain('insert failed');
    expect(state.dispatches).toHaveLength(0);
  });

  it('computes next run in UTC for a basic hourly cron', () => {
    const nextRun = computeNextRunFromCron('0 * * * *', 'UTC', now);
    expect(nextRun.toISOString()).toBe('2026-03-20T11:00:00.000Z');
  });

  it('computes next run correctly for non-UTC timezone schedules', () => {
    const nextRun = computeNextRunFromCron('0 9 * * *', 'America/New_York', now);
    expect(nextRun.toISOString()).toBe('2026-03-20T13:00:00.000Z');
  });
});
