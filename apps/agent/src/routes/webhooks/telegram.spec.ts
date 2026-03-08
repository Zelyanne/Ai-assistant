import { describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';
import { ChannelAdapterRegistry } from '../../channels/ChannelAdapterRegistry.js';
import { ChannelRouterService } from '../../services/channelRouter.js';
import { TelegramWebhookDeps, handleTelegramWebhook } from './telegram.js';

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
    originalUrl: '/webhooks/telegram',
    get: () => 'example.com',
    header: () => undefined,
    ...overrides,
  } as Request;
}

describe('Telegram webhook handler', () => {
  it('rejects invalid webhook signatures', async () => {
    const adapter = {
      validateWebhook: vi.fn(() => ({ valid: false, reason: 'telegram_secret_token_mismatch' })),
    };

    const deps: TelegramWebhookDeps = {
      registry: {
        get: vi.fn(() => adapter),
      } as unknown as ChannelAdapterRegistry,
      routerService: {
        enqueueInbound: vi.fn(),
      } as unknown as ChannelRouterService,
    };

    const req = createMockRequest({});
    const res = createMockResponse();

    await handleTelegramWebhook(req, res as unknown as Response, deps);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual(expect.objectContaining({ error: 'Invalid Telegram webhook signature' }));
    expect(deps.routerService.enqueueInbound).not.toHaveBeenCalled();
  });

  it('enqueues inbound message when signature is valid', async () => {
    const adapter = {
      validateWebhook: vi.fn(() => ({ valid: true })),
    };

    const deps: TelegramWebhookDeps = {
      registry: {
        get: vi.fn(() => adapter),
      } as unknown as ChannelAdapterRegistry,
      routerService: {
        enqueueInbound: vi.fn().mockResolvedValue({
          task_id: '44444444-4444-4444-8444-444444444444',
          correlation_id: 'corr-123',
          envelope: {},
        }),
      } as unknown as ChannelRouterService,
    };

    const req = createMockRequest({
      body: {
        organization_id: '11111111-1111-1111-1111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        update_id: 999,
      },
    });
    const res = createMockResponse();

    await handleTelegramWebhook(req, res as unknown as Response, deps);

    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual(expect.objectContaining({
      accepted: true,
      task_id: '44444444-4444-4444-8444-444444444444',
      correlation_id: expect.any(String),
    }));
    expect(deps.routerService.enqueueInbound).toHaveBeenCalledWith(
      'telegram',
      expect.objectContaining({
        organization_id: '11111111-1111-1111-1111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
      }),
    );
  });
});
