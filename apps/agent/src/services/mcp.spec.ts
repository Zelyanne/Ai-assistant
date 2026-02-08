import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPService } from './mcp.js';

const mockClientInstance = {
  connect: vi.fn().mockResolvedValue(undefined),
  callTool: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Success' }],
    structuredContent: { result: 'Success' }
  }),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  return {
    Client: vi.fn().mockImplementation(function() {
      return mockClientInstance;
    })
  };
});

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => {
  return {
    SSEClientTransport: vi.fn().mockImplementation(function() {
      return {};
    })
  };
});

vi.mock('../config/index.js', () => ({
  config: {
    ENCRYPTION_SECRET: 'a'.repeat(32),
    GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
  }
}));

vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        encrypted_creds: {
          access_token: 'iv:tag:encrypted_access',
          refresh_token: 'iv:tag:encrypted_refresh'
        }
      },
      error: null
    }),
    insert: vi.fn().mockResolvedValue({ error: null })
  }
}));

vi.mock('@ai-assistant/shared', () => ({
  decrypt: vi.fn().mockReturnValue('decrypted_token')
}));

describe('MCPService', () => {
  let mcpService: MCPService;

  beforeEach(() => {
    vi.clearAllMocks();
    mcpService = new MCPService();
    
    // Reset mock defaults
    mockClientInstance.connect.mockResolvedValue(undefined);
    mockClientInstance.callTool.mockResolvedValue({
      content: [{ type: 'text', text: 'Success' }],
      structuredContent: { result: 'Success' }
    });
    mockClientInstance.close.mockResolvedValue(undefined);
  });

  it('should execute a tool and return results', async () => {
    const result = await mcpService.executeTool('org-123', 'gmail.list_messages', { q: 'from:me' });
    
    expect(result).toBeDefined();
    expect(result.structuredContent).toBeDefined();
    expect(result.structuredContent.result).toBe('Success');
    expect(mockClientInstance.connect).toHaveBeenCalled();
    expect(mockClientInstance.callTool).toHaveBeenCalledWith({
      name: 'gmail.list_messages',
      arguments: { q: 'from:me' }
    });
    // With caching, close is NOT called immediately
    expect(mockClientInstance.close).not.toHaveBeenCalled();
  });

  it('should reuse the client for subsequent calls', async () => {
    // First call
    await mcpService.executeTool('org-123', 'tool1', {});
    // Second call
    await mcpService.executeTool('org-123', 'tool2', {});

    // Should only connect once
    expect(mockClientInstance.connect).toHaveBeenCalledTimes(1);
    // Should call tool twice
    expect(mockClientInstance.callTool).toHaveBeenCalledTimes(2);
  });

  it('should handle tool execution errors and invalidate cache', async () => {
    // Setup error for the tool call
    mockClientInstance.callTool.mockRejectedValueOnce(new Error('Tool failed'));
    
    await expect(mcpService.executeTool('org-123', 'invalid.tool', {}))
      .rejects.toThrow('Tool failed');
    
    // Verify it's removed from cache by making another call which should trigger a new connect
    mockClientInstance.callTool.mockResolvedValueOnce({ content: [] }); // Reset to success
    
    await mcpService.executeTool('org-123', 'retry.tool', {});
    
    // Should have connected again (1 from first failed attempt, 1 from retry)
    expect(mockClientInstance.connect).toHaveBeenCalledTimes(2);
  });
});
