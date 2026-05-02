import type { Database, Task } from '@ai-assistant/shared';

import { supabase } from './supabase.js';
import { LLMProviderFactory } from './llm/factory.js';

type CommandMessageRow = Database['public']['Tables']['command_messages']['Row'];
type CommandConversationRow = Database['public']['Tables']['command_conversations']['Row'];
type TaskRow = Database['public']['Tables']['tasks']['Row'];
type TaskUpdate = Database['public']['Tables']['tasks']['Update'];

type ConversationRole = 'user' | 'assistant' | 'system';

export type ConversationContextEntry = {
  role: ConversationRole;
  content: string;
  state?: string;
  created_at: string;
  task_id?: string;
  correlation_id?: string;
  thread_id?: string;
  metadata?: Record<string, unknown>;
};

const MAX_CONTEXT_MESSAGES = 40;
const RECENT_VERBATIM_MESSAGES = 18;
const COMPRESSION_CHAR_THRESHOLD = 16_000;
const SUMMARY_TARGET_CHARS = 3_500;
const CHANNEL_CONTEXT_ACTIONS = ['assistant.command', 'channel.send'] as const;
const CHANNEL_CONTEXT_SOURCES = new Set(['telegram-webhook', 'whatsapp-webhook', 'web-webhook', 'dashboard-command-center']);
const CHANNEL_CONTEXT_CHANNELS = new Set(['telegram', 'whatsapp', 'web']);

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asConversationRole(value: unknown): ConversationRole | null {
  if (value === 'user' || value === 'assistant' || value === 'system') {
    return value;
  }

  return null;
}

function readConversationSummary(payload: unknown): string | null {
  const record = asRecord(payload);
  return asString(record.conversation_summary)
    ?? asString(record.compressed_conversation_summary)
    ?? asString(record.rolling_conversation_summary);
}

function readExistingConversationContext(payload: unknown): ConversationContextEntry[] {
  const record = asRecord(payload);
  const raw = record.conversation_context;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      const entryRecord = asRecord(entry);
      const role = asConversationRole(entryRecord.role);
      const content = asString(entryRecord.content);
      const createdAt = asString(entryRecord.created_at) ?? asString(entryRecord.createdAt) ?? new Date().toISOString();
      if (!role || !content) {
        return null;
      }

      const metadata = asRecord(entryRecord.metadata);
      return {
        role,
        content,
        created_at: createdAt,
        ...(asString(entryRecord.state) ? { state: asString(entryRecord.state)! } : {}),
        ...(asString(entryRecord.task_id) ? { task_id: asString(entryRecord.task_id)! } : {}),
        ...(asString(entryRecord.correlation_id) ? { correlation_id: asString(entryRecord.correlation_id)! } : {}),
        ...(asString(entryRecord.thread_id) ? { thread_id: asString(entryRecord.thread_id)! } : {}),
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      } satisfies ConversationContextEntry;
    })
    .filter((entry): entry is ConversationContextEntry => Boolean(entry));
}

function toContextEntry(row: Pick<CommandMessageRow, 'role' | 'content' | 'state' | 'created_at' | 'source_task_id' | 'correlation_id'>): ConversationContextEntry | null {
  const role = asConversationRole(row.role);
  const content = asString(row.content);
  const createdAt = asString(row.created_at);

  if (!role || !content || !createdAt) {
    return null;
  }

  const state = asString(row.state);
  const taskId = asString(row.source_task_id);
  const correlationId = asString(row.correlation_id);

  return {
    role,
    content,
    created_at: createdAt,
    ...(state ? { state } : {}),
    ...(taskId ? { task_id: taskId } : {}),
    ...(correlationId ? { correlation_id: correlationId } : {}),
  };
}

function readAssistantCommandText(payload: Record<string, unknown>): string | null {
  return asString(payload.message_text)
    ?? asString(payload.command_text)
    ?? asString(payload.command);
}

