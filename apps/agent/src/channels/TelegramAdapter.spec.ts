import { describe, expect, it } from 'vitest';
import { TelegramAdapter } from './TelegramAdapter.js';

describe('TelegramAdapter', () => {
  const adapter = new TelegramAdapter({ webhook_secret_token: 'telegram-secret' });

  it('validates webhook with matching Telegram secret header', () => {
    const result = adapter.validateWebhook({
      headers: {
        'x-telegram-bot-api-secret-token': 'telegram-secret',
      },
      rawBody: '{"ok":true}',
      parsedBody: {},
    });

    expect(result.valid).toBe(true);
  });

  it('rejects webhook when Telegram secret header mismatches', () => {
    const result = adapter.validateWebhook({
      headers: {
        'x-telegram-bot-api-secret-token': 'wrong-secret',
      },
      rawBody: '{"ok":true}',
      parsedBody: {},
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('telegram_secret_token_mismatch');
  });

  it('normalizes Telegram updates into inbound envelope', () => {
    const normalized = adapter.normalizeInbound({
      organization_id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-4222-8222-222222222222',
      update_id: 789,
      message: {
        message_id: 456,
        text: 'ping',
        chat: { id: 999 },
        from: { id: 123, username: 'bot-user' },
      },
    });

    expect(normalized.channel).toBe('telegram');
    expect(normalized.external_message_id).toBe('456');
    expect(normalized.thread_id).toBe('999');
    expect(normalized.message_text).toBe('ping');
    expect(normalized.channel_metadata.telegram_update_id).toBe(789);
  });

  it('maps failed telegram provider payload into failed delivery event', () => {
    const delivery = adapter.mapDeliveryEvent({
      organization_id: '11111111-1111-1111-1111-111111111111',
      task_id: '33333333-3333-4333-8333-333333333333',
      update_id: 999,
      error_code: 500,
      error_message: 'provider timeout',
    });

    expect(delivery).not.toBeNull();
    expect(delivery?.delivery_state).toBe('failed');
    expect(delivery?.terminal).toBe(true);
  });
});
