import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Request, Response as ExpressResponse } from 'express';
import { OutboundChannelMessage } from '@ai-assistant/shared';
import { WhatsAppAdapter } from './WhatsAppAdapter.js';
import { ChannelAdapterRegistry } from './ChannelAdapterRegistry.js';
import { ChannelRouterService } from '../services/channelRouter.js';
import { handleWhatsAppWebhook } from '../routes/webhooks/whatsapp.js';
import { AuditLogger } from '../services/AuditLogger.js';

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

function createMockSupabase() {
  const state = {
    mode: 'none' as 'none' | 'insert' | 'insert-select',
  };

  const chain = {
    insert: vi.fn(() => {
      state.mode = 'insert';
      return chain;
    }),
    select: vi.fn(() => {
      state.mode = state.mode === 'insert' ? 'insert-select' : state.mode;
      return chain;
    }),
    single: vi.fn(async () => ({ data: { id: '99999999-9999-4999-8999-999999999999' }, error: null })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    eq: vi.fn(() => chain),
  };

  return {
    chain,
    mockSupabase: {
      from: vi.fn(() => chain),
    },
  };
}

describe('WhatsAppAdapter Integration', () => {
  const adapter = new WhatsAppAdapter({
    whatsapp_provider: 'evolution',
    evolution_api_base_url: 'https://evolution.example.com',
    evolution_api_key: 'evolution-api-key',
    evolution_instance_name: 'ops-bot',
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(AuditLogger, 'flush').mockResolvedValue(undefined);
  });

  it('sends a message successfully via Evolution API', async () => {
    const mockResponse = {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: true,
          id: 'BAE594145F4C59B4',
        },
        status: 'PENDING',
      }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as globalThis.Response);

    const message: OutboundChannelMessage = {
      channel: 'whatsapp',
      organization_id: '11111111-1111-1111-1111-111111111111',
      external_message_id: 'ext-123',
      thread_id: '5511999999999@s.whatsapp.net',
      message_text: 'Hello from Evolution',
      channel_metadata: {},
    };

    const result = await adapter.sendOutbound(message);

    expect(fetch).toHaveBeenCalledWith(
      'https://evolution.example.com/message/sendText/ops-bot',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'evolution-api-key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          number: '5511999999999',
          text: 'Hello from Evolution',
        }),
      }),
    );

    expect(result.delivery_state).toBe('sent');
    expect(result.provider_message_id).toBe('BAE594145F4C59B4');
  });

  it('sends a message successfully via Meta Cloud API when selected', async () => {
    const metaAdapter = new WhatsAppAdapter({
      whatsapp_provider: 'meta',
      whatsapp_api_key: 'meta-api-key',
      whatsapp_phone_number_id: 'meta-phone-id',
    });

    const mockResponse = {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        messaging_product: 'whatsapp',
        contacts: [{ input: '5511999999999', wa_id: '5511999999999' }],
        messages: [{ id: 'wamid.HBgLMTIzNDU2Nzg5MBVDRS' }],
      }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as globalThis.Response);

    const message: OutboundChannelMessage = {
      channel: 'whatsapp',
      organization_id: '11111111-1111-1111-1111-111111111111',
      external_message_id: 'ext-meta-123',
      thread_id: '5511999999999@s.whatsapp.net',
      message_text: 'Hello from Meta',
      channel_metadata: {},
    };

    const result = await metaAdapter.sendOutbound(message);

    expect(fetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v17.0/meta-phone-id/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer meta-api-key',
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('Hello from Meta'),
      }),
    );
    expect(result.delivery_state).toBe('sent');
    expect(result.provider_message_id).toBe('wamid.HBgLMTIzNDU2Nzg5MBVDRS');
  });

  it('sends a message successfully via Twilio when selected', async () => {
    const twilioAdapter = new WhatsAppAdapter({
      whatsapp_provider: 'twilio',
      twilio_account_sid: 'twilio-sid',
      twilio_auth_token: 'twilio-token',
      twilio_whatsapp_phone_number: 'whatsapp:+15551234567',
    });

    const mockResponse = {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        sid: 'SM-TWILIO-SID',
        status: 'queued',
      }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as globalThis.Response);

    const message: OutboundChannelMessage = {
      channel: 'whatsapp',
      organization_id: '11111111-1111-1111-1111-111111111111',
      external_message_id: 'ext-twilio-123',
      thread_id: '5511999999999',
      message_text: 'Hello from Twilio',
      channel_metadata: {},
    };

    const result = await twilioAdapter.sendOutbound(message);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.twilio.com/2010-04-01/Accounts/twilio-sid/Messages.json',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Basic '),
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      }),
    );
    expect(result.delivery_state).toBe('sent');
    expect(result.provider_message_id).toBe('SM-TWILIO-SID');
  });

  it('handles Evolution API errors', async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => JSON.stringify({
        errorMessage: 'Invalid API key',
      }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as globalThis.Response);

    const message: OutboundChannelMessage = {
      channel: 'whatsapp',
      organization_id: '11111111-1111-1111-1111-111111111111',
      external_message_id: 'ext-123',
      thread_id: '5511999999999@s.whatsapp.net',
      message_text: 'Hello Error',
      channel_metadata: {},
    };

    const result = await adapter.sendOutbound(message);

    expect(result.delivery_state).toBe('failed');
    expect(result.error_message).toBe('Invalid API key');
    expect(result.terminal).toBe(true);
  });

  it('normalizes Evolution messages.upsert webhook format', () => {
    const normalized = adapter.normalizeInbound({
      organization_id: '11111111-1111-1111-1111-111111111111',
      event: 'messages.upsert',
      instance: 'ops-bot',
      data: {
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: false,
          id: 'BAE594145F4C59B4',
        },
        pushName: 'Alexis',
        message: {
          extendedTextMessage: {
            text: 'Ping',
          },
        },
      },
    });

    expect(normalized.channel).toBe('whatsapp');
    expect(normalized.message_text).toBe('Ping');
    expect(normalized.thread_id).toBe('5511999999999@s.whatsapp.net');
    expect(normalized.channel_metadata).toEqual(expect.objectContaining({
      push_name: 'Alexis',
      event: 'messages.upsert',
    }));
  });

  it('normalizes Meta nested webhook format', () => {
    const normalized = adapter.normalizeInbound({
      object: 'whatsapp_business_account',
      organization_id: '11111111-1111-1111-1111-111111111111',
      entry: [{
        changes: [{
          value: {
            contacts: [{ profile: { name: 'Alexis' }, wa_id: '5511999999999' }],
            messages: [{
              from: '5511999999999',
              id: 'wamid.123',
              timestamp: '1600000000',
              text: { body: 'Ping Meta' },
              type: 'text',
            }],
          },
        }],
      }],
    });

    expect(normalized.channel).toBe('whatsapp');
    expect(normalized.message_text).toBe('Ping Meta');
    expect(normalized.thread_id).toBe('5511999999999');
    expect(normalized.channel_metadata).toEqual(expect.objectContaining({
      profile_name: 'Alexis',
      provider: 'meta',
    }));
  });

  it('maps Evolution send.message.update to delivery event', () => {
    const event = adapter.mapDeliveryEvent({
      organization_id: '11111111-1111-1111-1111-111111111111',
      task_id: '33333333-3333-4333-8333-333333333333',
      event: 'send.message.update',
      data: {
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          id: 'BAE594145F4C59B4',
        },
        status: 'READ',
      },
    });

    expect(event).not.toBeNull();
    expect(event?.delivery_state).toBe('delivered');
    expect(event?.provider_message_id).toBe('BAE594145F4C59B4');
    expect(event?.terminal).toBe(true);
  });

  it('normalizes Meta status updates', () => {
    const event = adapter.mapDeliveryEvent({
      object: 'whatsapp_business_account',
      organization_id: '11111111-1111-1111-1111-111111111111',
      task_id: '33333333-3333-4333-8333-333333333333',
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: 'wamid.123',
              status: 'delivered',
              timestamp: '1600000000',
              recipient_id: '5511999999999',
            }],
          },
        }],
      }],
    });

    expect(event).not.toBeNull();
    expect(event?.delivery_state).toBe('delivered');
    expect(event?.provider_message_id).toBe('wamid.123');
    expect(event?.terminal).toBe(true);
  });

  it('accepts a signed Evolution webhook and enqueues assistant.command task', async () => {
    const { chain, mockSupabase } = createMockSupabase();
    const securedAdapter = new WhatsAppAdapter({ evolution_webhook_secret: 'evolution-secret' });
    const registry = new ChannelAdapterRegistry([securedAdapter]);
    const routerService = new ChannelRouterService({
      registry,
      supabaseClient: mockSupabase as unknown as typeof import('../services/supabase.js').supabase,
    });

    const body = {
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      event: 'messages.upsert',
      instance: 'ops-bot',
      data: {
        key: {
          id: 'BAE594145F4C59B4',
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: false,
        },
        message: {
          conversation: 'hello via whatsapp',
        },
      },
    };
    const rawBody = JSON.stringify(body);

    const req = {
      protocol: 'https',
      originalUrl: '/webhooks/whatsapp',
      headers: {
        'x-evolution-webhook-secret': 'evolution-secret',
      },
      body,
      query: {},
      rawBody,
      get: () => 'agent.example.com',
      header: (name: string) => {
        const key = name.toLowerCase();
        if (key === 'x-evolution-webhook-secret') {
          return 'evolution-secret';
        }
        return undefined;
      },
    } as unknown as Request;
    const res = createMockResponse();

    await handleWhatsAppWebhook(req, res as unknown as ExpressResponse, { registry, routerService });

    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual(
      expect.objectContaining({
        accepted: true,
        task_id: '99999999-9999-4999-8999-999999999999',
      }),
    );
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        domain_action: 'assistant.command',
        status: 'queued',
      }),
    );
  });
});
