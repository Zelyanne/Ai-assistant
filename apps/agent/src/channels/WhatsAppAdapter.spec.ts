import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { WhatsAppAdapter } from './WhatsAppAdapter.js';

describe('WhatsAppAdapter', () => {
  const signingSecret = 'whatsapp-signing-secret';
  const evolutionSecret = 'evolution-secret';
  const adapter = new WhatsAppAdapter({
    webhook_signing_secret: signingSecret,
    evolution_webhook_secret: evolutionSecret,
  });

  it('validates Meta webhook payload with x-whatsapp-signature', () => {
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

  it('validates webhook payload with x-evolution-webhook-secret', () => {
    const result = adapter.validateWebhook({
      headers: {
        'x-evolution-webhook-secret': evolutionSecret,
      },
      rawBody: JSON.stringify({ event: 'messages.upsert' }),
      parsedBody: { event: 'messages.upsert' },
      requestPath: 'https://example.com/webhooks/whatsapp',
    });

    expect(result.valid).toBe(true);
  });

  it('normalizes Evolution inbound WhatsApp payload into shared envelope', () => {
    const normalized = adapter.normalizeInbound({
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      event: 'messages.upsert',
      instance: 'ops-bot',
      data: {
        key: {
          id: 'BAE594145F4C59B4',
          remoteJid: '15551230000@s.whatsapp.net',
          fromMe: false,
        },
        pushName: 'Alex',
        message: {
          conversation: 'Need update',
        },
      },
    });

    expect(normalized.channel).toBe('whatsapp');
    expect(normalized.external_message_id).toBe('BAE594145F4C59B4');
    expect(normalized.thread_id).toBe('15551230000@s.whatsapp.net');
    expect(normalized.message_text).toBe('Need update');
    expect(normalized.channel_metadata).toEqual(expect.objectContaining({
      event: 'messages.upsert',
      instance: 'ops-bot',
      push_name: 'Alex',
      provider: 'evolution',
    }));
  });

  it('normalizes Meta inbound WhatsApp payload into shared envelope', () => {
    const normalized = adapter.normalizeInbound({
      object: 'whatsapp_business_account',
      organization_id: '11111111-1111-1111-1111-111111111111',
      entry: [{
        changes: [{
          value: {
            contacts: [{ profile: { name: 'Alexis' }, wa_id: '15551230000' }],
            messages: [{
              from: '15551230000',
              id: 'wamid.123',
              timestamp: '1600000000',
              text: { body: 'Need update' },
            }],
          },
        }],
      }],
    });

    expect(normalized.channel).toBe('whatsapp');
    expect(normalized.external_message_id).toBe('wamid.123');
    expect(normalized.thread_id).toBe('15551230000');
    expect(normalized.channel_metadata).toEqual(expect.objectContaining({
      profile_name: 'Alexis',
      provider: 'meta',
    }));
  });

  it('maps Evolution delivery callbacks to delivered terminal state', () => {
    const event = adapter.mapDeliveryEvent({
      organization_id: '11111111-1111-1111-1111-111111111111',
      event: 'send.message.update',
      data: {
        key: {
          id: 'BAE594145F4C59B4',
          remoteJid: '15551230000@s.whatsapp.net',
        },
        status: 'DELIVERY_ACK',
      },
    });

    expect(event).not.toBeNull();
    expect(event?.delivery_state).toBe('delivered');
    expect(event?.terminal).toBe(true);
    expect(event?.provider_message_id).toBe('BAE594145F4C59B4');
  });

  it('maps Twilio status callback payload to failed terminal state', () => {
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
