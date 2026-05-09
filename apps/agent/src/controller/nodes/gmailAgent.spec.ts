import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gmailAgentNode } from './gmailAgent.js';
import type { SpecialistNodeContext } from './types.js';

const {
  mockCreateAgent,
  mockBuildSpecialistContextPrompt,
  mockGetSpecialistMcpTools,
} = vi.hoisted(() => ({
  mockCreateAgent: vi.fn(),
  mockBuildSpecialistContextPrompt: vi.fn(() => 'specialist prompt'),
  mockGetSpecialistMcpTools: vi.fn(),
}));

vi.mock('@langchain/mistralai', () => ({
  ChatMistralAI: vi.fn(),
}));

vi.mock('langchain', () => ({
  createAgent: mockCreateAgent,
  modelCallLimitMiddleware: vi.fn(() => ({})),
}));

vi.mock('../../config/index.js', () => ({
  config: {
    MISTRAL_API_KEY: 'test-key',
    DEFAULT_LLM_MODEL: 'mistral-small-latest',
  },
}));

vi.mock('../../services/llm/tracing.js', () => ({
  tracingService: {
    getHandler: vi.fn(() => null),
    handleSuccess: vi.fn(),
    handleFailure: vi.fn(),
    flush: vi.fn(),
  },
}));

vi.mock('./specialistToolBuilder.js', () => {
  return {
    buildSpecialistContextPrompt: mockBuildSpecialistContextPrompt,
    getSpecialistMcpTools: mockGetSpecialistMcpTools,
  };
});

function createContext(overrides: Partial<SpecialistNodeContext> = {}): SpecialistNodeContext {
  return {
    task: {
      id: 'task-1',
      organization_id: 'org-1',
      user_id: 'user-1',
      domain_action: 'assistant.command',
      status: 'processing',
      payload: {},
    } as SpecialistNodeContext['task'],
    executionRun: {
      task_id: 'task-1',
      organization_id: 'org-1',
      status: 'processing',
      ledger_markdown: '# Test',
      idempotency_state: {},
      tool_policy_version: 'test',
      version: 1,
      plan_json: {
        version: 'v1',
        original_command: 'Email John',
        summary: 'Email John',
        ledger_entries: [],
        replan_count: 0,
        steps: [],
      },
    } as SpecialistNodeContext['executionRun'],
    step: {
      key: 'step-1',
      title: 'Email John',
      worker_type: 'gmail',
      action: 'email_john',
      status: 'in_progress',
      requested_tools: [],
      input: {},
      output: {},
      attempt_count: 0,
      idempotency_key: 'step-1',
      recoverable: false,
    },
    agentToolPrompt: 'Email John the summary.',
    ...overrides,
  };
}

describe('gmailAgentNode agent-tool safety', () => {
  let capturedToolNames: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    capturedToolNames = [];
    mockGetSpecialistMcpTools.mockResolvedValue([
      {
        name: 'draft_gmail_message',
        call: vi.fn(async () => JSON.stringify({ draft_id: 'draft-1', summary: 'Draft created.' })),
      },
      {
        name: 'send_gmail_message',
        call: vi.fn(async () => JSON.stringify({ message_id: 'msg-1', summary: 'Email sent.' })),
      },
      {
        name: 'get_current_time',
        call: vi.fn(async () => '{}'),
      },
    ]);
    mockCreateAgent.mockImplementation(({ tools }) => {
      capturedToolNames = tools.map((tool: { name: string }) => tool.name);
      return {
        invoke: vi.fn(async () => {
          await tools[0].call({});
          return { messages: [{ content: 'Gmail done.' }] };
        }),
      };
    });
  });

  it('removes send_gmail_message for unconfirmed agent-tool prompts', async () => {
    const result = await gmailAgentNode(createContext({ allowHighRiskActions: false }));

    expect(capturedToolNames).not.toContain('send_gmail_message');
    expect(capturedToolNames).toContain('draft_gmail_message');
    expect(result.output.draft_id).toBe('draft-1');
    expect(result.toolInvocations).toHaveLength(1);
  });

  it('keeps send_gmail_message available when explicitly confirmed', async () => {
    await gmailAgentNode(createContext({ allowHighRiskActions: true }));

    expect(capturedToolNames).toContain('send_gmail_message');
  });
});