function toTaskContextEntry(row: Pick<TaskRow, 'id' | 'domain_action' | 'status' | 'payload' | 'created_at'>): ConversationContextEntry | null {
  const payload = asRecord(row.payload);
  const createdAt = asString(row.created_at);

  if (!createdAt) {
    return null;
  }

  const taskId = asString(row.id);
  const correlationId = asString(payload.correlation_id);
  const state = asString(row.status);

  if (row.domain_action === 'assistant.command') {
    const content = readAssistantCommandText(payload);
    if (!content) {
      return null;
    }

    return {
      role: 'user',
      content,
      created_at: createdAt,
      ...(state ? { state } : {}),
      ...(taskId ? { task_id: taskId } : {}),
      ...(correlationId ? { correlation_id: correlationId } : {}),
    };
  }

  if (row.domain_action === 'channel.send') {
    const content = asString(payload.message_text);
    if (!content) {
      return null;
    }

    return {
      role: 'assistant',
      content,
      created_at: createdAt,
      ...(state ? { state } : {}),
      ...(taskId ? { task_id: taskId } : {}),
      ...(correlationId ? { correlation_id: correlationId } : {}),
    };
  }

  return null;
}

function contextCharLength(entries: ConversationContextEntry[]): number {
  return entries.reduce((total, entry) => total + entry.content.length, 0);
}

function formatContextEntry(entry: ConversationContextEntry): string {
  const state = entry.state ? ` (${entry.state})` : '';
  const thread = entry.thread_id ? ` [thread:${entry.thread_id}]` : '';
  return `${entry.role.toUpperCase()}${state}${thread}: ${entry.content}`;
}

function fallbackCompressContext(existingSummary: string | null, olderEntries: ConversationContextEntry[]): string {
  const sections = [
    existingSummary ? `Previous summary:\n${existingSummary}` : null,
    'Recent older turns:',
    olderEntries.slice(-12).map(formatContextEntry).join('\n'),
  ].filter((section): section is string => Boolean(section));

  const summary = sections.join('\n\n').trim();
  return summary.length > SUMMARY_TARGET_CHARS
    ? `${summary.slice(0, SUMMARY_TARGET_CHARS - 3)}...`
    : summary;
}

async function compressConversationContext(
  existingSummary: string | null,
  olderEntries: ConversationContextEntry[],
): Promise<string> {
  if (olderEntries.length === 0) {
    return existingSummary ?? '';
  }

  const prompt = [
    'Compress this assistant conversation history into a durable rolling session summary.',
    `Target ${SUMMARY_TARGET_CHARS} characters or fewer. Preserve unresolved tasks, user preferences, named people, dates, pending confirmations, important file/email/thread IDs, and topic-watch context.`,
    'Do not include full email bodies. Keep only facts needed to continue the conversation.',
    '',
    existingSummary ? `EXISTING SUMMARY:\n${existingSummary}` : 'EXISTING SUMMARY: none',
    '',
    'OLDER TURNS:',
    olderEntries.map(formatContextEntry).join('\n'),
  ].join('\n');

  try {
    const provider = LLMProviderFactory.getProvider();
    const result = await provider.generateText(prompt, {
      temperature: 0,
      maxTokens: 900,
    });
    const compressed = result.data.trim();
    if (compressed.length > 0) {
      return compressed.length > SUMMARY_TARGET_CHARS
        ? `${compressed.slice(0, SUMMARY_TARGET_CHARS - 3)}...`
        : compressed;
    }
  } catch (error) {
    console.warn('[CommandConversationContextService] Conversation compression failed; using deterministic fallback.', error);
  }

  return fallbackCompressContext(existingSummary, olderEntries);
}

async function persistCurrentTaskConversationContext(
  task: Task,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!task.id) {
    return;
  }

  const values: TaskUpdate = {
    payload: payload as TaskUpdate['payload'],
  };

  const { error } = await supabase
    .from('tasks')
    .update(values)
    .eq('id', task.id)
    .eq('organization_id', task.organization_id);

  if (error) {
    console.warn('[CommandConversationContextService] Failed to persist compacted conversation context.', error);
  }
}

export class CommandConversationContextService {
  private async hydrateCommandCenterConversationContext(task: Task): Promise<Task> {
    if (task.topic !== 'Command Center') {
      return task;
    }

    const payload = asRecord(task.payload);
    const conversationId = asString(payload.conversation_id);
    if (!conversationId) {
      return task;
    }

    const userId = typeof task.user_id === 'string' ? task.user_id : null;

    const { data: conversation, error: conversationError } = await supabase
      .from('command_conversations')
      .select('id, organization_id, created_by')
      .eq('id', conversationId)
      .eq('organization_id', task.organization_id)
      .maybeSingle();

    if (conversationError || !conversation) {
      return task;
    }

    const createdBy = (conversation as Pick<CommandConversationRow, 'created_by'>).created_by;
    if (createdBy && (!userId || createdBy !== userId)) {
      return task;
    }

    const { data: rows, error: rowsError } = await supabase
      .from('command_messages')
      .select('role, content, state, created_at, source_task_id, correlation_id')
      .eq('conversation_id', conversationId)
      .eq('organization_id', task.organization_id)
      .order('created_at', { ascending: false })
      .limit(MAX_CONTEXT_MESSAGES);

    if (rowsError || !rows) {
      return task;
    }

    const context = (rows as Array<Pick<CommandMessageRow, 'role' | 'content' | 'state' | 'created_at' | 'source_task_id' | 'correlation_id'>>)
      .slice()
      .reverse()
      .map((row) => toContextEntry(row))
      .filter((entry): entry is ConversationContextEntry => Boolean(entry));

    return {
      ...task,
      payload: {
        ...payload,
        conversation_context: context,
      },
    };
  }

