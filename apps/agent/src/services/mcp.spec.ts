import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRefreshAccessToken, mockStoreWorkspaceTokens, mockLoadMcpTools } = vi.hoisted(() => ({
  mockRefreshAccessToken: vi.fn(),
  mockStoreWorkspaceTokens: vi.fn(),
  mockLoadMcpTools: vi.fn(),
}));

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockCallTool = vi.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'Success' }],
  structuredContent: { result: 'Success' },
});
const mockListTools = vi.fn().mockResolvedValue({
  tools: [
    { name: 'draft_gmail_message' },
    { name: 'manage_event' },
    { name: 'query_freebusy' },
  ],
  nextCursor: undefined,
});
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(function () {
    return {
      connect: mockConnect,
      callTool: mockCallTool,
      listTools: mockListTools,
      close: mockClose,
    };
  }),
}));

let lastTransport: unknown;
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(function (url: URL, options: unknown) {
    lastTransport = { url, options, onerror: null };
    return lastTransport;
  }),
}));

const workspaceIntegrationsQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
};
workspaceIntegrationsQuery.select.mockReturnValue(workspaceIntegrationsQuery);
workspaceIntegrationsQuery.eq.mockReturnValue(workspaceIntegrationsQuery);
workspaceIntegrationsQuery.maybeSingle.mockResolvedValue({
  data: {
    user_id: 'user-1',
    encrypted_creds: {
      access_token: 'iv:tag:encrypted_access',
      refresh_token: 'iv:tag:encrypted_refresh',
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      scopes: [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/calendar',
      ],
    },
    sync_status: 'idle',
  },
  error: null,
});
workspaceIntegrationsQuery.single.mockResolvedValue({ data: null, error: null });

const agentActivityLogQuery = {
  insert: vi.fn().mockResolvedValue({ error: null }),
};

vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'workspace_integrations') return workspaceIntegrationsQuery;
      if (table === 'agent_activity_log') return agentActivityLogQuery;
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    }),
  },
}));

vi.mock('@ai-assistant/shared/utils/encryption.js', () => ({
  decrypt: vi.fn().mockReturnValue('decrypted_token'),
}));

vi.mock('./tokenService.js', () => ({
  storeWorkspaceTokens: mockStoreWorkspaceTokens,
}));

vi.mock('./googleAuth.js', () => ({
  googleAuthService: { refreshAccessToken: mockRefreshAccessToken },
}));

vi.mock('@langchain/mcp-adapters', () => ({
  loadMcpTools: mockLoadMcpTools,
}));

vi.mock('../config/index.js', () => ({
  config: {
    ENCRYPTION_SECRET: 'a'.repeat(32),
    GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
  },
}));

