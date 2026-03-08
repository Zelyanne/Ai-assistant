import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
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

const WHATSAPP_SIGNATURE_HEADER = 'x-whatsapp-signature';
const TWILIO_SIGNATURE_HEADER = 'x-twilio-signature';

const WhatsAppWebhookSchema = z.object({
  organization_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  MessageSid: z.string().optional(),
  SmsMessageSid: z.string().optional(),
  SmsSid: z.string().optional(),
  Body: z.string().optional(),
  WaId: z.string().optional(),
  From: z.string().optional(),
  To: z.string().optional(),
  ProfileName: z.string().optional(),
  MessageStatus: z.string().optional(),
  SmsStatus: z.string().optional(),
  ErrorCode: z.string().optional(),
  ErrorMessage: z.string().optional(),
  thread_id: z.string().optional(),
  external_message_id: z.string().optional(),
  correlation_id: z.string().optional(),
  topic: z.string().optional(),
  domain_action: z.string().regex(/^[a-z]+\.[a-z]+$/).optional(),
});

interface WhatsAppAdapterOptions {
  webhook_signing_secret?: string;
}

function headerValue(headers: Record<string, string | string[] | undefined>, key: string): string | null {
  const value = headers[key] ?? headers[key.toLowerCase()];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return null;
}

function timingSafeCompare(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function twilioParamString(params: Record<string, unknown>): string {
  return Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key];
      if (Array.isArray(value)) {
        const sortedValues = [...value].map((entry) => String(entry)).sort();
        return sortedValues.map((entry) => `${key}${entry}`).join('');
      }

      if (value === null || typeof value === 'undefined') {
        return '';
      }

      return `${key}${String(value)}`;
    })
    .join('');
}

function expectedTwilioSignature(secret: string, requestPath: string, body: Record<string, unknown>): string {
  const toSign = `${requestPath}${twilioParamString(body)}`;
  return createHmac('sha1', secret).update(Buffer.from(toSign, 'utf-8')).digest('base64');
}

export class WhatsAppAdapter implements ChannelAdapter {
  readonly channel = 'whatsapp' as const;
  private readonly webhookSigningSecret?: string;

  constructor(options: WhatsAppAdapterOptions = {}) {
    this.webhookSigningSecret = options.webhook_signing_secret;
  }

  validateWebhook(input: WebhookValidationInput): WebhookValidationResult {
    if (!this.webhookSigningSecret) {
      return { valid: false, reason: 'whatsapp_webhook_secret_not_configured' };
    }

    const whatsappSignature = headerValue(input.headers, WHATSAPP_SIGNATURE_HEADER);
    if (whatsappSignature) {
      const expectedSignature = createHmac('sha256', this.webhookSigningSecret)
        .update(Buffer.from(input.rawBody, 'utf-8'))
        .digest('hex');

      if (timingSafeCompare(expectedSignature, whatsappSignature)) {
        return { valid: true };
      }

      return { valid: false, reason: 'whatsapp_signature_mismatch' };
    }

    const twilioSignature = headerValue(input.headers, TWILIO_SIGNATURE_HEADER);
    if (twilioSignature && input.requestPath && input.parsedBody && typeof input.parsedBody === 'object') {
      const expectedSignature = expectedTwilioSignature(
        this.webhookSigningSecret,
        input.requestPath,
        input.parsedBody as Record<string, unknown>,
      );

      if (timingSafeCompare(expectedSignature, twilioSignature)) {
        return { valid: true };
      }

      return { valid: false, reason: 'twilio_signature_mismatch' };
    }

    return { valid: false, reason: 'whatsapp_signature_header_missing' };
  }

  normalizeInbound(payload: unknown): NormalizedInboundEnvelope {
    const parsed = WhatsAppWebhookSchema.parse(payload);

    const externalMessageId = parsed.external_message_id
      ?? parsed.MessageSid
      ?? parsed.SmsMessageSid
      ?? parsed.SmsSid
      ?? `whatsapp-${randomUUID()}`;

    const threadId = parsed.thread_id
      ?? parsed.WaId
      ?? parsed.From
      ?? `whatsapp-thread-${randomUUID()}`;

    return NormalizedInboundEnvelopeSchema.parse({
      channel: this.channel,
      organization_id: parsed.organization_id,
      user_id: parsed.user_id ?? null,
      external_message_id: externalMessageId,
      thread_id: threadId,
      domain_action: parsed.domain_action ?? 'thread.action',
      topic: parsed.topic,
      message_text: parsed.Body,
      channel_metadata: {
        from: parsed.From,
        to: parsed.To,
        wa_id: parsed.WaId,
        profile_name: parsed.ProfileName,
      },
      raw_payload: parsed,
      correlation_id: parsed.correlation_id,
    });
  }

  async sendOutbound(message: OutboundChannelMessage): Promise<OutboundSendResult> {
    return {
      delivery_state: 'queued',
      provider_message_id: `whatsapp-${message.external_message_id}`,
      provider_response: {
        status: 'queued',
        channel: this.channel,
        status_callback_expected: true,
      },
      terminal: false,
    };
  }

  mapDeliveryEvent(payload: unknown): DeliveryEventEnvelope | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const parsed = WhatsAppWebhookSchema.parse(payload);
    const messageStatus = (parsed.MessageStatus ?? parsed.SmsStatus ?? '').toLowerCase();

    if (!messageStatus && !parsed.Body) {
      return null;
    }

    const deliveryState = messageStatus === 'sent'
      ? 'sent'
      : messageStatus === 'delivered' || messageStatus === 'read'
        ? 'delivered'
        : messageStatus === 'failed' || messageStatus === 'undelivered'
          ? 'failed'
          : 'queued';

    const terminal = deliveryState === 'failed' || deliveryState === 'delivered';

    return DeliveryEventEnvelopeSchema.parse({
      channel: this.channel,
      organization_id: parsed.organization_id,
      task_id: typeof (payload as Record<string, unknown>).task_id === 'string' ? (payload as Record<string, unknown>).task_id : undefined,
      external_message_id: parsed.MessageSid ?? parsed.SmsMessageSid ?? parsed.SmsSid ?? parsed.external_message_id ?? `whatsapp-${randomUUID()}`,
      thread_id: parsed.thread_id ?? parsed.WaId ?? parsed.From,
      provider_message_id: parsed.MessageSid ?? parsed.SmsSid,
      delivery_state: deliveryState,
      occurred_at: new Date().toISOString(),
      attempt_count: 1,
      terminal,
      error_code: parsed.ErrorCode,
      error_message: parsed.ErrorMessage,
      channel_metadata: {
        from: parsed.From,
        to: parsed.To,
        wa_id: parsed.WaId,
      },
      raw_payload: parsed,
      correlation_id: parsed.correlation_id,
    });
  }

  evaluateRetry(params: { attempt_count: number; max_attempts: number; error_message?: string }) {
    return evaluateBoundedRetryPolicy({
      attempt_count: params.attempt_count,
      max_attempts: params.max_attempts,
      error_message: params.error_message,
      base_delay_ms: 1_000,
      max_delay_ms: 60_000,
    });
  }
}
