import { randomUUID, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import {
  DeliveryEventEnvelope,
  DeliveryEventEnvelopeSchema,
  NormalizedInboundEnvelope,
  NormalizedInboundEnvelopeSchema,
  OutboundChannelMessage,
} from '@ai-assistant/shared';
import { ChannelAdapter, OutboundSendResult, WebhookValidationInput, WebhookValidationResult } from './ChannelAdapter.js';
import { evaluateBoundedRetryPolicy } from './retryPolicy.js';

const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

const TelegramUpdateSchema = z.object({
  update_id: z.number().int().optional(),
  message: z
    .object({
      message_id: z.number().int().optional(),
      text: z.string().optional(),
      chat: z
        .object({
          id: z.union([z.string(), z.number()]),
        })
        .optional(),
      from: z
        .object({
          id: z.union([z.string(), z.number()]).optional(),
          username: z.string().optional(),
          first_name: z.string().optional(),
          last_name: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  edited_message: z
    .object({
      message_id: z.number().int().optional(),
      text: z.string().optional(),
      chat: z
        .object({
          id: z.union([z.string(), z.number()]),
        })
        .optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string().optional(),
      message: z
        .object({
          message_id: z.number().int().optional(),
          chat: z
            .object({
              id: z.union([z.string(), z.number()]),
            })
            .optional(),
        })
        .optional(),
      data: z.string().optional(),
    })
    .optional(),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  external_message_id: z.string().optional(),
  thread_id: z.string().optional(),
  topic: z.string().optional(),
  domain_action: z.string().regex(/^[a-z]+\.[a-z]+$/).optional(),
  correlation_id: z.string().optional(),
});

interface TelegramAdapterOptions {
  bot_token?: string;
  webhook_secret_token?: string;
}

function asHeaderValue(headers: Record<string, string | string[] | undefined>, key: string): string | null {
  const value = headers[key] ?? headers[key.toLowerCase()];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export class TelegramAdapter implements ChannelAdapter {
  readonly channel = 'telegram' as const;
  private readonly botToken?: string;
  private readonly webhookSecretToken?: string;

  constructor(options: TelegramAdapterOptions = {}) {
    this.botToken = options.bot_token;
    this.webhookSecretToken = options.webhook_secret_token;
  }

  validateWebhook(input: WebhookValidationInput): WebhookValidationResult {
    if (!this.webhookSecretToken) {
      return { valid: false, reason: 'telegram_webhook_secret_not_configured' };
    }

    const headerValue = asHeaderValue(input.headers, TELEGRAM_SECRET_HEADER);
    if (!headerValue) {
      return { valid: false, reason: 'telegram_secret_header_missing' };
    }

    if (!safeEqual(this.webhookSecretToken, headerValue)) {
      return { valid: false, reason: 'telegram_secret_token_mismatch' };
    }

    return { valid: true };
  }

  normalizeInbound(payload: unknown): NormalizedInboundEnvelope {
    const parsed = TelegramUpdateSchema.parse(payload);

    // Extract chat ID from various update types
    const chatId = parsed.message?.chat?.id
      ?? parsed.edited_message?.chat?.id
      ?? parsed.callback_query?.message?.chat?.id;

    const threadId = parsed.thread_id
      ?? (chatId != null ? String(chatId) : undefined)
      ?? `telegram-thread-${randomUUID()}`;

    // Extract message ID from various update types
    const messageId = parsed.message?.message_id
      ?? parsed.edited_message?.message_id
      ?? parsed.callback_query?.message?.message_id;

    const externalMessageId = parsed.external_message_id
      ?? (messageId != null ? String(messageId) : undefined)
      ?? (parsed.update_id != null ? String(parsed.update_id) : undefined)
      ?? `telegram-${randomUUID()}`;

    const messageText = parsed.message?.text
      ?? parsed.edited_message?.text
      ?? parsed.callback_query?.data;

    return NormalizedInboundEnvelopeSchema.parse({
      channel: this.channel,
      organization_id: parsed.organization_id,
      user_id: parsed.user_id ?? null,
      thread_id: threadId,
      external_message_id: externalMessageId,
      domain_action: parsed.domain_action ?? 'thread.action',
      topic: parsed.topic,
      message_text: messageText,
      channel_metadata: {
        telegram_update_id: parsed.update_id,
        telegram_chat_id: chatId != null ? String(chatId) : undefined,
        telegram_from_id: parsed.message?.from?.id != null ? String(parsed.message.from.id) : undefined,
        telegram_username: parsed.message?.from?.username,
        telegram_first_name: parsed.message?.from?.first_name,
        telegram_last_name: parsed.message?.from?.last_name,
        telegram_callback_data: parsed.callback_query?.data,
      },
      raw_payload: parsed,
      correlation_id: parsed.correlation_id,
    });
  }

  async sendOutbound(message: OutboundChannelMessage): Promise<OutboundSendResult> {
    if (!this.botToken) {
      return {
        delivery_state: 'failed',
        error_message: 'telegram_bot_token_not_configured',
        provider_response: { acknowledged: false },
        terminal: true,
      };
    }

    const chatId = message.thread_id;
    const text = message.message_text;

    const executeSend = async (): Promise<OutboundSendResult> => {
      try {
        const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: text,
          }),
        });

        const data = (await response.json()) as any;

        if (!response.ok) {
          const isTerminal =
            response.status === 400 || // Bad Request
            response.status === 401 || // Unauthorized
            response.status === 403 || // Forbidden
            response.status === 404; // Not Found

          return {
            delivery_state: 'failed',
            error_code: String(response.status),
            error_message: data.description || response.statusText,
            provider_response: data,
            terminal: isTerminal,
          };
        }

        return {
          delivery_state: 'sent',
          provider_message_id: data.result?.message_id ? String(data.result.message_id) : undefined,
          provider_response: data,
          terminal: false,
        };
      } catch (error) {
        return {
          delivery_state: 'failed',
          error_message: error instanceof Error ? error.message : String(error),
          provider_response: { error: String(error) },
          terminal: false,
        };
      }
    };

    // Internal retry loop for transient errors
    let lastResult: OutboundSendResult | null = null;
    const maxInternalAttempts = 3;

    for (let attempt = 1; attempt <= maxInternalAttempts; attempt++) {
      lastResult = await executeSend();
      
      if (lastResult.delivery_state !== 'failed' || lastResult.terminal) {
        return lastResult;
      }

      const retry = this.evaluateRetry({
        attempt_count: attempt,
        max_attempts: maxInternalAttempts,
        error_message: lastResult.error_message,
      });

      if (!retry.should_retry || retry.terminal) {
        break;
      }

      if (retry.next_delay_ms) {
        await new Promise(resolve => setTimeout(resolve, retry.next_delay_ms!));
      }
    }

    return lastResult!;
  }

  mapDeliveryEvent(payload: unknown): DeliveryEventEnvelope | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidate = payload as Record<string, unknown>;
    if (typeof candidate.organization_id !== 'string') {
      return null;
    }

    const externalMessageId = typeof candidate.external_message_id === 'string'
      ? candidate.external_message_id
      : typeof candidate.update_id === 'number'
        ? String(candidate.update_id)
        : `telegram-${randomUUID()}`;

    const failure = typeof candidate.error_code === 'number' || typeof candidate.error_message === 'string';

    return DeliveryEventEnvelopeSchema.parse({
      channel: this.channel,
      organization_id: candidate.organization_id,
      task_id: candidate.task_id,
      external_message_id: externalMessageId,
      thread_id: typeof candidate.thread_id === 'string' ? candidate.thread_id : undefined,
      provider_message_id: typeof candidate.provider_message_id === 'string' ? candidate.provider_message_id : undefined,
      delivery_state: failure ? 'failed' : 'sent',
      occurred_at: typeof candidate.occurred_at === 'string' ? candidate.occurred_at : undefined,
      attempt_count: typeof candidate.attempt_count === 'number' ? candidate.attempt_count : 1,
      terminal: failure,
      error_code: typeof candidate.error_code === 'number' ? String(candidate.error_code) : undefined,
      error_message: typeof candidate.error_message === 'string' ? candidate.error_message : undefined,
      channel_metadata: {
        telegram_update_id: typeof candidate.update_id === 'number' ? candidate.update_id : undefined,
      },
      raw_payload: candidate,
      correlation_id: typeof candidate.correlation_id === 'string' ? candidate.correlation_id : undefined,
    });
  }

  evaluateRetry(params: { attempt_count: number; max_attempts: number; error_message?: string }) {
    return evaluateBoundedRetryPolicy({
      attempt_count: params.attempt_count,
      max_attempts: params.max_attempts,
      error_message: params.error_message,
    });
  }
}
