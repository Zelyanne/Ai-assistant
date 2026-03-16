import {
  type AssistantCommandIntent,
  type AssistantCommandIntentStep,
  type Citation,
  type ContextReference,
  type Task,
} from '@ai-assistant/shared';
import { BaseProcessor, type ProcessorResult } from './BaseProcessor.js';
import { AuditLogger } from '../services/AuditLogger.js';

function extractContextReferences(text: string): ContextReference[] {
  const refs: ContextReference[] = [];
  const docSheetRegex = /https:\/\/docs\.google\.com\/(?:document|spreadsheets)\/d\/([a-zA-Z0-9-_]+)[^\s]*/g;
  let match: RegExpExecArray | null;

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
  | 'channel.send'
  | 'system.analyze';

type AssistantCommandPayload = {
  command?: unknown;
  command_text?: unknown;
  high_risk?: unknown;
  confirmed?: unknown;
  source?: unknown;
  user_initiated?: unknown;
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
  approved_by?: unknown;
  approved_at?: unknown;
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
  context_references?: unknown;
  source_task_id?: unknown;
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asContextReferences(value: unknown): ContextReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }

    const url = asString((entry as { url?: unknown }).url);
    const fileId = asString((entry as { file_id?: unknown }).file_id);
    return url && fileId ? [{ url, file_id: fileId }] : [];
  });
}

function isConfirmed(payload: AssistantCommandPayload): boolean {
  return payload.confirmed === true;
}

