import { randomUUID } from 'crypto';
import {
  Channel,
  Database,
  DeliveryEventEnvelope,
  DeliveryEventEnvelopeSchema,
  Json,
  NormalizedInboundEnvelope,
  NormalizedInboundEnvelopeSchema,
  OutboundChannelMessage,
  OutboundChannelMessageSchema,
} from '@ai-assistant/shared';
import { ChannelAdapterRegistry, channelAdapterRegistry } from '../channels/ChannelAdapterRegistry.js';
import { supabase } from './supabase.js';
import { AuditLogger } from './AuditLogger.js';

type TasksInsert = Database['public']['Tables']['tasks']['Insert'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJson(value: unknown): Json {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toJson(entry));
  }

  if (isRecord(value)) {
    const out: Record<string, Json | undefined> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = toJson(entry);
    }
    return out;
  }

  return String(value);
}

function asRecordJson(value: unknown): Record<string, Json | undefined> {
  if (!isRecord(value)) {
    return {};
  }

  return toJson(value) as Record<string, Json | undefined>;
}

function mergeTaskResult(
  existingResult: unknown,
  event: DeliveryEventEnvelope,
): Record<string, Json | undefined> {
  const base = asRecordJson(existingResult);
  const currentHistoryRaw = base.channel_delivery_history;
  const currentHistory = Array.isArray(currentHistoryRaw) ? currentHistoryRaw : [];

  const transition: Record<string, Json | undefined> = {
    channel: event.channel,
    delivery_state: event.delivery_state,
    external_message_id: event.external_message_id,
    provider_message_id: event.provider_message_id,
    occurred_at: event.occurred_at ?? new Date().toISOString(),
    attempt_count: event.attempt_count,
    terminal: event.terminal,
    error_code: event.error_code,
    error_message: event.error_message,
    correlation_id: event.correlation_id,
  };

  const duplicate = currentHistory.some((entry) => {
    if (!isRecord(entry)) {
      return false;
    }

    return entry.delivery_state === transition.delivery_state
      && entry.provider_message_id === transition.provider_message_id
      && entry.external_message_id === transition.external_message_id;
  });

  const nextHistory = duplicate ? currentHistory : [...currentHistory, transition];

  const deliverySummary: Record<string, Json | undefined> = {
    channel: event.channel,
    delivery_state: event.delivery_state,
    external_message_id: event.external_message_id,
    provider_message_id: event.provider_message_id,
    attempt_count: event.attempt_count,
    terminal: event.terminal,
    error_code: event.error_code,
    error_message: event.error_message,
    correlation_id: event.correlation_id,
    channel_metadata: toJson(event.channel_metadata),
  };

  const merged: Record<string, Json | undefined> = {
    ...base,
    channel_delivery: deliverySummary,
    channel_delivery_history: nextHistory.map((entry) => toJson(entry)),
    external_message_id: event.external_message_id,
    provider_message_id: event.provider_message_id,
    correlation_id: event.correlation_id ?? base.correlation_id,
    channel_metadata: toJson(event.channel_metadata),
  };

  if (event.delivery_state === 'failed' && event.terminal) {
    merged.terminal_failure = {
      error_code: event.error_code,
      error_message: event.error_message,
      occurred_at: event.occurred_at ?? new Date().toISOString(),
      attempt_count: event.attempt_count,
    };
  }

  return merged;
}

export interface EnqueueInboundResult {
  task_id: string;
  correlation_id: string;
  envelope: NormalizedInboundEnvelope;
}

export interface EnqueueOutboundResult {
  task_id: string;
  correlation_id: string;
  message: OutboundChannelMessage;
}

export interface DeliveryEventResult {
  accepted: boolean;
  persisted: boolean;
  reason?: string;
  event?: DeliveryEventEnvelope;
}

interface ChannelRouterDeps {
  registry: ChannelAdapterRegistry;
  supabaseClient: typeof supabase;
}

export class ChannelRouterService {
  private readonly registry: ChannelAdapterRegistry;
  private readonly supabaseClient: typeof supabase;

  constructor(deps: ChannelRouterDeps) {
    this.registry = deps.registry;
    this.supabaseClient = deps.supabaseClient;
  }

  async enqueueInbound(channel: Channel, payload: unknown): Promise<EnqueueInboundResult> {
    const adapter = this.registry.get(channel);
    const normalized = NormalizedInboundEnvelopeSchema.parse(adapter.normalizeInbound(payload));
    const correlationId = normalized.correlation_id ?? randomUUID();

    const taskInsert: TasksInsert = {
      organization_id: normalized.organization_id,
      user_id: normalized.user_id ?? null,
      domain_action: normalized.domain_action,
      status: 'queued',
      topic: normalized.topic ?? null,
      payload: {
        channel: normalized.channel,
        external_message_id: normalized.external_message_id,
        thread_id: normalized.thread_id,
        organization_id: normalized.organization_id,
        user_id: normalized.user_id ?? null,
        message_text: normalized.message_text,
        correlation_id: correlationId,
        channel_metadata: normalized.channel_metadata,
        raw_payload: normalized.raw_payload,
      },
      result: {
        channel_delivery: {
          channel: normalized.channel,
          delivery_state: 'queued',
          external_message_id: normalized.external_message_id,
          correlation_id: correlationId,
        },
      },
    };

    const { data, error } = await this.supabaseClient
      .from('tasks')
      .insert(taskInsert)
      .select('id')
      .single();

    if (error || !data?.id) {
      throw new Error(error?.message ?? 'Failed to enqueue channel task');
    }

    await AuditLogger.flush(
      normalized.organization_id,
      data.id,
      'channel-router',
      'channel_inbound_enqueued',
      [
        AuditLogger.createStep('Channel Inbound', `Queued ${channel} message for ${normalized.domain_action}`, {
          input_summary: `external_message_id=${normalized.external_message_id}; thread_id=${normalized.thread_id}`,
          output_summary: `task_id=${data.id}; correlation_id=${correlationId}`,
        }),
      ],
      [
        AuditLogger.createCitation(
          'channel_message',
          normalized.external_message_id,
          `Inbound ${channel} message enqueued`,
        ),
      ],
    );

    return {
      task_id: data.id,
      correlation_id: correlationId,
      envelope: {
        ...normalized,
        correlation_id: correlationId,
      },
    };
  }

