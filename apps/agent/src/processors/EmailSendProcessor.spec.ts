import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailSendProcessor } from './EmailSendProcessor.js';

const { mockExecuteWorkerTool, mockResolveToolName, mockMaybeSingle } = vi.hoisted(() => ({
  mockExecuteWorkerTool: vi.fn(),
  mockResolveToolName: vi.fn(),
  mockMaybeSingle: vi.fn(),
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
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: mockMaybeSingle,
            single: mockMaybeSingle,
          })),
        })),
      })),
    })),
  },
}));

describe('EmailSendProcessor', () => {
  const processor = new EmailSendProcessor();

  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({ data: { user_id: 'owner-1' }, error: null });
  });

  it('sends email when approved by integration owner', async () => {
    mockExecuteWorkerTool.mockResolvedValueOnce({
      toolName: 'send_gmail_message',
      result: { content: [{ type: 'text', text: 'Message ID: abc-123' }] },
    });

    const result = await processor.process({
      id: 'task-1',
      organization_id: 'org-1',
      domain_action: 'email.send',
      payload: {
        to: 'ceo@example.com',
        subject: 'Update',
        body: 'All set.',
        approved_by: 'owner-1',
        approved_at: new Date().toISOString(),
        source_task_id: 'task-source-1',
      },
    } as any);

    expect(mockExecuteWorkerTool).toHaveBeenCalledWith(
      'org-1',
      'gmail',
      'send_gmail_message',
      expect.objectContaining({
        to: 'ceo@example.com',
        subject: 'Update',
        body: 'All set.',
      }),
    );
    expect(result.send_status).toBe('sent');
    expect(result.message_id).toBe('abc-123');
    expect(result.tool_name).toBe('send_gmail_message');
  });

  it('rejects when approved_by does not match integration owner', async () => {
    await expect(
      processor.process({
        id: 'task-1',
        organization_id: 'org-1',
        domain_action: 'email.send',
        payload: {
          to: 'ceo@example.com',
          subject: 'Update',
          body: 'All set.',
          approved_by: 'different-user',
          approved_at: new Date().toISOString(),
        },
      } as any),
    ).rejects.toThrow(/APPROVER_MISMATCH/);

    expect(mockExecuteWorkerTool).not.toHaveBeenCalled();
  });

  it('falls back to draft when send tool is unavailable', async () => {
    mockExecuteWorkerTool.mockRejectedValueOnce(new Error('Unknown tool: send_gmail_message'));
    mockResolveToolName.mockResolvedValueOnce({
      requestedTool: 'create_gmail_draft',
      resolvedTool: 'draft_gmail_message',
      availableTools: ['draft_gmail_message'],
    });
    mockExecuteWorkerTool.mockResolvedValueOnce({
      toolName: 'draft_gmail_message',
      result: { content: [{ type: 'text', text: 'Draft created' }] },
    });

    const result = await processor.process({
      id: 'task-1',
      organization_id: 'org-1',
      domain_action: 'email.send',
      payload: {
        to: 'ceo@example.com',
        subject: 'Update',
        body: 'All set.',
        approved_by: 'owner-1',
        approved_at: new Date().toISOString(),
      },
    } as any);

    expect(mockExecuteWorkerTool).toHaveBeenNthCalledWith(1, 'org-1', 'gmail', 'send_gmail_message', expect.any(Object));
    expect(mockExecuteWorkerTool).toHaveBeenNthCalledWith(2, 'org-1', 'gmail', 'create_gmail_draft', expect.any(Object));
    expect(result.send_status).toBe('draft_created');
    expect(result.tool_name).toBe('draft_gmail_message');
  });
});
