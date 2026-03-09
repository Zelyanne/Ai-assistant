import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@ai-assistant/shared';

type PostgrestResponse = { data: any; error: any };

function createSupabaseMock() {
  const state = {
    currentTable: '' as string,
    filters: new Map<string, unknown>(),
    inFilters: new Map<string, unknown[]>(),
    lastInsert: undefined as unknown,
    lastUpdate: undefined as unknown,
    memberAssignments: [] as Array<{ id: string; project_context_id: string; organization_id: string; member_user_id: string | null; is_active?: boolean }>,
    relancingUpdatesHistory: [] as Array<{ member_assignment_id: string; project_context_id: string; organization_id: string; source_user_id: string | null; correlation_id?: string | null; thread_id?: string | null; created_at?: string }>,
    contexts: new Map<string, {
      id: string;
      organization_id: string;
      setup_status: 'incomplete' | 'complete';
      project_name?: string;
      deadline?: string | null;
      scheduler_config?: Record<string, unknown>;
      blocker_active?: boolean;
    }>(),
    duplicateRelancingUpdate: false,
  };

  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn((payload: unknown) => {
      state.lastInsert = payload;
      return chain;
    }),
    update: vi.fn((payload: unknown) => {
      state.lastUpdate = payload;
      return chain;
    }),
    eq: vi.fn((key: string, value: unknown) => {
      state.filters.set(key, value);
      return chain;
    }),
    in: vi.fn((key: string, value: unknown[]) => {
      state.inFilters.set(key, value);
      return chain;
    }),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(async (): Promise<PostgrestResponse> => {
      if (state.currentTable === 'project_scheduling_contexts') {
        const contextId = String(state.filters.get('id'));
        const context = state.contexts.get(contextId);
        return { data: context ?? null, error: null };
      }

      if (state.currentTable === 'relancing_updates') {
        if (state.duplicateRelancingUpdate) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
        return { data: { id: 'rel-upd-1' }, error: null };
      }

      return { data: null, error: null };
    }),
    then: vi.fn((resolve: (value: PostgrestResponse) => unknown) => {
      if (state.currentTable === 'project_member_assignments') {
        const data = state.memberAssignments.filter((row) => {
          for (const [key, value] of state.filters.entries()) {
            const rowValue = (row as Record<string, unknown>)[key];
            if (typeof rowValue === 'undefined' && key === 'is_active') {
              if (value !== true) {
                return false;
              }
              continue;
            }
            if (rowValue !== value) {
              return false;
            }
          }
          return true;
        });
        return Promise.resolve(resolve({ data, error: null }));
      }

      if (state.currentTable === 'relancing_updates' && !state.lastInsert) {
        const data = state.relancingUpdatesHistory.filter((row) => {
          for (const [key, value] of state.filters.entries()) {
            if ((row as Record<string, unknown>)[key] !== value) {
              return false;
            }
          }
          for (const [key, values] of state.inFilters.entries()) {
            if (!values.includes((row as Record<string, unknown>)[key])) {
              return false;
            }
          }
          return true;
        });

        return Promise.resolve(resolve({ data, error: null }));
      }

      if (state.currentTable === 'relancing_update_events') {
        return Promise.resolve(resolve({ data: { id: 'evt-1' }, error: null }));
      }

      if (state.currentTable === 'project_scheduling_contexts' && state.lastUpdate) {
        return Promise.resolve(resolve({ data: { updated: true }, error: null }));
      }

      return Promise.resolve(resolve({ data: null, error: null }));
    }),
  };

  const supabase = {
    from: vi.fn((table: string) => {
      state.currentTable = table;
      state.filters = new Map();
      state.inFilters = new Map();
      state.lastInsert = undefined;
      state.lastUpdate = undefined;
      return chain;
    }),
  };

  return { supabase, state, chain };
}

