import { type Citation, type Task, type ContextReference } from '@ai-assistant/shared';
import { BaseProcessor, type ProcessorResult } from './BaseProcessor.js';
import { AuditLogger } from '../services/AuditLogger.js';

function extractContextReferences(text: string): ContextReference[] {
  const refs: ContextReference[] = [];
  const docSheetRegex = /https:\/\/docs\.google\.com\/(?:document|spreadsheets)\/d\/([a-zA-Z0-9-_]+)[^\s]*/g;
  let match;
  while ((match = docSheetRegex.exec(text)) !== null) {
    refs.push({ url: match[0], file_id: match[1] });
  }
  return refs;
}

type SupportedDelegationAction =
  | 'thread.action'
  | 'email.draft'
  | 'email.send'
  | 'calendar.create'
  | 'channel.send';

type DelegationPlan = {
  delegated_domain_action: SupportedDelegationAction;
  delegated_payload: Record<string, unknown>;
  summary: string;
  trace: ReturnType<BaseProcessor['getTrace']>;
  citations: Citation[];
};

type AssistantCommandPayload = {
  command?: unknown;
  command_text?: unknown;
  high_risk?: unknown;
  confirmed?: unknown;
  target_domain_action?: unknown;
  target_payload?: unknown;
  action_payload?: unknown;
  conversation_id?: unknown;
  conversation_context?: unknown;
  source_message_id?: unknown;
  channel?: unknown;
  correlation_id?: unknown;
  thread_id?: unknown;
  source_type?: unknown;
  source_id?: unknown;
  to?: unknown;
  recipient?: unknown;
  subject?: unknown;
  body?: unknown;
  start_time?: unknown;
  startTime?: unknown;
  end_time?: unknown;
  endTime?: unknown;
  summary?: unknown;
  message_text?: unknown;
  channel_metadata?: unknown;
};

const SUPPORTED_ACTIONS: ReadonlySet<string> = new Set([
  'thread.action',
  'email.draft',
  'email.send',
  'calendar.create',
  'channel.send',
  'system.analyze',
]);

const HIGH_RISK_ACTIONS: ReadonlySet<string> = new Set([
  'email.send',
  'channel.send',
]);

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isConfirmed(payload: AssistantCommandPayload): boolean {
  return payload.confirmed === true;
}

function isHighRisk(payload: AssistantCommandPayload): boolean {
  return payload.high_risk === true;
}

function requiresConfirmation(action: SupportedDelegationAction): boolean {
  return HIGH_RISK_ACTIONS.has(action);
}

function normalizeRecipient(payload: AssistantCommandPayload): string | null {
  return asString(payload.recipient) ?? asString(payload.to);
}

function resolveCommandText(payload: AssistantCommandPayload): string {
  const command = asString(payload.command);
  const commandText = asString(payload.command_text);
  return command ?? commandText ?? '';
}

function resolveExplicitAction(payload: AssistantCommandPayload): SupportedDelegationAction | null {
  const raw = asString(payload.target_domain_action);
  if (!raw) return null;
  return SUPPORTED_ACTIONS.has(raw) ? (raw as SupportedDelegationAction) : null;
}

function buildCitations(task: Task, payload: AssistantCommandPayload, commandText: string): Citation[] {
  const citations: Citation[] = [
    AuditLogger.createCitation(
      'command',
      task.id ? String(task.id) : 'assistant.command',
      `Command received: ${commandText.substring(0, 120)}`,
    ),
  ];

  const conversationId = asString(payload.conversation_id);
  if (conversationId) {
    citations.push(AuditLogger.createCitation('command_conversation', conversationId, 'Command conversation context'));
  }

  const sourceMessageId = asString(payload.source_message_id);
  if (sourceMessageId) {
    citations.push(AuditLogger.createCitation('command_message', sourceMessageId, 'Origin command message'));
  }

  const correlationId = asString(payload.correlation_id);
  if (correlationId) {
    citations.push(AuditLogger.createCitation('correlation', correlationId, 'Command correlation id'));
  }

  return citations;
}