  private async hydrateChannelThreadConversationContext(task: Task): Promise<Task> {
    if (task.domain_action !== 'assistant.command') {
      return task;
    }

    const payload = asRecord(task.payload);
    const source = asString(payload.source);
    const channel = asString(payload.channel);
    const threadId = asString(payload.thread_id);
    const userId = asString(task.user_id);
    const userInitiated = payload.user_initiated === true || source === 'dashboard-command-center';

    if (!channel || !threadId || !userId || !userInitiated) {
      return task;
    }

    if (!CHANNEL_CONTEXT_CHANNELS.has(channel)) {
      return task;
    }

    if (source && !CHANNEL_CONTEXT_SOURCES.has(source)) {
      return task;
    }

    let query = supabase
      .from('tasks')
      .select('id, domain_action, status, payload, created_at')
      .eq('organization_id', task.organization_id)
      .eq('user_id', userId)
      .eq('payload->>channel', channel)
      .eq('payload->>thread_id', threadId)
      .in('domain_action', [...CHANNEL_CONTEXT_ACTIONS])
      .order('created_at', { ascending: false })
      .limit(MAX_CONTEXT_MESSAGES + 1);

    if (task.id) {
      query = query.neq('id', task.id);
    }

    const { data: rows, error } = await query;
    if (error || !rows) {
      return task;
    }

    const rowSlice = (rows as Array<Pick<TaskRow, 'id' | 'domain_action' | 'status' | 'payload' | 'created_at'>>)
      .slice(0, MAX_CONTEXT_MESSAGES);
    const context = rowSlice
      .slice()
      .reverse()
      .map((row) => toTaskContextEntry(row))
      .filter((entry): entry is ConversationContextEntry => Boolean(entry));

    const existingContext = readExistingConversationContext(payload);
    const mergedContext = [...context, ...existingContext];

    if (mergedContext.length === 0) {
      return task;
    }

    const latestSummary = rowSlice
      .map((row) => readConversationSummary(row.payload))
      .find((summary): summary is string => Boolean(summary))
      ?? readConversationSummary(payload);

    const shouldCompress = contextCharLength(mergedContext) > COMPRESSION_CHAR_THRESHOLD;
    const recentContext = shouldCompress
      ? mergedContext.slice(-RECENT_VERBATIM_MESSAGES)
      : mergedContext;
    const olderContext = shouldCompress
      ? mergedContext.slice(0, Math.max(0, mergedContext.length - RECENT_VERBATIM_MESSAGES))
      : [];
    const compressedSummary = shouldCompress
      ? await compressConversationContext(latestSummary, olderContext)
      : latestSummary;
    const finalContext = compressedSummary
      ? [
          {
            role: 'system' as const,
            content: `Rolling conversation summary: ${compressedSummary}`,
            created_at: new Date().toISOString(),
            state: 'compressed',
          },
          ...recentContext,
        ]
      : recentContext;

    const nextPayload = {
      ...payload,
      conversation_context: finalContext,
      ...(compressedSummary ? { conversation_summary: compressedSummary } : {}),
      ...(shouldCompress ? { conversation_summary_updated_at: new Date().toISOString() } : {}),
    };

    if (shouldCompress || existingContext.length > 0) {
      await persistCurrentTaskConversationContext(task, nextPayload);
    }

    return {
      ...task,
      payload: nextPayload,
    };
  }

  async hydrateTaskConversationContext(task: Task): Promise<Task> {
    const commandCenterHydrated = await this.hydrateCommandCenterConversationContext(task);
    if (commandCenterHydrated !== task) {
      return commandCenterHydrated;
    }

    return this.hydrateChannelThreadConversationContext(task);
  }
}

export const commandConversationContextService = new CommandConversationContextService();