describe('RelancingUpdateProcessor', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns setup_required when user_id is missing', async () => {
    const { supabase } = createSupabaseMock();
    vi.doMock('../services/supabase.js', () => ({ supabase }));

    const { RelancingUpdateProcessor } = await import('./RelancingUpdateProcessor.js');
    const processor = new RelancingUpdateProcessor();

    const task = {
      id: 'task-1',
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: null,
      status: 'queued',
      domain_action: 'relancing.update',
      payload: {
        channel: 'telegram',
        external_message_id: 'ext-1',
        thread_id: 'thread-1',
        organization_id: '11111111-1111-1111-1111-111111111111',
        user_id: null,
        message_text: 'Status update',
        correlation_id: 'corr-1',
        channel_metadata: {},
        raw_payload: {},
      },
    } as unknown as Task;

    const result = await processor.process(task);
    expect(result.outcome).toBe('setup_required');
    expect(supabase.from).toHaveBeenCalledWith('agent_activity_log');
  });

  it('returns ambiguity_escalated when the reply is too ambiguous to classify safely', async () => {
    const { supabase, state } = createSupabaseMock();
    vi.doMock('../services/supabase.js', () => ({ supabase }));

    state.memberAssignments = [
      {
        id: 'assign-1',
        project_context_id: 'ctx-1',
        organization_id: '11111111-1111-1111-1111-111111111111',
        member_user_id: '22222222-2222-4222-8222-222222222222',
      },
    ];
    state.contexts.set('ctx-1', {
      id: 'ctx-1',
      organization_id: '11111111-1111-1111-1111-111111111111',
      setup_status: 'complete',
      project_name: 'Q2 Launch',
      deadline: '2026-03-20T12:00:00.000Z',
      scheduler_config: {},
      blocker_active: false,
    });

    const { RelancingUpdateProcessor } = await import('./RelancingUpdateProcessor.js');
    const processor = new RelancingUpdateProcessor();

    const task = {
      id: 'task-ambiguous',
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      status: 'queued',
      domain_action: 'relancing.update',
      payload: {
        channel: 'telegram',
        external_message_id: 'ext-ambiguous',
        thread_id: 'thread-1',
        organization_id: '11111111-1111-1111-1111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        message_text: 'ok',
        correlation_id: 'corr-ambiguous',
        channel_metadata: {},
        raw_payload: {},
      },
    } as unknown as Task;

    const result = await processor.process(task);
    expect(result.outcome).toBe('ambiguity_escalated');
    expect(supabase.from).toHaveBeenCalledWith('agent_activity_log');
  });

  it('persists blocker_report and pauses context when setup is complete', async () => {
    const { supabase, state, chain } = createSupabaseMock();
    vi.doMock('../services/supabase.js', () => ({ supabase }));

    state.memberAssignments = [
      {
        id: 'assign-1',
        project_context_id: 'ctx-1',
        organization_id: '11111111-1111-1111-1111-111111111111',
        member_user_id: '22222222-2222-4222-8222-222222222222',
      },
    ];
    state.contexts.set('ctx-1', {
      id: 'ctx-1',
      organization_id: '11111111-1111-1111-1111-111111111111',
      setup_status: 'complete',
      project_name: 'Q2 Launch',
      deadline: '2026-03-20T12:00:00.000Z',
      scheduler_config: {},
      blocker_active: false,
    });

    const { RelancingUpdateProcessor } = await import('./RelancingUpdateProcessor.js');
    const processor = new RelancingUpdateProcessor();

    const task = {
      id: 'task-2',
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      status: 'queued',
      domain_action: 'relancing.update',
      payload: {
        channel: 'telegram',
        external_message_id: 'ext-2',
        thread_id: 'thread-1',
        organization_id: '11111111-1111-1111-1111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        message_text: 'Blocked waiting for API access. Need help from Sam.',
        correlation_id: 'corr-2',
        channel_metadata: {},
        raw_payload: {},
      },
    } as unknown as Task;

    const result = await processor.process(task);
    expect(result.outcome).toBe('applied');
    expect(result.intents).toContain('blocker_report');

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        blocker_active: true,
        scheduler_config: expect.objectContaining({
          blocker_adjustment: expect.objectContaining({
            active: true,
            reason_code: 'blocker_paused',
          }),
        }),
      }),
    );
  });

  it('clears blocker state and schedules resume when status update arrives after blocker', async () => {
    const { supabase, state, chain } = createSupabaseMock();
    vi.doMock('../services/supabase.js', () => ({ supabase }));

    state.memberAssignments = [
      {
        id: 'assign-1',
        project_context_id: 'ctx-1',
        organization_id: '11111111-1111-1111-1111-111111111111',
        member_user_id: '22222222-2222-4222-8222-222222222222',
      },
    ];
    state.contexts.set('ctx-1', {
      id: 'ctx-1',
      organization_id: '11111111-1111-1111-1111-111111111111',
      setup_status: 'complete',
      project_name: 'Q2 Launch',
      deadline: '2026-03-20T12:00:00.000Z',
      scheduler_config: { nudging_frequency_hours_override: 24 },
      blocker_active: true,
    });

    const { RelancingUpdateProcessor } = await import('./RelancingUpdateProcessor.js');
    const processor = new RelancingUpdateProcessor();

    const task = {
      id: 'task-resume',
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      status: 'queued',
      domain_action: 'relancing.update',
      payload: {
        channel: 'telegram',
        external_message_id: 'ext-resume',
        thread_id: 'thread-1',
        organization_id: '11111111-1111-1111-1111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        message_text: 'Status update: unblocked and back on track.',
        correlation_id: 'corr-resume',
        channel_metadata: {},
        raw_payload: {},
      },
    } as unknown as Task;

    const result = await processor.process(task);

    expect(result.outcome).toBe('applied');
    expect(result.blocker_resumed).toBe(true);
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        blocker_active: false,
        blocker_summary: null,
        blocker_reported_by: null,
        next_nudge_at: expect.any(String),
        scheduler_config: expect.objectContaining({
          blocker_adjustment: expect.objectContaining({
            active: false,
            reason_code: 'status_resume',
          }),
        }),
      }),
    );
  });

  it('returns duplicate_prevented when idempotency key already exists', async () => {
    const { supabase, state } = createSupabaseMock();
    vi.doMock('../services/supabase.js', () => ({ supabase }));

    state.memberAssignments = [
      {
        id: 'assign-1',
        project_context_id: 'ctx-1',
        organization_id: '11111111-1111-1111-1111-111111111111',
        member_user_id: '22222222-2222-4222-8222-222222222222',
      },
    ];
    state.contexts.set('ctx-1', {
      id: 'ctx-1',
      organization_id: '11111111-1111-1111-1111-111111111111',
      setup_status: 'complete',
      project_name: 'Q2 Launch',
      deadline: '2026-03-20T12:00:00.000Z',
      scheduler_config: {},
      blocker_active: false,
    });
    state.duplicateRelancingUpdate = true;

    const { RelancingUpdateProcessor } = await import('./RelancingUpdateProcessor.js');
    const processor = new RelancingUpdateProcessor();

    const task = {
      id: 'task-3',
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      status: 'queued',
      domain_action: 'relancing.update',
      payload: {
        channel: 'telegram',
        external_message_id: 'ext-dup',
        thread_id: 'thread-1',
        organization_id: '11111111-1111-1111-1111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        message_text: 'Status: progressing',
        correlation_id: 'corr-3',
        channel_metadata: {},
        raw_payload: {},
      },
    } as unknown as Task;

    const result = await processor.process(task);
    expect(result.outcome).toBe('duplicate_prevented');
  });

  it('resolves a multi-assignment member from prior normalized thread linkage', async () => {
    const { supabase, state } = createSupabaseMock();
    vi.doMock('../services/supabase.js', () => ({ supabase }));

    state.memberAssignments = [
      {
        id: 'assign-1',
        project_context_id: 'ctx-1',
        organization_id: '11111111-1111-1111-1111-111111111111',
        member_user_id: '22222222-2222-4222-8222-222222222222',
      },
      {
        id: 'assign-2',
        project_context_id: 'ctx-2',
        organization_id: '11111111-1111-1111-1111-111111111111',
        member_user_id: '22222222-2222-4222-8222-222222222222',
      },
    ];
    state.relancingUpdatesHistory = [
      {
        member_assignment_id: 'assign-2',
        project_context_id: 'ctx-2',
        organization_id: '11111111-1111-1111-1111-111111111111',
        source_user_id: '22222222-2222-4222-8222-222222222222',
        thread_id: 'thread-linked',
        created_at: '2026-03-09T09:00:00.000Z',
      },
    ];
    state.contexts.set('ctx-2', {
      id: 'ctx-2',
      organization_id: '11111111-1111-1111-1111-111111111111',
      setup_status: 'complete',
      project_name: 'Linked Project',
      deadline: '2026-03-20T12:00:00.000Z',
      scheduler_config: {},
      blocker_active: false,
    });

    const { RelancingUpdateProcessor } = await import('./RelancingUpdateProcessor.js');
    const processor = new RelancingUpdateProcessor();

    const task = {
      id: 'task-linked',
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      status: 'queued',
      domain_action: 'relancing.update',
      payload: {
        channel: 'telegram',
        external_message_id: 'ext-linked',
        thread_id: 'thread-linked',
        organization_id: '11111111-1111-1111-1111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        message_text: 'Blocked waiting for docs',
        correlation_id: 'corr-linked',
        channel_metadata: {},
        raw_payload: {},
      },
    } as unknown as Task;

    const result = await processor.process(task);

    expect(result.outcome).toBe('applied');
    expect(result.project_context_id).toBe('ctx-2');
    expect(result.member_assignment_id).toBe('assign-2');
  });

  it('does not resume blocker state on generic status chatter without explicit resume signal', async () => {
    const { supabase, state, chain } = createSupabaseMock();
    vi.doMock('../services/supabase.js', () => ({ supabase }));

    state.memberAssignments = [
      {
        id: 'assign-1',
        project_context_id: 'ctx-1',
        organization_id: '11111111-1111-1111-1111-111111111111',
        member_user_id: '22222222-2222-4222-8222-222222222222',
      },
    ];
    state.contexts.set('ctx-1', {
      id: 'ctx-1',
      organization_id: '11111111-1111-1111-1111-111111111111',
      setup_status: 'complete',
      project_name: 'Q2 Launch',
      deadline: '2026-03-20T12:00:00.000Z',
      scheduler_config: { nudging_frequency_hours_override: 24 },
      blocker_active: true,
    });

    const { RelancingUpdateProcessor } = await import('./RelancingUpdateProcessor.js');
    const processor = new RelancingUpdateProcessor();

    const task = {
      id: 'task-still-blocked',
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      status: 'queued',
      domain_action: 'relancing.update',
      payload: {
        channel: 'telegram',
        external_message_id: 'ext-still-blocked',
        thread_id: 'thread-1',
        organization_id: '11111111-1111-1111-1111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        message_text: 'Status update: reviewing docs with Sam today.',
        correlation_id: 'corr-still-blocked',
        channel_metadata: {},
        raw_payload: {},
      },
    } as unknown as Task;

    const result = await processor.process(task);

    expect(result.outcome).toBe('applied');
    expect(result.blocker_resumed).toBe(false);
    expect(chain.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        blocker_active: false,
      }),
    );
  });
});
