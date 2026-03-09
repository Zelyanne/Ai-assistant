import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from './supabase.js'

// Mock config
vi.mock('../config/index.js', () => ({
  config: {
    ENCRYPTION_SECRET: 'a'.repeat(32),
    GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
  }
}));

vi.mock('../guards/PerimeterGuard.js', () => ({
  PerimeterGuard: vi.fn().mockImplementation(function () {
    return {
      redactPII: (text: string) => text,
    }
  }),
}))

const workspaceIntegrationsQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
}
workspaceIntegrationsQuery.select.mockReturnValue(workspaceIntegrationsQuery)
workspaceIntegrationsQuery.eq.mockReturnValue(workspaceIntegrationsQuery)
workspaceIntegrationsQuery.single.mockResolvedValue({
  data: {
    user_id: 'user-1',
    encrypted_creds: {
      access_token: 'iv:tag:encrypted_access',
      refresh_token: 'iv:tag:encrypted_refresh',
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  },
  error: null,
})

const agentActivityLogQuery = {
  insert: vi.fn().mockResolvedValue({ error: null }),
}

vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'workspace_integrations') return workspaceIntegrationsQuery
      if (table === 'agent_activity_log') return agentActivityLogQuery
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }),
  },
}))

// Mock shared utilities
vi.mock('@ai-assistant/shared/utils/encryption.js', () => ({
  decrypt: vi.fn().mockReturnValue('decrypted_token')
}));

// Mock token service
vi.mock('./tokenService.js', () => ({
  storeWorkspaceTokens: vi.fn().mockResolvedValue(undefined)
}));

let lastTransport: any
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(function (url: URL, options: any) {
    lastTransport = { url, options, onerror: null }
    return lastTransport
  }),
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(function () {
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockResolvedValue({ content: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    }
  }),
}))

describe('MCPService Connection Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastTransport = undefined
  });

  it('should capture and log transport errors before connect()', async () => {
    const { MCPService } = await import('./mcp.js')
    const mcpService = new MCPService()
    const orgId = 'org-error-test';
    
    // We want to trigger getClient which creates the transport and binds onerror
    // We'll mock executeTool's internals by letting it call getClient
    
    try {
      await mcpService.executeTool(orgId, 'any-tool', {});
    } catch {
      // Expect connection failure if we don't mock connect()
    }

    expect(lastTransport).toBeDefined()
    expect(lastTransport.onerror).toBeTypeOf('function')

    // Simulate an error event
    const mockError = {
      message: 'SSE 400 Bad Request',
      code: 400,
      event: { data: 'Invalid Scope' }
    };
    
    await lastTransport.onerror(mockError)

    // Verify logging to Supabase agent_activity_log
    expect(supabase.from).toHaveBeenCalledWith('agent_activity_log');
    expect(agentActivityLogQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: orgId,
      agent_id: 'mcp-client',
      action_taken: 'mcp_transport_error',
      reasoning_trace: expect.objectContaining({
        message: 'SSE 400 Bad Request',
        eventMessage: 'Invalid Scope'
      })
    }));
  });
});
