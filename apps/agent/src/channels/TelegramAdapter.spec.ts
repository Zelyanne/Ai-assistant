import { describe, expect, it, vi } from 'vitest';
import { TelegramAdapter } from './TelegramAdapter.js';

describe('TelegramAdapter', () => {
  const adapter = new TelegramAdapter({ 
    bot_token: 'test-token',
    webhook_secret_token: 'telegram-secret' 
  });

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
        from: { 
          id: 123, 
          username: 'bot-user',
          first_name: 'Test',
          last_name: 'User'
        },
      },
    });

    expect(normalized.channel).toBe('telegram');
    expect(normalized.external_message_id).toBe('456');
    expect(normalized.thread_id).toBe('999');
    expect(normalized.message_text).toBe('ping');
    expect(normalized.channel_metadata.telegram_update_id).toBe(789);
    expect(normalized.channel_metadata.telegram_first_name).toBe('Test');
    expect(normalized.channel_metadata.telegram_last_name).toBe('User');
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

  it('fails to send outbound when bot token is missing', async () => {
    const adapterNoToken = new TelegramAdapter({ webhook_secret_token: 'secret' });
    const result = await adapterNoToken.sendOutbound({
      channel: 'telegram',
      organization_id: '11111111-1111-1111-1111-111111111111',
      external_message_id: 'ext-1',
      thread_id: 'chat-1',
      message_text: 'hello',
      channel_metadata: {},
    });

    expect(result.delivery_state).toBe('failed');
    expect(result.error_message).toBe('telegram_bot_token_not_configured');
    expect(result.terminal).toBe(true);
  });

  it('successfully sends outbound message', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ok: true,
        result: { message_id: 12345 }
      })
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await adapter.sendOutbound({
      channel: 'telegram',
      organization_id: '11111111-1111-1111-1111-111111111111',
      external_message_id: 'ext-1',
      thread_id: 'chat-1',
      message_text: 'hello',
      channel_metadata: {},
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: 'chat-1', text: 'hello' })
      })
    );
    expect(result.delivery_state).toBe('sent');
    expect(result.provider_message_id).toBe('12345');
    
    vi.unstubAllGlobals();
  });

  it('handles Telegram API error (e.g. Forbidden)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve({
        ok: false,
        error_code: 403,
        description: 'Forbidden: bot was blocked by the user'
      })
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await adapter.sendOutbound({
      channel: 'telegram',
      organization_id: '11111111-1111-1111-1111-111111111111',
      external_message_id: 'ext-1',
      thread_id: 'chat-1',
      message_text: 'hello',
      channel_metadata: {},
    });

    expect(result.delivery_state).toBe('failed');
    expect(result.error_code).toBe('403');
    expect(result.error_message).toContain('blocked by the user');
    expect(result.terminal).toBe(true);

    vi.unstubAllGlobals();
  });
});
