import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { supabase } from './supabase.js';
import { decrypt } from '@ai-assistant/shared/utils/encryption.js';
import { PerimeterGuard } from '../guards/PerimeterGuard.js';
import { config } from '../config/index.js';
import { spawn, ChildProcess } from 'child_process';
import net from 'net';
import { loadMcpTools } from '@langchain/mcp-adapters';
import { StructuredTool } from '@langchain/core/tools';
import { googleAuthService } from './googleAuth.js';
import { storeWorkspaceTokens } from './tokenService.js';

const ENCRYPTION_SECRET = config.ENCRYPTION_SECRET;
const MCP_SERVER_PORT = 8000;
const MCP_SERVER_URL = `http://127.0.0.1:${MCP_SERVER_PORT}/mcp/`;
const TOOL_CACHE_TTL = 3600000; // 1 hour

interface CachedClient {
  client: Client;
  lastUsed: number;
}

interface CachedTools {
  tools: StructuredTool[];
  lastFetched: number;
}

export class MCPService {
  private guard: PerimeterGuard;
  private clientCache: Map<string, CachedClient>;
  private toolCache: Map<string, CachedTools>;
  private serverProcess: ChildProcess | null = null;
  private serverReady: Promise<void>;

  constructor() {
    this.guard = new PerimeterGuard();
    this.clientCache = new Map();
    this.toolCache = new Map();
    
    // Only start server if not in test environment OR if explicitly requested via env var
    // This allows tests to opt-in to testing the startup logic
    if (process.env.NODE_ENV !== 'test' || process.env.TEST_MCP_STARTUP === 'true') {
      this.serverReady = this.startSharedServer();
    } else {
      this.serverReady = Promise.resolve();
    }
  }

  /**
   * Starts a single shared MCP server process in multi-user HTTP mode.
   * This uses the repo's native multi-user support (EXTERNAL_OAUTH21_PROVIDER).
   */
  private async startSharedServer(): Promise<void> {
    console.log('Starting shared multi-tenant MCP server (Native Mode)...');
    
    this.serverProcess = spawn('uvx', [
      'workspace-mcp',
      '--transport', 'streamable-http'
    ], {
      env: {
        ...process.env,
        PORT: MCP_SERVER_PORT.toString(),
        WORKSPACE_MCP_PORT: MCP_SERVER_PORT.toString(),
        GOOGLE_OAUTH_CLIENT_ID: config.GOOGLE_OAUTH_CLIENT_ID,
        GOOGLE_OAUTH_CLIENT_SECRET: config.GOOGLE_OAUTH_CLIENT_SECRET,
        MCP_ENABLE_OAUTH21: 'true',
        WORKSPACE_MCP_STATELESS_MODE: 'false',
        EXTERNAL_OAUTH21_PROVIDER: 'true',
        OAUTHLIB_INSECURE_TRANSPORT: '1',
      }
    });

        const startupRegex = /(Ready for MCP connections|Starting HTTP server|Application startup complete|Uvicorn running on|🚀 Starting HTTP server)/i;

        return new Promise((resolve, reject) => {
          let resolved = false;

          let portCheckInterval: NodeJS.Timeout | null = null;

          const cleanup = () => {
            clearTimeout(timeoutId);
            if (portCheckInterval) clearInterval(portCheckInterval);
            this.serverProcess?.stdout?.removeAllListeners('data');
            this.serverProcess?.stderr?.removeAllListeners('data');
            this.serverProcess?.removeAllListeners('error');
            this.serverProcess?.removeAllListeners('exit');
          };

          const checkReady = (output: string) => {
            if (startupRegex.test(output)) {
              console.log('Native Multi-Tenant MCP server is ready.');
              if (!resolved) {
                resolved = true;
                cleanup();
                resolve();
              }
            }
          };

          const checkPort = () => {
            const socket = new net.Socket();
            socket.setTimeout(200);
            socket.on('connect', () => {
              socket.destroy();
              if (!resolved) {
                console.log('Native Multi-Tenant MCP server port is ready (detected via poll).');
                resolved = true;
                cleanup();
                resolve();
              }
            });
            socket.on('timeout', () => {
              socket.destroy();
            });
            socket.on('error', (err) => {
              socket.destroy();
            });
            socket.connect(MCP_SERVER_PORT, '127.0.0.1');
          };

          portCheckInterval = setInterval(checkPort, 500);

          const timeoutId = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              if (this.serverProcess) {
                console.log('Killing MCP server process due to timeout...');
                this.serverProcess.kill();
              }
              cleanup();
              reject(new Error('MCP server start timeout after 60 seconds'));
            }
          }, 60000);

          this.serverProcess?.stdout?.on('data', (data) => {
            const output = data.toString();
            process.stdout.write(`[MCP Stdout] ${output}`);
            checkReady(output);
          });

