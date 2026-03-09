import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelAdapter } from '../channels/ChannelAdapter.js';
import { ChannelAdapterRegistry } from '../channels/ChannelAdapterRegistry.js';
import { ChannelRouterService } from './channelRouter.js';
import { AuditLogger } from './AuditLogger.js';

type ChainMode = 'none' | 'insert' | 'insert-select' | 'select' | 'update';

function createSupabaseMock() {
  const state = {
    mode: 'none' as ChainMode,
    insertResponse: { data: { id: '44444444-4444-4444-8444-444444444444' }, error: null } as {
      data: unknown;
      error: unknown;
    },
    maybeSingleResponse: { data: null, error: null } as { data: unknown; error: unknown },
    selectResponse: { data: { result: {} }, error: null } as { data: unknown; error: unknown },
    updateResponse: { error: null } as { error: unknown },
  };

  const chain = {
    insert: vi.fn(() => {
      state.mode = 'insert';
      return chain;
    }),
    select: vi.fn(() => {
      state.mode = state.mode === 'insert' ? 'insert-select' : 'select';
      return chain;
    }),
    maybeSingle: vi.fn(async () => state.maybeSingleResponse),
    single: vi.fn(async () => (state.mode === 'insert-select' ? state.insertResponse : state.selectResponse)),
    update: vi.fn(() => {
      state.mode = 'update';
      return chain;
    }),
    eq: vi.fn(() => (state.mode === 'update' ? Promise.resolve(state.updateResponse) : chain)),
  };

  const mockSupabase = {
    from: vi.fn(() => chain),
  };

  return {
    mockSupabase,
    chain,
    state,
  };
}

function createAdapterStub(): ChannelAdapter {
  return {
    channel: 'telegram',
    validateWebhook: () => ({ valid: true }),
    normalizeInbound: () => ({
      channel: 'telegram',
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      thread_id: 'thread-1',
      external_message_id: 'ext-1',
      domain_action: 'thread.action',
      message_text: 'hello',
      channel_metadata: { source: 'telegram' },
      raw_payload: { update_id: 1 },
      correlation_id: 'corr-1',
    }),
    sendOutbound: async () => ({
      delivery_state: 'sent',
      provider_message_id: 'provider-1',
      provider_response: { ok: true },
      terminal: false,
    }),
    mapDeliveryEvent: (payload) => {
      if (!payload || typeof payload !== 'object') {
        return null;
      }

      const input = payload as Record<string, unknown>;
      if (typeof input.delivery_state !== 'string') {
        return null;
      }

      const deliveryState = input.delivery_state;
      if (deliveryState !== 'queued' && deliveryState !== 'sent' && deliveryState !== 'delivered' && deliveryState !== 'failed') {
        return null;
      }

      return {
        channel: 'telegram',
        organization_id: '11111111-1111-1111-1111-111111111111',
        task_id: typeof input.task_id === 'string' ? input.task_id : undefined,
        external_message_id: 'ext-1',
        provider_message_id: 'provider-1',
        delivery_state: deliveryState,
        attempt_count: 1,
        terminal: deliveryState === 'failed',
        error_code: typeof input.error_code === 'string' ? input.error_code : undefined,
        error_message: typeof input.error_message === 'string' ? input.error_message : undefined,
        channel_metadata: { source: 'telegram' },
        raw_payload: input,
        correlation_id: 'corr-1',
      };
    },
    evaluateRetry: ({ attempt_count, max_attempts, error_message }) => ({
      should_retry: attempt_count < max_attempts,
      next_delay_ms: attempt_count < max_attempts ? 500 : null,
      attempt_count,
      terminal: attempt_count >= max_attempts,
      reason: error_message,
    }),
  };
}

