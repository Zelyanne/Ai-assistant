import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graph } from './graph.js';
import { AgencyService } from '../services/agency.js';

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
  mockGetLangChainTools,
  mockGetLastLangChainToolError,
  createAgentMock,
  mockLoadStartupMemoryContext,
  mockLoadShortTermMemory,
  mockAppendShortTermMemoryEntry,
  mockUpdateTaskState,
  mockChannelEnqueueOutbound,
} = vi.hoisted(() => ({
  mockCheckCapabilityReadiness: vi.fn(),
  mockResolveToolName: vi.fn(),
  mockExecuteWorkerTool: vi.fn(),
  mockGetLangChainTools: vi.fn(),
  mockGetLastLangChainToolError: vi.fn(),
  createAgentMock: vi.fn(),
  mockLoadStartupMemoryContext: vi.fn(),
  mockLoadShortTermMemory: vi.fn(),
  mockAppendShortTermMemoryEntry: vi.fn(),
  mockUpdateTaskState: vi.fn(),
  mockChannelEnqueueOutbound: vi.fn(),
}));

vi.mock('langchain', () => ({
  createAgent: (...args: unknown[]) => createAgentMock(...args),
  modelCallLimitMiddleware: vi.fn(() => ({ name: 'modelCallLimitMiddleware' })),
  toolStrategy: vi.fn((schema: unknown) => schema),
}));

const { mockChatMistralResponse } = vi.hoisted(() => ({
  mockChatMistralResponse: {
    current: {
      confidence: 1.0,
      needs_clarification: false,
      interpretation: 'test',
      summary: 'test plan',
      reasoning: 'test',
      steps: [
        {
          key: 'step-1',
          title: 'Test step',
          worker_type: 'gmail',
          action: 'draft_email',
          input: { recipient: 'test@test.com', subject: 'Test', body: 'Hello' },
          requested_tools: ['draft_gmail_message'],
          recoverable: false,
        },
      ],
    } as Record<string, unknown>,
  },
}));

const { mockScheduleManageProcess } = vi.hoisted(() => ({
  mockScheduleManageProcess: vi.fn(),
}));

const { mockResearchRun } = vi.hoisted(() => ({
  mockResearchRun: vi.fn(),
}));

vi.mock('../agents/ResearchAgent.js', () => ({
  researchAgent: {
    run: mockResearchRun,
  },
}));

vi.mock('@langchain/mistralai', () => {
  class ChatMistralAI {
    constructor(..._args: unknown[]) {}
    withStructuredOutput(_schema: unknown, _options?: unknown) {
      return this;
    }
    async invoke(_input: unknown) {
      return mockChatMistralResponse.current;
    }
  }

  return {
    ChatMistralAI,
  };
});

vi.mock('../services/mcp.js', () => ({
  mcpService: {
    checkCapabilityReadiness: mockCheckCapabilityReadiness,
    resolveToolName: mockResolveToolName,
    executeWorkerTool: mockExecuteWorkerTool,
    getLangChainTools: mockGetLangChainTools,
    getLastLangChainToolError: mockGetLastLangChainToolError,
  },
}));

vi.mock('../processors/ScheduleManageProcessor.js', () => ({
  ScheduleManageProcessor: class MockScheduleManageProcessor {
    process = mockScheduleManageProcess;
  },
}));

vi.mock('../services/MemoryService.js', () => ({
  MemoryService: class MockMemoryService {
    readMemoryIfExists = vi.fn();
    writeMemory = vi.fn();
  },
    memoryService: {
      loadStartupMemoryContext: mockLoadStartupMemoryContext,
      loadShortTermMemory: mockLoadShortTermMemory,
      appendShortTermMemoryEntry: mockAppendShortTermMemoryEntry,
      updateTaskState: mockUpdateTaskState,
    },
  }));

