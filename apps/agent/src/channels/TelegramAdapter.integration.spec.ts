import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { TelegramAdapter } from './TelegramAdapter.js';
import { ChannelRouterService } from '../services/channelRouter.js';
import { ChannelAdapterRegistry } from './ChannelAdapterRegistry.js';
import { AuditLogger } from '../services/AuditLogger.js';
import { handleTelegramWebhook } from '../routes/webhooks/telegram.js';

interface MockResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
}

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

describe('Telegram Integration', () => {
  const mockSupabase = {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'task-123' }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((resolve) => resolve({ data: [], error: null })),
    })),
  };

  const adapter = new TelegramAdapter({ 
    bot_token: 'test-token',
    webhook_secret_token: 'secret' 
  });
  const registry = new ChannelAdapterRegistry([adapter]);
  const routerService = new ChannelRouterService({
    registry,
    supabaseClient: mockSupabase as any,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuditLogger, 'flush').mockResolvedValue(undefined);
  });

  it('handles inbound telegram message and routes to assistant.command', async () => {
    const payload = {
      update_id: 100,
      message: {
        message_id: 200,
        text: 'What is my schedule?',
        chat: { id: 12345 },
        from: { id: 555, username: 'testuser' },
      },
      organization_id: '11111111-1111-1111-1111-111111111111',
    };

    const result = await routerService.enqueueInbound('telegram', payload);

    expect(result.envelope.domain_action).toBe('assistant.command');
    expect(mockSupabase.from).toHaveBeenCalledWith('tasks');
  });

  it('sends outbound message via Telegram API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ok: true,
        result: { message_id: 999 }
      })
    });
    vi.stubGlobal('fetch', mockFetch);

    const outboundResult = await adapter.sendOutbound({
      channel: 'telegram',
      organization_id: 'org-1',
      external_message_id: 'ext-1',
      thread_id: '12345',
      message_text: 'Your schedule is empty.',
      channel_metadata: {},
    });

    expect(outboundResult.delivery_state).toBe('sent');
    expect(outboundResult.provider_message_id).toBe('999');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.telegram.org/bottest-token/sendMessage'),
      expect.any(Object)
    );

    vi.unstubAllGlobals();
  });

  it('accepts a valid Telegram webhook and enqueues assistant.command task', async () => {
    const body = {
      update_id: 500,
      message: {
        message_id: 1200,
        text: 'summarize today',
        chat: { id: 12345 },
        from: { id: 999, username: 'sandbox-user' },
      },
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
    };

    const req = {
      protocol: 'https',
      originalUrl: '/webhooks/telegram',
      headers: {
        'x-telegram-bot-api-secret-token': 'secret',
      },
      body,
      query: {},
      get: () => 'agent.example.com',
      header: (name: string) => {
        const key = name.toLowerCase();
        if (key === 'x-correlation-id') {
          return undefined;
        }
        return undefined;
      },
    } as unknown as Request;
    const res = createMockResponse();

    await handleTelegramWebhook(req, res as unknown as Response, {
      registry,
      routerService,
    });

    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual(
      expect.objectContaining({
        accepted: true,
      }),
    );
    expect(mockSupabase.from).toHaveBeenCalledWith('tasks');
  });
});
