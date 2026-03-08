import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { WhatsAppAdapter } from './WhatsAppAdapter.js';

describe('WhatsAppAdapter', () => {
  const signingSecret = 'whatsapp-signing-secret';
  const adapter = new WhatsAppAdapter({ webhook_signing_secret: signingSecret });

  it('validates webhook payload with x-whatsapp-signature', () => {
    const rawBody = JSON.stringify({ Body: 'hello' });
    const signature = createHmac('sha256', signingSecret)
      .update(Buffer.from(rawBody, 'utf-8'))
      .digest('hex');

    const result = adapter.validateWebhook({
      headers: {
        'x-whatsapp-signature': signature,
      },
      rawBody,
      parsedBody: { Body: 'hello' },
      requestPath: 'https://example.com/webhooks/whatsapp',
    });

    expect(result.valid).toBe(true);
  });

  it('normalizes inbound WhatsApp payload into shared envelope', () => {
    const normalized = adapter.normalizeInbound({
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      MessageSid: 'SM123',
      Body: 'Need update',
      WaId: '15551230000',
      From: 'whatsapp:+15551230000',
      To: 'whatsapp:+15550001111',
      ProfileName: 'Alex',
    });

    expect(normalized.channel).toBe('whatsapp');
    expect(normalized.external_message_id).toBe('SM123');
    expect(normalized.thread_id).toBe('15551230000');
    expect(normalized.channel_metadata.wa_id).toBe('15551230000');
  });

  it('maps status callback payload to failed terminal state', () => {
    const event = adapter.mapDeliveryEvent({
      organization_id: '11111111-1111-1111-1111-111111111111',
      task_id: '33333333-3333-4333-8333-333333333333',
      MessageSid: 'SM123',
      MessageStatus: 'failed',
      ErrorCode: '63016',
      ErrorMessage: 'Rate limit',
      WaId: '15551230000',
    });

    expect(event).not.toBeNull();
    expect(event?.delivery_state).toBe('failed');
    expect(event?.terminal).toBe(true);
    expect(event?.error_code).toBe('63016');
  });

  it('returns retry decision with exponential backoff', () => {
    const decision = adapter.evaluateRetry({
      attempt_count: 2,
      max_attempts: 4,
      error_message: 'temporary_downstream_failure',
    });

    expect(decision.should_retry).toBe(true);
    expect(decision.next_delay_ms).toBe(2000);
    expect(decision.terminal).toBe(false);
  });
});
