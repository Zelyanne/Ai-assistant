import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPService } from './mcp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { supabase } from './supabase.js';

// Mock config
vi.mock('../config/index.js', () => ({
  config: {
    ENCRYPTION_SECRET: 'a'.repeat(32),
    GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
  }
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
          access_token: 'iv:tag:encrypted_access',
          refresh_token: 'iv:tag:encrypted_refresh'
        }
      },
      error: null
    }),
    insert: vi.fn().mockResolvedValue({ error: null })
  }
}));

// Mock shared utilities
vi.mock('@ai-assistant/shared/utils/encryption.js', () => ({
  decrypt: vi.fn().mockReturnValue('decrypted_token')
}));

// Mock token service
vi.mock('./tokenService.js', () => ({
  storeWorkspaceTokens: vi.fn().mockResolvedValue(undefined)
}));

// Mock transport
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => {
  return {
    SSEClientTransport: vi.fn().mockImplementation(function() {
      return {
        onerror: null,
        onclose: null,
        start: vi.fn()
      };
    })
  };
});

describe('MCPService Connection Error Handling', () => {
  let mcpService: MCPService;

  beforeEach(() => {
    vi.clearAllMocks();
    mcpService = new MCPService();
  });

  it('should capture and log transport errors before connect()', async () => {
    const orgId = 'org-error-test';
    
    // We want to trigger getClient which creates the transport and binds onerror
    // We'll mock executeTool's internals by letting it call getClient
    
    try {
      await mcpService.executeTool(orgId, 'any-tool', {});
    } catch (e) {
      // Expect connection failure if we don't mock connect()
    }

    // Find the transport instance created
    const transportInstance = vi.mocked(SSEClientTransport).mock.results[0].value;
    expect(transportInstance.onerror).toBeDefined();

    // Simulate an error event
    const mockError = {
      message: 'SSE 400 Bad Request',
      code: 400,
      event: { data: 'Invalid Scope' }
    };
    
    await transportInstance.onerror(mockError);

    // Verify logging to Supabase agent_activity_log
    expect(supabase.from).toHaveBeenCalledWith('agent_activity_log');
    expect(supabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: orgId,
      agent_id: 'mcp-client',
      action_taken: 'mcp_transport_error',
      reasoning_trace: expect.objectContaining({
        message: 'SSE 400 Bad Request',
        eventData: 'Invalid Scope'
      })
    }));
  });
});
