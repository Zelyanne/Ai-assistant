import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { supabase } from './supabase.js';
import { decrypt } from '@ai-assistant/shared';
import { PerimeterGuard } from '../guards/PerimeterGuard.js';

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || '';

interface CachedClient {
  client: Client;
  transport: StdioClientTransport;
  lastUsed: number;
}

export class MCPService {
  private guard: PerimeterGuard;
  private clientCache: Map<string, CachedClient>;

  constructor() {
    this.guard = new PerimeterGuard();
    this.clientCache = new Map();
  }

  private async getClient(orgId: string): Promise<Client> {
    const now = Date.now();
    
    // Check cache
    const cached = this.clientCache.get(orgId);
    if (cached) {
      // Basic liveness check could go here, for now we assume it's alive if in cache
      // We could also check if the token is likely expired (e.g. > 55 mins) but we don't store token time
      cached.lastUsed = now;
      return cached.client;
    }

    // If not in cache, create new
    // 1. Get tokens for the organization
    const { data: integration, error } = await supabase
      .from('workspace_integrations')
      .select('encrypted_creds')
      .eq('organization_id', orgId)
      .eq('provider', 'google')
      .single();

    if (error || !integration) {
      throw new Error(`Integration not found for organization ${orgId}`);
    }

    const creds = integration.encrypted_creds as any;
    const accessToken = decrypt(creds.access_token, ENCRYPTION_SECRET);

    // 2. Setup MCP Client
    const client = new Client(
      { name: 'agent-controller', version: '1.0.0' },
      { capabilities: {} }
    );

    // 3. Spawn subprocess
    const transport = new StdioClientTransport({
      command: 'uvx',
      args: ['--from', 'google-workspace-mcp', 'google-workspace-worker'],
      env: {
        ...process.env,
        GOOGLE_ACCESS_TOKEN: accessToken,
      }
    });

    await client.connect(transport);

    this.clientCache.set(orgId, {
      client,
      transport,
      lastUsed: now
    });

    return client;
  }

  async executeTool(orgId: string, toolName: string, args: any): Promise<any> {
    let client: Client;
    
    try {
      client = await this.getClient(orgId);
    } catch (err: any) {
      console.error(`Failed to get MCP client for ${orgId}:`, err);
       // Log error to activity log
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
      // 4. Execute Tool
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });

      // 5. Perimeter Guard check (Redaction)
      const redactedResult = this.redactResult(result);

      // 6. Log to agent_activity_log
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
      // Remove from cache on error as connection might be dead
      this.clientCache.delete(orgId);
      
      // Log error to activity log
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

  // Cleanup method to close connections (can be called by a cron job or on shutdown)
  async cleanup(maxAgeMs: number = 3600000) { // Default 1 hour
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

  private redactResult(result: any): any {
    const redactedResult: any = JSON.parse(JSON.stringify(result));
    
    // Handle both 'content' and 'toolResult' if they exist
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
