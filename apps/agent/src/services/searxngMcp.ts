import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { StructuredTool } from '@langchain/core/tools';
import { loadMcpTools } from '@langchain/mcp-adapters';
import { config } from '../config/index.js';

export interface SearxngMcpHealth {
  healthy: boolean;
  status: number;
  message: string;
}

function buildBasicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

export class SearxngMcpService {
  private client: Client | null = null;

  private toolsCache: StructuredTool[] | null = null;

  private mcpUrl(): string {
    const url = config.SEARXNG_MCP_URL?.trim();
    if (url) {
      return url;
    }

    // Dev auto-discovery default: use local MCP endpoint when no env is provided.
    return 'http://127.0.0.1:3000/mcp';
  }

  private requestHeaders(): Headers {
    const headers = new Headers();
    const username = config.SEARXNG_MCP_USERNAME?.trim();
    const password = config.SEARXNG_MCP_PASSWORD?.trim();

    if (username && password) {
      headers.set('Authorization', buildBasicAuthHeader(username, password));
    }

    return headers;
  }

  private healthUrl(): URL {
    const mcp = new URL(this.mcpUrl());
    if (mcp.pathname.endsWith('/mcp')) {
      mcp.pathname = mcp.pathname.replace(/\/mcp$/, '/health');
    } else {
      mcp.pathname = `${mcp.pathname.replace(/\/$/, '')}/health`;
    }

    return mcp;
  }

  async getClient(): Promise<Client> {
    if (this.client) {
      return this.client;
    }

    const client = new Client(
      { name: 'searxng-mcp-client', version: '1.0.0' },
      { capabilities: {} },
    );

    const transport = new StreamableHTTPClientTransport(new URL(this.mcpUrl()), {
      requestInit: {
        headers: this.requestHeaders(),
      },
    });

    await client.connect(transport);
    this.client = client;
    return client;
  }

  async getLangChainTools(): Promise<StructuredTool[]> {
    if (this.toolsCache) {
      return this.toolsCache;
    }

    const client = await this.getClient();
    const tools = await loadMcpTools('searxng-mcp', client);
    this.toolsCache = tools;
    return tools;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const client = await this.getClient();
    return client.callTool({
      name,
      arguments: args,
    });
  }

  async healthCheck(): Promise<SearxngMcpHealth> {
    try {
      const response = await fetch(this.healthUrl(), {
        method: 'GET',
        headers: this.requestHeaders(),
      });

      if (!response.ok) {
        return {
          healthy: false,
          status: response.status,
          message: `Health check failed with status ${response.status}`,
        };
      }

      return {
        healthy: true,
        status: response.status,
        message: 'SearXNG MCP healthy',
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        healthy: false,
        status: 0,
        message,
      };
    }
  }

  async reset(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }

    this.client = null;
    this.toolsCache = null;
  }
}

export const searxngMcpService = new SearxngMcpService();
