import { describe, expect, it } from 'vitest';
import { WebChatAdapter } from './WebChatAdapter.js';

describe('WebChatAdapter', () => {
  const adapter = new WebChatAdapter();

  it('normalizes web chat payload into the shared inbound envelope', () => {
    const normalized = adapter.normalizeInbound({
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-2222-2222-222222222222',
      thread_id: 'thread-123',
      external_message_id: 'msg-123',
      message_text: 'hello world',
      metadata: { source: 'web-chat-widget' },
    });

    expect(normalized.channel).toBe('web');
    expect(normalized.external_message_id).toBe('msg-123');
    expect(normalized.thread_id).toBe('thread-123');
    expect(normalized.organization_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(normalized.user_id).toBe('22222222-2222-2222-2222-222222222222');
    expect(normalized.domain_action).toBe('thread.action');
    expect(normalized.channel_metadata).toEqual({ source: 'web-chat-widget' });
  });

  it('maps delivery payloads into delivery events', () => {
    const event = adapter.mapDeliveryEvent({
      organization_id: '11111111-1111-1111-1111-111111111111',
      task_id: '33333333-3333-4333-8333-333333333333',
      thread_id: 'thread-123',
      external_message_id: 'msg-123',
      provider_message_id: 'provider-1',
      delivery_state: 'delivered',
      correlation_id: 'corr-1',
    });

    expect(event).not.toBeNull();
    expect(event?.channel).toBe('web');
    expect(event?.delivery_state).toBe('delivered');
    expect(event?.provider_message_id).toBe('provider-1');
    expect(event?.correlation_id).toBe('corr-1');
  });

  it('returns terminal retry decision when budget is exhausted', () => {
    const decision = adapter.evaluateRetry({
      attempt_count: 3,
      max_attempts: 3,
      error_message: 'provider_failed',
    });

    expect(decision.should_retry).toBe(false);
    expect(decision.terminal).toBe(true);
    expect(decision.next_delay_ms).toBeNull();
  });
});
