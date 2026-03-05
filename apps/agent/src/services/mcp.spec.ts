import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockConnect = vi.fn().mockResolvedValue(undefined)
const mockCallTool = vi.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'Success' }],
  structuredContent: { result: 'Success' },
})
const mockClose = vi.fn().mockResolvedValue(undefined)

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(function () {
    return {
      connect: mockConnect,
      callTool: mockCallTool,
      close: mockClose,
    }
  }),
}))

let lastTransport: any
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(function (url: URL, options: any) {
    lastTransport = { url, options, onerror: null }
    return lastTransport
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

vi.mock('@ai-assistant/shared/utils/encryption.js', () => ({
  decrypt: vi.fn().mockReturnValue('decrypted_token'),
}))

vi.mock('./tokenService.js', () => ({
  storeWorkspaceTokens: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('./googleAuth.js', () => ({
  googleAuthService: { refreshAccessToken: vi.fn() },
}))

vi.mock('@langchain/mcp-adapters', () => ({
  loadMcpTools: vi.fn().mockResolvedValue([]),
}))

vi.mock('../config/index.js', () => ({
  config: {
    ENCRYPTION_SECRET: 'a'.repeat(32),
    GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
  },
}))

describe('MCPService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastTransport = undefined
  })

  it('executes a tool and returns results', async () => {
    const { MCPService } = await import('./mcp.js')
    const service = new MCPService()

    const result = await service.executeTool('org-123', 'gmail.list_messages', { q: 'from:me' })

    expect(result.structuredContent?.result).toBe('Success')
    expect(mockConnect).toHaveBeenCalledTimes(1)
    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'gmail.list_messages',
      arguments: { q: 'from:me' },
    })
    expect(mockClose).not.toHaveBeenCalled()
    expect(lastTransport).toBeDefined()
  })

  it('reuses the cached client for subsequent calls', async () => {
    const { MCPService } = await import('./mcp.js')
    const service = new MCPService()

    await service.executeTool('org-123', 'tool1', {})
    await service.executeTool('org-123', 'tool2', {})

    expect(mockConnect).toHaveBeenCalledTimes(1)
    expect(mockCallTool).toHaveBeenCalledTimes(2)
  })

  it('invalidates cache on tool error and reconnects', async () => {
    const { MCPService } = await import('./mcp.js')
    const service = new MCPService()

    mockCallTool.mockRejectedValueOnce(new Error('Tool failed'))
    await expect(service.executeTool('org-123', 'invalid.tool', {})).rejects.toThrow('Tool failed')

    mockCallTool.mockResolvedValueOnce({ content: [] })
    await service.executeTool('org-123', 'retry.tool', {})

    expect(mockConnect).toHaveBeenCalledTimes(2)
  })
})
