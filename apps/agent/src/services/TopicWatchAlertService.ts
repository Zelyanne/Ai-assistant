import type { Database, EmailTriageClassification } from '@ai-assistant/shared';
import { supabase } from './supabase.js';

type Json = Database['public']['Tables']['tasks']['Insert']['payload'];

export interface TopicWatchAlertThread {
  id: string;
  subject: string | null;
  metadata: Record<string, unknown> | null;
  summary: string | null;
  summary_json: Record<string, unknown> | null;
}

export interface TopicWatchAlertInput {
  organizationId: string;
  userId: string | null;
  sourceTaskId: string | null;
  thread: TopicWatchAlertThread;
  classification: EmailTriageClassification;
}

export interface TopicWatchAlertResult {
  alerted: boolean;
  webMessageCreated: boolean;
  telegramTaskQueued: boolean;
  reason: string | null;
  alertText: string | null;
}

type ConversationIdRow = { id: string };
type TelegramLinkRow = { external_thread_id: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function metadataSender(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  return asString(metadata.from)
    ?? asString(metadata.from_email)
    ?? asString(metadata.sender)
    ?? asString(metadata.sender_email);
}

function summaryFromThread(thread: TopicWatchAlertThread): string {
  const summaryJson = isRecord(thread.summary_json) ? thread.summary_json : {};
  const metadata = isRecord(thread.metadata) ? thread.metadata : {};
  const candidate = asString(thread.summary)
    ?? asString(summaryJson.summary)
    ?? asString(summaryJson.context)
    ?? asString(summaryJson.snippet)
    ?? asString(metadata.snippet)
    ?? asString(thread.subject)
    ?? 'A watched email matched this topic.';

  return truncate(candidate, 180);
}

function normalizeCorrelationPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function buildCorrelationId(threadId: string, topics: string[]): string {
  const topicPart = topics.map(normalizeCorrelationPart).filter(Boolean).join('-') || 'topic';
  return truncate(`topic-watch:${threadId}:${topicPart}`, 180);
}

function buildMetadata(input: TopicWatchAlertInput, topics: string[]): Json {
  return {
    source: 'topic-watch-alert',
    alert_type: 'topic_watch',
    thread_id: input.thread.id,
    topics,
    source_task_id: input.sourceTaskId,
    suggested_actions: ['draft reply', 'summarize thread', 'remind me later', 'ignore'],
  };
}

export class TopicWatchAlertService {
  buildAlertText(thread: TopicWatchAlertThread, classification: EmailTriageClassification): string | null {
    if (!classification.is_highlighted || classification.matches.length === 0) {
      return null;
    }

    const primaryMatch = classification.matches[0];
    if (!primaryMatch) {
      return null;
    }

    const sender = metadataSender(thread.metadata) ?? 'the sender';
    const topic = truncate(primaryMatch.topic, 80);
    const summary = summaryFromThread(thread);

    return `I found a new ${topic}-related email from ${sender}: ${summary}. Want me to draft a reply, summarize the full thread, remind you later, or ignore it?`;
  }

  async alertForMatchedThread(input: TopicWatchAlertInput): Promise<TopicWatchAlertResult> {
    const alertText = this.buildAlertText(input.thread, input.classification);
    if (!alertText) {
      return {
        alerted: false,
        webMessageCreated: false,
        telegramTaskQueued: false,
        reason: 'not_highlighted_or_no_matches',
        alertText: null,
      };
    }

    const topics = input.classification.matches.map((match) => match.topic);
    const correlationId = buildCorrelationId(input.thread.id, topics);
    const hasTelegramLink = await this.hasActiveTelegramLink(input);
    const webAlertText = hasTelegramLink
      ? alertText
      : `${alertText} Telegram is not linked yet; connect Telegram in Settings > Social Integrations to receive these alerts there too.`;
    const webMessageCreated = await this.createWebAlertMessage(input, webAlertText, correlationId, topics);
    const telegramTaskQueued = await this.enqueueTelegramAlert(input, alertText, `${correlationId}:telegram`, topics);

    return {
      alerted: webMessageCreated || telegramTaskQueued,
      webMessageCreated,
      telegramTaskQueued,
      reason: webMessageCreated || telegramTaskQueued ? null : 'no_usable_alert_channel',
      alertText: webAlertText,
    };
  }

  private async hasActiveTelegramLink(input: TopicWatchAlertInput): Promise<boolean> {
    if (!input.userId) {
      return false;
    }

    const linkResult = await supabase
      .from('messaging_channel_links')
      .select('external_thread_id')
      .eq('organization_id', input.organizationId)
      .eq('user_id', input.userId)
      .eq('channel', 'telegram')
      .eq('status', 'active')
      .maybeSingle();

    if (linkResult.error) {
      return false;
    }

    const link = linkResult.data as TelegramLinkRow | null;
    return Boolean(link?.external_thread_id);
  }

  private async createWebAlertMessage(
    input: TopicWatchAlertInput,
    alertText: string,
    correlationId: string,
    topics: string[],
  ): Promise<boolean> {
    if (!input.userId) {
      return false;
    }

    const existing = await supabase
      .from('command_messages')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('correlation_id', correlationId)
      .maybeSingle();

    if (existing.error) {
      return false;
    }

    if (existing.data?.id) {
      return false;
    }

    const conversationId = await this.ensureWebConversation(input.organizationId, input.userId);
    if (!conversationId) {
      return false;
    }

    const inserted = await supabase.from('command_messages').insert({
      organization_id: input.organizationId,
      conversation_id: conversationId,
      role: 'assistant',
      content: alertText,
      state: 'done',
      channel: 'web',
      thread_id: input.thread.id,
      source_task_id: input.sourceTaskId,
      correlation_id: correlationId,
      metadata: buildMetadata(input, topics),
    });

    return !inserted.error;
  }

  private async ensureWebConversation(organizationId: string, userId: string): Promise<string | null> {
    const existing = await supabase
      .from('command_conversations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('created_by', userId)
      .eq('channel', 'web')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existing.error && (existing.data as ConversationIdRow | null)?.id) {
      return (existing.data as ConversationIdRow).id;
    }

    const inserted = await supabase
      .from('command_conversations')
      .insert({
        organization_id: organizationId,
        created_by: userId,
        channel: 'web',
        title: 'Assistant',
        metadata: { source: 'topic-watch-alert' },
      })
      .select('id')
      .single();

    if (inserted.error || !(inserted.data as ConversationIdRow | null)?.id) {
      return null;
    }

    return (inserted.data as ConversationIdRow).id;
  }

  private async enqueueTelegramAlert(
    input: TopicWatchAlertInput,
    alertText: string,
    correlationId: string,
    topics: string[],
  ): Promise<boolean> {
    if (!input.userId) {
      return false;
    }

    const linkResult = await supabase
      .from('messaging_channel_links')
      .select('external_thread_id')
      .eq('organization_id', input.organizationId)
      .eq('user_id', input.userId)
      .eq('channel', 'telegram')
      .eq('status', 'active')
      .maybeSingle();

    if (linkResult.error) {
      return false;
    }

    const link = linkResult.data as TelegramLinkRow | null;
    if (!link?.external_thread_id) {
      return false;
    }

    const existing = await supabase
      .from('tasks')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('domain_action', 'channel.send')
      .eq('payload->>correlation_id', correlationId)
      .maybeSingle();

    if (existing.error || existing.data?.id) {
      return false;
    }

    const inserted = await supabase.from('tasks').insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      domain_action: 'channel.send',
      status: 'queued',
      topic: topics[0] ?? 'Watch Topic',
      payload: {
        channel: 'telegram',
        thread_id: link.external_thread_id,
        external_message_id: `topic-watch-${input.thread.id}`,
        message_text: alertText,
        channel_metadata: buildMetadata(input, topics),
        correlation_id: correlationId,
      },
    });

    return !inserted.error;
  }
}

export const topicWatchAlertService = new TopicWatchAlertService();