function isTrustedUserInitiatedCommand(task: Task, payload: AssistantCommandPayload): boolean {
  const channel = asString(payload.channel);
  const source = asString(payload.source);

  if (channel === 'web') {
    return task.topic === 'Command Center' && source === 'dashboard-command-center';
  }

  if (payload.user_initiated !== true) {
    return false;
  }

  if (channel === 'telegram') {
    return source === 'telegram-webhook';
  }

  if (channel === 'whatsapp') {
    return source === 'whatsapp-webhook';
  }

  return false;
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

function extractEmailAddressFromText(text: string): string | null {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ?? null;
}

function extractEmailBodyFromText(text: string): string | null {
  const patterns = [
    /(?:ou\s+tu\s+lui\s+dis|lui\s+dis|say(?:ing)?|to\s+say|write|body:?|message:?|r[ée]dige|[ée]cris)\s+["'“”]?(.+?)["'“”]?\s*$/i,
    /(?:that\s+says|qui\s+dit)\s+["'“”]?(.+?)["'“”]?\s*$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function buildSendApprovalFields(
  task: Task,
  ...sources: Array<Record<string, unknown> | AssistantCommandPayload>
): Record<string, string> {
  const approvedBy = sources
    .map((source) => asString(source.approved_by))
    .find((value): value is string => Boolean(value))
    ?? (typeof task.user_id === 'string' ? task.user_id : null);
  const approvedAt = sources
    .map((source) => asString(source.approved_at))
    .find((value): value is string => Boolean(value));
  const sourceTaskId = sources
    .map((source) => asString(source.source_task_id))
    .find((value): value is string => Boolean(value))
    ?? (typeof task.id === 'string' ? task.id : null);

  const fields: Record<string, string> = {};

  if (approvedBy) {
    fields.approved_by = approvedBy;
    fields.approved_at = approvedAt ?? new Date().toISOString();
  }

  if (sourceTaskId) {
    fields.source_task_id = sourceTaskId;
  }

  return fields;
}

function resolveCommandText(payload: AssistantCommandPayload): string {
  const command = asString(payload.command);
  const commandText = asString(payload.command_text);
  const messageText = asString(payload.message_text);
  return command ?? commandText ?? messageText ?? '';
}

function resolveExplicitAction(payload: AssistantCommandPayload): SupportedDelegationAction | null {
  const raw = asString(payload.target_domain_action);
  if (!raw) {
    return null;
  }

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
    citations.push(
      AuditLogger.createCitation('command_conversation', conversationId, 'Command conversation context'),
    );
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

function getDefaultRequestedTools(step: {
  worker_type: AssistantCommandIntentStep['worker_type'];
  action: string;
}): string[] {
  if (step.worker_type === 'gmail') {
    return step.action === 'send_email' ? ['send_gmail_message'] : ['draft_gmail_message'];
  }

  if (step.worker_type === 'calendar') {
    return ['manage_event', 'query_freebusy'];
  }

  if (step.worker_type === 'drive') {
    return ['get_drive_file_content'];
  }

  if (step.worker_type === 'docs') {
    return ['create_doc'];
  }

  if (step.worker_type === 'sheets') {
    return ['modify_sheet_values'];
  }

  if (step.worker_type === 'slides') {
    return ['create_presentation'];
  }

  return [];
}

function makePlanStep(
  index: number,
  input: Partial<AssistantCommandIntentStep> & Pick<AssistantCommandIntentStep, 'worker_type' | 'action' | 'title'>,
): AssistantCommandIntentStep {
  return {
    key: input.key ?? `step-${index + 1}`,
    title: input.title,
    worker_type: input.worker_type,
    action: input.action,
    requested_tools:
      input.requested_tools && input.requested_tools.length > 0
        ? input.requested_tools
        : getDefaultRequestedTools(input),
    input: input.input ?? {},
    idempotency_key:
      input.idempotency_key ?? `${input.worker_type}-${input.action}-${index + 1}`,
    recoverable: input.recoverable ?? false,
  };
}

function buildPlannerIntent(
  commandText: string,
  payload: AssistantCommandPayload,
  contextReferences: ContextReference[],
  requestedSteps: AssistantCommandIntentStep[],
  summary: string,
): AssistantCommandIntent {
  return {
    original_command: commandText,
    summary,
    mode: requestedSteps.length > 1 ? 'multi_step' : 'single_step',
    requested_steps: requestedSteps,
    high_risk: isHighRisk(payload),
    confirmed: isConfirmed(payload),
    context_references: contextReferences,
    conversation_id: asString(payload.conversation_id) ?? undefined,
    source_message_id: asString(payload.source_message_id) ?? undefined,
    correlation_id: asString(payload.correlation_id) ?? undefined,
    conversation_context: payload.conversation_context,
  };
}

function buildExplicitPlan(
  task: Task,
  explicitAction: SupportedDelegationAction,
  payload: AssistantCommandPayload,
  commandText: string,
  contextReferences: ContextReference[],
): AssistantCommandIntent | null {
  const explicitPayload = asRecord(payload.target_payload);
  const actionPayload = asRecord(payload.action_payload);
  const mergedPayload =
    Object.keys(explicitPayload).length > 0 ? explicitPayload : actionPayload;

  const planOverride = Array.isArray(mergedPayload.plan_steps)
    ? mergedPayload.plan_steps
    : Array.isArray(actionPayload.plan_steps)
      ? actionPayload.plan_steps
      : null;

  if (planOverride) {
    const steps = planOverride.map((entry, index) => {
      const record = asRecord(entry);
      return makePlanStep(index, {
        key: asString(record.key) ?? undefined,
        title: asString(record.title) ?? `Worker step ${index + 1}`,
        worker_type: (asString(record.worker_type) as AssistantCommandIntentStep['worker_type']) ?? 'gmail',
        action: asString(record.action) ?? 'draft_email',
        requested_tools: Array.isArray(record.requested_tools)
          ? record.requested_tools.filter((tool): tool is string => typeof tool === 'string')
          : undefined,
        input: asRecord(record.input),
        idempotency_key: asString(record.idempotency_key) ?? undefined,
        recoverable: record.recoverable === true,
      });
    });

    return buildPlannerIntent(
      commandText,
      payload,
      contextReferences,
      steps,
      `Planned ${steps.length} workspace capability step${steps.length === 1 ? '' : 's'}`,
    );
  }

  if (explicitAction === 'email.draft' || explicitAction === 'email.send') {
    const recipient = normalizeRecipient({ ...payload, ...mergedPayload });
    const subject = asString(mergedPayload.subject) ?? asString(payload.subject);
    const body = asString(mergedPayload.body) ?? asString(payload.body);

    if (!recipient || !subject || !body) {
      throw new Error(`COMMAND_AMBIGUOUS: ${explicitAction} command missing recipient/subject/body payload fields.`);
    }

    const step = makePlanStep(0, {
      worker_type: 'gmail',
      action: explicitAction === 'email.send' ? 'send_email' : 'draft_email',
      title: explicitAction === 'email.send' ? 'Send Gmail message' : 'Draft Gmail message',
      input: {
        to: recipient,
        recipient,
        subject,
        body,
        ...(explicitAction === 'email.send'
          ? buildSendApprovalFields(task, payload, mergedPayload)
          : {}),
        body_format: asString(mergedPayload.body_format) ?? 'plain',
      },
      recoverable: explicitAction === 'email.send',
    });

    return buildPlannerIntent(
      commandText,
      payload,
      contextReferences,
      [step],
      explicitAction === 'email.send' ? 'Plan Gmail send worker' : 'Plan Gmail draft worker',
    );
  }

  if (explicitAction === 'calendar.create') {
    const summary = asString(mergedPayload.summary) ?? asString(payload.summary);
    const startTime = asString(mergedPayload.startTime) ?? asString(mergedPayload.start_time) ?? asString(payload.startTime) ?? asString(payload.start_time);
    const endTime = asString(mergedPayload.endTime) ?? asString(mergedPayload.end_time) ?? asString(payload.endTime) ?? asString(payload.end_time);

    if (!summary || !startTime || !endTime) {
      throw new Error('COMMAND_AMBIGUOUS: Calendar command missing summary/start/end payload fields.');
    }

    const step = makePlanStep(0, {
      worker_type: 'calendar',
      action: 'create_event',
      title: 'Create calendar event',
      input: {
        summary,
        startTime,
        endTime,
        description: asString(mergedPayload.description),
        location: asString(mergedPayload.location),
      },
    });

    return buildPlannerIntent(
      commandText,
      payload,
      contextReferences,
      [step],
      'Plan Calendar capability worker',
    );
  }

  return null;
}

function inferWorkspacePlan(
  task: Task,
  payload: AssistantCommandPayload,
  commandText: string,
  contextReferences: ContextReference[],
): AssistantCommandIntent | null {
  const commandLower = commandText.toLowerCase();
  const steps: AssistantCommandIntentStep[] = [];

  const wantsEmail = /\b(email|mail)\b/.test(commandLower);
  const wantsDraft = /\b(draft|compose|write|r[ée]dige|[ée]cris)\b/.test(commandLower);
  const wantsSend = /\b(send|envoie|envoyer)\b/.test(commandLower) && wantsEmail;
  const wantsCalendar = /\b(calendar|schedule|meeting|invite)\b/.test(commandLower);
  const wantsDoc = /\b(doc|document|google doc)\b/.test(commandLower);
  const wantsSheet = /\b(sheet|spreadsheet)\b/.test(commandLower);
  const wantsSlide = /\b(slide|deck|presentation)\b/.test(commandLower);
  const wantsDrive = contextReferences.length > 0 || /\b(drive|file)\b/.test(commandLower);

  let sourceStepKey: string | null = null;

  if (wantsDrive) {
    const driveStep = makePlanStep(steps.length, {
      worker_type: 'drive',
      action: 'read_drive_context',
      title: 'Read Drive source context',
      input: {
        context_references: contextReferences,
      },
      requested_tools: ['get_drive_file_content'],
      recoverable: true,
    });
    sourceStepKey = driveStep.key;
    steps.push(driveStep);
  }

  if (wantsDoc) {
    const docsStep = makePlanStep(steps.length, {
      worker_type: 'docs',
      action: 'create_document',
      title: 'Create Google Doc artifact',
      input: {
        title: asString(payload.subject) ?? 'Planner-generated document',
        source_step_key: sourceStepKey,
      },
      requested_tools: ['create_doc'],
      recoverable: true,
    });
    sourceStepKey = docsStep.key;
    steps.push(docsStep);
  }

  if (wantsSheet) {
    const sheetsStep = makePlanStep(steps.length, {
      worker_type: 'sheets',
      action: 'update_sheet',
      title: 'Update Google Sheet artifact',
      input: {
        source_step_key: sourceStepKey,
      },
      requested_tools: ['modify_sheet_values'],
      recoverable: true,
    });
    sourceStepKey = sheetsStep.key;
    steps.push(sheetsStep);
  }

  if (wantsSlide) {
    const slidesStep = makePlanStep(steps.length, {
      worker_type: 'slides',
      action: 'create_presentation',
      title: 'Create Google Slides artifact',
      input: {
        source_step_key: sourceStepKey,
      },
      requested_tools: ['create_presentation'],
      recoverable: true,
    });
    sourceStepKey = slidesStep.key;
    steps.push(slidesStep);
  }

  if (wantsCalendar) {
    const summary = asString(payload.summary);
    const startTime = asString(payload.startTime) ?? asString(payload.start_time);
    const endTime = asString(payload.endTime) ?? asString(payload.end_time);

    if (!summary || !startTime || !endTime) {
      throw new Error('COMMAND_AMBIGUOUS: Calendar command missing summary/start/end payload fields.');
    }

    steps.push(
      makePlanStep(steps.length, {
        worker_type: 'calendar',
        action: 'create_event',
        title: 'Create calendar event',
        input: {
          summary,
          startTime,
          endTime,
          description: asString(payload.body) ?? undefined,
        },
      }),
    );
  }

  if (wantsEmail && (wantsDraft || wantsSend || sourceStepKey)) {
    const recipient = normalizeRecipient(payload) ?? extractEmailAddressFromText(commandText);
    const subject = asString(payload.subject) ?? 'Planner update';
    const body = asString(payload.body) ?? extractEmailBodyFromText(commandText);

    if (!recipient) {
      throw new Error('COMMAND_AMBIGUOUS: Email command missing recipient payload field.');
    }

    steps.push(
      makePlanStep(steps.length, {
        worker_type: 'gmail',
        action: wantsSend ? 'send_email' : 'draft_email',
        title: wantsSend ? 'Send Gmail message' : 'Draft Gmail message',
        input: {
          to: recipient,
          recipient,
          subject,
          body: body ?? undefined,
          source_step_key: sourceStepKey,
          ...(wantsSend ? buildSendApprovalFields(task, payload) : {}),
        },
        recoverable: wantsSend,
      }),
    );
  }

  if (steps.length === 0) {
    return null;
  }

  return buildPlannerIntent(
    commandText,
    payload,
    contextReferences,
    steps,
    `Planned ${steps.length} workspace capability step${steps.length === 1 ? '' : 's'}`,
  );
}

export class AssistantCommandProcessor extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    this.clearTrace();

    const payload = asRecord(task.payload) as AssistantCommandPayload;
    const commandText = resolveCommandText(payload);

    if (!commandText) {
      throw new Error('COMMAND_INVALID: Missing command text.');
    }

    const confirmed = isConfirmed(payload) || isTrustedUserInitiatedCommand(task, payload);
    if (isHighRisk(payload) && !confirmed) {
      throw new Error('CONFIRMATION_REQUIRED: High-risk command requires explicit confirmation.');
    }

    const citations = buildCitations(task, payload, commandText);
    const extractedRefs = extractContextReferences(commandText);
    const existingRefs = asContextReferences(payload.context_references);
    const contextReferences = [...existingRefs, ...extractedRefs];

    const explicitAction = resolveExplicitAction(payload);
    if (explicitAction && requiresConfirmation(explicitAction) && !confirmed) {
      throw new Error('CONFIRMATION_REQUIRED: High-risk delegated action requires explicit confirmation.');
    }

    if (explicitAction && explicitAction !== 'thread.action' && explicitAction !== 'channel.send' && explicitAction !== 'system.analyze') {
      const plannerIntent = buildExplicitPlan(
        task,
        explicitAction,
        payload,
        commandText,
        contextReferences,
      );

      if (plannerIntent) {
        this.addTraceStep('command_intent_parse', `Planned ${plannerIntent.requested_steps.length} workspace steps`, 0.95);
        return {
          planner_intent: plannerIntent,
          summary: plannerIntent.summary,
          trace: this.getTrace(),
          citations,
        };
      }
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
          context_references: contextReferences.length > 0 ? contextReferences : undefined,
        },
        summary: 'Mapped command to thread.action',
        trace: this.getTrace(),
        citations,
      };
    }

    const inferredPlan = inferWorkspacePlan(task, payload, commandText, contextReferences);
    if (inferredPlan) {
      if (inferredPlan.requested_steps.some((step) => step.action === 'send_email') && !confirmed) {
        throw new Error('CONFIRMATION_REQUIRED: Email send requires explicit confirmation.');
      }

      this.addTraceStep('command_intent_parse', `Planned ${inferredPlan.requested_steps.length} workspace steps`, 0.88);
      return {
        planner_intent: inferredPlan,
        summary: inferredPlan.summary,
        trace: this.getTrace(),
        citations,
      };
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
          context_references: contextReferences.length > 0 ? contextReferences : undefined,
        },
        summary: 'Mapped command to channel.send',
        trace: this.getTrace(),
        citations,
      };
    }

    if (explicitAction === 'system.analyze') {
      this.addTraceStep('command_intent_parse', 'Mapped command to system.analyze', 0.9);
      return {
        delegated_domain_action: 'system.analyze',
        delegated_payload: {
          prompt: commandText,
          conversation_id: asString(payload.conversation_id),
          correlation_id: asString(payload.correlation_id),
        },
        summary: 'Mapped command to system.analyze',
        trace: this.getTrace(),
        citations,
      };
    }

    throw new Error('COMMAND_AMBIGUOUS: Unable to map command to a supported domain action.');
  }
}
