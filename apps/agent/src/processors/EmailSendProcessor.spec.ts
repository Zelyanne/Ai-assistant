import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailSendProcessor } from './EmailSendProcessor.js';

const { mockExecuteTool, mockMaybeSingle } = vi.hoisted(() => ({
  mockExecuteTool: vi.fn(),
  mockMaybeSingle: vi.fn(),
}));

vi.mock('../services/mcp.js', () => ({
  mcpService: {
    executeTool: mockExecuteTool,
  },
}));

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: mockMaybeSingle,
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
    mockExecuteTool.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Message ID: abc-123' }] });

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

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'org-1',
      'send_gmail_message',
      expect.objectContaining({
        to: 'ceo@example.com',
        subject: 'Update',
        body: 'All set.',
      }),
    );
    expect(result.send_status).toBe('sent');
    expect(result.message_id).toBe('abc-123');
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

    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it('falls back to draft when send tool is unavailable', async () => {
    mockExecuteTool
      .mockRejectedValueOnce(new Error('Unknown tool: send_gmail_message'))
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Draft created' }] });

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

    expect(mockExecuteTool).toHaveBeenNthCalledWith(1, 'org-1', 'send_gmail_message', expect.any(Object));
    expect(mockExecuteTool).toHaveBeenNthCalledWith(2, 'org-1', 'create_gmail_draft', expect.any(Object));
    expect(result.send_status).toBe('draft_created');
  });
});