vi.mock('../services/channelRouter.js', () => ({
  channelRouter: {
    enqueueOutbound: mockChannelEnqueueOutbound,
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
  command_messages: new Map<string, Record<string, unknown>>(),
  agent_activity_log: [] as Record<string, unknown>[],
};

type MockAgentTool = {
  name: string;
  invoke?: (args: Record<string, unknown>) => Promise<unknown>;
  call?: (args: Record<string, unknown>) => Promise<unknown>;
};

async function invokeMockAgentTool(tool: MockAgentTool | undefined, args: Record<string, unknown>): Promise<unknown> {
  if (!tool) {
    return undefined;
  }

  if (tool.call) {
    return tool.call(args);
  }

  return tool.invoke?.(args);
}

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
        } else if (table === 'command_messages') {
          const id = String(
            row.id ??
              `11111111-1111-4111-8111-${String(db.command_messages.size + 1).padStart(12, '0')}`,
          );
          db.command_messages.set(id, clone({
            id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            metadata: {},
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

    if (table === 'command_messages') {
      const rows = Array.from(db.command_messages.values()).filter((row) => matches(row, state.filters));
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

    if (table === 'command_messages') {
      for (const [id, row] of db.command_messages.entries()) {
        if (matches(row, state.filters)) {
          db.command_messages.set(id, { ...row, ...clone(state.updatePatch ?? {}) });
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
    db.command_messages.clear();
    db.agent_activity_log.length = 0;

    // Reset ChatMistralAI mock to default (high confidence, plan with steps)
    mockChatMistralResponse.current = {
      confidence: 1.0,
      needs_clarification: false,
      interpretation: 'test',
      summary: 'test plan',
      reasoning: 'test',
      steps: [
        {
          key: 'step-1',
          title: 'Test step',
          worker_type: 'gmail',
          action: 'draft_email',
          input: { recipient: 'test@test.com', subject: 'Test', body: 'Hello' },
          requested_tools: ['draft_gmail_message'],
          recoverable: false,
        },
      ],
    };

    mockScheduleManageProcess.mockResolvedValue({
      outcome: 'created',
      schedule: {
        id: 'schedule-1',
        next_run: '2026-03-20T10:30:00.000Z',
        cron_expression: '30 10 * * *',
        timezone: 'UTC',
        task_type: 'assistant.command',
      },
      summary: 'Schedule created with next run at 2026-03-20T10:30:00.000Z.',
      confirmation_message: 'Confirmed.',
    });

    mockResearchRun.mockResolvedValue({
      summary: 'Research completed using 1 source.',
      key_findings: ['1. Mock source: Mock finding'],
      sources: [{ title: 'Mock source', url: 'https://example.com/mock', snippet: 'Mock finding' }],
    });

    mockGetLangChainTools.mockResolvedValue([]);
    mockGetLastLangChainToolError.mockReturnValue(null);

    createAgentMock.mockImplementation(({
      tools,
      responseFormat,
    }: {
      tools: MockAgentTool[];
      responseFormat?: unknown;
    }) => ({
      invoke: async () => {
        if (responseFormat) {
          return {
            structuredResponse: mockChatMistralResponse.current,
            messages: [{ content: 'General agent completed.' }],
          };
        }

        const toolNames = tools.map((tool) => tool.name);

        if (toolNames.includes('get_drive_file_content')) {
          await invokeMockAgentTool(tools.find((tool) => tool.name === 'get_drive_file_content'), { file_id: 'file-123' });
          return { messages: [{ content: 'Drive context loaded.' }] };
        }

        if (toolNames.includes('create_doc')) {
          await invokeMockAgentTool(tools.find((tool) => tool.name === 'create_doc'), {
            title: 'Generated doc',
            content: 'Drive source loaded',
          });
          await invokeMockAgentTool(tools.find((tool) => tool.name === 'modify_doc_text'), {
            document_id: 'doc-1',
            text: 'Drive source loaded',
            start_index: 1,
          });
          return { messages: [{ content: 'Docs artifact created and populated.' }] };
        }

        if (toolNames.includes('send_gmail_message')) {
          await invokeMockAgentTool(tools.find((tool) => tool.name === 'send_gmail_message'), {
            to: 'alexis@example.com',
            subject: 'Status update',
            body: 'Document ready.',
          });
          return { messages: [{ content: 'Gmail send completed.' }] };
        }

        if (toolNames.includes('draft_gmail_message')) {
          await invokeMockAgentTool(tools.find((tool) => tool.name === 'draft_gmail_message'), {
            to: 'alexis@example.com',
            subject: 'Status update',
            body: 'Document ready.',
          });
          return { messages: [{ content: 'Gmail draft completed.' }] };
        }

        if (toolNames.includes('manage_event')) {
          await invokeMockAgentTool(tools.find((tool) => tool.name === 'manage_event'), {
            action: 'create',
            summary: 'Status sync',
            start_time: '2026-03-21T10:00:00Z',
            end_time: '2026-03-21T10:30:00Z',
          });
          return { messages: [{ content: 'Calendar event created.' }] };
        }

        if (toolNames.includes('create_spreadsheet')) {
          await invokeMockAgentTool(tools.find((tool) => tool.name === 'create_spreadsheet'), { title: 'Generated sheet' });
          return { messages: [{ content: 'Spreadsheet created.' }] };
        }

        if (toolNames.includes('create_presentation')) {
          await invokeMockAgentTool(tools.find((tool) => tool.name === 'create_presentation'), { title: 'Generated deck' });
          return { messages: [{ content: 'Presentation created.' }] };
        }

        return { messages: [{ content: 'Worker completed.' }] };
      },
    }));

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
      return {
        requestedTool,
        resolvedTool: requestedTool,
        availableTools: [requestedTool],
      };
    });

    mockExecuteWorkerTool.mockImplementation(async (_orgId: string, workerType: string, requestedTool: string) => {
      if (workerType === 'calendar') {
        return {
          toolName: 'manage_event',
          result: { structuredContent: { id: 'evt-1', htmlLink: 'https://calendar.google.com/event?id=evt-1' } },
        };
      }

      if (workerType === 'docs') {
        return {
          toolName: 'create_doc',
          result: { structuredContent: { id: 'doc-1', url: 'https://docs.google.com/document/d/doc-1' } },
        };
      }

      return {
        toolName: requestedTool,
        result: { content: [{ type: 'text', text: 'Done' }] },
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
        toolName: requestedTool,
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
    mockAppendShortTermMemoryEntry.mockResolvedValue('/memory/org/user/short-term.md');
    mockUpdateTaskState.mockImplementation(async (_orgId, _userId, taskId, state) => ({
      task_id: taskId,
      ...state,
    }));
  });

  it.skip('legacy: creates and completes a persisted Drive -> Docs -> Gmail execution run', async () => {
    // Configure mock to return the 3-step plan (Drive → Docs → Gmail)
    mockChatMistralResponse.current = {
      confidence: 1.0,
      needs_clarification: false,
      interpretation: 'Read source, create doc, draft email',
      summary: 'Read the source, create a doc, then draft the email',
      reasoning: 'Three-step workflow',
      steps: [
        {
          key: 'drive-step',
          title: 'Read Drive file',
          worker_type: 'drive',
          action: 'read_drive_context',
          requested_tools: ['get_drive_file_content'],
          input: { context_references: [{ url: 'https://docs.google.com/document/d/file-123/edit', file_id: 'file-123' }] },
          recoverable: false,
        },
        {
          key: 'doc-step',
          title: 'Create doc',
          worker_type: 'docs',
          action: 'create_document',
          requested_tools: ['create_doc'],
          input: { source_step_key: 'drive-step' },
          recoverable: false,
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
          recoverable: false,
        },
      ],
    };

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

  it('runs assistant.command through General Agent specialist tools and verifier without router execution', async () => {
    const createMcpTool = (name: string, result: Record<string, unknown>): MockAgentTool => ({
      name,
      call: vi.fn(async () => result),
      invoke: vi.fn(async () => result),
    });

    mockGetLangChainTools.mockResolvedValue([
      createMcpTool('create_doc', {
        id: 'doc-1',
        url: 'https://docs.google.com/document/d/doc-1',
        title: 'Generated doc',
        summary: 'Doc created.',
      }),
      createMcpTool('modify_doc_text', {
        id: 'doc-1',
        url: 'https://docs.google.com/document/d/doc-1',
        title: 'Generated doc',
        summary: 'Doc populated.',
      }),
      createMcpTool('draft_gmail_message', {
        draft_id: 'draft-1',
        summary: 'Draft created.',
      }),
    ]);

    createAgentMock.mockImplementation(({
      tools,
      responseFormat,
    }: {
      tools: MockAgentTool[];
      responseFormat?: unknown;
    }) => ({
      invoke: async () => {
        const toolNames = tools.map((tool) => tool.name);
        if (responseFormat && toolNames.includes('ask_docs_agent')) {
          const docsRaw = await invokeMockAgentTool(
            tools.find((tool) => tool.name === 'ask_docs_agent'),
            { prompt: 'Create a concise summary doc.' },
          );
          const docsResult = JSON.parse(String(docsRaw)) as { handoff_content?: string };
          await invokeMockAgentTool(
            tools.find((tool) => tool.name === 'ask_gmail_agent'),
            { prompt: `Draft an email to alexis@example.com using this doc handoff: ${docsResult.handoff_content ?? ''}` },
          );

          return {
            structuredResponse: {
              outcome: 'agent_tools',
              confidence: 1,
              interpretation: 'Create a doc and draft an email using specialist tools.',
              needs_clarification: false,
              summary: 'Created doc and drafted email.',
              reasoning: 'Specialist tools handled both domains.',
              steps: [],
              agent_tool_summary: 'Created doc and drafted email.',
            },
            messages: [{ content: 'General agent completed specialist tool calls.' }],
          };
        }

        if (toolNames.includes('create_doc')) {
          await invokeMockAgentTool(tools.find((tool) => tool.name === 'create_doc'), {
            title: 'Generated doc',
            content: 'Summary content',
          });
          await invokeMockAgentTool(tools.find((tool) => tool.name === 'modify_doc_text'), {
            document_id: 'doc-1',
            text: 'Summary content',
            start_index: 1,
          });
          return { messages: [{ content: 'Docs artifact created and populated.' }] };
        }

        if (toolNames.includes('draft_gmail_message')) {
          await invokeMockAgentTool(tools.find((tool) => tool.name === 'draft_gmail_message'), {
            to: 'alexis@example.com',
            subject: 'Summary doc',
            body: 'Document ready.',
          });
          return { messages: [{ content: 'Gmail draft completed.' }] };
        }

        return { messages: [{ content: 'Worker completed.' }] };
      },
    }));

    const task = {
      ...baseTask,
      domain_action: 'assistant.command',
      topic: 'Command Center',
      payload: {
        command: 'Create a doc summary and email it to alexis@example.com',
        channel: 'web',
        source: 'dashboard-command-center',
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.execution_run).toBeUndefined();
    expect(result.task.result.outcome).toBe('agent_tools_reviewed');
    expect(result.task.result.agent_tool_results).toHaveLength(2);
    expect(result.task.result.agent_tool_verification.status).toBe('passed');
    expect(result.task.result.final_response_ready).toBe(true);
    expect(mockAppendShortTermMemoryEntry).toHaveBeenCalled();
    expect(result.trace.some((step: { step_name: string }) => step.step_name === 'Execution Verifier')).toBe(true);
  });

  it('routes failed execution review back to General Agent with repair feedback', async () => {
    let generalAgentCalls = 0;

    createAgentMock.mockImplementation(({
      tools,
      responseFormat,
    }: {
      tools: MockAgentTool[];
      responseFormat?: unknown;
    }) => ({
      invoke: async (input?: unknown) => {
        const toolNames = tools.map((tool) => tool.name);
        if (responseFormat && toolNames.includes('ask_gmail_agent')) {
          generalAgentCalls += 1;
          const prompt = String(((input as { messages?: Array<{ content?: unknown }> })?.messages?.[0]?.content) ?? '');

          if (generalAgentCalls === 1) {
            await invokeMockAgentTool(
              tools.find((tool) => tool.name === 'ask_gmail_agent'),
              { prompt: 'Send the update email to alexis@example.com.' },
            );

            return {
              structuredResponse: {
                outcome: 'agent_tools',
                confidence: 1,
                interpretation: 'Send the update email.',
                needs_clarification: false,
                summary: 'Tried to send the update email.',
                reasoning: 'The Gmail specialist was called.',
                steps: [],
                agent_tool_summary: 'Tried to send the update email.',
              },
              messages: [{ content: 'General agent completed specialist tool calls.' }],
            };
          }

          expect(prompt).toContain('EXECUTION REVIEW FEEDBACK FOR RETRY');
          return {
            structuredResponse: {
              outcome: 'agent_tools',
              confidence: 1,
              interpretation: 'The reviewed send attempt needs user confirmation.',
              needs_clarification: true,
              clarification_prompt: 'Please confirm that I should send this email, or ask me to draft it instead.',
              summary: 'Need confirmation before sending.',
              reasoning: 'The review feedback requires confirmation.',
              steps: [],
            },
            messages: [{ content: 'Need confirmation.' }],
          };
        }

        return { messages: [{ content: 'Worker completed.' }] };
      },
    }));

    const task = {
      ...baseTask,
      domain_action: 'assistant.command',
      topic: 'Command Center',
      payload: {
        command: 'Send an update email to alexis@example.com',
        channel: 'web',
        source: 'dashboard-command-center',
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(generalAgentCalls).toBe(2);
    expect(result.review_attempts).toBe(1);
    expect(result.task.status).toBe('paused');
    expect(result.task.result.prompt).toContain('Please confirm');
    expect(mockAppendShortTermMemoryEntry).toHaveBeenCalledWith(
      task.organization_id,
      task.user_id,
      expect.stringContaining('Execution review failed'),
    );
  });

  it('pauses with a clear workspace-tools message when MCP tools are unavailable', async () => {
    mockGetLangChainTools.mockResolvedValue([]);
    mockGetLastLangChainToolError.mockReturnValue('MCP server start timeout after 60 seconds');

    const task = {
      ...baseTask,
      domain_action: 'assistant.command',
      topic: 'Command Center',
      payload: {
        command: 'Create a doc summary and email it to alexis@example.com',
        channel: 'web',
        source: 'dashboard-command-center',
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.task.status).toBe('paused');
    expect(result.task.result.prompt).toContain('Google Workspace tools are temporarily unavailable');
    expect(result.task.result.summary).toContain('Google Workspace tools are temporarily unavailable');
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
        'email_draft',
        'finalize',
      ]),
    );
  });

  it.skip('legacy: records one automatic re-plan and continues when a recoverable worker step fails', async () => {
    // Configure mock to return the 2-step plan with recoverable first step
    mockChatMistralResponse.current = {
      confidence: 1.0,
      needs_clarification: false,
      interpretation: 'Create doc then draft email',
      summary: 'Create a doc if possible, then draft the email',
      reasoning: 'Two-step workflow with recoverable first step',
      steps: [
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
          recoverable: false,
        },
      ],
    };

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

  it.skip('legacy: resumes an existing assistant.command execution run without reparsing the command', async () => {
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
      'draft_gmail_message',
      expect.any(Object),
    );
  });

  it.skip('legacy: blocks planning before execution when capability readiness fails', async () => {
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

  it.skip('legacy: pauses Command Center tasks instead of escalating when capability readiness fails', async () => {
    const task = {
      ...baseTask,
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'Send an email update',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
        confirmed: true,
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
      'draft_gmail_message',
      expect.any(Object),
    );
  });

  it('enqueues a user-facing webhook reply with the full draft for approval', async () => {
    const task = {
      ...baseTask,
      domain_action: 'email.draft',
      payload: {
        recipient: 'alexis@example.com',
        subject: 'Status',
        body: 'This is the full draft body and should never be echoed back in chat.',
        channel: 'telegram',
        source: 'telegram-webhook',
        user_initiated: true,
        thread_id: 'tg-thread-1',
        external_message_id: 'tg-inbound-1',
        correlation_id: 'corr-1',
      },
    };

    db.tasks.set(task.id, clone(task));

    await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]);

    expect(mockChannelEnqueueOutbound).toHaveBeenCalledTimes(1);
    const outbound = mockChannelEnqueueOutbound.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(outbound.channel).toBe('telegram');
    expect(outbound.thread_id).toBe('tg-thread-1');
    expect(String(outbound.message_text)).toContain('Brouillon prêt');
    expect(String(outbound.message_text)).toContain('This is the full draft body and should never be echoed back in chat.');
    expect(String(outbound.message_text)).toContain('je l’enverrai directement');
  });

  it('keeps email draft error replies conversational without exposing draft content', async () => {
    mockExecuteWorkerTool.mockRejectedValueOnce(
      new Error('Failed to draft email body: This is the full draft body and should never be echoed back in chat.'),
    );

    const task = {
      ...baseTask,
      domain_action: 'email.draft',
      payload: {
        recipient: 'alexis@example.com',
        subject: 'Status',
        body: 'This is the full draft body and should never be echoed back in chat.',
        channel: 'telegram',
        source: 'telegram-webhook',
        user_initiated: true,
        thread_id: 'tg-thread-err-1',
        external_message_id: 'tg-inbound-err-1',
      },
    };

    db.tasks.set(task.id, clone(task));

    await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]);

    expect(mockChannelEnqueueOutbound).toHaveBeenCalledTimes(1);
    const outbound = mockChannelEnqueueOutbound.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(String(outbound.message_text)).toContain('Je n’ai pas pu finaliser le brouillon automatiquement');
    expect(String(outbound.message_text)).not.toContain('This is the full draft body');
  });

  it.skip('legacy: bypasses perimeter escalation for user-initiated social assistant commands', async () => {
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

  it.skip('legacy: uses message_text fallback for user-initiated telegram assistant commands', async () => {
    const task = {
      ...baseTask,
      domain_action: 'assistant.command',
      payload: {
        message_text: 'Draft an email update to alexis@example.com',
        channel: 'telegram',
        source: 'telegram-webhook',
        user_initiated: true,
        confirmed: true,
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.task.status).not.toBe('paused');
    expect(result.execution_run.status).toBe('completed');
  });

  it('responds conversationally to simple telegram chat without creating an execution run', async () => {
    mockChatMistralResponse.current = {
      outcome: 'chat',
      confidence: 1,
      needs_clarification: false,
      interpretation: 'Greeting and small talk',
      summary: 'Salut ! Ça va bien, merci. Et toi ?',
      reasoning: 'No Google Workspace action requested.',
      steps: [],
      chat_response: 'Salut ! Ça va bien, merci. Et toi ?',
    };

    const task = {
      ...baseTask,
      id: '123e4567-e89b-12d3-a456-426614174333',
      domain_action: 'assistant.command',
      payload: {
        message_text: 'Hello comment ça va ?',
        channel: 'telegram',
        source: 'telegram-webhook',
        user_initiated: true,
        thread_id: 'tg-chat-hello',
        external_message_id: 'tg-msg-hello',
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;
    const generalAgentCreateCall = createAgentMock.mock.calls.find(([arg]) => {
      const config = arg as { responseFormat?: unknown };
      return Boolean(config.responseFormat);
    });
    const generalAgentConfig = generalAgentCreateCall?.[0] as { tools?: Array<{ name?: string }> } | undefined;

    expect(result.execution_run).toBeUndefined();
    expect(generalAgentConfig?.tools?.map((tool) => tool.name)).toContain('search_web_research');
    expect(result.task.result).toMatchObject({
      outcome: 'chat_response',
      chat_response: 'Salut ! Ça va bien, merci. Et toi ?',
    });
    expect(mockChannelEnqueueOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'telegram',
        thread_id: 'tg-chat-hello',
        message_text: 'Salut ! Ça va bien, merci. Et toi ?',
      }),
    );
  });

  it('answers current web research requests directly without creating an execution run', async () => {
    mockResearchRun.mockResolvedValueOnce({
      summary: 'Research completed for OVNI using 2 sources.',
      key_findings: [
        '1. France Culture: Pourquoi les ovnis reviennent dans la politique americaine.',
        '2. France 24: Les scientifiques rappellent que la recherche reste prudente.',
      ],
      sources: [
        {
          title: 'France Culture OVNI',
          url: 'https://example.com/france-culture-ovni',
          snippet: 'Pourquoi les ovnis reviennent dans la politique americaine.',
        },
        {
          title: 'France 24 OVNI',
          url: 'https://example.com/france24-ovni',
          snippet: 'La recherche reste prudente.',
        },
      ],
    });

    const conversationId = '223e4567-e89b-42d3-a456-426614174010';
    const correlationId = 'command-correlation-web-research';
    const assistantMessageId = '333e4567-e89b-42d3-a456-426614174010';
    const task = {
      ...baseTask,
      id: '123e4567-e89b-12d3-a456-426614174335',
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'stp explique moi les actualites OVNI en 2026',
        channel: 'web',
        source: 'dashboard-command-center',
        user_initiated: true,
        conversation_id: conversationId,
        correlation_id: correlationId,
      },
    };

    db.tasks.set(task.id, clone(task));
    db.command_messages.set(assistantMessageId, {
      id: assistantMessageId,
      conversation_id: conversationId,
      organization_id: task.organization_id,
      role: 'assistant',
      content: 'Processing command...',
      state: 'processing',
      channel: 'web',
      correlation_id: correlationId,
      source_task_id: task.id,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(createAgentMock).not.toHaveBeenCalled();
    expect(mockResearchRun).toHaveBeenCalledWith(expect.objectContaining({
      query: 'stp explique moi les actualites OVNI en 2026',
      language: 'fr',
      safesearch: 1,
    }));
    expect(result.execution_run).toBeUndefined();
    expect(result.task.result).toMatchObject({ outcome: 'chat_response' });
    expect(db.command_messages.get(assistantMessageId)).toEqual(expect.objectContaining({
      state: 'done',
      content: expect.stringContaining('Un OVNI est simplement'),
      source_task_id: task.id,
    }));
  });

  it('persists completed Command Center chat replies back to command messages', async () => {
    mockChatMistralResponse.current = {
      outcome: 'chat',
      confidence: 1,
      needs_clarification: false,
      interpretation: 'Greeting and small talk',
      summary: 'Salut ! Je vais bien, merci. Et toi ?',
      reasoning: 'No Google Workspace action requested.',
      steps: [],
      chat_response: 'Salut ! Je vais bien, merci. Et toi ?',
    };

    const conversationId = '223e4567-e89b-42d3-a456-426614174000';
    const correlationId = 'command-correlation-web-chat';
    const assistantMessageId = '333e4567-e89b-42d3-a456-426614174000';
    const task = {
      ...baseTask,
      id: '123e4567-e89b-12d3-a456-426614174334',
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'salut coment ça va ?',
        channel: 'web',
        source: 'dashboard-command-center',
        user_initiated: true,
        conversation_id: conversationId,
        correlation_id: correlationId,
      },
    };

    db.tasks.set(task.id, clone(task));
    db.command_messages.set(assistantMessageId, {
      id: assistantMessageId,
      conversation_id: conversationId,
      organization_id: task.organization_id,
      role: 'assistant',
      content: 'Intent preview: "salut coment ça va ?"',
      state: 'queued',
      channel: 'web',
      correlation_id: correlationId,
      source_task_id: task.id,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]);

    expect(db.command_messages.get(assistantMessageId)).toEqual(expect.objectContaining({
      state: 'done',
      content: 'Salut ! Je vais bien, merci. Et toi ?',
      source_task_id: task.id,
    }));
  });

  it.skip('legacy: pauses through general agent when an existing run is escalated', async () => {
    const task = {
      ...baseTask,
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'continue',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
      },
    };

    db.tasks.set(task.id, clone(task));
    db.execution_runs.set(task.id, {
      id: '123e4567-e89b-42d3-a456-426614174111',
      task_id: task.id,
      organization_id: task.organization_id,
      status: 'escalated',
      plan_json: {
        version: 'v1',
        original_command: 'continue',
        summary: 'Escalated run',
        ledger_entries: [],
        replan_count: 0,
        steps: [
          {
            key: 'step-1',
            title: 'Draft email',
            worker_type: 'gmail',
            action: 'draft_email',
            status: 'failed',
            requested_tools: [],
            input: { recipient: 'alexis@example.com' },
            output: {},
            attempt_count: 1,
            idempotency_key: 'gmail-draft_email-1',
            recoverable: false,
            error_message: 'gmail tool failed',
          },
        ],
      },
      ledger_markdown: '# Execution Run Ledger',
      current_step_key: 'step-1',
      current_worker_type: 'gmail',
      tool_policy_version: 'workspace-v1.14.2',
      idempotency_state: {},
      version: 1,
      last_error: 'gmail tool failed body: This is the full draft body and should never be echoed back in chat.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.execution_run.status).toBe('escalated');
    expect(result.task.status).toBe('paused');
    expect(result.task.result.prompt).toContain('masqué pour confidentialité');
    expect(result.task.result.prompt).not.toContain('This is the full draft body');
  });

  it.skip('legacy: bypasses perimeter escalation for Command Center tasks even without explicit marker', async () => {
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

  it.skip('legacy: pauses ambiguous Command Center commands instead of escalating', async () => {
    // Configure mock to return low confidence for ambiguous command
    mockChatMistralResponse.current = {
      confidence: 0.3,
      needs_clarification: true,
      clarification_prompt: 'Could you specify what kind of help you need?',
      interpretation: 'Vague help request',
      summary: 'Ambiguous help request',
      reasoning: 'Command is too vague to interpret',
      steps: [],
    };

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

  it.skip('legacy: pauses with a clarification prompt when assistant.command needs more details', async () => {
    // Configure ChatMistralAI mock to return low confidence / clarification needed
    mockChatMistralResponse.current = {
      confidence: 0.3,
      needs_clarification: true,
      clarification_prompt: 'What title, start time, and end time should I use for this calendar event?',
      interpretation: 'Calendar event request but missing details',
      summary: 'Need calendar timing details',
      reasoning: 'Missing required fields',
      steps: [],
    };

    const task = {
      ...baseTask,
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'Put dinner with Sam on my calendar',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.task.status).toBe('paused');
    expect(result.task.result.prompt).toBe('What title, start time, and end time should I use for this calendar event?');
  });

  it('pauses trusted chat email sends when explicit confirmation is missing', async () => {
    const task = {
      ...baseTask,
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'send an email now',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
        high_risk: true,
        recipient: 'alexis@example.com',
        subject: 'Status',
        body: 'Ship it',
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.task.status).toBe('paused');
    expect(result.execution_run).toBeUndefined();
    expect(result.task.result.reason).toBe('High-risk command requires confirmation');
    expect(AgencyService.getTierForTopic).not.toHaveBeenCalled();
  });

  it('pauses instead of crashing when General Agent returns no structured plan', async () => {
    createAgentMock.mockImplementationOnce(() => ({
      invoke: async () => ({
        messages: [{ content: 'No structured response was produced.' }],
      }),
    }));

    const task = {
      ...baseTask,
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'okay fais moi un rapport de ces informations avec introduction corps du devoir conclusion et ensuite envoie le via mail a othily.g@gmail.com',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.task.status).toBe('paused');
    expect(result.task.result.reason).toBe('Unable to complete request');
    expect(result.task.result.prompt).toContain('could not reliably interpret this request');
    expect(result.execution_run).toBeUndefined();
  });

  it('pauses instead of crashing when General Agent times out', async () => {
    createAgentMock.mockImplementationOnce(() => ({
      invoke: async () => {
        throw new Error('General Agent timed out while handling the request.');
      },
    }));

    const task = {
      ...baseTask,
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'bien fais en un rapport avec dans google docs et envoie le par mail a othily.g@gmail.com',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.task.status).toBe('paused');
    expect(result.task.result.reason).toBe('General Agent execution timed out');
    expect(result.task.result.prompt).toContain('check Google Docs and Gmail');
    expect(result.task.result.outcome).toBe('execution_timeout');
    expect(result.execution_run).toBeUndefined();
    expect(mockAppendShortTermMemoryEntry).toHaveBeenCalledWith(
      task.organization_id,
      task.user_id,
      expect.stringContaining('General Agent timeout'),
    );
  });

  it('routes scheduled assistant commands through the General Agent scheduling tool', async () => {
    const task = {
      ...baseTask,
      id: '123e4567-e89b-12d3-a456-426614174090',
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'in 30 minutes please send an email to alexis@example.com',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
      },
    };

    createAgentMock.mockImplementationOnce(({
      tools,
      responseFormat,
    }: {
      tools: Array<{ name: string; invoke: (args: Record<string, unknown>) => Promise<unknown> }>;
      responseFormat?: unknown;
    }) => ({
      invoke: async () => {
        expect(responseFormat).toBeTruthy();
        await tools.find((tool) => tool.name === 'get_current_time')?.invoke({ timezone: 'UTC', format: 'iso' });
        const scheduleRaw = await tools.find((tool) => tool.name === 'schedule_agent_request')?.invoke({
          request: task.payload.command,
          timezone: 'UTC',
        });

        return {
          structuredResponse: {
            outcome: 'schedule',
            confidence: 1.0,
            needs_clarification: false,
            interpretation: 'The user wants an email request scheduled for later.',
            summary: 'Scheduled the email request.',
            reasoning: 'Future-oriented request should be scheduled instead of executed immediately.',
            steps: [],
            schedule_result: JSON.parse(String(scheduleRaw ?? '{}')),
          },
          messages: [{ content: 'Scheduled request created.' }],
        };
      },
    }));

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.execution_run).toBeUndefined();
    expect(result.task.result.outcome).toBe('schedule_created');
    expect(result.task.result.schedule).toEqual(expect.objectContaining({
      schedule_id: 'schedule-1',
      task_type: 'assistant.command',
    }));
    expect(mockScheduleManageProcess).toHaveBeenCalledOnce();
  });

  it('passes run_at_iso to schedule_agent_request when timing was already resolved', async () => {
    const task = {
      ...baseTask,
      id: '123e4567-e89b-12d3-a456-426614174092',
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'dans 10 min envoie un mail a othily.g@gmail.com',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
      },
    };

    createAgentMock.mockImplementationOnce(({
      tools,
      responseFormat,
    }: {
      tools: Array<{ name: string; invoke: (args: Record<string, unknown>) => Promise<unknown> }>;
      responseFormat?: unknown;
    }) => ({
      invoke: async () => {
        expect(responseFormat).toBeTruthy();
        await tools.find((tool) => tool.name === 'get_current_time')?.invoke({ timezone: 'UTC', format: 'iso' });
        const scheduleRaw = await tools.find((tool) => tool.name === 'schedule_agent_request')?.invoke({
          request: 'envoie un mail a othily.g@gmail.com',
          timezone: 'UTC',
          run_at_iso: '2026-03-20T10:10:00.000Z',
        });

        return {
          structuredResponse: {
            outcome: 'schedule',
            confidence: 1.0,
            needs_clarification: false,
            interpretation: 'The user wants this email sent in ten minutes.',
            summary: 'Schedule the email in ten minutes.',
            reasoning: 'Relative timing was resolved via get_current_time and passed as run_at_iso.',
            steps: [],
            schedule_result: JSON.parse(String(scheduleRaw ?? '{}')),
          },
          messages: [{ content: 'Scheduled request created with run_at_iso.' }],
        };
      },
    }));

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.execution_run).toBeUndefined();
    expect(result.task.result.outcome).toBe('schedule_created');
    expect(mockScheduleManageProcess).toHaveBeenCalledOnce();

    const scheduledTask = mockScheduleManageProcess.mock.calls[0]?.[0] as { payload?: Record<string, unknown> };
    expect(scheduledTask.payload?.run_at_iso).toBe('2026-03-20T10:10:00.000Z');
    expect(scheduledTask.payload?.message_text).toBe('envoie un mail a othily.g@gmail.com');
  });

  it('auto-falls back to backend scheduling when the model chooses schedule outcome without tool output', async () => {
    const task = {
      ...baseTask,
      id: '123e4567-e89b-12d3-a456-426614174091',
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'dans 10 min envoie un mail a othily.g@gmail.com',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
      },
    };

    createAgentMock.mockImplementationOnce(({
      responseFormat,
    }: {
      responseFormat?: unknown;
    }) => ({
      invoke: async () => {
        expect(responseFormat).toBeTruthy();
        return {
          structuredResponse: {
            outcome: 'schedule',
            confidence: 1.0,
            needs_clarification: false,
            interpretation: 'The user wants this scheduled shortly in the future.',
            summary: 'Schedule the request in 10 minutes.',
            reasoning: 'Future-oriented request should be scheduled.',
            steps: [],
          },
          messages: [{ content: 'Scheduled request should be created.' }],
        };
      },
    }));

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.execution_run).toBeUndefined();
    expect(result.task.result.outcome).toBe('schedule_created');
    expect(String(result.task.result.summary)).toContain('Got it');
    expect(mockScheduleManageProcess).toHaveBeenCalledOnce();
  });

  it('treats a bare confirm reply as confirmation using conversation context', async () => {
    const riskyTask = {
      ...baseTask,
      id: '123e4567-e89b-12d3-a456-426614174100',
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'send an email now',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
        high_risk: true,
      },
    };

    db.tasks.set(riskyTask.id, clone(riskyTask));

    const paused = await graph.invoke({ task: riskyTask } as Parameters<typeof graph.invoke>[0]) as any;
    expect(paused.task.status).toBe('paused');
    expect(paused.task.result.reason).toBe('High-risk command requires confirmation');
    const pausedPrompt = paused.task.result.prompt as string;
    expect(typeof pausedPrompt).toBe('string');

    createAgentMock.mockImplementation(({
      tools,
      responseFormat,
      systemPrompt,
    }: {
      tools: MockAgentTool[];
      responseFormat?: unknown;
      systemPrompt?: unknown;
    }) => ({
      invoke: async () => {
        if (responseFormat && String(systemPrompt).includes('resolving a paused conversation turn')) {
          return {
            structuredResponse: {
              use_previous_request: true,
              confirmed: true,
              resolved_request: 'send an email now',
              reasoning: 'The latest user message explicitly confirms the paused request.',
            },
            messages: [{ content: 'Paused turn resolved.' }],
          };
        }

        if (responseFormat) {
          return {
            structuredResponse: mockChatMistralResponse.current,
            messages: [{ content: 'General agent completed.' }],
          };
        }

        const toolNames = tools.map((tool) => tool.name);
        if (toolNames.includes('draft_gmail_message')) {
          await invokeMockAgentTool(tools.find((tool) => tool.name === 'draft_gmail_message'), {
            to: 'alexis@example.com',
            subject: 'Status update',
            body: 'Document ready.',
          });
          return { messages: [{ content: 'Gmail draft completed.' }] };
        }

        return { messages: [{ content: 'Worker completed.' }] };
      },
    }));

    const confirmTask = {
      ...baseTask,
      id: '123e4567-e89b-12d3-a456-426614174101',
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'confirm',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
        conversation_context: [
          { role: 'user', content: 'send an email now', created_at: new Date().toISOString() },
          { role: 'assistant', content: pausedPrompt, state: 'paused', created_at: new Date().toISOString() },
        ],
      },
    };

    db.tasks.set(confirmTask.id, clone(confirmTask));

    const result = await graph.invoke({ task: confirmTask } as Parameters<typeof graph.invoke>[0]) as any;
    // The confirmed command may still pause for missing details, but it should not
    // re-pause due to missing high-risk confirmation.
    expect(result.task.result.reason).not.toBe('High-risk command requires confirmation');
  });

  it('treats natural send approval as confirmation using paused send context', async () => {
    const createMcpTool = (name: string, result: Record<string, unknown>): MockAgentTool => ({
      name,
      call: vi.fn(async () => result),
      invoke: vi.fn(async () => result),
    });
    const sendTool = createMcpTool('send_gmail_message', {
      message_id: 'message-1',
      summary: 'Email sent.',
    });

    mockGetLangChainTools.mockResolvedValue([
      createMcpTool('create_doc', {
        id: 'doc-1',
        url: 'https://docs.google.com/document/d/doc-1',
        title: 'OVNI report',
        summary: 'Doc created.',
      }),
      createMcpTool('modify_doc_text', {
        id: 'doc-1',
        url: 'https://docs.google.com/document/d/doc-1',
        summary: 'Doc populated.',
      }),
      sendTool,
    ]);

    const originalCommand = 'okay tu peux sauvegarder ton rapport dans un google docs et envoyer ça par mail a othily.g@gmail.com';

    createAgentMock.mockImplementation(({
      tools,
      responseFormat,
      systemPrompt,
    }: {
      tools: MockAgentTool[];
      responseFormat?: unknown;
      systemPrompt?: unknown;
    }) => ({
      invoke: async (input?: unknown) => {
        if (responseFormat && String(systemPrompt).includes('resolving a paused conversation turn')) {
          return {
            structuredResponse: {
              use_previous_request: true,
              confirmed: true,
              resolved_request: originalCommand,
              reasoning: 'The latest user message authorizes sending the paused report email.',
            },
            messages: [{ content: 'Paused turn resolved.' }],
          };
        }

        const toolNames = tools.map((tool) => tool.name);

        if (responseFormat && toolNames.includes('ask_docs_agent')) {
          const prompt = String(((input as { messages?: Array<{ content?: unknown }> })?.messages?.[0]?.content) ?? '');
          expect(prompt).toContain(`User request: "${originalCommand}"`);
          expect(prompt).not.toContain('User request: "you can send the mail"');

          const docsRaw = await invokeMockAgentTool(
            tools.find((tool) => tool.name === 'ask_docs_agent'),
            { prompt: 'Create a Google Doc containing the OVNI report from the conversation context.' },
          );
          const docsResult = JSON.parse(String(docsRaw)) as { handoff_content?: string };
          await invokeMockAgentTool(
            tools.find((tool) => tool.name === 'ask_gmail_agent'),
            { prompt: `Send the OVNI report to othily.g@gmail.com. Include this doc handoff: ${docsResult.handoff_content ?? ''}` },
          );

          return {
            structuredResponse: {
              outcome: 'agent_tools',
              confidence: 1,
              interpretation: 'The user confirmed sending the previously requested report email.',
              needs_clarification: false,
              summary: 'Created the report doc and sent the email.',
              reasoning: 'The current message confirms the paused send request from conversation context.',
              steps: [],
              agent_tool_summary: 'Created the report doc and sent the email.',
            },
            messages: [{ content: 'General agent completed specialist tool calls.' }],
          };
        }

        if (toolNames.includes('create_doc')) {
          await invokeMockAgentTool(tools.find((tool) => tool.name === 'create_doc'), {
            title: 'OVNI report',
            content: 'OVNI report content from the prior answer.',
          });
          await invokeMockAgentTool(tools.find((tool) => tool.name === 'modify_doc_text'), {
            document_id: 'doc-1',
            text: 'OVNI report content from the prior answer.',
            start_index: 1,
          });
          return { messages: [{ content: 'Docs artifact created and populated.' }] };
        }

        if (toolNames.includes('send_gmail_message')) {
          await invokeMockAgentTool(tools.find((tool) => tool.name === 'send_gmail_message'), {
            to: 'othily.g@gmail.com',
            subject: 'Rapport OVNI 2026',
            body: 'Here is the report doc.',
          });
          return { messages: [{ content: 'Gmail send completed.' }] };
        }

        if (toolNames.includes('draft_gmail_message')) {
          throw new Error('Expected confirmed approval to keep send_gmail_message available.');
        }

        return { messages: [{ content: 'Worker completed.' }] };
      },
    }));

    const task = {
      ...baseTask,
      id: '123e4567-e89b-12d3-a456-426614174102',
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'you can send the mail',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
        conversation_context: [
          { role: 'user', content: 'stp je n y connais rien au Ovni tu peux m expliquer ce que sait et les news qu il y a eu par rapport à ça en 2026 ?', created_at: new Date().toISOString() },
          { role: 'assistant', content: 'Un OVNI est simplement un Objet Volant Non Identifie... Sources: CNES, France Inter.', created_at: new Date().toISOString() },
          { role: 'user', content: originalCommand, created_at: new Date().toISOString() },
          { role: 'assistant', content: 'J’ai besoin d’une précision pour continuer. Ask the user for explicit confirmation before sending, or offer to create a draft instead.', state: 'paused', created_at: new Date().toISOString() },
        ],
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.task.result.outcome).toBe('agent_tools_reviewed');
    expect(result.task.result.agent_tool_original_request).toBe(originalCommand);
    expect(sendTool.call).toHaveBeenCalledOnce();
  });

  it('treats send approval after a completed draft as confirmation using recent conversation context', async () => {
    const createMcpTool = (name: string, result: Record<string, unknown>): MockAgentTool => ({
      name,
      call: vi.fn(async () => result),
      invoke: vi.fn(async () => result),
    });
    const sendTool = createMcpTool('send_gmail_message', {
      message_id: 'message-2',
      summary: 'Email sent.',
    });

    mockGetLangChainTools.mockResolvedValue([sendTool]);

    const resolvedCommand = 'Send the previously prepared Google Docs NASA report email to othily.g@gmail.com.';

    createAgentMock.mockImplementation(({
      tools,
      responseFormat,
      systemPrompt,
    }: {
      tools: MockAgentTool[];
      responseFormat?: unknown;
      systemPrompt?: unknown;
    }) => ({
      invoke: async (input?: unknown) => {
        if (responseFormat && String(systemPrompt).includes('resolving whether the latest user message continues recent conversation context')) {
          return {
            structuredResponse: {
              use_conversation_context: true,
              confirmed: true,
              resolved_request: resolvedCommand,
              reasoning: 'The latest user message authorizes sending the email draft prepared in the previous assistant turn.',
            },
            messages: [{ content: 'Recent turn resolved.' }],
          };
        }

        const toolNames = tools.map((tool) => tool.name);

        if (responseFormat && toolNames.includes('ask_gmail_agent')) {
          const prompt = String(((input as { messages?: Array<{ content?: unknown }> })?.messages?.[0]?.content) ?? '');
          expect(prompt).toContain(`User request: "${resolvedCommand}"`);
          expect(prompt).not.toContain('User request: "it s still in draft mode please send the message"');

          await invokeMockAgentTool(
            tools.find((tool) => tool.name === 'ask_gmail_agent'),
            { prompt: 'Send the already prepared NASA report email to othily.g@gmail.com.' },
          );

          return {
            structuredResponse: {
              outcome: 'agent_tools',
              confidence: 1,
              interpretation: 'The user confirmed sending the previously drafted NASA report email.',
              needs_clarification: false,
              summary: 'Sent the prepared NASA report email.',
              reasoning: 'The current message confirms the prior completed draft action from conversation context.',
              steps: [],
              agent_tool_summary: 'Sent the prepared NASA report email.',
            },
            messages: [{ content: 'General agent completed specialist tool calls.' }],
          };
        }

        if (toolNames.includes('send_gmail_message')) {
          await invokeMockAgentTool(tools.find((tool) => tool.name === 'send_gmail_message'), {
            to: 'othily.g@gmail.com',
            subject: 'Rapport : Activités de la NASA en 2026',
            body: 'Voici le lien vers le rapport Google Docs.',
          });
          return { messages: [{ content: 'Gmail send completed.' }] };
        }

        if (toolNames.includes('draft_gmail_message')) {
          throw new Error('Expected recent-turn confirmation to keep send_gmail_message available.');
        }

        return { messages: [{ content: 'Worker completed.' }] };
      },
    }));

    const task = {
      ...baseTask,
      id: '123e4567-e89b-12d3-a456-426614174103',
      topic: 'Command Center',
      domain_action: 'assistant.command',
      payload: {
        command: 'it s still in draft mode please send the message',
        source: 'dashboard-command-center',
        channel: 'web',
        user_initiated: true,
        conversation_context: [
          { role: 'user', content: 'parle moi de ce que la nasa fait actuellement en 2026', created_at: new Date().toISOString() },
          { role: 'assistant', content: 'J ai trouve 12 sources recentes. Points principaux: Artemis, budget NASA, Mars...', created_at: new Date().toISOString() },
          { role: 'user', content: 'fais en un rapport que tu mettras dans un google docs , tu partageras le google docs ensuite par mail à othily.g@gmail.com', created_at: new Date().toISOString() },
          { role: 'assistant', content: "Création du rapport: Un document Google Docs intitulé 'Rapport d'activités de la NASA en 2026' a été créé. Préparation de l'email: Un brouillon d'email a été préparé pour accompagner l'envoi du rapport.", created_at: new Date().toISOString() },
        ],
      },
    };

    db.tasks.set(task.id, clone(task));

    const result = await graph.invoke({ task } as Parameters<typeof graph.invoke>[0]) as any;

    expect(result.task.result.outcome).toBe('agent_tools_reviewed');
    expect(result.task.result.agent_tool_original_request).toBe(resolvedCommand);
    expect(sendTool.call).toHaveBeenCalledOnce();
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
