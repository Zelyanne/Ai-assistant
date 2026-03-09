import { beforeEach, describe, expect, it } from 'vitest';
import {
  RelancingScheduler,
  collectMissingSetupFields,
  deriveWindowBounds,
  resolveCadenceHours,
  resolveUrgencyBand,
} from './RelancingScheduler.js';

type MockState = {
  contexts: Array<Record<string, any>>;
  members: Array<Record<string, any>>;
  protocols: Array<Record<string, any>>;
  dispatches: Array<Record<string, any>>;
  tasks: Array<Record<string, any>>;
  logs: Array<Record<string, any>>;
  counters: {
    dispatch: number;
    task: number;
  };
};

function createMockSupabase(state: MockState): { from: (table: string) => any } {
  return {
    from: (table: string) => {
      if (table === 'project_scheduling_contexts') {
        return {
          select: () => ({
            eq: async (column: string, value: string) => ({
              data: state.contexts.filter((row) => row[column] === value),
              error: null,
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async (column: string, value: string) => {
              state.contexts = state.contexts.map((row) =>
                row[column] === value ? { ...row, ...payload } : row,
              );
              return { error: null };
            },
          }),
        };
      }

      if (table === 'project_member_assignments') {
        return {
          select: () => {
            const filters: Record<string, unknown> = {};
            const chain = {
              eq: (column: string, value: unknown) => {
                filters[column] = value;
                if (Object.keys(filters).length >= 2) {
                  return Promise.resolve({
                    data: state.members.filter(
                      (row) =>
                        row.project_context_id === filters.project_context_id
                        && row.is_active === filters.is_active,
                    ),
                    error: null,
                  });
                }
                return chain;
              },
            };
            return chain;
          },
        };
      }

      if (table === 'user_protocols') {
        return {
          select: () => ({
            eq: (_column: string, organizationId: string) => ({
              order: () => ({
                limit: async () => ({
                  data: state.protocols.filter((row) => row.organization_id === organizationId),
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'project_nudge_dispatches') {
        return {
          select: () => {
            const filters: Record<string, unknown> = {};
            const chain = {
              eq: (column: string, value: unknown) => {
                filters[column] = value;
                return chain;
              },
              maybeSingle: async () => {
                const found = state.dispatches.find(
                  (row) => row.organization_id === filters.organization_id
                    && row.project_context_id === filters.project_context_id
                    && row.member_assignment_id === filters.member_assignment_id
                    && row.nudge_window_start === filters.nudge_window_start,
                );
                return { data: found ? { id: found.id } : null, error: null };
              },
            };
            return chain;
          },
          insert: (payload: Record<string, any>) => ({
            select: () => ({
              single: async () => {
                const duplicate = state.dispatches.find(
                  (row) => row.organization_id === payload.organization_id
                    && row.project_context_id === payload.project_context_id
                    && row.member_assignment_id === payload.member_assignment_id
                    && row.nudge_window_start === payload.nudge_window_start,
                );

                if (duplicate) {
                  return { data: null, error: { message: 'duplicate', code: '23505' } };
                }

                state.counters.dispatch += 1;
                const id = `dispatch-${state.counters.dispatch}`;
                state.dispatches.push({ ...payload, id, task_id: null });
                return { data: { id }, error: null };
              },
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async (_column: string, id: string) => {
              state.dispatches = state.dispatches.map((row) =>
                row.id === id ? { ...row, ...payload } : row,
              );
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
                state.counters.task += 1;
                const id = `task-${state.counters.task}`;
                state.tasks.push({ ...payload, id });
                return { data: { id }, error: null };
              },
            }),
          }),
        };
      }

      if (table === 'agent_activity_log') {
        return {
          insert: async (payload: Record<string, unknown>) => {
            state.logs.push(payload);
            return { error: null };
          },
        };
      }

      throw new Error(`Unhandled mock table: ${table}`);
    },
  };
}

describe('RelancingScheduler', () => {
  let state: MockState;
  const now = new Date('2026-03-08T12:00:00.000Z');

  beforeEach(() => {
    state = {
      contexts: [],
      members: [],
      protocols: [],
      dispatches: [],
      tasks: [],
      logs: [],
      counters: {
        dispatch: 0,
        task: 0,
      },
    };
  });

  it('queues relancing.nudge task for due complete setup', async () => {
    state.contexts.push({
      id: 'context-1',
      organization_id: 'org-1',
      project_name: 'Q2 Launch',
      deadline: '2026-03-20T12:00:00.000Z',
      setup_status: 'complete',
      scheduler_config: {},
      next_nudge_at: null,
      last_nudge_at: null,
      blocker_active: false,
      blocker_summary: null,
    });
    state.members.push({
      id: 'member-1',
      project_context_id: 'context-1',
      organization_id: 'org-1',
      member_name: 'Jordan',
      member_user_id: 'user-1',
      is_active: true,
    });
    state.protocols.push({
      organization_id: 'org-1',
      metadata: { nudging_frequency_hours: 24 },
    });

    const scheduler = new RelancingScheduler({
      now: () => now,
      supabaseClient: createMockSupabase(state),
      safetyControlsService: {
        isEmergencyBrakeEnabled: async () => false,
      },
    });

    await scheduler.runCycle();

    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].domain_action).toBe('relancing.nudge');
    expect(state.tasks[0].status).toBe('queued');
    expect((state.tasks[0].payload as Record<string, unknown>).reason_code).toBe('deadline_urgency');
    expect(state.dispatches[0].task_id).toBe('task-1');
  });

  it('prevents duplicate nudge insertion for same project/member/window', async () => {
    state.contexts.push({
      id: 'context-1',
      organization_id: 'org-1',
      project_name: 'Q2 Launch',
      deadline: '2026-03-20T12:00:00.000Z',
      setup_status: 'complete',
      scheduler_config: {},
      next_nudge_at: null,
      last_nudge_at: null,
      blocker_active: false,
      blocker_summary: null,
    });
    state.members.push({
      id: 'member-1',
      project_context_id: 'context-1',
      organization_id: 'org-1',
      member_name: 'Jordan',
      member_user_id: 'user-1',
      is_active: true,
    });
    state.protocols.push({ organization_id: 'org-1', metadata: { nudging_frequency_hours: 24 } });

    const window = deriveWindowBounds(now, 24);
    state.dispatches.push({
      id: 'dispatch-existing',
      organization_id: 'org-1',
      project_context_id: 'context-1',
      member_assignment_id: 'member-1',
      nudge_window_start: window.start.toISOString(),
      nudge_window_end: window.end.toISOString(),
      reason_code: 'deadline_urgency',
      task_id: 'task-existing',
    });

    const scheduler = new RelancingScheduler({
      now: () => now,
      supabaseClient: createMockSupabase(state),
      safetyControlsService: {
        isEmergencyBrakeEnabled: async () => false,
      },
    });

    await scheduler.runCycle();

    expect(state.tasks).toHaveLength(0);
    expect(state.logs.some((log) => JSON.stringify(log.reasoning_trace).includes('duplicate_prevented'))).toBe(true);
  });

  it('creates paused task with blocker reason when blocker is active', async () => {
    state.contexts.push({
      id: 'context-1',
      organization_id: 'org-1',
      project_name: 'Q2 Launch',
      deadline: '2026-03-20T12:00:00.000Z',
      setup_status: 'complete',
      scheduler_config: {},
      next_nudge_at: null,
      last_nudge_at: null,
      blocker_active: true,
      blocker_summary: 'Waiting on legal approval',
    });
    state.members.push({
      id: 'member-1',
      project_context_id: 'context-1',
      organization_id: 'org-1',
      member_name: 'Jordan',
      member_user_id: 'user-1',
      is_active: true,
    });

    const scheduler = new RelancingScheduler({
      now: () => now,
      supabaseClient: createMockSupabase(state),
      safetyControlsService: {
        isEmergencyBrakeEnabled: async () => false,
      },
    });

    await scheduler.runCycle();

    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].status).toBe('paused');
    expect((state.tasks[0].result as Record<string, unknown>).reason_code).toBe('blocker_paused');
  });

  it('honors explicit blocker adjustment policy even when blocker_active is false', async () => {
    state.contexts.push({
      id: 'context-1',
      organization_id: 'org-1',
      project_name: 'Q2 Launch',
      deadline: '2026-03-20T12:00:00.000Z',
      setup_status: 'complete',
      scheduler_config: {
        blocker_adjustment: {
          active: true,
          reason_code: 'blocker_paused',
        },
      },
      next_nudge_at: null,
      last_nudge_at: null,
      blocker_active: false,
      blocker_summary: 'Waiting on vendor response',
    });
    state.members.push({
      id: 'member-1',
      project_context_id: 'context-1',
      organization_id: 'org-1',
      member_name: 'Jordan',
      member_user_id: 'user-1',
      is_active: true,
    });

    const scheduler = new RelancingScheduler({
      now: () => now,
      supabaseClient: createMockSupabase(state),
      safetyControlsService: {
        isEmergencyBrakeEnabled: async () => false,
      },
    });

    await scheduler.runCycle();

    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].status).toBe('paused');
    expect((state.tasks[0].result as Record<string, unknown>).summary).toContain('blocker_paused');
  });

  it('resets setup_status when required setup fields are invalid', async () => {
    state.contexts.push({
      id: 'context-1',
      organization_id: 'org-1',
      project_name: '',
      deadline: null,
      setup_status: 'complete',
      scheduler_config: {},
      next_nudge_at: null,
      last_nudge_at: null,
      blocker_active: false,
      blocker_summary: null,
    });

    const scheduler = new RelancingScheduler({
      now: () => now,
      supabaseClient: createMockSupabase(state),
      safetyControlsService: {
        isEmergencyBrakeEnabled: async () => false,
      },
    });

    await scheduler.runCycle();

    expect(state.contexts[0].setup_status).toBe('incomplete');
    expect(state.logs.some((log) => JSON.stringify(log.reasoning_trace).includes('missing_required_fields'))).toBe(true);
  });

  it('applies deterministic urgency bands and cadence multipliers', () => {
    const dueIn10Days = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const dueIn5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const dueIn2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const overdue = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();

    expect(resolveUrgencyBand(dueIn10Days, now)).toBe('base');
    expect(resolveUrgencyBand(dueIn5Days, now)).toBe('urgent_7d');
    expect(resolveUrgencyBand(dueIn2Days, now)).toBe('urgent_3d');
    expect(resolveUrgencyBand(overdue, now)).toBe('overdue');

    expect(resolveCadenceHours(24, 'base')).toBe(24);
    expect(resolveCadenceHours(24, 'urgent_7d')).toBe(19.2);
    expect(resolveCadenceHours(24, 'urgent_3d')).toBe(16);
    expect(resolveCadenceHours(24, 'overdue')).toBe(12);
  });

  it('detects missing setup fields deterministically', () => {
    const missing = collectMissingSetupFields(
      {
        projectName: '',
        membersCount: 0,
        deadline: null,
      },
      now,
      false,
    );

    expect(missing).toEqual(['project_name', 'members', 'deadline']);
  });
});