  async enqueueOutbound(message: OutboundChannelMessage): Promise<EnqueueOutboundResult> {
    const normalized = OutboundChannelMessageSchema.parse(message);
    const correlationId = normalized.correlation_id ?? randomUUID();

    const taskInsert: TasksInsert = {
      organization_id: normalized.organization_id,
      user_id: normalized.user_id ?? null,
      domain_action: 'channel.send',
      status: 'queued',
      topic: null,
      payload: {
        channel: normalized.channel,
        external_message_id: normalized.external_message_id,
        thread_id: normalized.thread_id,
        organization_id: normalized.organization_id,
        user_id: normalized.user_id ?? null,
        message_text: normalized.message_text,
        correlation_id: correlationId,
        channel_metadata: normalized.channel_metadata,
        provider_payload: normalized.provider_payload,
      },
      result: {
        channel_delivery: {
          channel: normalized.channel,
          delivery_state: 'queued',
          external_message_id: normalized.external_message_id,
          correlation_id: correlationId,
        },
      },
    };

    const { data, error } = await this.supabaseClient
      .from('tasks')
      .insert(taskInsert)
      .select('id')
      .single();

    if (error || !data?.id) {
      throw new Error(error?.message ?? 'Failed to enqueue outbound channel task');
    }

    await AuditLogger.flush(
      normalized.organization_id,
      data.id,
      'channel-router',
      'channel_outbound_enqueued',
      [
        AuditLogger.createStep('Channel Outbound', `Queued outbound ${normalized.channel} message`, {
          input_summary: `external_message_id=${normalized.external_message_id}; thread_id=${normalized.thread_id}`,
          output_summary: `task_id=${data.id}; correlation_id=${correlationId}`,
        }),
      ],
      [
        AuditLogger.createCitation(
          'channel_message',
          normalized.external_message_id,
          `Outbound ${normalized.channel} message enqueued`,
        ),
      ],
    );

    return {
      task_id: data.id,
      correlation_id: correlationId,
      message: {
        ...normalized,
        task_id: normalized.task_id ?? data.id,
        correlation_id: correlationId,
      },
    };
  }

  async handleDeliveryEvent(channel: Channel, payload: unknown): Promise<DeliveryEventResult> {
    const adapter = this.registry.get(channel);
    const mapped = adapter.mapDeliveryEvent(payload);

    if (!mapped) {
      return {
        accepted: false,
        persisted: false,
        reason: 'event_not_recognized',
      };
    }

    const event = DeliveryEventEnvelopeSchema.parse(mapped);
    if (!event.task_id) {
      return {
        accepted: true,
        persisted: false,
        reason: 'event_without_task_id',
        event,
      };
    }

    await this.persistDeliveryEvent(event);

    return {
      accepted: true,
      persisted: true,
      event,
    };
  }

  async persistDeliveryEvent(event: DeliveryEventEnvelope): Promise<Record<string, Json | undefined> | null> {
    if (!event.task_id) {
      return null;
    }

    const { data: currentTask, error: selectError } = await this.supabaseClient
      .from('tasks')
      .select('result')
      .eq('id', event.task_id)
      .single();

    if (selectError) {
      throw new Error(selectError.message);
    }

    const mergedResult = mergeTaskResult(currentTask?.result, event);

    const { error: updateError } = await this.supabaseClient
      .from('tasks')
      .update({
        result: mergedResult,
        updated_at: new Date().toISOString(),
      })
      .eq('id', event.task_id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await AuditLogger.flush(
      event.organization_id,
      event.task_id,
      'channel-router',
      'channel_delivery_update',
      [
        AuditLogger.createStep('Channel Delivery', `Delivery state updated: ${event.delivery_state}`, {
          input_summary: `channel=${event.channel}; external_message_id=${event.external_message_id}`,
          output_summary: `terminal=${event.terminal}; attempt=${event.attempt_count}`,
        }),
      ],
      [
        AuditLogger.createCitation(
          'channel_delivery',
          event.provider_message_id ?? event.external_message_id,
          `${event.channel} delivery transition ${event.delivery_state}`,
        ),
      ],
    );

    return mergedResult;
  }

  evaluateRetry(channel: Channel, params: { attempt_count: number; max_attempts: number; error_message?: string }) {
    const adapter = this.registry.get(channel);
    return adapter.evaluateRetry(params);
  }
}

export const channelRouter = new ChannelRouterService({
  registry: channelAdapterRegistry,
  supabaseClient: supabase,
});
