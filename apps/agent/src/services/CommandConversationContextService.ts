import type { Database, Task } from '@ai-assistant/shared';

import { supabase } from './supabase.js';

type CommandMessageRow = Database['public']['Tables']['command_messages']['Row'];
type CommandConversationRow = Database['public']['Tables']['command_conversations']['Row'];
type TaskRow = Database['public']['Tables']['tasks']['Row'];

type ConversationRole = 'user' | 'assistant' | 'system';

export type ConversationContextEntry = {
  role: ConversationRole;
  content: string;
  state?: string;
  created_at: string;
  task_id?: string;
  correlation_id?: string;
};

const MAX_CONTEXT_MESSAGES = 40;
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

    const context = (rows as Array<Pick<TaskRow, 'id' | 'domain_action' | 'status' | 'payload' | 'created_at'>>)
      .slice(0, MAX_CONTEXT_MESSAGES)
      .reverse()
      .map((row) => toTaskContextEntry(row))
      .filter((entry): entry is ConversationContextEntry => Boolean(entry));

    if (context.length === 0) {
      return task;
    }

    return {
      ...task,
      payload: {
        ...payload,
        conversation_context: context,
      },
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
