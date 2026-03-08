import {
  Channel,
  DeliveryEventEnvelope,
  DeliveryRetryDecision,
  OutboundChannelMessage,
  NormalizedInboundEnvelope,
} from '@ai-assistant/shared';

export interface WebhookValidationInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  parsedBody: unknown;
  requestPath?: string;
}

export interface WebhookValidationResult {
  valid: boolean;
  reason?: string;
}

export interface OutboundSendResult {
  delivery_state: 'queued' | 'sent' | 'failed';
  provider_message_id?: string;
  provider_response: Record<string, unknown>;
  terminal: boolean;
  error_code?: string;
  error_message?: string;
}

export interface ChannelAdapter {
  readonly channel: Channel;

  validateWebhook(input: WebhookValidationInput): WebhookValidationResult;

  normalizeInbound(payload: unknown): NormalizedInboundEnvelope;

  sendOutbound(message: OutboundChannelMessage): Promise<OutboundSendResult>;

  mapDeliveryEvent(payload: unknown): DeliveryEventEnvelope | null;

  evaluateRetry(params: {
    attempt_count: number;
    max_attempts: number;
    error_message?: string;
  }): DeliveryRetryDecision;
}
