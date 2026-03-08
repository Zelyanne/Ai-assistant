import { describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';
import { ChannelAdapterRegistry } from '../../channels/ChannelAdapterRegistry.js';
import { ChannelRouterService } from '../../services/channelRouter.js';
import { WhatsAppWebhookDeps, handleWhatsAppWebhook } from './whatsapp.js';

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
  it('rejects invalid webhook signatures', async () => {
    const adapter = {
      validateWebhook: vi.fn(() => ({ valid: false, reason: 'twilio_signature_mismatch' })),
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

  it('routes valid inbound webhook payload to queue', async () => {
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
        Body: 'hello from whatsapp',
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
        MessageStatus: 'delivered',
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
});
