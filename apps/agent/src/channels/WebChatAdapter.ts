import { createHash, randomUUID } from 'crypto';
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

const WebChatInboundSchema = z.object({
  organization_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  thread_id: z.string().min(1),
  external_message_id: z.string().min(1).optional(),
  message_text: z.string().optional(),
  domain_action: z.string().regex(/^[a-z]+\.[a-z]+$/).optional(),
  topic: z.string().optional(),
  correlation_id: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

function metadataIdentity(metadata: Record<string, unknown> | undefined): string | undefined {
  if (!metadata) return undefined;

  const candidates = [
    metadata.client_message_id,
    metadata.message_id,
    metadata.external_message_id,
    metadata.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return undefined;
}

function buildDeterministicFallbackMessageId(input: {
  threadId: string;
  messageText: string | undefined;
  correlationId: string | undefined;
  metadata: Record<string, unknown> | undefined;
}): string {
  const fingerprint = JSON.stringify({
    thread_id: input.threadId,
    message_text: input.messageText ?? null,
    correlation_id: input.correlationId ?? null,
    metadata_identity: metadataIdentity(input.metadata) ?? null,
  });
  const digest = createHash('sha256').update(fingerprint).digest('hex').slice(0, 24);
  return `web-${digest}`;
}

export class WebChatAdapter implements ChannelAdapter {
  readonly channel = 'web' as const;

  validateWebhook(_input: WebhookValidationInput): WebhookValidationResult {
    return { valid: true };
  }

  normalizeInbound(payload: unknown): NormalizedInboundEnvelope {
    const parsed = WebChatInboundSchema.parse(payload);
    const resolvedExternalMessageId = parsed.external_message_id
      ?? metadataIdentity(parsed.metadata)
      ?? buildDeterministicFallbackMessageId({
        threadId: parsed.thread_id,
        messageText: parsed.message_text,
        correlationId: parsed.correlation_id,
        metadata: parsed.metadata,
      });

    return NormalizedInboundEnvelopeSchema.parse({
      channel: this.channel,
      organization_id: parsed.organization_id,
      user_id: parsed.user_id ?? null,
      thread_id: parsed.thread_id,
      external_message_id: resolvedExternalMessageId,
      domain_action: parsed.domain_action ?? 'thread.action',
      topic: parsed.topic,
      message_text: parsed.message_text,
      channel_metadata: parsed.metadata ?? {},
      raw_payload: parsed,
      correlation_id: parsed.correlation_id,
    });
  }

  async sendOutbound(message: OutboundChannelMessage): Promise<OutboundSendResult> {
    return {
      delivery_state: 'sent',
      provider_message_id: `web-${message.external_message_id}`,
      provider_response: {
        channel: this.channel,
        thread_id: message.thread_id,
      },
      terminal: false,
    };
  }

  mapDeliveryEvent(payload: unknown): DeliveryEventEnvelope | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidate = payload as Record<string, unknown>;
    if (typeof candidate.organization_id !== 'string' || typeof candidate.thread_id !== 'string') {
      return null;
    }

    return DeliveryEventEnvelopeSchema.parse({
      channel: this.channel,
      organization_id: candidate.organization_id,
      task_id: candidate.task_id,
      external_message_id: typeof candidate.external_message_id === 'string' ? candidate.external_message_id : `web-${randomUUID()}`,
      thread_id: candidate.thread_id,
      provider_message_id: candidate.provider_message_id,
      delivery_state: candidate.delivery_state ?? 'delivered',
      occurred_at: candidate.occurred_at,
      attempt_count: candidate.attempt_count ?? 1,
      terminal: candidate.terminal ?? false,
      error_code: candidate.error_code,
      error_message: candidate.error_message,
      channel_metadata: candidate.channel_metadata ?? {},
      raw_payload: candidate,
      correlation_id: candidate.correlation_id,
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
