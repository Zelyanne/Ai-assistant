import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graph } from './graph.js';

vi.mock('../services/SafetyControlsService.js', () => ({
  SafetyControlsService: {
    isEmergencyBrakeEnabled: vi.fn().mockResolvedValue(false),
  },
}));

vi.mock('../services/agency.js', () => ({
  AgencyService: {
    getTierForTopic: vi.fn().mockResolvedValue('Public'),
  },
}));

vi.mock('../config/index.js', () => ({
  config: {
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-key',
    MISTRAL_API_KEY: 'mock-mistral-key',
    DEFAULT_LLM_MODEL: 'mistral-small-latest',
    CONFIDENCE_THRESHOLD: 0.8,
    ENCRYPTION_SECRET: '0123456789abcdef0123456789abcdef',
  },
}));

vi.mock('../services/llm/tracing.js', () => ({
  tracingService: {
    getHandler: vi.fn().mockReturnValue(null),
    handleSuccess: vi.fn(),
    handleFailure: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../services/ProtocolService.js', () => ({
  ProtocolService: {
    fetchProtocol: vi.fn().mockResolvedValue('# Mock Protocol'),
    extractRules: vi.fn().mockResolvedValue('1. Rule One'),
  },
}));

const {
  mockCheckCapabilityReadiness,
  mockResolveToolName,
  mockExecuteWorkerTool,
  mockLoadStartupMemoryContext,
  mockLoadShortTermMemory,
  mockUpdateTaskState,
} = vi.hoisted(() => ({
  mockCheckCapabilityReadiness: vi.fn(),
  mockResolveToolName: vi.fn(),
  mockExecuteWorkerTool: vi.fn(),
  mockLoadStartupMemoryContext: vi.fn(),
  mockLoadShortTermMemory: vi.fn(),
  mockUpdateTaskState: vi.fn(),
}));

vi.mock('../services/mcp.js', () => ({
  mcpService: {
    checkCapabilityReadiness: mockCheckCapabilityReadiness,
    resolveToolName: mockResolveToolName,
    executeWorkerTool: mockExecuteWorkerTool,
    getLangChainTools: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../services/MemoryService.js', () => ({
  memoryService: {
    loadStartupMemoryContext: mockLoadStartupMemoryContext,
    loadShortTermMemory: mockLoadShortTermMemory,
    updateTaskState: mockUpdateTaskState,
  },
}));

type QueryState = {
  table: string;
  filters: Array<[string, unknown]>;
  updatePatch: Record<string, unknown> | null;
  selectColumns: string | null;
};

const db = {
  tasks: new Map<string, Record<string, unknown>>(),
  execution_runs: new Map<string, Record<string, unknown>>(),
  agent_activity_log: [] as Record<string, unknown>[],
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function matches(row: Record<string, unknown>, filters: Array<[string, unknown]>): boolean {
  return filters.every(([key, value]) => row[key] === value);
}

function createQuery(table: string) {
  const state: QueryState = {
    table,
    filters: [],
    updatePatch: null,
    selectColumns: null,
  };

  const api = {
    select(columns: string) {
      state.selectColumns = columns;
      return api;
    },
    update(patch: Record<string, unknown>) {
      state.updatePatch = patch;
      return api;
    },
    insert: vi.fn(async (payload: Record<string, unknown> | Record<string, unknown>[]) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      for (const row of rows) {
        if (table === 'tasks') {
          db.tasks.set(String(row.id), clone(row));
        } else if (table === 'execution_runs') {
          db.execution_runs.set(String(row.task_id), clone({
            id:
              row.id ??
              `00000000-0000-4000-8000-${String(db.execution_runs.size + 1).padStart(12, '0')}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...row,
          }));
        } else if (table === 'agent_activity_log') {
          db.agent_activity_log.push(clone(row));
        }
      }

      return { error: null };
    }),
    eq(key: string, value: unknown) {
      state.filters.push([key, value]);
      return api;
    },
    async single() {
      return runSelect();
    },
    async maybeSingle() {
      return runSelect();
    },
    then(resolve: (value: { data: unknown; error: null }) => unknown) {
      return Promise.resolve(runUpdate()).then(resolve);
    },
  };

  function runSelect() {
    if (table === 'tasks') {
      const rows = Array.from(db.tasks.values()).filter((row) => matches(row, state.filters));
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    }

    if (table === 'execution_runs') {
      const rows = Array.from(db.execution_runs.values()).filter((row) => matches(row, state.filters));
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    }

    return Promise.resolve({ data: null, error: null });
  }

  function runUpdate() {
    if (table === 'tasks') {
      for (const [id, row] of db.tasks.entries()) {
        if (matches(row, state.filters)) {
          db.tasks.set(id, { ...row, ...clone(state.updatePatch ?? {}) });
        }
      }
    }

    if (table === 'execution_runs') {
      for (const [taskId, row] of db.execution_runs.entries()) {
        if (matches(row, state.filters)) {
          db.execution_runs.set(taskId, { ...row, ...clone(state.updatePatch ?? {}) });
        }
      }
    }

    return { data: null, error: null };
  }

  return api;
}

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: vi.fn((table: string) => createQuery(table)),
  },
}));

describe('Agent Controller Graph planner-worker flow', () => {
  const baseTask = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organization_id: '123e4567-e89b-12d3-a456-426614174001',
    user_id: '123e4567-e89b-12d3-a456-426614174002',
    status: 'queued',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db.tasks.clear();
    db.execution_runs.clear();
    db.agent_activity_log.length = 0;

    mockCheckCapabilityReadiness.mockResolvedValue({
      worker_type: 'gmail',
      ready: true,
      integration_active: true,
      policy_allowed: true,
      required_scopes: [],
      missing_scopes: [],
      requested_tools: [],
      resolved_tools: [],
      unavailable_tools: [],
      errors: [],
    });

    mockResolveToolName.mockImplementation(async (_orgId: string, requestedTool: string) => {
      const mapping: Record<string, string> = {
        create_gmail_draft: 'draft_gmail_message',
        send_gmail_message: 'send_gmail_message',
      };

      return {
        requestedTool,
        resolvedTool: mapping[requestedTool] ?? requestedTool,
        availableTools: Object.values(mapping),
      };
    });

    mockExecuteWorkerTool.mockImplementation(async (_orgId: string, workerType: string, requestedTool: string) => {
      if (workerType === 'drive') {
        return {
          toolName: 'get_drive_file_content',
          result: { structuredContent: { summary: 'Drive source loaded' } },
        };
      }

      if (workerType === 'docs') {
        return {
          toolName: 'create_doc',
          result: { structuredContent: { id: 'doc-1', url: 'https://docs.google.com/document/d/doc-1' } },
        };
      }

      return {
        toolName: requestedTool === 'create_gmail_draft' ? 'draft_gmail_message' : requestedTool,
        result: { content: [{ type: 'text', text: 'Done' }] },
      };
    });

    mockLoadStartupMemoryContext.mockResolvedValue({
      files: {
        persona: '/memory/org/user/persona.md',
        short_term: '/memory/org/user/short-term.md',
        weekly_memory: '/memory/org/user/weekly-memory.md',
        long_term: '/memory/org/user/long-term.md',
        task_state: '/memory/org/user/task-state.json',
      },
      persona: '# Persona\n\n- Tone: Crisp\n',
      weekly_memory: '# Weekly Memory\n\n- Weekly focus\n',
      long_term: '# Long-Term Memory\n\n- Long-term preference\n',
      task_state: { current_node: 'load_memory', status: 'processing' },
    });
    mockLoadShortTermMemory.mockResolvedValue(
      '# Short-Term Memory\n\n- Current draft\n',
    );
    mockUpdateTaskState.mockImplementation(async (_orgId, _userId, taskId, state) => ({
      task_id: taskId,
      ...state,
    }));
  });

  it('creates and completes a persisted Drive -> Docs -> Gmail execution run', async () => {
    const task = {
      ...baseTask,
      domain_action: 'assistant.command',
      payload: {
        command: 'Read the source, create a doc, then draft the email',
        target_domain_action: 'email.draft',
        target_payload: {
          plan_steps: [
            {
              key: 'drive-step',
              title: 'Read Drive file',
              worker_type: 'drive',
              action: 'read_drive_context',
              requested_tools: ['get_drive_file_content'],
              input: { context_references: [{ url: 'https://docs.google.com/document/d/file-123/edit', file_id: 'file-123' }] },
            },
            {
              key: 'doc-step',
              title: 'Create doc',
              worker_type: 'docs',
              action: 'create_document',
              requested_tools: ['create_doc'],
              input: { source_step_key: 'drive-step' },
            },
            {
              key: 'gmail-step',
              title: 'Draft email',
              worker_type: 'gmail',
              action: 'draft_email',
              requested_tools: ['draft_gmail_message'],
              input: {
                recipient: 'alexis@example.com',
                subject: 'Status update',
                source_step_key: 'doc-step',
              },
            },
          ],
        },
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.execution_run.status).toBe('completed');
    expect(result.execution_run.plan_json.replan_count).toBe(0);
    expect(result.execution_run.plan_json.steps.map((step: { status: string }) => step.status)).toEqual([
      'completed',
      'completed',
      'completed',
    ]);
    expect(mockExecuteWorkerTool).toHaveBeenCalledWith(
      task.organization_id,
      'drive',
      'get_drive_file_content',
      expect.any(Object),
    );
    expect(mockExecuteWorkerTool).toHaveBeenCalledWith(
      task.organization_id,
      'docs',
      'create_doc',
      expect.any(Object),
    );
    expect(result.task.result.execution_run.completed_steps).toHaveLength(3);
  });

  it('loads user-scoped memory into graph state before workspace execution', async () => {
    const task = {
      ...baseTask,
      domain_action: 'assistant.command',
      payload: {
        command: 'Draft an update email',
        target_domain_action: 'email.draft',
        target_payload: {
          plan_steps: [
            {
              key: 'gmail-step',
              title: 'Draft email',
              worker_type: 'gmail',
              action: 'draft_email',
              requested_tools: ['draft_gmail_message'],
              input: {
                recipient: 'alexis@example.com',
                subject: 'Weekly update',
              },
            },
          ],
        },
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(mockLoadStartupMemoryContext).toHaveBeenCalledWith(
      task.organization_id,
      task.user_id,
    );
    expect(mockLoadShortTermMemory).toHaveBeenCalledWith(
      task.organization_id,
      task.user_id,
    );
    expect(
      mockLoadStartupMemoryContext.mock.invocationCallOrder[0],
    ).toBeLessThan(mockLoadShortTermMemory.mock.invocationCallOrder[0] ?? Infinity);
    expect(result.persona_memory).toContain('Tone: Crisp');
    expect(result.weekly_memory).toContain('Weekly focus');
    expect(result.short_term_memory).toContain('Current draft');
  });

  it('persists task-state transitions across intermediate graph nodes', async () => {
    const task = {
      ...baseTask,
      domain_action: 'email.draft',
      payload: {
        recipient: 'alexis@example.com',
        subject: 'Status',
        body: 'Draft body',
      },
    };

    db.tasks.set(task.id, clone(task));

    await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]);

    const visitedNodes = mockUpdateTaskState.mock.calls.map((call) => call[3]?.current_node);

    expect(visitedNodes).toEqual(
      expect.arrayContaining([
        'initialize',
        'load_memory',
        'load_protocol',
        'load_short_term_memory',
        'check_perimeter',
        'load_workspace_context',
        'email_draft',
        'finalize',
      ]),
    );
  });

  it('records one automatic re-plan and continues when a recoverable worker step fails', async () => {
    const task = {
      ...baseTask,
      domain_action: 'assistant.command',
      payload: {
        command: 'Create a doc if possible, then draft the email',
        target_domain_action: 'email.draft',
        target_payload: {
          plan_steps: [
            {
              key: 'doc-step',
              title: 'Create doc',
              worker_type: 'docs',
              action: 'create_document',
              requested_tools: ['create_doc'],
              input: { title: 'Draft input' },
              recoverable: true,
            },
            {
              key: 'gmail-step',
              title: 'Draft email',
              worker_type: 'gmail',
              action: 'draft_email',
              requested_tools: ['draft_gmail_message'],
              input: {
                recipient: 'alexis@example.com',
                subject: 'Status update',
              },
            },
          ],
        },
      },
    };

    db.tasks.set(task.id, clone(task));
    mockExecuteWorkerTool.mockImplementationOnce(async (_orgId: string, workerType: string) => {
      if (workerType === 'docs') {
        throw new Error('create_doc temporarily unavailable');
      }
      return {
        toolName: 'draft_gmail_message',
        result: { content: [{ type: 'text', text: 'Draft created' }] },
      };
    });

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.execution_run.status).toBe('completed');
    expect(result.execution_run.plan_json.replan_count).toBe(1);
    expect(result.execution_run.plan_json.steps[0].status).toBe('skipped');
    expect(result.execution_run.plan_json.steps[1].status).toBe('completed');
    expect(result.execution_run.current_step_key).toBeNull();
    expect(result.execution_run.current_worker_type).toBeNull();
  });

  it('resumes an existing assistant.command execution run without reparsing the command', async () => {
    const task = {
      ...baseTask,
      domain_action: 'assistant.command',
      payload: {},
    };

    db.tasks.set(task.id, clone(task));
    db.execution_runs.set(task.id, {
      id: '123e4567-e89b-12d3-a456-426614174099',
      task_id: task.id,
      organization_id: task.organization_id,
      status: 'processing',
      plan_json: {
        version: 'v1',
        original_command: 'Send the prepared update',
        summary: 'Resume Gmail draft step',
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
      ledger_markdown: '# Execution Run Ledger',
      current_step_key: 'gmail-step',
      current_worker_type: 'gmail',
      tool_policy_version: 'workspace-v1.14.2',
      idempotency_state: {},
      version: 1,
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.error).toBeUndefined();
    expect(result.execution_run.status).toBe('completed');
    expect(result.execution_run.plan_json.steps[0].status).toBe('completed');
    expect(mockExecuteWorkerTool).toHaveBeenCalledWith(
      task.organization_id,
      'gmail',
      'create_gmail_draft',
      expect.any(Object),
    );
  });

  it('blocks planning before execution when capability readiness fails', async () => {
    const task = {
      ...baseTask,
      domain_action: 'assistant.command',
      payload: {
        command: 'Create a Google Doc from this source',
        target_domain_action: 'email.draft',
        target_payload: {
          plan_steps: [
            {
              key: 'doc-step',
              title: 'Create doc',
              worker_type: 'docs',
              action: 'create_document',
              requested_tools: ['create_doc'],
              input: { title: 'Blocked doc' },
            },
          ],
        },
      },
    };

    db.tasks.set(task.id, clone(task));
    mockCheckCapabilityReadiness.mockResolvedValueOnce({
      worker_type: 'docs',
      ready: false,
      integration_active: true,
      policy_allowed: true,
      required_scopes: ['https://www.googleapis.com/auth/documents'],
      missing_scopes: ['https://www.googleapis.com/auth/documents'],
      requested_tools: ['create_doc'],
      resolved_tools: [],
      unavailable_tools: ['create_doc'],
      errors: ['Missing scope: https://www.googleapis.com/auth/documents'],
    });

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.task.status).toBe('escalation');
    expect(result.execution_run.status).toBe('blocked');
    expect(mockExecuteWorkerTool).not.toHaveBeenCalled();
  });

  it('pauses Command Center tasks instead of escalating when capability readiness fails', async () => {
    const task = {
      ...baseTask,
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'Send an email update',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
        target_domain_action: 'email.send',
        target_payload: {
          recipient: 'alexis@example.com',
          subject: 'Status update',
          body: 'Hello team',
        },
      },
    };

    db.tasks.set(task.id, clone(task));
    mockCheckCapabilityReadiness.mockResolvedValueOnce({
      worker_type: 'gmail',
      ready: false,
      integration_active: true,
      policy_allowed: true,
      required_scopes: ['https://www.googleapis.com/auth/gmail.modify'],
      missing_scopes: ['https://www.googleapis.com/auth/gmail.modify'],
      requested_tools: ['send_gmail_message'],
      resolved_tools: ['send_gmail_message'],
      unavailable_tools: [],
      errors: ['Missing scope: https://www.googleapis.com/auth/gmail.modify'],
    });

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.task.status).toBe('paused');
    expect(result.execution_run.status).toBe('blocked');
    expect(result.task.result.outcome).toBe('setup_required');
    expect(mockExecuteWorkerTool).not.toHaveBeenCalled();
  });

  it('keeps direct email.draft execution working outside planner mode', async () => {
    const task = {
      ...baseTask,
      domain_action: 'email.draft',
      payload: {
        recipient: 'alexis@example.com',
        subject: 'Status',
        body: 'Draft body',
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.error).toBeUndefined();
    expect(result.result.summary).toContain('Email draft created');
    expect(mockExecuteWorkerTool).toHaveBeenCalledWith(
      task.organization_id,
      'gmail',
      'create_gmail_draft',
      expect.any(Object),
    );
  });

  it('bypasses perimeter escalation for user-initiated social assistant commands', async () => {
    const task = {
      ...baseTask,
      domain_action: 'assistant.command',
      payload: {
        command: 'Send the prepared update',
        channel: 'telegram',
        source: 'telegram-webhook',
        user_initiated: true,
        confirmed: true,
        high_risk: true,
        target_domain_action: 'email.draft',
        target_payload: {
          plan_steps: [
            {
              key: 'gmail-step',
              title: 'Draft email',
              worker_type: 'gmail',
              action: 'draft_email',
              requested_tools: ['draft_gmail_message'],
              input: {
                recipient: 'alexis@example.com',
                subject: 'Status update',
              },
            },
          ],
        },
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.task.status).not.toBe('escalation');
    expect(result.execution_run.status).toBe('completed');
  });

  it('bypasses perimeter escalation for Command Center tasks even without explicit marker', async () => {
    const task = {
      ...baseTask,
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'Send the prepared update',
        channel: 'web',
        target_domain_action: 'email.draft',
        target_payload: {
          plan_steps: [
            {
              key: 'gmail-step',
              title: 'Draft email',
              worker_type: 'gmail',
              action: 'draft_email',
              requested_tools: ['draft_gmail_message'],
              input: {
                recipient: 'alexis@example.com',
                subject: 'Status update',
              },
            },
          ],
        },
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.task.status).not.toBe('escalation');
    expect(result.execution_run.status).toBe('completed');
  });

  it('pauses ambiguous Command Center commands instead of escalating', async () => {
    const task = {
      ...baseTask,
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'help me with this',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.task.status).toBe('paused');
    expect(result.task.result.reason).toBe('Command is ambiguous');
  });

  it('keeps automated thread actions eligible for perimeter escalation', async () => {
    const task = {
      ...baseTask,
      domain_action: 'thread.action',
      payload: {
        thread_id: 'thread-1',
        channel: 'web',
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.task.status).toBe('escalation');
  });
});
