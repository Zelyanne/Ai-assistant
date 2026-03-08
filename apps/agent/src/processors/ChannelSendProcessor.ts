import { randomUUID } from 'crypto';
import {
  DeliveryEventEnvelope,
  OutboundChannelMessage,
  OutboundChannelMessageSchema,
  Task,
} from '@ai-assistant/shared';
import { ChannelAdapterRegistry, channelAdapterRegistry } from '../channels/ChannelAdapterRegistry.js';
import { channelRouter, ChannelRouterService } from '../services/channelRouter.js';
import { BaseProcessor } from './BaseProcessor.js';

type ChannelSendProcessorDeps = {
  registry?: ChannelAdapterRegistry;
  routerService?: ChannelRouterService;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureOutboundMessage(task: Task): OutboundChannelMessage {
  const payload = (task.payload ?? {}) as Record<string, unknown>;

  const channel = typeof payload.channel === 'string' ? payload.channel : 'web';
  const externalMessageId = typeof payload.external_message_id === 'string' && payload.external_message_id.length > 0
    ? payload.external_message_id
    : (task.id ? String(task.id) : `out-${randomUUID()}`);
  const threadId = typeof payload.thread_id === 'string' && payload.thread_id.length > 0
    ? payload.thread_id
    : `thread-${randomUUID()}`;
  const messageText = typeof payload.message_text === 'string' && payload.message_text.length > 0
    ? payload.message_text
    : '';
  const channelMetadata = (payload.channel_metadata && typeof payload.channel_metadata === 'object' && !Array.isArray(payload.channel_metadata))
    ? payload.channel_metadata as Record<string, unknown>
    : {};
  const providerPayload = (payload.provider_payload && typeof payload.provider_payload === 'object' && !Array.isArray(payload.provider_payload))
    ? payload.provider_payload as Record<string, unknown>
    : undefined;
  const correlationId = typeof payload.correlation_id === 'string' ? payload.correlation_id : undefined;

  return OutboundChannelMessageSchema.parse({
    channel,
    organization_id: task.organization_id,
    user_id: task.user_id ?? null,
    task_id: task.id,
    external_message_id: externalMessageId,
    thread_id: threadId,
    message_text: messageText,
    channel_metadata: channelMetadata,
    provider_payload: providerPayload,
    correlation_id: correlationId,
  });
}

export class ChannelSendProcessor extends BaseProcessor {
  private readonly registry: ChannelAdapterRegistry;
  private readonly routerService: ChannelRouterService;

  constructor(deps: ChannelSendProcessorDeps = {}) {
    super();
    this.registry = deps.registry ?? channelAdapterRegistry;
    this.routerService = deps.routerService ?? channelRouter;
  }

  async process(task: Task) {
    this.clearTrace();

    const outbound = ensureOutboundMessage(task);
    const adapter = this.registry.get(outbound.channel);
    const correlationId = outbound.correlation_id ?? randomUUID();

    // Idempotency guard: if this task already recorded a non-failed provider message id,
    // skip re-sending to avoid duplicate outbound sends on retries/replays.
    if (isRecord(task.result) && isRecord(task.result.channel_delivery)) {
      const delivery = task.result.channel_delivery as Record<string, unknown>;
      const deliveryState = delivery.delivery_state;
      const providerMessageId = delivery.provider_message_id;
      if ((deliveryState === 'sent' || deliveryState === 'queued' || deliveryState === 'delivered')
        && typeof providerMessageId === 'string' && providerMessageId.length > 0) {
        this.addTraceStep('channel_send_idempotent', `Skipping send; already has provider_message_id=${providerMessageId}`);
        return {
          summary: `Outbound ${outbound.channel} message already acknowledged`,
          delivery_state: deliveryState,
          provider_message_id: providerMessageId,
          correlation_id: typeof delivery.correlation_id === 'string' ? delivery.correlation_id : correlationId,
          trace: this.getTrace(),
        };
      }
    }

    const payload = (task.payload ?? {}) as Record<string, unknown>;
    const maxAttemptsRaw = payload.max_attempts;
    const maxAttempts = typeof maxAttemptsRaw === 'number' && Number.isFinite(maxAttemptsRaw)
      ? Math.max(1, Math.trunc(maxAttemptsRaw))
      : 3;

    this.addTraceStep('channel_send_start', `Starting outbound send via ${outbound.channel}`);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      this.addTraceStep('channel_send_attempt', `Attempt ${attempt}/${maxAttempts}`);

      const sendResult = await adapter.sendOutbound({
        ...outbound,
        correlation_id: correlationId,
      });

      const event: DeliveryEventEnvelope = {
        channel: outbound.channel,
        organization_id: outbound.organization_id,
        task_id: task.id,
        external_message_id: outbound.external_message_id,
        thread_id: outbound.thread_id,
        provider_message_id: sendResult.provider_message_id,
        delivery_state: sendResult.delivery_state,
        occurred_at: new Date().toISOString(),
        attempt_count: attempt,
        terminal: sendResult.terminal,
        error_code: sendResult.error_code,
        error_message: sendResult.error_message,
        channel_metadata: outbound.channel_metadata,
        raw_payload: {
          provider_response: sendResult.provider_response,
        },
        correlation_id: correlationId,
      };

      const mergedResult = await this.routerService.persistDeliveryEvent(event);
      if (mergedResult) {
        // Ensure graph finalization won't clobber delivery results.
        task.result = mergedResult as unknown as Record<string, unknown>;
      }

      if (sendResult.delivery_state !== 'failed') {
        this.addTraceStep('channel_send_success', `Outbound send acknowledged (${sendResult.delivery_state})`);
        return {
          summary: `Outbound ${outbound.channel} message ${sendResult.delivery_state}`,
          delivery_state: sendResult.delivery_state,
          provider_message_id: sendResult.provider_message_id,
          correlation_id: correlationId,
          trace: this.getTrace(),
        };
      }

      const retry = adapter.evaluateRetry({
        attempt_count: attempt,
        max_attempts: maxAttempts,
        error_message: sendResult.error_message,
      });

      if (!retry.should_retry || retry.terminal) {
        this.addTraceStep('channel_send_failed', 'Outbound send failed (terminal)');
        throw new Error(sendResult.error_message ?? 'channel_send_failed');
      }

      const delay = retry.next_delay_ms ?? 0;
      this.addTraceStep('channel_send_retry', `Retrying after ${delay}ms`);
      if (delay > 0) {
        await sleep(delay);
      }
    }

    throw new Error('channel_send_retry_budget_exhausted');
  }
}
