import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryState = {
  filters: Array<[string, unknown]>;
  updatePatch: Record<string, unknown> | null;
};

const rows = new Map<string, Record<string, unknown>>();
let nextSelectError: { message: string } | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function matches(row: Record<string, unknown>, filters: Array<[string, unknown]>): boolean {
  return filters.every(([key, value]) => row[key] === value);
}

function createQuery() {
  const state: QueryState = {
    filters: [],
    updatePatch: null,
  };

  const api = {
    select() {
      return api;
    },
    insert: vi.fn(async (payload: Record<string, unknown>) => {
      rows.set(String(payload.task_id), clone({
        id: payload.id ?? '123e4567-e89b-12d3-a456-426614174099',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      }));
      return { error: null };
    }),
    update(patch: Record<string, unknown>) {
      state.updatePatch = patch;
      return api;
    },
    eq(key: string, value: unknown) {
      state.filters.push([key, value]);
      return api;
    },
    async maybeSingle() {
      return runSelect();
    },
    async single() {
      return runSelect();
    },
    then(resolve: (value: { data: null; error: null }) => unknown) {
      return Promise.resolve(runUpdate()).then(resolve);
    },
  };

  function runSelect() {
    if (nextSelectError) {
      const error = nextSelectError;
      nextSelectError = null;
      return Promise.resolve({ data: null, error });
    }

    const match = Array.from(rows.values()).find((row) => matches(row, state.filters)) ?? null;
    return Promise.resolve({ data: match, error: null });
  }

  function runUpdate() {
    for (const [taskId, row] of rows.entries()) {
      if (matches(row, state.filters)) {
        rows.set(taskId, { ...row, ...clone(state.updatePatch ?? {}) });
      }
    }

    return { data: null, error: null };
  }

  return api;
}

vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn(() => createQuery()),
  },
}));

describe('ExecutionRunService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows.clear();
    nextSelectError = null;
  });

  it('redacts ledger handoff content while preserving structured state', async () => {
    const { ExecutionRunService } = await import('./ExecutionRunService.js');
    const service = new ExecutionRunService();

    const run = await service.createRun({
      taskId: '123e4567-e89b-12d3-a456-426614174000',
      organizationId: '123e4567-e89b-12d3-a456-426614174001',
      toolPolicyVersion: 'workspace-v1.14.2',
      plan: {
        version: 'v1',
        original_command: 'Draft and send update',
        summary: 'Planner run',
        ledger_entries: [],
        replan_count: 0,
        steps: [
          {
            key: 'gmail-step',
            title: 'Draft email',
            worker_type: 'gmail',
            action: 'draft_email',
            status: 'pending',
            requested_tools: ['draft_gmail_message'],
            input: {
              recipient: 'alexis@example.com',
              subject: 'Status update',
            },
            output: {},
            attempt_count: 0,
            idempotency_key: 'gmail-draft-1',
            recoverable: false,
          },
        ],
      },
    });

    const inProgressRun = await service.markStepInProgress(run, 'gmail-step');
    const completedRun = await service.completeStep(inProgressRun, {
      stepKey: 'gmail-step',
      output: {
        summary: 'Email draft created for alexis@example.com',
      },
      nextWorkerNote: 'Send to alexis@example.com after approval.',
      toolName: 'draft_gmail_message',
    });

    expect(completedRun.ledger_markdown).not.toContain('alexis@example.com');
    expect(completedRun.ledger_markdown).toMatch(/\[EMAIL_\d+\]/);
    expect(completedRun.plan_json.steps[0].output.summary).toBe('Email draft created for alexis@example.com');
  });

  it('treats a missing execution_runs table as unavailable on reads', async () => {
    const { ExecutionRunService } = await import('./ExecutionRunService.js');
    const service = new ExecutionRunService();

    nextSelectError = {
      message: "Could not find the table 'public.execution_runs' in the schema cache",
    };

    await expect(service.getByTaskId('123e4567-e89b-12d3-a456-426614174000')).resolves.toBeNull();
  });

  it('revises remaining steps at checkpoint and records checkpoint_replan metadata', async () => {
    const { ExecutionRunService } = await import('./ExecutionRunService.js');
    const service = new ExecutionRunService();

    const run = await service.createRun({
      taskId: '123e4567-e89b-12d3-a456-426614174555',
      organizationId: '123e4567-e89b-12d3-a456-426614174001',
      toolPolicyVersion: 'workspace-v1.14.2',
      plan: {
        version: 'v1',
        original_command: 'Do four steps',
        summary: 'Checkpoint test',
        ledger_entries: [],
        replan_count: 0,
        steps: [
          {
            key: 's1',
            title: 'Step 1',
            worker_type: 'gmail',
            action: 'draft_email',
            status: 'completed',
            requested_tools: [],
            input: {},
            output: {},
            attempt_count: 1,
            idempotency_key: 'k1',
            recoverable: false,
          },
          {
            key: 's2',
            title: 'Step 2',
            worker_type: 'docs',
            action: 'create_document',
            status: 'completed',
            requested_tools: [],
            input: {},
            output: {},
            attempt_count: 1,
            idempotency_key: 'k2',
            recoverable: false,
          },
          {
            key: 's3',
            title: 'Step 3',
            worker_type: 'calendar',
            action: 'create_event',
            status: 'pending',
            requested_tools: [],
            input: {},
            output: {},
            attempt_count: 0,
            idempotency_key: 'k3',
            recoverable: false,
          },
        ],
      },
    });

    const revised = await service.reviseRemainingSteps(run, {
      revisedSteps: [
        {
          key: 's3b',
          title: 'Revised Step 3',
          worker_type: 'drive',
          action: 'read_drive_context',
          input: {
            file_id: 'file-123',
          },
          recoverable: true,
        },
      ],
      note: 'Checkpoint adjusted remaining plan based on completed work.',
    });

    expect(revised.plan_json.replan_count).toBe(1);
    expect(revised.plan_json.steps).toHaveLength(3);
    expect(revised.plan_json.steps[0]?.status).toBe('completed');
    expect(revised.plan_json.steps[1]?.status).toBe('completed');
    expect(revised.plan_json.steps[2]).toMatchObject({
      key: 's3b',
      status: 'pending',
      worker_type: 'drive',
      action: 'read_drive_context',
    });
    expect(revised.current_step_key).toBe('s3b');
    expect(revised.plan_json.ledger_entries.at(-1)).toMatchObject({
      action: 'checkpoint_replan',
      attempt_number: 1,
    });
  });
});
