import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailDraftProcessor } from './EmailDraftProcessor.js';

const { mockResolveToolName, mockExecuteWorkerTool } = vi.hoisted(() => ({
  mockResolveToolName: vi.fn(),
  mockExecuteWorkerTool: vi.fn(),
}));

vi.mock('../services/mcp.js', () => ({
  mcpService: {
    resolveToolName: mockResolveToolName,
    executeWorkerTool: mockExecuteWorkerTool,
  },
}));

vi.mock('../services/supabase.js', () => ({
  supabase: {},
}));

describe('EmailDraftProcessor', () => {
  let processor: EmailDraftProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new EmailDraftProcessor();
  });

  it('creates an email draft with normalized Gmail tool names', async () => {
    mockResolveToolName.mockResolvedValue({
      requestedTool: 'draft_gmail_message',
      resolvedTool: 'draft_gmail_message',
      availableTools: ['draft_gmail_message'],
    });
    mockExecuteWorkerTool.mockResolvedValue({
      toolName: 'draft_gmail_message',
      result: { content: [{ type: 'text', text: 'Draft created' }] },
    });

    const result = await processor.process({
      id: 'task-123',
      organization_id: 'org-1',
      domain_action: 'email.draft',
      payload: {
        recipient: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body',
      },
    } as any);

    expect(mockExecuteWorkerTool).toHaveBeenCalledWith(
      'org-1',
      'gmail',
      'draft_gmail_message',
      expect.objectContaining({
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body',
      }),
    );
    expect(result.tool_name).toBe('draft_gmail_message');
  });

  it('throws when required payload fields are missing', async () => {
    await expect(
      processor.process({
        id: 'task-123',
        organization_id: 'org-1',
        domain_action: 'email.draft',
        payload: { recipient: 'test@example.com' },
      } as any),
    ).rejects.toThrow(/Missing required email fields/);

    expect(mockExecuteWorkerTool).not.toHaveBeenCalled();
  });
});
