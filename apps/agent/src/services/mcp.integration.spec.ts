import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock PerimeterGuard
vi.mock('../guards/PerimeterGuard.js', () => ({
  PerimeterGuard: vi.fn().mockImplementation(function() {
    return {
      redactPII: vi.fn().mockImplementation((text) => text)
    };
  })
}));

// Mock Supabase
vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        user_id: 'user-1',
        encrypted_creds: {
          access_token: 'mock:iv:token',
          refresh_token: 'mock:iv:refresh'
          ,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        }
      },
      error: null
    }),
    insert: vi.fn().mockResolvedValue({ error: null })
  }
}));

// Mock Shared Utils
vi.mock('@ai-assistant/shared/utils/encryption.js', () => ({
  decrypt: vi.fn().mockReturnValue('valid-access-token'),
}))

// Mock MCP SDK Client and Transport
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockCallTool = vi.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'Tool Result' }]
});
const mockClose = vi.fn().mockResolvedValue(undefined);

// Use a regular function for the mock implementation to satisfy the "constructor" requirement
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(function () {
    return {
      connect: mockConnect,
      callTool: mockCallTool,
      close: mockClose,
    }
  }),
}))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(function (url: URL, options: any) {
    return { url, options, onerror: null }
  }),
}))

vi.mock('../config/index.js', () => ({
  config: {
    ENCRYPTION_SECRET: 'a'.repeat(32),
    GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
  }
}));

describe('MCPService Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should perform a full tool execution flow', async () => {
    const { MCPService } = await import('./mcp.js')
    const service = new MCPService()
    const result = await service.executeTool('org-1', 'test_tool', { arg: 'val' })

    expect(mockConnect).toHaveBeenCalled();
    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'test_tool',
      arguments: { arg: 'val' }
    });
    // With caching enabled, close is NOT called automatically anymore
    expect(mockClose).not.toHaveBeenCalled();
    
    expect(result).toBeDefined();
    expect(result.content[0].text).toBe('Tool Result');
  });

  it('should reuse client in integration flow', async () => {
    const { MCPService } = await import('./mcp.js')
    const service = new MCPService()
    await service.executeTool('org-1', 'tool_1', {})
    await service.executeTool('org-1', 'tool_2', {})

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockCallTool).toHaveBeenCalledTimes(2);
  });
});
