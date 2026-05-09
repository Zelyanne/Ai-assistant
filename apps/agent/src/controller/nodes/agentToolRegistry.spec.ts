import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@ai-assistant/shared';
import { createSpecialistAgentTools } from './agentToolRegistry.js';
import type { SpecialistNodeContext } from './types.js';

const {
  mockGmailAgentNode,
  mockDocsAgentNode,
  mockBuildPromptScopedSkillAppendix,
} = vi.hoisted(() => ({
  mockGmailAgentNode: vi.fn(),
  mockDocsAgentNode: vi.fn(),
  mockBuildPromptScopedSkillAppendix: vi.fn(),
}));

vi.mock('./gmailAgent.js', () => ({ gmailAgentNode: mockGmailAgentNode }));
vi.mock('./calendarAgent.js', () => ({ calendarAgentNode: vi.fn() }));
vi.mock('./docsAgent.js', () => ({ docsAgentNode: mockDocsAgentNode }));
vi.mock('./sheetsAgent.js', () => ({ sheetsAgentNode: vi.fn() }));
vi.mock('./slidesAgent.js', () => ({ slidesAgentNode: vi.fn() }));
vi.mock('./driveAgent.js', () => ({ driveAgentNode: vi.fn() }));
vi.mock('../../prompts/agentSkillInjector.js', () => ({
  buildPromptScopedSkillAppendix: mockBuildPromptScopedSkillAppendix,
}));

const task = {
  id: 'task-1',
  organization_id: 'org-1',
  user_id: 'user-1',
  domain_action: 'assistant.command',
  status: 'processing',
  payload: {},
} as unknown as Task;

describe('createSpecialistAgentTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildPromptScopedSkillAppendix.mockResolvedValue({
      content: 'RELEVANT USER SKILLS\nUse concise writing.',
      userSkillNames: ['concise-writing'],
    });
    mockDocsAgentNode.mockResolvedValue({
      summary: 'Doc created.',
      nextWorkerNote: 'Doc handoff.',
      toolName: 'create_doc',
      output: {
        summary: 'Doc created.',
        handoff_content: 'Doc handoff.',
        document_id: 'doc-1',
        document_url: 'https://docs.google.com/document/d/doc-1',
        tool_name: 'create_doc',
      },
    });
    mockGmailAgentNode.mockResolvedValue({
      summary: 'Email sent.',
      nextWorkerNote: 'Email handoff.',
      toolName: 'send_gmail_message',
      output: {
        summary: 'Email sent.',
        handoff_content: 'Email handoff.',
        message_id: 'msg-1',
        tool_name: 'send_gmail_message',
      },
    });
  });

  it('wraps a specialist node as a prompt-only tool with scoped skills', async () => {
    const results: unknown[] = [];
    const tools = createSpecialistAgentTools({
      task,
      originalCommand: 'Create a doc summary',
      allowHighRiskActions: false,
      onResult: (result) => {
        results.push(result);
      },
    });

    const docsTool = tools.find((tool) => tool.name === 'ask_docs_agent');
    expect(docsTool).toBeDefined();

    const raw = await docsTool!.invoke({ prompt: 'Create a concise project summary doc.' });
    const parsed = JSON.parse(String(raw)) as Record<string, unknown>;
    const context = mockDocsAgentNode.mock.calls[0]?.[0] as SpecialistNodeContext;

    expect(parsed.agent).toBe('docs');
    expect(parsed.status).toBe('completed');
    expect(parsed.handoff_content).toBe('Doc handoff.');
    expect(parsed.artifacts).toMatchObject({ document_id: 'doc-1' });
    expect(context.agentToolPrompt).toBe('Create a concise project summary doc.');
    expect(context.relevantSkillContext).toContain('Use concise writing.');
    expect(mockBuildPromptScopedSkillAppendix).toHaveBeenCalledWith(expect.objectContaining({
      target: 'docs',
      prompt: 'Create a concise project summary doc.',
      organizationId: 'org-1',
      userId: 'user-1',
    }));
    expect(results).toHaveLength(1);
  });

  it('blocks unconfirmed Gmail send-like prompts before calling the specialist', async () => {
    const tools = createSpecialistAgentTools({
      task,
      originalCommand: 'Send an email',
      allowHighRiskActions: false,
    });

    const gmailTool = tools.find((tool) => tool.name === 'ask_gmail_agent');
    const raw = await gmailTool!.invoke({ prompt: 'Send an email to john@example.com saying hello.' });
    const parsed = JSON.parse(String(raw)) as Record<string, unknown>;

    expect(parsed.status).toBe('needs_confirmation');
    expect(parsed.handoff_content).toContain('confirm');
    expect(mockGmailAgentNode).not.toHaveBeenCalled();
  });

  it('blocks ambiguous email prompts before calling the Gmail specialist', async () => {
    const tools = createSpecialistAgentTools({
      task,
      originalCommand: 'Email John',
      allowHighRiskActions: false,
    });

    const gmailTool = tools.find((tool) => tool.name === 'ask_gmail_agent');
    const raw = await gmailTool!.invoke({ prompt: 'Email John the project summary.' });
    const parsed = JSON.parse(String(raw)) as Record<string, unknown>;

    expect(parsed.status).toBe('needs_confirmation');
    expect(mockGmailAgentNode).not.toHaveBeenCalled();
  });

  it('passes confirmation state into Gmail specialist context', async () => {
    const tools = createSpecialistAgentTools({
      task,
      originalCommand: 'Send an email',
      allowHighRiskActions: true,
    });

    const gmailTool = tools.find((tool) => tool.name === 'ask_gmail_agent');
    const raw = await gmailTool!.invoke({ prompt: 'Send an email to john@example.com saying hello.' });
    const parsed = JSON.parse(String(raw)) as Record<string, unknown>;
    const context = mockGmailAgentNode.mock.calls[0]?.[0] as SpecialistNodeContext;

    expect(parsed.status).toBe('completed');
    expect(context.allowHighRiskActions).toBe(true);
  });
});
