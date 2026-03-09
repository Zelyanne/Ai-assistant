import { beforeEach, describe, expect, it, vi } from 'vitest';

type Store = {
  existingReport: { id: string; narrative: string; critical_actions: unknown } | null;
  persistedReport: Record<string, unknown> | null;
  audits: Array<Record<string, unknown>>;
};

const store: Store = {
  existingReport: null,
  persistedReport: null,
  audits: [],
};

function createChain(table: string): any {
  const state = {
    mode: 'select' as 'select' | 'upsert' | 'insert',
    payload: undefined as unknown,
  };

  const resolveSelect = () => {
    if (table === 'status_reports') {
      return { data: store.existingReport, error: null };
    }

    if (table === 'relancing_updates') {
      return {
        data: [
          {
            id: 'rel-1',
            intents: ['blocker_report'],
            progress_summary: null,
            blocker_summary: 'Blocked on API approval',
            dependency: 'Platform API access',
            requested_help: 'Please unblock with platform team',
            eta_hint: 'tomorrow',
            message_text: 'Blocked on API approval',
            thread_id: 'thread-42',
            external_message_id: 'msg-42',
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      };
    }

    if (table === 'project_scheduling_contexts') {
      return {
        data: [
          {
            id: 'ctx-1',
            project_name: 'Q2 Launch',
            blocker_active: true,
            blocker_summary: 'Legal approval pending',
            deadline: null,
          },
        ],
        error: null,
      };
    }

    if (table === 'tasks') {
      return {
        data: [
          {
            id: 'task-1',
            domain_action: 'relancing.nudge',
            status: 'done',
            result: { summary: 'Nudge sent successfully' },
            created_at: new Date().toISOString(),
          },
          {
            id: 'task-2',
            domain_action: 'thread.action',
            status: 'escalation',
            result: { summary: 'Needs PM review' },
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      };
    }

    if (table === 'morning_briefs') {
      return {
        data: {
          id: 'brief-1',
          generated_at: new Date().toISOString(),
          summary_text: 'Morning brief indicates blocker concentration in launch stream.',
        },
        error: null,
      };
    }

    return { data: null, error: null };
  };

  const resolveSingle = () => {
    if (table === 'status_reports' && state.mode === 'upsert') {
      return { data: { id: 'report-1' }, error: null };
    }
    return { data: null, error: null };
  };

  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => resolveSelect()),
    upsert: vi.fn((payload: unknown) => {
      state.mode = 'upsert';
      state.payload = payload;
      store.persistedReport = payload as Record<string, unknown>;
      return chain;
    }),
    insert: vi.fn(async (payload: unknown) => {
      state.mode = 'insert';
      state.payload = payload;
      if (table === 'agent_activity_log') {
        store.audits.push(payload as Record<string, unknown>);
      }
      return { error: null };
    }),
    single: vi.fn(async () => resolveSingle()),
    then: vi.fn((resolve: (value: { data: unknown; error: unknown }) => unknown, reject?: (reason?: unknown) => unknown) => {
      return Promise.resolve(resolveSelect()).then(resolve, reject);
    }),
  };

  return chain;
}

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: vi.fn((table: string) => createChain(table)),
  },
}));

describe('StatusReportProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.existingReport = null;
    store.persistedReport = null;
    store.audits = [];
  });

  it('aggregates relancing sources and persists a report with critical actions', async () => {
    const { StatusReportProcessor } = await import('./StatusReportProcessor.js');
    const processor = new StatusReportProcessor();

    const result = await processor.process({
      id: 'task-report-1',
      organization_id: 'org-1',
      user_id: 'user-1',
      domain_action: 'status.report',
      status: 'queued',
      payload: { force: true },
    } as any);

    expect(result.outcome).toBe('generated');
    expect(result.report_id).toBe('report-1');
    expect(result.critical_actions.length).toBeGreaterThan(0);
    expect(result.critical_actions[0].priority).toBe('high');
    expect(store.persistedReport).toEqual(
      expect.objectContaining({
        organization_id: 'org-1',
        idempotency_key: expect.stringContaining('status-report:org-1:'),
      }),
    );
    expect((store.persistedReport?.metadata as Record<string, unknown>).source_links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source_type: 'relancing_update', source_id: 'rel-1' }),
        expect.objectContaining({ source_type: 'thread', source_id: 'thread-42' }),
        expect.objectContaining({ source_type: 'task', source_id: 'task-1' }),
        expect.objectContaining({ source_type: 'project_context', source_id: 'ctx-1' }),
      ]),
    );
    expect(store.audits.length).toBeGreaterThan(0);
    expect((store.audits[0].reasoning_trace as Array<Record<string, unknown>>).some((step) => step.step_name === 'Status Report Highlight')).toBe(true);
  });

  it('returns duplicate_prevented when report already exists and force is false', async () => {
    store.existingReport = {
      id: 'report-existing',
      narrative: 'Existing narrative',
      critical_actions: [],
    };

    const { StatusReportProcessor } = await import('./StatusReportProcessor.js');
    const processor = new StatusReportProcessor();

    const result = await processor.process({
      id: 'task-report-2',
      organization_id: 'org-1',
      user_id: 'user-1',
      domain_action: 'status.report',
      status: 'queued',
      payload: { force: false },
    } as any);

    expect(result.outcome).toBe('duplicate_prevented');
    expect(result.report_id).toBe('report-existing');
    expect(store.persistedReport).toBeNull();
  });
});
