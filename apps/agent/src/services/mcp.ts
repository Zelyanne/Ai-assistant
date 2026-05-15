import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Effect } from 'effect';
import { supabase } from './supabase.js';
import { decrypt } from '@ai-assistant/shared/utils/encryption.js';
import { type CapabilityReadinessResult } from '@ai-assistant/shared';
import { PerimeterGuard } from '../guards/PerimeterGuard.js';
import { config } from '../config/index.js';
import { spawn, ChildProcess } from 'child_process';
import net from 'net';
import { loadMcpTools } from '@langchain/mcp-adapters';
import { StructuredTool } from '@langchain/core/tools';
import { googleAuthService } from './googleAuth.js';
import { storeWorkspaceTokensEffect } from './tokenService.js';
import { AuditLogger } from './AuditLogger.js';
import {
  workerToolPolicyService,
  type CapabilityWorkerType,
} from './WorkerToolPolicyService.js';

const ENCRYPTION_SECRET = config.ENCRYPTION_SECRET;
const MCP_SERVER_PORT = 8000;
const MCP_SERVER_URL = `http://127.0.0.1:${MCP_SERVER_PORT}/mcp/`;
const TOOL_CACHE_TTL = 3600000; // 1 hour

interface CachedClient {
  client: Client;
  lastUsed: number;
  expiresAt: number | null;
}

interface CachedTools {
  tools: StructuredTool[];
  lastFetched: number;
}

interface CachedToolNames {
  names: string[];
  lastFetched: number;
}

interface ResolveToolResult {
  requestedTool: string;
  resolvedTool: string | null;
  availableTools: string[];
}

type IntegrationRow = {
  encrypted_creds: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: string;
    scopes?: string[] | string;
    [key: string]: unknown;
  };
  user_id: string | null;
  sync_status?: string | null;
} | null;

const TOOL_KEYWORD_MAP: Record<string, string[][]> = {
  draft_gmail_message: [['draft', 'gmail']],
  send_gmail_message: [['send', 'gmail']],
  manage_event: [['manage', 'event'], ['calendar', 'event']],
  query_freebusy: [['freebusy'], ['free', 'busy']],
  create_doc: [['create', 'doc'], ['create', 'document']],
  modify_doc_text: [['modify', 'doc'], ['doc', 'text']],
  get_doc_content: [['doc', 'content']],
  search_drive_files: [['search', 'drive']],
  get_drive_file_content: [['drive', 'content']],
  create_drive_file: [['create', 'drive', 'file']],
  import_to_google_doc: [['import', 'google', 'doc']],
  create_spreadsheet: [['create', 'spreadsheet']],
  read_sheet_values: [['read', 'sheet']],
  modify_sheet_values: [['modify', 'sheet']],
  create_presentation: [['create', 'presentation'], ['create', 'slide']],
  modify_presentation: [['modify', 'presentation'], ['slide', 'modify']],
};

export class MCPService {
  private guard: PerimeterGuard;
  private clientCache: Map<string, CachedClient>;
  private toolCache: Map<string, CachedTools>;
  private toolNameCache: Map<string, CachedToolNames>;
  private toolFetchErrors: Map<string, string>;
  private serverProcess: ChildProcess | null = null;
  private serverReady: Promise<void>;

  constructor() {
    this.guard = new PerimeterGuard();
    this.clientCache = new Map();
    this.toolCache = new Map();
    this.toolNameCache = new Map();
    this.toolFetchErrors = new Map();
    
    // Only start server if not in test environment OR if explicitly requested via env var
    // This allows tests to opt-in to testing the startup logic
    if (process.env.NODE_ENV !== 'test' || process.env.TEST_MCP_STARTUP === 'true') {
      this.serverReady = this.createServerReadyPromise();
    } else {
      this.serverReady = Promise.resolve();
    }
  }

  private createServerReadyPromise(): Promise<void> {
    return this.startSharedServer().catch((error) => {
      this.serverProcess = null;
      throw error;
    });
  }