describe('MCPService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastTransport = undefined;
    mockRefreshAccessToken.mockResolvedValue({
      access_token: 'fresh_access_token',
      expiry_date: Date.now() + 60 * 60 * 1000,
      scope: [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/calendar',
      ].join(' '),
    });
    mockStoreWorkspaceTokens.mockResolvedValue({ success: true });
    mockLoadMcpTools.mockResolvedValue([]);
    workspaceIntegrationsQuery.select.mockReturnValue(workspaceIntegrationsQuery);
    workspaceIntegrationsQuery.eq.mockReturnValue(workspaceIntegrationsQuery);
    workspaceIntegrationsQuery.maybeSingle.mockResolvedValue({
      data: {
        user_id: 'user-1',
        encrypted_creds: {
          access_token: 'iv:tag:encrypted_access',
          refresh_token: 'iv:tag:encrypted_refresh',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          scopes: [
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/calendar',
          ],
        },
        sync_status: 'idle',
      },
      error: null,
    });
  });

  it('executes a tool and returns results', async () => {
    const { MCPService } = await import('./mcp.js');
    const service = new MCPService();

    const result = await service.executeTool('org-123', 'gmail.list_messages', { q: 'from:me' });

    expect(result.structuredContent?.result).toBe('Success');
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'gmail.list_messages',
      arguments: { q: 'from:me' },
    });
    expect(lastTransport).toBeDefined();
  });

  it('normalizes legacy aliases and enforces worker policy', async () => {
    const { MCPService } = await import('./mcp.js');
    const service = new MCPService();

    const resolution = await service.resolveToolName('org-123', 'create_gmail_draft');
    expect(resolution.resolvedTool).toBe('draft_gmail_message');

    await service.executeWorkerTool('org-123', 'gmail', 'create_gmail_draft', {
      to: 'alexis@example.com',
      subject: 'Hello',
      body: 'Body',
    });

    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'draft_gmail_message',
      arguments: expect.objectContaining({
        to: 'alexis@example.com',
        subject: 'Hello',
      }),
    });
  });

  it('reports capability readiness failures for missing scopes or tools', async () => {
    workspaceIntegrationsQuery.maybeSingle.mockResolvedValueOnce({
      data: {
        user_id: 'user-1',
        encrypted_creds: {
          access_token: 'iv:tag:encrypted_access',
          refresh_token: 'iv:tag:encrypted_refresh',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          scopes: ['https://www.googleapis.com/auth/gmail.modify'],
        },
        sync_status: 'idle',
      },
      error: null,
    });
    mockListTools.mockResolvedValueOnce({ tools: [{ name: 'draft_gmail_message' }], nextCursor: undefined });

    const { MCPService } = await import('./mcp.js');
    const service = new MCPService();

    const readiness = await service.checkCapabilityReadiness('org-123', 'calendar', [
      'manage_event',
      'query_freebusy',
    ]);

    expect(readiness.ready).toBe(false);
    expect(readiness.missing_scopes).toContain('https://www.googleapis.com/auth/calendar');
    expect(readiness.unavailable_tools).toContain('manage_event');
  });

  it('returns a structured blocked result for inactive integrations', async () => {
    workspaceIntegrationsQuery.maybeSingle.mockResolvedValueOnce({
      data: {
        user_id: 'user-1',
        encrypted_creds: {
          access_token: 'iv:tag:encrypted_access',
          refresh_token: 'iv:tag:encrypted_refresh',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          scopes: ['https://www.googleapis.com/auth/calendar'],
        },
        sync_status: 'error',
      },
      error: null,
    });

    const { MCPService } = await import('./mcp.js');
    const service = new MCPService();

    const readiness = await service.checkCapabilityReadiness('org-123', 'calendar', [
      'manage_event',
    ]);

    expect(readiness.ready).toBe(false);
    expect(readiness.integration_active).toBe(false);
    expect(readiness.errors).toContain('Google Workspace integration is not active (sync_status=error).');
    expect(mockListTools).not.toHaveBeenCalled();
  });

  it('retries tool execution once after invalid_token auth failures', async () => {
    mockCallTool
      .mockRejectedValueOnce(new Error('invalid_token 401'))
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Success' }],
        structuredContent: { result: 'Recovered' },
      });

    const { MCPService } = await import('./mcp.js');
    const service = new MCPService();

    const result = await service.executeTool('org-123', 'draft_gmail_message', { subject: 'Retry me' });

    expect(result.structuredContent?.result).toBe('Recovered');
    expect(mockCallTool).toHaveBeenCalledTimes(2);
    expect(mockConnect).toHaveBeenCalledTimes(2);
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockStoreWorkspaceTokens).toHaveBeenCalledWith(
      'org-123',
      'user-1',
      'google',
      expect.objectContaining({
        access_token: 'fresh_access_token',
      }),
    );
  });

  it('retries LangChain tool loading once after invalid_token auth failures', async () => {
    mockLoadMcpTools
      .mockRejectedValueOnce(new Error('invalid_token 401'))
      .mockResolvedValueOnce([{ name: 'draft_gmail_message' }]);

    const { MCPService } = await import('./mcp.js');
    const service = new MCPService();

    const tools = await service.getLangChainTools('org-123');

    expect(tools).toEqual([{ name: 'draft_gmail_message' }]);
    expect(mockLoadMcpTools).toHaveBeenCalledTimes(2);
    expect(mockConnect).toHaveBeenCalledTimes(2);
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
  });
});
