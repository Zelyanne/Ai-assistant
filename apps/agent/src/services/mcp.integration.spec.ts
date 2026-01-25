import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPService } from './mcp.js';

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
        encrypted_creds: {
          access_token: 'mock:iv:token',
          refresh_token: 'mock:iv:refresh'
        }
      },
      error: null
    }),
    insert: vi.fn().mockResolvedValue({ error: null })
  }
}));

// Mock Shared Utils
vi.mock('@ai-assistant/shared', () => ({
  decrypt: vi.fn().mockReturnValue('valid-access-token')
}));

// Mock MCP SDK Client and Transport
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockCallTool = vi.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'Tool Result' }]
});
const mockClose = vi.fn().mockResolvedValue(undefined);

// Use a regular function for the mock implementation to satisfy the "constructor" requirement
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(function() {
    return {
      connect: mockConnect,
      callTool: mockCallTool,
      close: mockClose
    };
  })
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(function(config) {
    return {
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      _config: config
    };
  })
}));

describe('MCPService Integration Flow', () => {
  let service: MCPService;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENCRYPTION_SECRET = 'secret';
    service = new MCPService();
  });

  it('should perform a full tool execution flow', async () => {
    const result = await service.executeTool('org-1', 'test_tool', { arg: 'val' });

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
    await service.executeTool('org-1', 'tool_1', {});
    await service.executeTool('org-1', 'tool_2', {});

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockCallTool).toHaveBeenCalledTimes(2);
  });
});
