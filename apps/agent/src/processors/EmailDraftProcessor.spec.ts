import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailDraftProcessor } from './EmailDraftProcessor.js';
import { MCPService } from '../services/mcp.js';

// Mock dependencies
vi.mock('../services/mcp.js');

// Mock Supabase to prevent config validation error
vi.mock('../services/supabase.js', () => ({
  supabase: {}
}));

describe('EmailDraftProcessor', () => {
  let processor: EmailDraftProcessor;
  let mockExecuteTool: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteTool = vi.fn().mockResolvedValue({ 
      content: [{ type: 'text', text: 'Draft created' }] 
    });
    
    // Mock the MCPService class method
    MCPService.prototype.executeTool = mockExecuteTool;
    
    processor = new EmailDraftProcessor();
  });

  it('should successfully create an email draft via MCP', async () => {
    const task = {
      id: 'task-123',
      organization_id: 'org-1',
      domain_action: 'email.draft',
      payload: {
        recipient: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body'
      }
    };

    const result = await processor.process(task as any);

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'org-1',
      'create_gmail_draft',
      expect.objectContaining({
        userId: 'me',
        draft: expect.objectContaining({
          message: expect.objectContaining({
            raw: expect.any(String)
          })
        })
      })
    );

    // Verify raw content is base64 encoded
    const callArgs = mockExecuteTool.mock.calls[0][2];
    const decodedRaw = atob(callArgs.draft.message.raw);
    expect(decodedRaw).toContain('To: test@example.com');
    expect(decodedRaw).toContain('Subject: Test Subject');
    expect(decodedRaw).toContain('Test Body');

    expect(result.message).toContain('successfully');
  });

  it('should throw error when required payload fields are missing', async () => {
    const task = {
      id: 'task-123',
      organization_id: 'org-1',
      domain_action: 'email.draft',
      payload: {
        recipient: 'test@example.com'
        // Missing subject and body
      }
    };

    await expect(processor.process(task as any)).rejects.toThrow(/Missing required email fields/);
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });
});
