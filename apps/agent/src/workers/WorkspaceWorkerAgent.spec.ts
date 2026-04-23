import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerExecutionContext } from './CapabilityWorkerRegistry.js';
import { executeWorkspaceWorkerAgent } from './WorkspaceWorkerAgent.js';

const {
  createAgentMock,
  mockExecuteWorkerTool,
  mockResolveToolName,
} = vi.hoisted(() => ({
  createAgentMock: vi.fn(),
  mockExecuteWorkerTool: vi.fn(),
  mockResolveToolName: vi.fn(),
}));

vi.mock('langchain', () => ({
  createAgent: (...args: unknown[]) => createAgentMock(...args),
  modelCallLimitMiddleware: vi.fn(() => ({ name: 'modelCallLimitMiddleware' })),
  toolStrategy: vi.fn((schema: unknown) => schema),
}));

vi.mock('@langchain/mistralai', () => {
  class ChatMistralAI {
    constructor(..._args: unknown[]) {}
  }

  return { ChatMistralAI };
});

vi.mock('../config/index.js', () => ({
  config: {
    MISTRAL_API_KEY: 'mock-key',
    DEFAULT_LLM_MODEL: 'mistral-small-latest',
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

vi.mock('../services/mcp.js', () => ({
  mcpService: {
    executeWorkerTool: mockExecuteWorkerTool,
    resolveToolName: mockResolveToolName,
  },
}));

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { user_id: '123e4567-e89b-12d3-a456-426614174002' },
        error: null,
      }),
    })),
  },
}));

function buildContext(
  workerType: WorkerExecutionContext['step']['worker_type'],
  action: string,
  input: Record<string, unknown> = {},
): WorkerExecutionContext {
  return {
    task: {
      id: '123e4567-e89b-12d3-a456-426614174000',
      organization_id: '123e4567-e89b-12d3-a456-426614174001',
      user_id: '123e4567-e89b-12d3-a456-426614174002',
      domain_action: 'assistant.command',
      status: 'queued',
      payload: {},
    },
    executionRun: {
      id: '123e4567-e89b-12d3-a456-426614174099',
      task_id: '123e4567-e89b-12d3-a456-426614174000',
      organization_id: '123e4567-e89b-12d3-a456-426614174001',
      status: 'processing',
      tool_policy_version: 'workspace-v1.15.0',
      current_step_key: 'step-1',
      current_worker_type: workerType,
      version: 1,
      idempotency_state: {},
      ledger_markdown: '',
      plan_json: {
        version: 'v1',
        original_command: 'Create a workspace artifact and hand it off.',
        summary: 'Workspace flow',
        replan_count: 0,
        ledger_entries: [],
        steps: [
          {
            key: 'step-1',
            title: 'Current worker step',
            worker_type: workerType,
            action,
            status: 'in_progress',
            requested_tools: [],
            input,
            output: {},
            attempt_count: 1,
            idempotency_key: `${workerType}-${action}-1`,
            recoverable: true,
          },
        ],
      },
    },
    step: {
      key: 'step-1',
      title: 'Current worker step',
      worker_type: workerType,
      action,
      status: 'in_progress',
      requested_tools: [],
      input,
      output: {},
      attempt_count: 1,
      idempotency_key: `${workerType}-${action}-1`,
      recoverable: true,
    },
  };
}

