import { createHash, randomBytes } from 'crypto';
import type { Database } from '@ai-assistant/shared';
import { Effect } from 'effect';
import { config } from '../config/index.js';
import { supabase } from './supabase.js';

type MessagingChannelLinkRow = Database['public']['Tables']['messaging_channel_links']['Row'];

type TelegramApiResponse<T> =
  | { ok: true; result: T }
  | { ok: false; description?: string };

type TelegramWebhookInfo = {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
};

export type TelegramIdentity = {
  organization_id: string;
  user_id: string;
};

export type TelegramLinkActivationResult =
  | { ok: true; link: MessagingChannelLinkRow; chatId: string; message: string }
  | { ok: false; chatId: string | null; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getTelegramMessage(update: unknown): Record<string, unknown> {
  if (!isRecord(update)) return {};
  if (isRecord(update.message)) return update.message;
  if (isRecord(update.edited_message)) return update.edited_message;

  const callbackQuery = isRecord(update.callback_query) ? update.callback_query : {};
  return isRecord(callbackQuery.message) ? callbackQuery.message : {};
}

function getTelegramChatId(update: unknown): string | null {
  const message = getTelegramMessage(update);
  const chat = isRecord(message.chat) ? message.chat : {};
  const id = chat.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

function getTelegramUser(update: unknown): Record<string, unknown> {
  if (isRecord(update) && isRecord(update.callback_query) && isRecord(update.callback_query.from)) {
    return update.callback_query.from;
  }

  const message = getTelegramMessage(update);
  return isRecord(message.from) ? message.from : {};
}

function getTelegramUserId(update: unknown): string | null {
  const id = getTelegramUser(update).id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

function getTelegramUsername(update: unknown): string | null {
  return asString(getTelegramUser(update).username);
}

function getTelegramDisplayName(update: unknown): string | null {
  const user = getTelegramUser(update);
  return [asString(user.first_name), asString(user.last_name)].filter(Boolean).join(' ').trim() || null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function telegramApiUrl(method: string): string {
  return `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/${method}`;
}

function normalizeWebhookUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export class MessagingChannelLinkService {
  createTelegramLinkTokenEffect(params: { organizationId: string; userId: string }): Effect.Effect<{ token: string; deepLink: string; expiresAt: string }, unknown> {
    if (!config.TELEGRAM_BOT_USERNAME) {
      return Effect.fail(new Error('TELEGRAM_BOT_USERNAME_PROJECT_GOOGLE_ASSITANT is not configured'));
    }

    return Effect.gen(this, function* () {
      yield* this.ensureTelegramWebhookReadyEffect();

      const token = yield* Effect.sync(() => randomBytes(32).toString('base64url'));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const tokenHash = hashToken(token);

      yield* Effect.tryPromise({
        try: async () => await supabase
          .from('messaging_channel_links')
          .update({
            status: 'revoked',
            link_token_hash: null,
            link_token_expires_at: null,
          })
          .eq('organization_id', params.organizationId)
          .eq('user_id', params.userId)
          .eq('channel', 'telegram')
          .eq('status', 'pending'),
        catch: (error) => error,
      });

      const { error } = yield* Effect.tryPromise({
        try: async () => await supabase
          .from('messaging_channel_links')
          .insert({
            organization_id: params.organizationId,
            user_id: params.userId,
            channel: 'telegram',
            status: 'pending',
            link_token_hash: tokenHash,
            link_token_expires_at: expiresAt,
          }),
        catch: (error) => error,
      });

      if (error) {
        yield* Effect.fail(new Error(error.message));
      }

      return {
        token,
        deepLink: `https://t.me/${config.TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(token)}`,
        expiresAt,
      };
    });
  }

  async createTelegramLinkToken(params: { organizationId: string; userId: string }): Promise<{ token: string; deepLink: string; expiresAt: string }> {
    return Effect.runPromise(this.createTelegramLinkTokenEffect(params));
  }

  activateTelegramLinkEffect(token: string, update: unknown): Effect.Effect<TelegramLinkActivationResult, unknown> {
    const chatId = getTelegramChatId(update);
    if (!chatId) {
      return Effect.succeed({ ok: false, chatId: null, message: 'Telegram chat could not be identified.' });
    }

    return Effect.gen(function* () {
      const tokenHash = hashToken(token);
      const { data: link, error } = yield* Effect.tryPromise({
        try: async () => await supabase
          .from('messaging_channel_links')
          .select('*')
          .eq('channel', 'telegram')
          .eq('status', 'pending')
          .eq('link_token_hash', tokenHash)
          .gt('link_token_expires_at', new Date().toISOString())
          .maybeSingle(),
        catch: (error) => error,
      });

      if (error) {
        yield* Effect.fail(new Error(error.message));
      }

      if (!link) {
        return { ok: false, chatId, message: 'This Telegram link has expired or is invalid. Generate a new link from Settings.' };
      }

      yield* Effect.tryPromise({
        try: async () => await supabase
          .from('messaging_channel_links')
          .update({ status: 'revoked' })
          .eq('channel', 'telegram')
          .eq('status', 'active')
          .or(`and(organization_id.eq.${link.organization_id},user_id.eq.${link.user_id}),external_thread_id.eq.${chatId}`),
        catch: (error) => error,
      });

      const now = new Date().toISOString();
      const { data: activated, error: updateError } = yield* Effect.tryPromise({
        try: async () => await supabase
          .from('messaging_channel_links')
          .update({
            external_user_id: getTelegramUserId(update),
            external_thread_id: chatId,
            username: getTelegramUsername(update),
            display_name: getTelegramDisplayName(update),
            status: 'active',
            link_token_hash: null,
            link_token_expires_at: null,
            linked_at: now,
            last_seen_at: now,
            metadata: {
              telegram_chat_id: chatId,
              telegram_user_id: getTelegramUserId(update),
            },
          })
          .eq('id', link.id)
          .select('*')
          .single(),
        catch: (error) => error,
      });

      if (updateError) {
        return yield* Effect.fail(new Error(updateError.message));
      }

      if (!activated) {
        return yield* Effect.fail(new Error('Failed to activate Telegram link'));
      }

      return {
        ok: true,
        link: activated,
        chatId,
        message: 'Telegram is connected. You can now message this bot to talk to your assistant.',
      };
    });
  }

  async activateTelegramLink(token: string, update: unknown): Promise<TelegramLinkActivationResult> {
    return Effect.runPromise(this.activateTelegramLinkEffect(token, update));
  }

  resolveTelegramIdentityEffect(update: unknown): Effect.Effect<TelegramIdentity | null, unknown> {
    const chatId = getTelegramChatId(update);
    if (!chatId) return Effect.succeed(null);

    return Effect.gen(function* () {
      const { data: link, error } = yield* Effect.tryPromise({
        try: async () => await supabase
          .from('messaging_channel_links')
          .select('organization_id, user_id')
          .eq('channel', 'telegram')
          .eq('status', 'active')
          .eq('external_thread_id', chatId)
          .maybeSingle(),
        catch: (error) => error,
      });

      if (error) {
        yield* Effect.fail(new Error(error.message));
      }

      if (!link) {
        return null;
      }

      yield* Effect.tryPromise({
        try: async () => await supabase
          .from('messaging_channel_links')
          .update({
            external_user_id: getTelegramUserId(update),
            username: getTelegramUsername(update),
            display_name: getTelegramDisplayName(update),
            last_seen_at: new Date().toISOString(),
          })
          .eq('channel', 'telegram')
          .eq('status', 'active')
          .eq('external_thread_id', chatId),
        catch: (error) => error,
      });

      return {
        organization_id: link.organization_id,
        user_id: link.user_id,
      };
    });
  }

  async resolveTelegramIdentity(update: unknown): Promise<TelegramIdentity | null> {
    return Effect.runPromise(this.resolveTelegramIdentityEffect(update));
  }

  sendTelegramTextEffect(chatId: string, text: string): Effect.Effect<void, unknown> {
    if (!config.TELEGRAM_BOT_TOKEN) {
      return Effect.fail(new Error('TELEGRAM_BOT_TOKEN_PROJECT_GOOGLE_ASSITANT is not configured'));
    }

    return Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: async () => await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
        }),
        catch: (error) => error,
      });

      if (!response.ok) {
        const data = yield* Effect.promise(async () => await response.json().catch(() => null) as { description?: string } | null);
        yield* Effect.fail(new Error(data?.description ?? response.statusText));
      }
    });
  }

  async sendTelegramText(chatId: string, text: string): Promise<void> {
    return Effect.runPromise(this.sendTelegramTextEffect(chatId, text));
  }

  private ensureTelegramWebhookReadyEffect(): Effect.Effect<void, unknown> {
    if (!config.TELEGRAM_BOT_TOKEN) {
      return Effect.fail(new Error('TELEGRAM_BOT_TOKEN_PROJECT_GOOGLE_ASSITANT is not configured'));
    }

    if (!config.TELEGRAM_WEBHOOK_SECRET) {
      return Effect.fail(new Error('TELEGRAM_WEBHOOK_SECRET_PROJECT_GOOGLE_ASSITANT is not configured'));
    }

    return Effect.gen(this, function* () {
      if (config.TELEGRAM_WEBHOOK_URL) {
        yield* this.callTelegramApiEffect<boolean>('setWebhook', {
          url: config.TELEGRAM_WEBHOOK_URL,
          secret_token: config.TELEGRAM_WEBHOOK_SECRET,
          allowed_updates: ['message', 'edited_message', 'callback_query'],
        });
        return;
      }

      const info = yield* this.callTelegramApiEffect<TelegramWebhookInfo>('getWebhookInfo');
      if (!info.url) {
        return yield* Effect.fail(new Error('Telegram webhook is not configured. Set TELEGRAM_WEBHOOK_URL_PROJECT_GOOGLE_ASSITANT to your public https://.../webhooks/telegram URL, or run Telegram setWebhook manually with secret_token matching TELEGRAM_WEBHOOK_SECRET_PROJECT_GOOGLE_ASSITANT.'));
      }

      const webhookUrl = info.url;
      if (normalizeWebhookUrl(webhookUrl).endsWith('/webhooks/telegram')) {
        return;
      }

      yield* Effect.fail(new Error(`Telegram webhook points to ${webhookUrl}, not this agent's /webhooks/telegram route. Set TELEGRAM_WEBHOOK_URL_PROJECT_GOOGLE_ASSITANT or update Telegram setWebhook.`));
    });
  }

  private callTelegramApiEffect<T>(method: string, body?: Record<string, unknown>): Effect.Effect<T, unknown> {
    return Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: async () => await fetch(telegramApiUrl(method), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        }),
        catch: (error) => error,
      });

      const payload = yield* Effect.promise(async () => await response.json().catch(() => null) as TelegramApiResponse<T> | null);
      if (!response.ok) {
        const description = payload && 'description' in payload ? payload.description : undefined;
        return yield* Effect.fail(new Error(description ?? response.statusText));
      }

      if (!payload?.ok) {
        const description = payload && 'description' in payload ? payload.description : undefined;
        return yield* Effect.fail(new Error(description ?? response.statusText));
      }

      return payload.result;
    });
  }
}

export const messagingChannelLinkService = new MessagingChannelLinkService();
