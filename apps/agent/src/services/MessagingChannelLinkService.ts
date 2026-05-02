import { createHash, randomBytes } from 'crypto';
import type { Database } from '@ai-assistant/shared';
import { config } from '../config/index.js';
import { supabase } from './supabase.js';

type MessagingChannelLinkRow = Database['public']['Tables']['messaging_channel_links']['Row'];

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

export class MessagingChannelLinkService {
  async createTelegramLinkToken(params: { organizationId: string; userId: string }): Promise<{ token: string; deepLink: string; expiresAt: string }> {
    if (!config.TELEGRAM_BOT_USERNAME) {
      throw new Error('TELEGRAM_BOT_USERNAME is not configured');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const tokenHash = hashToken(token);

    await supabase
      .from('messaging_channel_links')
      .update({
        status: 'revoked',
        link_token_hash: null,
        link_token_expires_at: null,
      })
      .eq('organization_id', params.organizationId)
      .eq('user_id', params.userId)
      .eq('channel', 'telegram')
      .eq('status', 'pending');

    const { error } = await supabase
      .from('messaging_channel_links')
      .insert({
        organization_id: params.organizationId,
        user_id: params.userId,
        channel: 'telegram',
        status: 'pending',
        link_token_hash: tokenHash,
        link_token_expires_at: expiresAt,
      });

    if (error) {
      throw new Error(error.message);
    }

    return {
      token,
      deepLink: `https://t.me/${config.TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(token)}`,
      expiresAt,
    };
  }

  async activateTelegramLink(token: string, update: unknown): Promise<TelegramLinkActivationResult> {
    const chatId = getTelegramChatId(update);
    if (!chatId) {
      return { ok: false, chatId: null, message: 'Telegram chat could not be identified.' };
    }

    const tokenHash = hashToken(token);
    const { data: link, error } = await supabase
      .from('messaging_channel_links')
      .select('*')
      .eq('channel', 'telegram')
      .eq('status', 'pending')
      .eq('link_token_hash', tokenHash)
      .gt('link_token_expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!link) {
      return { ok: false, chatId, message: 'This Telegram link has expired or is invalid. Generate a new link from Settings.' };
    }

    await supabase
      .from('messaging_channel_links')
      .update({ status: 'revoked' })
      .eq('channel', 'telegram')
      .eq('status', 'active')
      .or(`and(organization_id.eq.${link.organization_id},user_id.eq.${link.user_id}),external_thread_id.eq.${chatId}`);

    const now = new Date().toISOString();
    const { data: activated, error: updateError } = await supabase
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
      .single();

    if (updateError || !activated) {
      throw new Error(updateError?.message ?? 'Failed to activate Telegram link');
    }

    return {
      ok: true,
      link: activated,
      chatId,
      message: 'Telegram is connected. You can now message this bot to talk to your assistant.',
    };
  }

  async resolveTelegramIdentity(update: unknown): Promise<TelegramIdentity | null> {
    const chatId = getTelegramChatId(update);
    if (!chatId) return null;

    const { data: link, error } = await supabase
      .from('messaging_channel_links')
      .select('organization_id, user_id')
      .eq('channel', 'telegram')
      .eq('status', 'active')
      .eq('external_thread_id', chatId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!link) {
      return null;
    }

    await supabase
      .from('messaging_channel_links')
      .update({
        external_user_id: getTelegramUserId(update),
        username: getTelegramUsername(update),
        display_name: getTelegramDisplayName(update),
        last_seen_at: new Date().toISOString(),
      })
      .eq('channel', 'telegram')
      .eq('status', 'active')
      .eq('external_thread_id', chatId);

    return {
      organization_id: link.organization_id,
      user_id: link.user_id,
    };
  }

  async sendTelegramText(chatId: string, text: string): Promise<void> {
    if (!config.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }

    const response = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null) as { description?: string } | null;
      throw new Error(data?.description ?? response.statusText);
    }
  }
}

export const messagingChannelLinkService = new MessagingChannelLinkService();