          this.serverProcess?.stderr?.on('data', (data) => {
            const output = data.toString();
            process.stdout.write(`[MCP Stderr] ${output}`);
            checkReady(output);
            
            if (output.toLowerCase().includes('error')) {
              console.error(`[MCP Server Error] ${output}`);
            }
            if (output.includes('Command not found') || output.includes('is not recognized')) {
              if (!resolved) {
                resolved = true;
                cleanup();
                reject(new Error(`MCP server failed to start: ${output.trim()}`));
              }
            }
          });



      this.serverProcess?.on('error', (err) => {
        console.error('Failed to start MCP server:', err);
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(err);
        }
      });

      this.serverProcess?.on('exit', (code, signal) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          const reason = signal ? `killed with signal ${signal}` : `exited with code ${code}`;
          console.error(`MCP server process ${reason} during startup.`);
          reject(new Error(`MCP server ${reason} before becoming ready.`));
        }
      });
    });
  }

  private async getClient(orgId: string): Promise<Client> {
    await this.serverReady;
    const now = Date.now();
    
    // Check cache
    const cached = this.clientCache.get(orgId);
    if (cached) {
      cached.lastUsed = now;
      return cached.client;
    }

    // 1. Get tokens for the organization
    const { data: integration, error } = await supabase
      .from('workspace_integrations')
      .select('encrypted_creds, user_id')
      .eq('organization_id', orgId)
      .eq('provider', 'google')
      .single();

    if (error || !integration) {
      throw new Error(`Integration not found for organization ${orgId}`);
    }

    if (!integration.user_id) {
        throw new Error(`Integration user_id is missing for organization ${orgId}`);
    }

    let creds = integration.encrypted_creds as any;
    console.log(`[MCP] Checking tokens for ${orgId}. Expiry: ${creds.expires_at}`);
    let accessToken = decrypt(creds.access_token, ENCRYPTION_SECRET);
    const expiresAt = creds.expires_at ? new Date(creds.expires_at).getTime() : 0;

    // Check if token is expired or about to expire (within 5 mins) OR if expiry is missing
    const isExpired = !expiresAt || (expiresAt - now < 300000);
    
    if (isExpired) {
      console.log(`[MCP] Access token for ${orgId} is ${!expiresAt ? 'missing expiry' : 'expired'}, attempting refresh...`);
      if (creds.refresh_token) {
        const refreshToken = decrypt(creds.refresh_token, ENCRYPTION_SECRET);
        try {
          const newTokens = await googleAuthService.refreshAccessToken(refreshToken);
          if (newTokens.access_token) {
            accessToken = newTokens.access_token;
            
            // Update DB
            await storeWorkspaceTokens(orgId, integration.user_id!, 'google', {
              access_token: accessToken,
              refresh_token: refreshToken, // Keep the same refresh token
              expires_at: newTokens.expiry_date ? new Date(newTokens.expiry_date).toISOString() : undefined
            });
            console.log(`Successfully refreshed access token for ${orgId}`);
          }
        } catch (refreshErr) {
          console.error(`Failed to refresh token for ${orgId}:`, refreshErr);
          // If it was strictly expired, we might want to throw here, 
          // but for now we'll let the 401 happen naturally to trigger retry logic elsewhere
        }
      } else {
        console.warn(`No refresh token found for ${orgId}, cannot refresh.`);
      }
    }

    // 2. Setup MCP Client with Bearer Token in Streamable HTTP transport
    // This is the native client for the server's 'streamable-http' transport.
    // It correctly handles session ID handshakes and header propagation.
    const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL), {
      requestInit: {
        headers: new Headers({
          'Authorization': `Bearer ${accessToken}`
        })
      }
    });


    const client = new Client(
      { name: 'agent-controller', version: '1.0.0' },
      { capabilities: {} }
    );

    // Bind error handler BEFORE connect
    transport.onerror = async (err: any) => {
      // Redact PII from error details before logging
      const sanitizer = new PerimeterGuard();
      
      const errorDetails = {
        message: err.message,
        code: err.code,
        stack: sanitizer.redactPII(err.stack || ''),
        timestamp: new Date().toISOString(),
        // Surgical extraction and redaction of event data to avoid log bloat and PII leak
        eventMessage: sanitizer.redactPII(String(err.event?.message || err.event?.data || (err as any).data || '')),
        eventType: err.event?.type
      };
      console.error('[MCP Transport Error]', JSON.stringify(errorDetails, null, 2));
      
      try {
        await supabase.from('agent_activity_log').insert({
          organization_id: orgId,
          agent_id: 'mcp-client',
          action_taken: 'mcp_transport_error',
          reasoning_trace: errorDetails
        });
      } catch (logErr) {
        console.error('Failed to log MCP transport error to DB:', logErr);
      }
    };

    try {
      await client.connect(transport);
    } catch (err: any) {
      console.error(`[MCP] Failed to connect to server for org ${orgId}:`, err.message);
      // The transport.onerror will likely have caught more detail, but we throw here to fail the request
      throw err;
    }

    this.clientCache.set(orgId, {
      client,
      lastUsed: now
    });

    return client;
  }

  async getLangChainTools(orgId: string): Promise<StructuredTool[]> {
    const now = Date.now();
    const cached = this.toolCache.get(orgId);

    if (cached && (now - cached.lastFetched < TOOL_CACHE_TTL)) {
      return cached.tools;
    }

    try {
      const client = await this.getClient(orgId);
      // We use 'workspace-mcp' as the server name for the adapter
      const tools = await loadMcpTools('workspace-mcp', client);
      
      this.toolCache.set(orgId, {
        tools,
        lastFetched: now
      });

      return tools;
    } catch (err: any) {
      console.error(`Failed to fetch LangChain tools for org ${orgId}:`, err);
      
      // Clear cache on 401/Auth errors
      const isAuthError = err.message?.includes('401') || err.message?.toLowerCase().includes('unauthorized');
      if (isAuthError) {
        console.log(`Clearing MCP client cache for ${orgId} due to auth error`);
        this.clientCache.delete(orgId);
        this.toolCache.delete(orgId);
      }
      
      return [];
    }
  }

  async executeTool(orgId: string, toolName: string, args: any): Promise<any> {
    let client: Client;
    
    try {
      client = await this.getClient(orgId);
    } catch (err: any) {
      console.error(`Failed to get MCP client for ${orgId}:`, err);
       const errorLogData: any = {
        organization_id: orgId,
        agent_id: 'agent-controller',
        action_taken: `mcp_client_init_error: ${toolName}`,
        reasoning_trace: {
          tool: toolName,
          arguments: args,
          error: err.message || 'Unknown error',
        },
      };
      await supabase.from('agent_activity_log').insert(errorLogData);
      throw err;
    }

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });

      const redactedResult = this.redactResult(result);

      const logData: any = {
        organization_id: orgId,
        agent_id: 'agent-controller',
        action_taken: `mcp_tool_call: ${toolName}`,
        reasoning_trace: {
          tool: toolName,
          arguments: args,
          result: redactedResult,
        },
      };
      
      await supabase.from('agent_activity_log').insert(logData);

      return redactedResult;
    } catch (err: any) {
      console.error(`MCP tool execution failed: ${toolName}`, err);
      
      const isAuthError = err.message?.toLowerCase().includes('401') || 
                          err.message?.toLowerCase().includes('unauthorized') ||
                          err.message?.toLowerCase().includes('authenticated');

      if (isAuthError) {
        console.log(`Auth error detected for ${orgId}, clearing cache for retry...`);
        this.clientCache.delete(orgId);
      } else {
        // Also clear cache for other errors as the SSE connection might be unstable
        this.clientCache.delete(orgId);
      }
      
      const errorLogData: any = {
        organization_id: orgId,
        agent_id: 'agent-controller',
        action_taken: `mcp_tool_error: ${toolName}`,
        reasoning_trace: {
          tool: toolName,
          arguments: args,
          error: err.message || 'Unknown error',
        },
      };
      await supabase.from('agent_activity_log').insert(errorLogData);
      throw err;
    }
  }

  async cleanup(maxAgeMs: number = 3600000) {
    const now = Date.now();
    for (const [orgId, cached] of this.clientCache.entries()) {
      if (now - cached.lastUsed > maxAgeMs) {
        try {
          await cached.client.close();
        } catch (e) {
          console.error(`Error closing MCP client for ${orgId}`, e);
        }
        this.clientCache.delete(orgId);
      }
    }
  }

  // Gracefully shutdown the shared server
  async shutdown() {
    await this.cleanup(0);
    if (this.serverProcess) {
      this.serverProcess.kill();
      console.log('Shared MCP server shutdown.');
    }
  }

  private redactResult(result: any): any {
    const redactedResult: any = JSON.parse(JSON.stringify(result));
    
    if (redactedResult.content && Array.isArray(redactedResult.content)) {
      redactedResult.content = redactedResult.content.map((item: any) => {
        if (item.type === 'text' && typeof item.text === 'string') {
          return { ...item, text: this.guard.redactPII(item.text) };
        }
        return item;
      });
    }

    if (redactedResult.toolResult && typeof redactedResult.toolResult === 'object') {
      redactedResult.toolResult = this.redactObject(redactedResult.toolResult);
    }

    if (redactedResult.structuredContent) {
      redactedResult.structuredContent = this.redactObject(redactedResult.structuredContent);
    }

    return redactedResult;
  }

  private redactObject(obj: any): any {
    if (typeof obj === 'string') {
      return this.guard.redactPII(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.redactObject(item));
    }
    if (typeof obj === 'object' && obj !== null) {
      const redacted: any = {};
      for (const key in obj) {
        redacted[key] = this.redactObject(obj[key]);
      }
      return redacted;
    }
    return obj;
  }
}

export const mcpService = new MCPService();