export class AssistantCommandProcessor extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    this.clearTrace();

    const payload = asRecord(task.payload) as AssistantCommandPayload;
    const commandText = resolveCommandText(payload);

    if (!commandText) {
      throw new Error('COMMAND_INVALID: Missing command text.');
    }

    const confirmed = isConfirmed(payload);

    if (isHighRisk(payload) && !confirmed) {
      throw new Error('CONFIRMATION_REQUIRED: High-risk command requires explicit confirmation.');
    }

    const citations = buildCitations(task, payload, commandText);

    const extractedRefs = extractContextReferences(commandText);
    const existingRefs = (payload as any).context_references as ContextReference[] | undefined;
    const context_references = [...(existingRefs || []), ...extractedRefs];

    const explicitAction = resolveExplicitAction(payload);
    if (explicitAction) {
      if (requiresConfirmation(explicitAction) && !confirmed) {
        throw new Error('CONFIRMATION_REQUIRED: High-risk delegated action requires explicit confirmation.');
      }

      const explicitPayload = asRecord(payload.target_payload);
      const delegatedPayload = Object.keys(explicitPayload).length > 0
        ? explicitPayload
        : asRecord(payload.action_payload);

      const meta = {
        conversation_id: asString(payload.conversation_id),
        source_message_id: asString(payload.source_message_id),
        correlation_id: asString(payload.correlation_id),
        command_text: commandText,
        conversation_context: payload.conversation_context,
        context_references: context_references.length > 0 ? context_references : undefined,
      };

      this.addTraceStep('command_intent_parse', `Mapped command to ${explicitAction}`, 0.98);

      return {
        delegated_domain_action: explicitAction,
        delegated_payload: {
          ...delegatedPayload,
          ...meta,
        },
        summary: `Mapped command to ${explicitAction}`,
        trace: this.getTrace(),
        citations,
      } satisfies DelegationPlan;
    }

    const commandLower = commandText.toLowerCase();

    const threadId = asString(payload.thread_id);
    const sourceType = asString(payload.source_type);
    const sourceId = asString(payload.source_id);
    const hasThreadContext = Boolean(threadId || (sourceType === 'thread' && sourceId));

    if (hasThreadContext && /\b(thread|follow\s*up|reply)\b/.test(commandLower)) {
      this.addTraceStep('command_intent_parse', 'Mapped command to thread.action', 0.9);
      return {
        delegated_domain_action: 'thread.action',
        delegated_payload: {
          source_type: sourceType ?? (sourceId ? 'thread' : undefined),
          source_id: sourceId,
          thread_id: threadId,
          command_text: commandText,
          conversation_id: asString(payload.conversation_id),
          source_message_id: asString(payload.source_message_id),
          correlation_id: asString(payload.correlation_id),
          channel: asString(payload.channel) ?? 'web',
          conversation_context: payload.conversation_context,
          context_references: context_references.length > 0 ? context_references : undefined,
        },
        summary: 'Mapped command to thread.action',
        trace: this.getTrace(),
        citations,
      } satisfies DelegationPlan;
    }

    if (/\b(calendar|schedule|meeting|invite)\b/.test(commandLower)) {
      const summary = asString(payload.summary);
      const startTime = asString(payload.startTime) ?? asString(payload.start_time);
      const endTime = asString(payload.endTime) ?? asString(payload.end_time);

      if (!summary || !startTime || !endTime) {
        throw new Error('COMMAND_AMBIGUOUS: Calendar command missing summary/start/end payload fields.');
      }

      this.addTraceStep('command_intent_parse', 'Mapped command to calendar.create', 0.85);
      return {
        delegated_domain_action: 'calendar.create',
        delegated_payload: {
          summary,
          startTime,
          endTime,
          conversation_id: asString(payload.conversation_id),
          source_message_id: asString(payload.source_message_id),
          correlation_id: asString(payload.correlation_id),
          conversation_context: payload.conversation_context,
          context_references: context_references.length > 0 ? context_references : undefined,
        },
        summary: 'Mapped command to calendar.create',
        trace: this.getTrace(),
        citations,
      } satisfies DelegationPlan;
    }

    if (/\b(send)\b/.test(commandLower) && /\b(email|mail)\b/.test(commandLower)) {
      if (!confirmed) {
        throw new Error('CONFIRMATION_REQUIRED: Email send requires explicit confirmation.');
      }

      const recipient = normalizeRecipient(payload);
      const subject = asString(payload.subject);
      const body = asString(payload.body);

      if (!recipient || !subject || !body) {
        throw new Error('COMMAND_AMBIGUOUS: Email send command missing recipient/subject/body payload fields.');
      }

      this.addTraceStep('command_intent_parse', 'Mapped command to email.send', 0.84);
      return {
        delegated_domain_action: 'email.send',
        delegated_payload: {
          to: recipient,
          subject,
          body,
          source_task_id: task.id,
          conversation_id: asString(payload.conversation_id),
          source_message_id: asString(payload.source_message_id),
          correlation_id: asString(payload.correlation_id),
          conversation_context: payload.conversation_context,
          context_references: context_references.length > 0 ? context_references : undefined,
        },
        summary: 'Mapped command to email.send',
        trace: this.getTrace(),
        citations,
      } satisfies DelegationPlan;
    }

    if (/\b(draft|compose|write)\b/.test(commandLower) && /\b(email|mail|reply)\b/.test(commandLower)) {
      const recipient = normalizeRecipient(payload);
      const subject = asString(payload.subject);
      const body = asString(payload.body);

      if (!recipient || !subject || !body) {
        throw new Error('COMMAND_AMBIGUOUS: Email draft command missing recipient/subject/body payload fields.');
      }

      this.addTraceStep('command_intent_parse', 'Mapped command to email.draft', 0.84);
      return {
        delegated_domain_action: 'email.draft',
        delegated_payload: {
          recipient,
          subject,
          body,
          conversation_id: asString(payload.conversation_id),
          source_message_id: asString(payload.source_message_id),
          correlation_id: asString(payload.correlation_id),
          conversation_context: payload.conversation_context,
          context_references: context_references.length > 0 ? context_references : undefined,
        },
        summary: 'Mapped command to email.draft',
        trace: this.getTrace(),
        citations,
      } satisfies DelegationPlan;
    }

    if (/\b(message|notify|telegram|whatsapp|channel)\b/.test(commandLower)) {
      if (!confirmed) {
        throw new Error('CONFIRMATION_REQUIRED: Channel send requires explicit confirmation.');
      }

      const channel = asString(payload.channel) ?? 'web';
      const messageText = asString(payload.message_text) ?? commandText;

      this.addTraceStep('command_intent_parse', 'Mapped command to channel.send', 0.75);
      return {
        delegated_domain_action: 'channel.send',
        delegated_payload: {
          channel,
          message_text: messageText,
          thread_id: asString(payload.thread_id),
          correlation_id: asString(payload.correlation_id),
          channel_metadata: asRecord(payload.channel_metadata),
          conversation_id: asString(payload.conversation_id),
          source_message_id: asString(payload.source_message_id),
          conversation_context: payload.conversation_context,
          context_references: context_references.length > 0 ? context_references : undefined,
        },
        summary: 'Mapped command to channel.send',
        trace: this.getTrace(),
        citations,
      } satisfies DelegationPlan;
    }

    throw new Error('COMMAND_AMBIGUOUS: Unable to map command to a supported domain action.');
  }
}