describe('ChannelRouterService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('enqueues normalized inbound payload as queued task', async () => {
    const { mockSupabase, chain } = createSupabaseMock();
    const registry = new ChannelAdapterRegistry([createAdapterStub()]);
    const flushSpy = vi.spyOn(AuditLogger, 'flush').mockResolvedValue(undefined);

    const service = new ChannelRouterService({
      registry,
      supabaseClient: mockSupabase as unknown as typeof import('./supabase.js').supabase,
    });

    const result = await service.enqueueInbound('telegram', { ignored: true });

    expect(result.task_id).toBe('44444444-4444-4444-8444-444444444444');
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        domain_action: 'thread.action',
        status: 'queued',
        payload: expect.objectContaining({
          channel: 'telegram',
          external_message_id: 'ext-1',
          thread_id: 'thread-1',
        }),
      }),
    );
    expect(flushSpy).toHaveBeenCalledOnce();
  });

  it('returns existing task when inbound message is a duplicate', async () => {
    const { mockSupabase, chain, state } = createSupabaseMock();
    const registry = new ChannelAdapterRegistry([createAdapterStub()]);
    const flushSpy = vi.spyOn(AuditLogger, 'flush').mockResolvedValue(undefined);

    state.maybeSingleResponse = {
      data: {
        id: '99999999-9999-4999-8999-999999999999',
        payload: {
          correlation_id: 'corr-existing',
        },
      },
      error: null,
    };

    const service = new ChannelRouterService({
      registry,
      supabaseClient: mockSupabase as unknown as typeof import('./supabase.js').supabase,
    });

    const result = await service.enqueueInbound('telegram', { ignored: true });

    expect(result.task_id).toBe('99999999-9999-4999-8999-999999999999');
    expect(result.correlation_id).toBe('corr-existing');
    expect(chain.insert).not.toHaveBeenCalled();
    expect(flushSpy).toHaveBeenCalled();
  });

  it('auto-routes relancing hints to relancing.update', async () => {
    const { mockSupabase, chain } = createSupabaseMock();
    const adapter = createAdapterStub();
    adapter.normalizeInbound = () => ({
      channel: 'telegram',
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      thread_id: 'thread-1',
      external_message_id: 'ext-relancing-1',
      domain_action: 'thread.action',
      topic: 'Relancing',
      message_text: 'Blocked waiting on API access.',
      channel_metadata: { source: 'telegram' },
      raw_payload: { update_id: 2 },
      correlation_id: 'corr-relancing-1',
    });

    const registry = new ChannelAdapterRegistry([adapter]);
    const flushSpy = vi.spyOn(AuditLogger, 'flush').mockResolvedValue(undefined);

    const service = new ChannelRouterService({
      registry,
      supabaseClient: mockSupabase as unknown as typeof import('./supabase.js').supabase,
    });

    await service.enqueueInbound('telegram', { ignored: true });

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        domain_action: 'relancing.update',
      }),
    );
    expect(flushSpy).toHaveBeenCalledOnce();
  });

  it('persists delivery event transitions to task result', async () => {
    const { mockSupabase, chain, state } = createSupabaseMock();
    const registry = new ChannelAdapterRegistry([createAdapterStub()]);
    vi.spyOn(AuditLogger, 'flush').mockResolvedValue(undefined);

    state.selectResponse = {
      data: {
        result: {
          channel_delivery_history: [
            {
              channel: 'telegram',
              delivery_state: 'queued',
              external_message_id: 'ext-1',
              provider_message_id: 'provider-1',
            },
          ],
        },
      },
      error: null,
    };

    const service = new ChannelRouterService({
      registry,
      supabaseClient: mockSupabase as unknown as typeof import('./supabase.js').supabase,
    });

    const response = await service.handleDeliveryEvent('telegram', {
      task_id: '55555555-5555-4555-8555-555555555555',
      delivery_state: 'failed',
      error_code: '500',
      error_message: 'provider timeout',
    });

    expect(response.accepted).toBe(true);
    expect(response.persisted).toBe(true);
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          channel_delivery: expect.objectContaining({
            delivery_state: 'failed',
            error_code: '500',
          }),
          terminal_failure: expect.objectContaining({
            error_code: '500',
          }),
        }),
      }),
    );
  });

  it('accepts non-task delivery events without persistence', async () => {
    const { mockSupabase, chain } = createSupabaseMock();
    const registry = new ChannelAdapterRegistry([createAdapterStub()]);
    vi.spyOn(AuditLogger, 'flush').mockResolvedValue(undefined);

    const service = new ChannelRouterService({
      registry,
      supabaseClient: mockSupabase as unknown as typeof import('./supabase.js').supabase,
    });

    const response = await service.handleDeliveryEvent('telegram', {
      delivery_state: 'sent',
    });

    expect(response.accepted).toBe(true);
    expect(response.persisted).toBe(false);
    expect(chain.update).not.toHaveBeenCalled();
  });
});
