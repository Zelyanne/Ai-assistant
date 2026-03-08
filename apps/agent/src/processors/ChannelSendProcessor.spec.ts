import { describe, expect, it, vi } from 'vitest';
import { ChannelSendProcessor } from './ChannelSendProcessor.js';
import { ChannelAdapter } from '../channels/ChannelAdapter.js';
import { ChannelAdapterRegistry } from '../channels/ChannelAdapterRegistry.js';
import { ChannelRouterService } from '../services/channelRouter.js';

function createAdapterStub(overrides: Partial<ChannelAdapter> = {}): ChannelAdapter {
  return {
    channel: 'telegram',
    validateWebhook: () => ({ valid: true }),
    normalizeInbound: () => {
      throw new Error('not used');
    },
    sendOutbound: async () => ({
      delivery_state: 'sent',
      provider_message_id: 'provider-1',
      provider_response: { ok: true },
      terminal: false,
    }),
    mapDeliveryEvent: () => null,
    evaluateRetry: () => ({
      should_retry: false,
      next_delay_ms: null,
      attempt_count: 1,
      terminal: true,
    }),
    ...overrides,
  };
}

describe('ChannelSendProcessor', () => {
  it('calls adapter.sendOutbound and persists delivery event', async () => {
    const sendOutbound = vi.fn()
      .mockResolvedValueOnce({
        delivery_state: 'failed',
        provider_message_id: 'provider-1',
        provider_response: { ok: false },
        terminal: false,
        error_message: 'temporary_downstream_failure',
      })
      .mockResolvedValueOnce({
        delivery_state: 'sent',
        provider_message_id: 'provider-2',
        provider_response: { ok: true },
        terminal: false,
      });

    const adapter = createAdapterStub({
      sendOutbound,
      evaluateRetry: ({ attempt_count, max_attempts }) => ({
        should_retry: attempt_count < max_attempts,
        next_delay_ms: 0,
        attempt_count,
        terminal: false,
      }),
    });

    const registry = new ChannelAdapterRegistry([adapter]);
    const persistDeliveryEvent = vi.fn().mockResolvedValue({
      channel_delivery_history: [{ delivery_state: 'sent' }],
    });

    const routerService = {
      persistDeliveryEvent,
    } as unknown as ChannelRouterService;

    const processor = new ChannelSendProcessor({ registry, routerService });

    const task: any = {
      id: '44444444-4444-4444-8444-444444444444',
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      domain_action: 'channel.send',
      status: 'queued',
      payload: {
        channel: 'telegram',
        thread_id: 'chat-1',
        external_message_id: 'ext-1',
        message_text: 'hello',
        max_attempts: 2,
      },
      result: {},
    };

    const result = await processor.process(task);

    expect(sendOutbound).toHaveBeenCalledTimes(2);
    expect(persistDeliveryEvent).toHaveBeenCalledTimes(2);
    expect(result).toEqual(expect.objectContaining({ delivery_state: 'sent' }));
    expect(task.result).toEqual(expect.objectContaining({ channel_delivery_history: expect.any(Array) }));
  });

  it('throws on terminal failure and still persists failure event', async () => {
    const sendOutbound = vi.fn().mockResolvedValue({
      delivery_state: 'failed',
      provider_message_id: 'provider-1',
      provider_response: { ok: false },
      terminal: true,
      error_message: 'provider_timeout',
      error_code: '500',
    });

    const adapter = createAdapterStub({
      sendOutbound,
      evaluateRetry: () => ({
        should_retry: false,
        next_delay_ms: null,
        attempt_count: 1,
        terminal: true,
        reason: 'provider_timeout',
      }),
    });

    const registry = new ChannelAdapterRegistry([adapter]);
    const persistDeliveryEvent = vi.fn().mockResolvedValue({
      terminal_failure: { error_code: '500' },
    });

    const routerService = {
      persistDeliveryEvent,
    } as unknown as ChannelRouterService;

    const processor = new ChannelSendProcessor({ registry, routerService });

    const task: any = {
      id: '44444444-4444-4444-8444-444444444444',
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: null,
      domain_action: 'channel.send',
      status: 'queued',
      payload: {
        channel: 'telegram',
        thread_id: 'chat-1',
        external_message_id: 'ext-1',
        message_text: 'hello',
      },
      result: {},
    };

    await expect(processor.process(task)).rejects.toThrow('provider_timeout');
    expect(persistDeliveryEvent).toHaveBeenCalledTimes(1);
    expect(task.result).toEqual(expect.objectContaining({ terminal_failure: expect.any(Object) }));
  });
});