  private async ensureServerReady(): Promise<void> {
    try {
      await this.serverReady;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[MCP] Shared server was not ready (${message}); retrying startup once...`);
      this.serverReady = this.createServerReadyPromise();
      await this.serverReady;
    }
  }

  getLastLangChainToolError(orgId: string): string | null {
    return this.toolFetchErrors.get(orgId) ?? null;
  }

  /**
   * Starts a single shared MCP server process in multi-user HTTP mode.
   * This uses the repo's native multi-user support (EXTERNAL_OAUTH21_PROVIDER).
   */
  private async startSharedServer(): Promise<void> {
    console.log('Starting shared multi-tenant MCP server (Native Mode)...');
    
    this.serverProcess = spawn('uvx', [
      'workspace-mcp',
      '--transport', 'streamable-http',
      '--tool-tier', 'extended',
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
            socket.on('error', (_err) => {
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

  private isAuthError(error: unknown): boolean {
    if (!error) {
      return false;
    }

    const candidate = error as {
      message?: unknown;
      code?: unknown;
      status?: unknown;
      event?: { message?: unknown; data?: unknown };
    };

    const code = typeof candidate.code === 'number'
      ? candidate.code
      : typeof candidate.status === 'number'
        ? candidate.status
        : null;

    if (code === 401 || code === 403) {
      return true;
    }

    const text = [
      candidate.message,
      candidate.event?.message,
      candidate.event?.data,
    ]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase();

    return text.includes('401')
      || text.includes('403')
      || text.includes('unauthorized')
      || text.includes('forbidden')
      || text.includes('invalid_token')
      || text.includes('authentication failed')
      || text.includes('bearer token is invalid')
      || text.includes('no longer recognized by the server')
      || text.includes('expired')
      || text.includes('authenticated');
  }

  private async resetOrgCache(orgId: string): Promise<void> {
    const cached = this.clientCache.get(orgId);
    if (cached) {
      try {
        await cached.client.close();
      } catch (error) {
        console.error(`Error closing cached MCP client for ${orgId}:`, error);
      }
    }

    this.clientCache.delete(orgId);
    this.toolCache.delete(orgId);
    this.toolNameCache.delete(orgId);
  }

  private getClientEffect(
    orgId: string,
    options: { forceReconnect?: boolean; forceRefresh?: boolean } = {},
  ): Effect.Effect<Client, unknown> {
    return Effect.gen(this, function* () {
      yield* Effect.tryPromise({
        try: () => this.ensureServerReady(),
        catch: (error) => error,
      });
      const now = Date.now();
    
      // Check cache
      const cached = this.clientCache.get(orgId);
      const cachedStillValid = cached
        && !options.forceReconnect
        && cached.expiresAt !== null
        && cached.expiresAt - now >= 300000;

      if (cachedStillValid) {
        cached.lastUsed = now;
        return cached.client;
      }

      if (cached) {
        yield* Effect.tryPromise({
          try: () => this.resetOrgCache(orgId),
          catch: (error) => error,
        });
      }

      // 1. Get tokens for the organization
      const integration = yield* this.getIntegrationEffect(orgId);
      const error = integration ? null : { message: `Integration not found for organization ${orgId}` };

      if (error || !integration) {
        return yield* Effect.fail(new Error(`Integration not found for organization ${orgId}`));
      }

      if (!this.isIntegrationActive(integration)) {
        return yield* Effect.fail(new Error(this.buildInactiveIntegrationMessage(integration)));
      }

      if (!integration.user_id) {
        return yield* Effect.fail(new Error(`Integration user_id is missing for organization ${orgId}`));
      }

      const creds = integration.encrypted_creds as any;
      yield* Effect.sync(() => console.log(`[MCP] Checking tokens for ${orgId}. Expiry: ${creds.expires_at}`));
      let accessToken = yield* Effect.try({
        try: () => decrypt(creds.access_token, ENCRYPTION_SECRET),
        catch: (error) => error,
      });
      let expiresAt = creds.expires_at ? new Date(creds.expires_at).getTime() : 0;

      // Check if token is expired or about to expire (within 5 mins) OR if expiry is missing
      const isExpired = options.forceRefresh || !expiresAt || (expiresAt - now < 300000);
    
      if (isExpired) {
        yield* Effect.sync(() => console.log(`[MCP] Access token for ${orgId} is ${!expiresAt ? 'missing expiry' : 'expired'}, attempting refresh...`));
        if (creds.refresh_token) {
          const refreshToken = yield* Effect.try({
            try: () => decrypt(creds.refresh_token, ENCRYPTION_SECRET),
            catch: (error) => error,
          });
          const refreshResult = yield* Effect.tryPromise({
            try: () => googleAuthService.refreshAccessToken(refreshToken),
            catch: (error) => error,
          }).pipe(Effect.either);

          if (refreshResult._tag === 'Right') {
            const newTokens = refreshResult.right;
            if (newTokens.access_token) {
              accessToken = newTokens.access_token;

              // Update DB
              yield* storeWorkspaceTokensEffect(orgId, integration.user_id, 'google', {
                access_token: accessToken,
                refresh_token: refreshToken, // Keep the same refresh token
                expires_at: newTokens.expiry_date ? new Date(newTokens.expiry_date).toISOString() : undefined,
                scopes: this.getScopesFromTokenPayload(newTokens).length > 0
                  ? this.getScopesFromTokenPayload(newTokens)
                  : this.getStoredScopes(integration),
              });
              expiresAt = typeof newTokens.expiry_date === 'number' ? newTokens.expiry_date : expiresAt;
              yield* Effect.sync(() => console.log(`Successfully refreshed access token for ${orgId}`));
            }
          } else {
            const refreshErr = refreshResult.left;
            yield* Effect.sync(() => console.error(`Failed to refresh token for ${orgId}:`, refreshErr));
            // If it was strictly expired, we might want to throw here,
            // but for now we'll let the 401 happen naturally to trigger retry logic elsewhere.
          }
        } else {
          yield* Effect.sync(() => console.warn(`No refresh token found for ${orgId}, cannot refresh.`));
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
          await AuditLogger.flush(
            orgId,
            null,
            'agent-controller',
            'mcp_transport_error',
            [AuditLogger.createStep('MCP Transport', `Error: ${err.message}`, {
              input_summary: `Code: ${err.code}`,
              output_summary: errorDetails.eventMessage
            })],
            []
          );
        } catch (logErr) {
          console.error('Failed to log MCP transport error to DB:', logErr);
        }

        if (this.isAuthError(err)) {
          await this.resetOrgCache(orgId);
        }
      };

      const connectResult = yield* Effect.tryPromise({
        try: () => client.connect(transport),
        catch: (error) => error,
      }).pipe(Effect.either);

      if (connectResult._tag === 'Left') {
        const err = connectResult.left as { message?: unknown };
        yield* Effect.sync(() => console.error(`[MCP] Failed to connect to server for org ${orgId}:`, err.message));
        // The transport.onerror will likely have caught more detail, but we throw here to fail the request
        return yield* Effect.fail(connectResult.left);
      }

      this.clientCache.set(orgId, {
        client,
        lastUsed: now,
        expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null,
      });

      return client;
    });
  }

  private async getClient(
    orgId: string,
    options: { forceReconnect?: boolean; forceRefresh?: boolean } = {},
  ): Promise<Client> {
    return Effect.runPromise(this.getClientEffect(orgId, options));
  }

  private getIntegrationEffect(orgId: string): Effect.Effect<IntegrationRow, unknown> {
    const query = supabase
      .from('workspace_integrations')
      .select('encrypted_creds, user_id, sync_status')
      .eq('organization_id', orgId)
      .eq('provider', 'google') as unknown as {
        maybeSingle?: () => Promise<{ data: unknown; error: { message: string } | null }>;
        single?: () => Promise<{ data: unknown; error: { message: string } | null }>;
      };

    return Effect.gen(function* () {
      const { data, error } = yield* Effect.tryPromise({
        try: async () => query.maybeSingle
          ? await query.maybeSingle()
          : query.single
            ? await query.single()
            : { data: null, error: { message: 'Supabase query does not support single-row fetch.' } },
        catch: (error) => error,
      });

      if (error) {
        return yield* Effect.fail(new Error(error.message));
      }

      return (data as IntegrationRow) ?? null;
    });
  }

  private async getIntegration(orgId: string): Promise<IntegrationRow> {
    return Effect.runPromise(this.getIntegrationEffect(orgId));
  }

  private isIntegrationActive(integration: IntegrationRow): boolean {
    if (!integration) {
      return false;
    }

    const syncStatus = typeof integration.sync_status === 'string'
      ? integration.sync_status.toLowerCase()
      : 'idle';
    const hasCredentials = Boolean(
      integration.encrypted_creds?.access_token || integration.encrypted_creds?.refresh_token,
    );

    return hasCredentials && syncStatus !== 'error' && syncStatus !== 'disconnected' && syncStatus !== 'revoked';
  }

  private buildInactiveIntegrationMessage(integration: IntegrationRow): string {
    if (!integration) {
      return 'Google Workspace integration is not connected.';
    }

    if (!integration.encrypted_creds?.access_token && !integration.encrypted_creds?.refresh_token) {
      return 'Google Workspace integration is missing stored credentials.';
    }

    const syncStatus = typeof integration.sync_status === 'string' ? integration.sync_status : 'unknown';
    return `Google Workspace integration is not active (sync_status=${syncStatus}).`;
  }

  private getStoredScopes(integration: IntegrationRow): string[] {
    const rawScopes = integration?.encrypted_creds?.scopes;
    if (Array.isArray(rawScopes)) {
      return rawScopes.filter((scope): scope is string => typeof scope === 'string');
    }

    if (typeof rawScopes === 'string') {
      return rawScopes.split(' ').map((scope) => scope.trim()).filter(Boolean);
    }

    return [];
  }

  private getScopesFromTokenPayload(tokens: Record<string, unknown>): string[] {
    if (typeof tokens.scope !== 'string') {
      return [];
    }

    return tokens.scope
      .split(' ')
      .map((scope) => scope.trim())
      .filter(Boolean);
  }

  private normalizeToolName(toolName: string): string {
    return toolName.trim().toLowerCase();
  }

  private isRequestedToolAllowed(
    workerType: CapabilityWorkerType,
    requestedTool: string,
  ): boolean {
    return workerToolPolicyService.isToolAllowed(workerType, requestedTool);
  }

  private matchToolByKeywords(toolNames: string[], keywords: string[][]): string | null {
    for (const keywordSet of keywords) {
      for (const toolName of toolNames) {
        const normalized = this.normalizeToolName(toolName);
        if (keywordSet.every((keyword) => normalized.includes(keyword))) {
          return toolName;
        }
      }
    }

    return null;
  }

  async listToolNames(orgId: string, allowRetry = true): Promise<string[]> {
    const now = Date.now();
    const cached = this.toolNameCache.get(orgId);

    if (cached && now - cached.lastFetched < TOOL_CACHE_TTL) {
      return cached.names;
    }

    try {
      const client = await this.getClient(orgId, {
        forceReconnect: !allowRetry,
        forceRefresh: !allowRetry,
      });
      const typedClient = client as unknown as {
        listTools: (args?: { cursor?: string }) => Promise<{
          tools: Array<{ name?: string }>;
          nextCursor?: string;
        }>;
      };

      const names: string[] = [];
      let cursor: string | undefined;

      do {
        const response = await typedClient.listTools({ cursor });
        names.push(
          ...response.tools
            .map((tool) => (typeof tool.name === 'string' ? tool.name : null))
            .filter((toolName): toolName is string => Boolean(toolName)),
        );
        cursor = response.nextCursor;
      } while (cursor);

      const deduped = Array.from(new Set(names));
      this.toolNameCache.set(orgId, { names: deduped, lastFetched: now });
      return deduped;
    } catch (error) {
      if (allowRetry && this.isAuthError(error)) {
        await this.resetOrgCache(orgId);
        return this.listToolNames(orgId, false);
      }

      throw error;
    }
  }

  async resolveToolName(orgId: string, requestedTool: string): Promise<ResolveToolResult> {
    const availableTools = await this.listToolNames(orgId);
    const normalizedRequested = this.normalizeToolName(requestedTool);
    const exactMatch = availableTools.find(
      (toolName) => this.normalizeToolName(toolName) === normalizedRequested,
    );

    if (exactMatch) {
      return { requestedTool, resolvedTool: exactMatch, availableTools };
    }

    // Keyword-based fallback
    const keywordMatch = this.matchToolByKeywords(
      availableTools,
      TOOL_KEYWORD_MAP[requestedTool] ?? [],
    );

    return {
      requestedTool,
      resolvedTool: keywordMatch,
      availableTools,
    };
  }

  async executeWorkerTool(
    orgId: string,
    workerType: CapabilityWorkerType,
    requestedTool: string,
    args: Record<string, unknown>,
  ): Promise<{ toolName: string; result: unknown }> {
    if (!this.isRequestedToolAllowed(workerType, requestedTool)) {
      throw new Error(
        `Worker policy denied tool ${requestedTool} for ${workerType}`,
      );
    }

    const resolution = await this.resolveToolName(orgId, requestedTool);
    if (!resolution.resolvedTool) {
      throw new Error(`Tool ${requestedTool} is unavailable for ${workerType}`);
    }

    const result = await this.executeTool(orgId, resolution.resolvedTool, args);
    return { toolName: resolution.resolvedTool, result };
  }

  async checkCapabilityReadiness(
    orgId: string,
    workerType: CapabilityWorkerType,
    requestedTools: string[],
  ): Promise<CapabilityReadinessResult> {
    const integration = await this.getIntegration(orgId);
    const integrationActive = this.isIntegrationActive(integration);
    const scopes = this.getStoredScopes(integration);
    const requiredScopes = workerToolPolicyService.getRequiredScopes(workerType);
    const missingScopes = requiredScopes.filter((scope) => !scopes.includes(scope));
    const resolvedTools: string[] = [];
    const unavailableTools: string[] = [];
    const errors: string[] = [];

    if (!integrationActive) {
      errors.push(this.buildInactiveIntegrationMessage(integration));
    }

    for (const requestedTool of requestedTools) {
      if (!this.isRequestedToolAllowed(workerType, requestedTool)) {
        unavailableTools.push(requestedTool);
        errors.push(`Worker policy denied tool: ${requestedTool}`);
        continue;
      }

      if (!integrationActive) {
        continue;
      }

      try {
        const resolution = await this.resolveToolName(orgId, requestedTool);
        if (resolution.resolvedTool) {
          resolvedTools.push(resolution.resolvedTool);
        } else {
          unavailableTools.push(requestedTool);
          errors.push(`Unavailable tool: ${requestedTool}`);
        }
      } catch (error: unknown) {
        unavailableTools.push(requestedTool);
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    const ready = integrationActive
      && missingScopes.length === 0
      && unavailableTools.length === 0;

    errors.push(...missingScopes.map((scope) => `Missing scope: ${scope}`));

    return {
      worker_type: workerType,
      ready,
      integration_active: integrationActive,
      policy_allowed: requestedTools.every((toolName) =>
        workerToolPolicyService.isToolAllowed(workerType, toolName),
      ),
      required_scopes: requiredScopes,
      missing_scopes: missingScopes,
      requested_tools: requestedTools,
      resolved_tools: resolvedTools,
      unavailable_tools: unavailableTools,
      errors: ready ? [] : Array.from(new Set(errors)),
    };
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
      this.toolFetchErrors.delete(orgId);

      return tools;
    } catch (err: any) {
      if (this.isAuthError(err)) {
        console.log(`Retrying LangChain tool fetch for ${orgId} after auth recovery`);
        await this.resetOrgCache(orgId);

        try {
          const client = await this.getClient(orgId, { forceReconnect: true, forceRefresh: true });
          const tools = await loadMcpTools('workspace-mcp', client);

          this.toolCache.set(orgId, {
            tools,
            lastFetched: Date.now(),
          });
          this.toolFetchErrors.delete(orgId);

          return tools;
        } catch (retryErr: any) {
          console.error(`Retry failed fetching LangChain tools for org ${orgId}:`, retryErr);
          this.toolFetchErrors.set(orgId, retryErr instanceof Error ? retryErr.message : String(retryErr));
          return [];
        }
      }

      console.error(`Failed to fetch LangChain tools for org ${orgId}:`, err);
      this.toolFetchErrors.set(orgId, err instanceof Error ? err.message : String(err));

      return [];
    }
  }

  async executeTool(
    orgId: string,
    toolName: string,
    args: any,
    allowRetry = true,
  ): Promise<any> {
    return Effect.runPromise(this.executeToolEffect(orgId, toolName, args, allowRetry));
  }

  executeToolEffect(
    orgId: string,
    toolName: string,
    args: any,
    allowRetry = true,
  ): Effect.Effect<any, unknown> {
    return Effect.gen(this, function* () {
      const clientResult = yield* this.getClientEffect(orgId, {
        forceReconnect: !allowRetry,
        forceRefresh: !allowRetry,
      }).pipe(Effect.either);

      if (clientResult._tag === 'Left') {
        const err = clientResult.left as { message?: unknown };
        yield* Effect.sync(() => console.error(`Failed to get MCP client for ${orgId}:`, err));
        yield* Effect.tryPromise({
          try: () => AuditLogger.flush(
            orgId,
            null,
            'agent-controller',
            `mcp_client_init_error: ${toolName}`,
            [AuditLogger.createStep('MCP Client Init', `Failed to initialize client for ${toolName}`, {
              input_summary: `Tool: ${toolName}`,
              output_summary: typeof err.message === 'string' ? err.message : 'Unknown error'
            })],
            []
          ),
          catch: (error) => error,
        });
        return yield* Effect.fail(clientResult.left);
      }

      const client = clientResult.right;
      const callResult = yield* Effect.tryPromise({
        try: () => client.callTool({
          name: toolName,
          arguments: args,
        }),
        catch: (error) => error,
      }).pipe(Effect.either);

      if (callResult._tag === 'Left') {
        const err = callResult.left as { message?: unknown };
        yield* Effect.sync(() => console.error(`MCP tool execution failed: ${toolName}`, err));

        const isAuthError = this.isAuthError(err);

        yield* Effect.tryPromise({
          try: () => this.resetOrgCache(orgId),
          catch: (error) => error,
        });

        if (isAuthError && allowRetry) {
          yield* Effect.sync(() => console.log(`Auth error detected for ${orgId}, retrying tool ${toolName} once with a fresh MCP client...`));
          return yield* this.executeToolEffect(orgId, toolName, args, false);
        }

        yield* Effect.tryPromise({
          try: () => AuditLogger.flush(
            orgId,
            null,
            'agent-controller',
            `mcp_tool_error: ${toolName}`,
            [AuditLogger.createStep('MCP Tool Execution', `Tool execution failed: ${toolName}`, {
              input_summary: JSON.stringify(args).substring(0, 500),
              output_summary: typeof err.message === 'string' ? err.message : 'Unknown error'
            })],
            []
          ),
          catch: (error) => error,
        });
        return yield* Effect.fail(callResult.left);
      }

      const result = callResult.right;

      const redactedResult = this.redactResult(result);

      yield* Effect.tryPromise({
        try: () => AuditLogger.flush(
          orgId,
          null,
          'agent-controller',
          `mcp_tool_call: ${toolName}`,
          [AuditLogger.createStep('MCP Tool Execution', `Executed tool: ${toolName}`, {
            input_summary: JSON.stringify(args).substring(0, 500),
            output_summary: JSON.stringify(redactedResult).substring(0, 500)
          })],
          []
        ),
        catch: (error) => error,
      });

      return redactedResult;
    });
  }

  async cleanup(maxAgeMs: number = 3600000) {
    const now = Date.now();
    for (const [orgId, cached] of this.clientCache.entries()) {
      if (now - cached.lastUsed > maxAgeMs) {
        await this.resetOrgCache(orgId);
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
