import { describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';
import { ChannelAdapterRegistry } from '../../channels/ChannelAdapterRegistry.js';
import { ChannelRouterService } from '../../services/channelRouter.js';
import { WhatsAppWebhookDeps, createWhatsAppWebhookRouter, handleWhatsAppWebhook } from './whatsapp.js';

vi.hoisted(() => {
  Object.assign(process.env, {
    SUPABASE_URL_PROJECT_GOOGLE_ASSITANT: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY_PROJECT_GOOGLE_ASSITANT: 'test-service-role-key',
    MISTRAL_API_KEY_PROJECT_GOOGLE_ASSITANT: 'test-mistral-key',
    GOOGLE_OAUTH_CLIENT_ID_PROJECT_GOOGLE_ASSITANT: 'test-google-client-id',
    GOOGLE_OAUTH_CLIENT_SECRET_PROJECT_GOOGLE_ASSITANT: 'test-google-client-secret',
    GOOGLE_OAUTH_REDIRECT_URI_PROJECT_GOOGLE_ASSITANT: 'https://example.com/oauth/callback',
    ENCRYPTION_SECRET_PROJECT_GOOGLE_ASSITANT: '0123456789abcdef0123456789abcdef',
  });
});

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

function createMockRequest(overrides: Partial<Request>): Request {
  return {
    protocol: 'https',
    headers: {},
    body: {},
    query: {},
    originalUrl: '/webhooks/whatsapp',
    get: () => 'example.com',
    header: () => undefined,
    ...overrides,
  } as Request;
}

describe('WhatsApp webhook handler', () => {
  it('rejects invalid webhook secrets', async () => {
    const adapter = {
      validateWebhook: vi.fn(() => ({ valid: false, reason: 'evolution_webhook_secret_mismatch' })),
    };

    const deps: WhatsAppWebhookDeps = {
      registry: {
        get: vi.fn(() => adapter),
      } as unknown as ChannelAdapterRegistry,
      routerService: {
        enqueueInbound: vi.fn(),
        handleDeliveryEvent: vi.fn(),
      } as unknown as ChannelRouterService,
    };

    const req = createMockRequest({});
    const res = createMockResponse();

    await handleWhatsAppWebhook(req, res as unknown as Response, deps);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual(expect.objectContaining({ error: 'Invalid WhatsApp webhook signature' }));
  });

  it('routes valid inbound Evolution payload to queue', async () => {
    const adapter = {
      validateWebhook: vi.fn(() => ({ valid: true })),
    };

    const deps: WhatsAppWebhookDeps = {
      registry: {
        get: vi.fn(() => adapter),
      } as unknown as ChannelAdapterRegistry,
      routerService: {
        enqueueInbound: vi.fn().mockResolvedValue({
          task_id: '66666666-6666-4666-8666-666666666666',
          correlation_id: 'corr-456',
          envelope: {},
        }),
        handleDeliveryEvent: vi.fn(),
      } as unknown as ChannelRouterService,
    };

    const req = createMockRequest({
      body: {
        organization_id: '11111111-1111-1111-1111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        event: 'messages.upsert',
        data: {
          key: {
            id: 'BAE594145F4C59B4',
            remoteJid: '15551230000@s.whatsapp.net',
            fromMe: false,
          },
          message: {
            conversation: 'hello from whatsapp',
          },
        },
      },
    });
    const res = createMockResponse();

    await handleWhatsAppWebhook(req, res as unknown as Response, deps);

    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({
      accepted: true,
      task_id: '66666666-6666-4666-8666-666666666666',
      correlation_id: 'corr-456',
    });
    expect(deps.routerService.enqueueInbound).toHaveBeenCalled();
  });

  it('passes query param domain_action through for explicit routing', async () => {
    const adapter = {
      validateWebhook: vi.fn(() => ({ valid: true })),
    };

    const deps: WhatsAppWebhookDeps = {
      registry: {
        get: vi.fn(() => adapter),
      } as unknown as ChannelAdapterRegistry,
      routerService: {
        enqueueInbound: vi.fn().mockResolvedValue({
          task_id: '66666666-6666-4666-8666-666666666666',
          correlation_id: 'corr-456',
          envelope: {},
        }),
        handleDeliveryEvent: vi.fn(),
      } as unknown as ChannelRouterService,
    };

    const req = createMockRequest({
      body: {
        organization_id: '11111111-1111-1111-1111-111111111111',
        event: 'messages.upsert',
        data: {
          key: {
            id: 'BAE594145F4C59B4',
            remoteJid: '15551230000@s.whatsapp.net',
            fromMe: false,
          },
          message: {
            conversation: 'hello from whatsapp',
          },
        },
      },
      query: {
        domain_action: 'relancing.update',
      },
    });
    const res = createMockResponse();

    await handleWhatsAppWebhook(req, res as unknown as Response, deps);

    expect(deps.routerService.enqueueInbound).toHaveBeenCalledWith(
      'whatsapp',
      expect.objectContaining({
        domain_action: 'relancing.update',
      }),
    );
  });

  it('routes delivery callbacks to delivery persistence flow', async () => {
    const adapter = {
      validateWebhook: vi.fn(() => ({ valid: true })),
    };

    const deps: WhatsAppWebhookDeps = {
      registry: {
        get: vi.fn(() => adapter),
      } as unknown as ChannelAdapterRegistry,
      routerService: {
        enqueueInbound: vi.fn(),
        handleDeliveryEvent: vi.fn().mockResolvedValue({
          accepted: true,
          persisted: true,
          reason: undefined,
        }),
      } as unknown as ChannelRouterService,
    };

    const req = createMockRequest({
      body: {
        organization_id: '11111111-1111-1111-1111-111111111111',
        task_id: '77777777-7777-4777-8777-777777777777',
        event: 'send.message',
        data: {
          key: {
            id: 'BAE594145F4C59B4',
            remoteJid: '15551230000@s.whatsapp.net',
          },
          status: 'PENDING',
        },
      },
    });
    const res = createMockResponse();

    await handleWhatsAppWebhook(req, res as unknown as Response, deps);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      accepted: true,
      persisted: true,
      reason: undefined,
    });
    expect(deps.routerService.handleDeliveryEvent).toHaveBeenCalled();
  });

  it('ignores self-authored messages.upsert events', async () => {
    const adapter = {
      validateWebhook: vi.fn(() => ({ valid: true })),
    };

    const deps: WhatsAppWebhookDeps = {
      registry: {
        get: vi.fn(() => adapter),
      } as unknown as ChannelAdapterRegistry,
      routerService: {
        enqueueInbound: vi.fn(),
        handleDeliveryEvent: vi.fn(),
      } as unknown as ChannelRouterService,
    };

    const req = createMockRequest({
      body: {
        organization_id: '11111111-1111-1111-1111-111111111111',
        event: 'messages.upsert',
        data: {
          key: {
            id: 'BAE594145F4C59B4',
            remoteJid: '15551230000@s.whatsapp.net',
            fromMe: true,
          },
        },
      },
    });
    const res = createMockResponse();

    await handleWhatsAppWebhook(req, res as unknown as Response, deps);

    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({
      accepted: true,
      persisted: false,
      reason: 'self_message_ignored',
    });
    expect(deps.routerService.enqueueInbound).not.toHaveBeenCalled();
  });

  it('serves Meta verification challenge on GET when verify token matches', async () => {
    const previousToken = process.env.WHATSAPP_WEBHOOK_SECRET_PROJECT_GOOGLE_ASSITANT;
    process.env.WHATSAPP_WEBHOOK_SECRET_PROJECT_GOOGLE_ASSITANT = 'meta-secret';

    try {
      const router = createWhatsAppWebhookRouter({
        registry: {} as ChannelAdapterRegistry,
        routerService: {} as ChannelRouterService,
      });
      const layer = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (req: Request, res: Response) => void }> } }> }).stack
        .find((entry) => entry.route?.path === '/' && entry.route.methods.get);

      const send = vi.fn();
      const req = createMockRequest({
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'meta-secret',
          'hub.challenge': 'challenge-token',
        },
      });
      const res = {
        status: vi.fn().mockReturnThis(),
        send,
        sendStatus: vi.fn(),
        json: vi.fn(),
      } as unknown as Response;

      layer?.route?.stack[0]?.handle(req, res);

      expect(send).toHaveBeenCalledWith('challenge-token');
    } finally {
      process.env.WHATSAPP_WEBHOOK_SECRET_PROJECT_GOOGLE_ASSITANT = previousToken;
    }
  });
});