describe('WorkspaceWorkerAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockResolveToolName.mockImplementation(async (_orgId: string, requestedTool: string) => ({
      requestedTool,
      resolvedTool: requestedTool,
      availableTools: [requestedTool],
    }));

    mockExecuteWorkerTool.mockImplementation(async (_orgId: string, workerType: string, requestedTool: string) => {
      if (workerType === 'docs' && requestedTool === 'create_doc') {
        return {
          toolName: 'create_doc',
          result: { structuredContent: { id: 'doc-1', url: 'https://docs.google.com/document/d/doc-1/edit' } },
        };
      }

      if (workerType === 'docs' && requestedTool === 'modify_doc_text') {
        return {
          toolName: 'modify_doc_text',
          result: { structuredContent: { updated: true } },
        };
      }

      if (workerType === 'drive') {
        return {
          toolName: requestedTool,
          result: { structuredContent: { summary: 'Drive source loaded', id: 'file-1' } },
        };
      }

      if (workerType === 'gmail') {
        return {
          toolName: requestedTool,
          result: { content: [{ type: 'text', text: 'Gmail action completed' }] },
        };
      }

      if (workerType === 'sheets') {
        return {
          toolName: requestedTool,
          result: { structuredContent: { spreadsheet_id: 'sheet-1', url: 'https://docs.google.com/spreadsheets/d/sheet-1/edit' } },
        };
      }

      if (workerType === 'slides') {
        return {
          toolName: requestedTool,
          result: { structuredContent: { presentation_id: 'deck-1', url: 'https://docs.google.com/presentation/d/deck-1/edit' } },
        };
      }

      return {
        toolName: requestedTool,
        result: { structuredContent: { id: 'evt-1' } },
      };
    });
  });

  it.each([
    ['drive', 'read_drive_context', ['search_drive_files', 'get_drive_file_content', 'get_drive_shareable_link']],
    ['docs', 'create_document', ['create_doc', 'modify_doc_text', 'get_doc_content']],
    ['gmail', 'draft_email', ['draft_gmail_message', 'get_gmail_thread_content']],
    ['sheets', 'update_sheet', ['create_spreadsheet', 'modify_sheet_values', 'read_sheet_values', 'get_spreadsheet_info']],
    ['slides', 'create_presentation', ['create_presentation', 'batch_update_presentation', 'get_presentation']],
    ['calendar', 'create_event', ['manage_event', 'get_events', 'list_calendars']],
  ])('builds a specialized tool set for %s', async (workerType, action, expectedToolNames) => {
    createAgentMock.mockImplementationOnce(({ tools }: { tools: Array<{ name: string; invoke: (args: Record<string, unknown>) => Promise<unknown> }> }) => ({
      invoke: async () => {
        if (tools.some((tool) => tool.name === 'get_drive_file_content')) {
          await tools.find((tool) => tool.name === 'get_drive_file_content')?.invoke({ file_id: 'file-1' });
        } else if (tools.some((tool) => tool.name === 'create_doc')) {
          await tools.find((tool) => tool.name === 'create_doc')?.invoke({ title: 'Generated doc' });
        } else if (tools.some((tool) => tool.name === 'draft_gmail_message')) {
          await tools.find((tool) => tool.name === 'draft_gmail_message')?.invoke({
            to: 'alexis@example.com',
            subject: 'Status',
            body: 'Done',
          });
        } else if (tools.some((tool) => tool.name === 'create_spreadsheet')) {
          await tools.find((tool) => tool.name === 'create_spreadsheet')?.invoke({ title: 'Generated sheet' });
        } else if (tools.some((tool) => tool.name === 'create_presentation')) {
          await tools.find((tool) => tool.name === 'create_presentation')?.invoke({ title: 'Generated deck' });
        } else if (tools.some((tool) => tool.name === 'manage_event')) {
          await tools.find((tool) => tool.name === 'manage_event')?.invoke({
            action: 'create',
            summary: 'Status sync',
            start_time: '2026-03-21T10:00:00Z',
            end_time: '2026-03-21T10:30:00Z',
          });
        }

        return { messages: [{ content: 'Worker completed.' }] };
      },
    }));

    await executeWorkspaceWorkerAgent(buildContext(workerType as WorkerExecutionContext['step']['worker_type'], action as string));

    const agentArgs = createAgentMock.mock.calls[0]?.[0] as { tools?: Array<{ name: string }> };
    expect(agentArgs.tools?.map((tool) => tool.name)).toEqual(expect.arrayContaining(expectedToolNames as string[]));
  });

  it('returns rich Docs handoff metadata after creating a populated document', async () => {
    createAgentMock.mockImplementationOnce(({ tools }: { tools: Array<{ name: string; invoke: (args: Record<string, unknown>) => Promise<unknown> }> }) => ({
      invoke: async () => {
        await tools.find((tool) => tool.name === 'create_doc')?.invoke({
          title: 'danse avec les star',
          content: 'Waltz\nTango\nSalsa',
        });
        await tools.find((tool) => tool.name === 'modify_doc_text')?.invoke({
          document_id: 'doc-1',
          text: 'Waltz\nTango\nSalsa',
          start_index: 1,
        });

        return { messages: [{ content: 'The Google Doc has been created and filled with the requested dance ideas.' }] };
      },
    }));

    const result = await executeWorkspaceWorkerAgent(buildContext('docs', 'create_document', {
      title: 'Planner-generated document',
    }));

    expect(result.output.document_id).toBe('doc-1');
    expect(result.output.document_url).toBe('https://docs.google.com/document/d/doc-1/edit');
    expect(result.nextWorkerNote).toContain('Google Doc ready');
    expect(result.nextWorkerNote).toContain('initial content populated');
    expect(String(result.summary)).toContain('created');
  });
});
