/**
 * General Agent Node
 *
 * User-facing entry point that receives requests, uses the time/date tool,
 * and produces structured execution plans for the Router to dispatch.
 *
 * @see ADR-001: Router Node Pattern
 * @see Task 24: Intent Clarification Logic
 */

import type { AssistantCommandIntent, ExecutionPlan, Task } from '@ai-assistant/shared';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ChatMistralAI } from '@langchain/mistralai';
import { createAgent, modelCallLimitMiddleware, toolStrategy } from 'langchain';
import { z } from 'zod';
import { config } from '../../config/index.js';
import { tracingService } from '../../services/llm/tracing.js';
import { AuditLogger } from '../../services/AuditLogger.js';
import { executionRunService } from '../../services/ExecutionRunService.js';
import { workerToolPolicyService, type CapabilityWorkerType } from '../../services/WorkerToolPolicyService.js';
import { mcpService } from '../../services/mcp.js';
import { PerimeterGuard } from '../../guards/PerimeterGuard.js';
import { ScheduleManageProcessor } from '../../processors/ScheduleManageProcessor.js';
import { getSpecialistPrompt } from '../../prompts/specialistPrompts.js';
import { createCurrentTimeTool } from '../../tools/timeDateTool.js';
import { createWatchTopicTools } from '../../tools/watchTopicTools.js';
import type { AgentState } from '../graph.js';
import { buildEscalationPayload } from '../escalation.js';

// --- Configuration ---

const CONFIDENCE_THRESHOLD = config.CONFIDENCE_THRESHOLD ?? 0.8;
const SUPPORTED_WORKER_TYPES = ['gmail', 'calendar', 'docs', 'sheets', 'slides', 'drive'] as const;
const GENERAL_AGENT_CONTACT_TOOLS = [
  'search_contacts',
  'get_contact',
  'list_contacts',
  'manage_contact',
] as const;
const MEMORY_PROMPT_LIMIT = 3000;
const CONVERSATION_CONTEXT_PROMPT_LIMIT = 2200;
const RUN_ERROR_PROMPT_LIMIT = 240;
const runErrorGuard = new PerimeterGuard();

/**
 * Detect if this is a user-initiated command channel (web/telegram/whatsapp).
 * For these channels, clarification/low-confidence should return 'paused' not 'escalation'.
 */
function getUserInitiatedChannel(task: { topic?: string; domain_action: string; payload: unknown }): string | null {
  if (task.domain_action !== 'assistant.command') return null;

  const payload = (task.payload ?? {}) as Record<string, unknown>;
  const channel = typeof payload.channel === 'string' ? payload.channel : undefined;
  const source = typeof payload.source === 'string' ? payload.source : undefined;
  const isCommandCenter = task.topic === 'Command Center';

  if ((channel === 'web' || (!channel && isCommandCenter)) && (source === 'dashboard-command-center' || isCommandCenter)) {
    return 'web';
  }

  if (payload.user_initiated === true) {
    if (channel === 'telegram' && source === 'telegram-webhook') return 'telegram';
    if (channel === 'whatsapp' && source === 'whatsapp-webhook') return 'whatsapp';
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

type ConversationRole = 'user' | 'assistant' | 'system';

type ConversationContextEntry = {
  role: ConversationRole;
  content: string;
  state: string | null;
  createdAt: string | null;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asConversationRole(value: unknown): ConversationRole | null {
  const role = asNonEmptyString(value);
  if (!role) return null;
  if (role === 'user' || role === 'assistant' || role === 'system') return role;
  return null;
}

function sanitizeRunErrorForUser(raw: string | null | undefined): string | null {
  const normalized = asNonEmptyString(raw);
  if (!normalized) {
    return null;
  }

  const redacted = runErrorGuard.redactPII(normalized)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!redacted) {
    return null;
  }

  if (/\b(body|draft|content)\b\s*[:=]/i.test(redacted)) {
    return 'Le détail exact du brouillon a été masqué pour confidentialité.';
  }

  if (redacted.length > RUN_ERROR_PROMPT_LIMIT) {
    return `${redacted.slice(0, RUN_ERROR_PROMPT_LIMIT - 3)}...`;
  }

  return redacted;
}

function parseConversationContext(raw: unknown): ConversationContextEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const out: ConversationContextEntry[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const role = asConversationRole(record.role);
    const content = asNonEmptyString(record.content);
    if (!role || !content) {
      continue;
    }

    const state = asNonEmptyString(record.state);
    const createdAt = asNonEmptyString(record.created_at) ?? asNonEmptyString(record.createdAt);

    out.push({
      role,
      content,
      state,
      createdAt,
    });
  }

  return out;
}

function truncateConversationBlock(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= CONVERSATION_CONTEXT_PROMPT_LIMIT) {
    return trimmed;
  }

  return `${trimmed.slice(0, CONVERSATION_CONTEXT_PROMPT_LIMIT - 3)}...`;
}

function buildConversationContextBlock(entries: ConversationContextEntry[]): string {
  if (entries.length === 0) {
    return '';
  }

  const compressedSummary = entries.slice().reverse().find((entry) => entry.role === 'system' && entry.state === 'compressed');
  const recent = entries
    .filter((entry) => entry !== compressedSummary)
    .slice(-16);
  const promptEntries = compressedSummary ? [compressedSummary, ...recent] : recent;

  const lines = promptEntries.map((entry) => {
    const stateSuffix = entry.state ? ` (${entry.state})` : '';
    const roleLabel = entry.role.toUpperCase();
    const content = entry === compressedSummary && entry.content.length > 900
      ? `${entry.content.slice(0, 897)}...`
      : entry.content;
    return `${roleLabel}${stateSuffix}: ${content}`;
  });

  return truncateConversationBlock(`CONVERSATION CONTEXT (most recent last):\n${lines.join('\n')}`);
}

function isConfirmationOnlyMessage(userRequest: string): boolean {
  const normalized = userRequest.trim().toLowerCase();
  return normalized === 'confirm' || normalized === 'yes' || normalized === 'y' || normalized === 'ok' || normalized === 'okay';
}

function extractPendingConfirmationCommand(entries: ConversationContextEntry[]): string | null {
  if (entries.length === 0) return null;

  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]!;
    if (entry.role !== 'assistant') continue;
    if (entry.state !== 'paused') continue;

    const contentLower = entry.content.toLowerCase();
    const looksLikeConfirmationPause =
      (contentLower.includes('high-risk') || contentLower.includes('high risk'))
      && (contentLower.includes('confirm') || contentLower.includes('reply yes'));

    if (!looksLikeConfirmationPause) {
      continue;
    }

    for (let j = i - 1; j >= 0; j -= 1) {
      const prior = entries[j]!;
      if (prior.role !== 'user') continue;
      const candidate = prior.content.trim();
      if (!candidate) continue;
      return candidate;
    }
  }

  return null;
}

const GeneralAgentScheduleResultSchema = z.object({
  schedule_id: z.string().trim().min(1).optional(),
  next_run: z.string().trim().min(1).optional(),
  cron_expression: z.string().trim().min(1).optional(),
  timezone: z.string().trim().min(1).optional(),
  task_type: z.string().trim().min(1).optional(),
  summary: z.string().trim().min(1).optional(),
  confirmation_message: z.string().trim().min(1).optional(),
  error: z.string().trim().min(1).optional(),
});

type GeneralAgentScheduleResult = z.infer<typeof GeneralAgentScheduleResultSchema>;

const GeneralAgentWatchTopicResultSchema = z.object({
  outcome: z.string().trim().min(1).optional(),
  confirmation_message: z.string().trim().min(1).optional(),
  total: z.number().int().nonnegative().optional(),
  topics: z.array(z.unknown()).optional(),
  topic: z.unknown().optional(),
});

type GeneralAgentWatchTopicResult = z.infer<typeof GeneralAgentWatchTopicResultSchema>;

function buildScheduleManageToolPayload(
  task: Task,
  request: string,
  timezone?: string,
  runAtIso?: string,
): Record<string, unknown> {
  const payload = asRecord(task.payload);

  return {
    command_text: request,
    message_text: request,
    timezone: timezone ?? asNonEmptyString(asRecord(payload.channel_metadata).timezone) ?? undefined,
    channel: asNonEmptyString(payload.channel) ?? undefined,
    external_message_id: asNonEmptyString(payload.external_message_id) ?? undefined,
    thread_id: asNonEmptyString(payload.thread_id) ?? undefined,
    channel_metadata: asRecord(payload.channel_metadata),
    source: asNonEmptyString(payload.source) ?? undefined,
    user_initiated: true,
    confirmed: true,
    conversation_id: asNonEmptyString(payload.conversation_id) ?? undefined,
    source_message_id: asNonEmptyString(payload.source_message_id) ?? undefined,
    correlation_id: asNonEmptyString(payload.correlation_id) ?? undefined,
    conversation_context: payload.conversation_context,
    run_at_iso: runAtIso,
  };
}

async function runScheduleAgentRequest(
  task: Task,
  request: string,
  timezone?: string,
  runAtIso?: string,
): Promise<GeneralAgentScheduleResult> {
  try {
    const processor = new ScheduleManageProcessor();
    const result = await processor.process({
      id: task.id,
      organization_id: task.organization_id,
      user_id: task.user_id,
      domain_action: 'schedule.manage',
      topic: task.topic,
      status: 'processing',
      payload: buildScheduleManageToolPayload(task, request, timezone, runAtIso),
    });

    const resultRecord = asRecord(result);
    const schedule = asRecord(resultRecord.schedule);
    const summary = asNonEmptyString(resultRecord.summary) ?? 'Schedule created.';

    if (resultRecord.outcome !== 'created') {
      return {
        error: asNonEmptyString(resultRecord.confirmation_message) ?? summary,
        summary,
      };
    }

    return {
      schedule_id: asNonEmptyString(schedule.id) ?? undefined,
      next_run: asNonEmptyString(schedule.next_run) ?? undefined,
      cron_expression: asNonEmptyString(schedule.cron_expression) ?? undefined,
      timezone: asNonEmptyString(schedule.timezone) ?? undefined,
      task_type: asNonEmptyString(schedule.task_type) ?? undefined,
      summary,
      confirmation_message: asNonEmptyString(resultRecord.confirmation_message) ?? undefined,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

function createScheduleAgentRequestTool(task: Task): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'schedule_agent_request',
    description: [
      'Create a one-off or recurring schedule for the current request.',
      'Use this ONLY when the user clearly wants something to happen later or on a recurring cadence.',
      'ALWAYS call get_current_time first when the request uses relative time like "in 30 minutes", "tomorrow", or "next Monday".',
      'When relative timing is resolved, pass run_at_iso and make request the action to execute at that time (without timing words).',
      'Returns JSON with the created schedule metadata.',
    ].join(' '),
    schema: z.object({
      request: z.string().min(1).describe('The action request to schedule. If run_at_iso is omitted, include timing text in this field.'),
      timezone: z.string().optional().describe('Optional IANA timezone override when the user provided one.'),
      run_at_iso: z.string().optional().describe('Optional absolute execution datetime in ISO-8601 format.'),
    }),
    func: async ({ request, timezone, run_at_iso }) => {
      const response = await runScheduleAgentRequest(task, request, timezone, run_at_iso);
      return JSON.stringify(response);
    },
  });
}

function planRequiresExplicitConfirmation(plan: ExecutionPlan): boolean {
  return plan.steps.some((step) => step.worker_type === 'gmail' && step.action === 'send_email');
}


// --- Intent + Plan (merged into a single LLM call) ---

const PlanStepSchema = z.object({
  key: z.string().describe('Unique step identifier (e.g. "step-1")'),
  title: z.string().describe('Human-readable step title'),
  worker_type: z.string().describe('Specialist agent to execute this step. Must be one of gmail, calendar, docs, sheets, slides, drive.'),
  action: z.string().describe('Natural-language description of what the specialist should do (e.g. "create a spreadsheet with the project budget", "draft an email to the team about the meeting")'),
  input: z.record(z.unknown()).describe('Structured input with the data the specialist needs (e.g. recipient, message, tone, language; subject/body ONLY if explicitly provided by the user). The specialist decides which tools to call.'),
  recoverable: z.boolean().default(false).describe('Whether this step can recover from failure'),
});

/**
 * Combined schema: one LLM call handles both intent assessment AND plan building.
 * If confidence < threshold, steps will be empty and clarification fields filled.
 */
const GeneralAgentResponseSchema = z.object({
  outcome: z.enum(['plan', 'schedule', 'watch_topic']).default('plan').describe('Use "schedule" only after you have already created the schedule via schedule_agent_request. Use "watch_topic" only after calling a watch-topic tool.'),
  confidence: z.number().min(0).max(1).describe('Confidence in understanding the request (0-1). Be generous — most natural language requests should be >= 0.8.'),
  interpretation: z.string().describe('How you interpreted the user request'),
  needs_clarification: z.boolean().describe('True ONLY if the request is truly ambiguous (e.g. missing recipient, subject is unclear, dates are completely vague). Default false for clear requests.'),
  clarification_prompt: z.string().optional().describe('What to ask the user if clarification needed'),
  summary: z.string().describe('One-line summary of the plan'),
  reasoning: z.string().describe('Brief reasoning for the plan structure'),
  steps: z.array(PlanStepSchema).describe('Ordered execution steps. Empty if clarification needed.'),
  schedule_result: GeneralAgentScheduleResultSchema.optional().describe('Required when outcome is "schedule". Copy the JSON returned by schedule_agent_request.'),
  watch_topic_result: GeneralAgentWatchTopicResultSchema.optional().describe('Required when outcome is "watch_topic". Copy the JSON returned by manage_watch_topic or list_watch_topics.'),
});

const CheckpointStepSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  worker_type: z.enum(SUPPORTED_WORKER_TYPES),
  action: z.string().min(1),
  input: z.record(z.unknown()).default({}),
  recoverable: z.boolean().default(false),
});

const CheckpointReviewSchema = z.object({
  summary: z.string().min(1),
  should_replan: z.boolean().default(false),
  revised_steps: z.array(CheckpointStepSchema).default([]),
});

type CheckpointReview = z.infer<typeof CheckpointReviewSchema>;

function truncateMemory(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length <= MEMORY_PROMPT_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(0, MEMORY_PROMPT_LIMIT - 3)}...`;
}

function buildMemoryContextBlock(state: AgentState): string {
  const persona = truncateMemory(state.persona_memory);
  const longTerm = truncateMemory(state.long_term_memory);
  const sections = [
    persona ? `PERSONA MEMORY:\n${persona}` : null,
    longTerm ? `LONG-TERM MEMORY:\n${longTerm}` : null,
  ].filter((section): section is string => Boolean(section));

  if (sections.length === 0) {
    return '';
  }

  return `${sections.join('\n\n')}\n\n`;
}

function shouldRunCheckpointReview(state: AgentState, run: AgentState['execution_run']): boolean {
  if (!run || !state.router_completed_step_key) {
    return false;
  }

  const totalSteps = run.plan_json.steps.length;
  if (totalSteps <= 3) {
    return false;
  }

  const hasPendingSteps = run.plan_json.steps.some((step) =>
    step.status === 'pending' || step.status === 'in_progress');

  if (!hasPendingSteps) {
    return false;
  }

  const doneStepCount = run.plan_json.steps.filter((step) =>
    step.status === 'completed'
      || step.status === 'skipped'
      || step.status === 'failed'
      || step.status === 'blocked').length;

  return doneStepCount > 0 && doneStepCount % 3 === 0;
}

/**
 * Build an execution plan from user input.
 * When plannerIntent exists (backward compat from assistant_command processor), uses it directly.
 * Otherwise, makes a single LLM call to assess intent AND build the plan.
 */
async function buildPlanFromUserInput(
  task: Task,
  userRequest: string,
  plannerIntent: AssistantCommandIntent | null,
  memoryContextBlock: string,
): Promise<{
  plan: ExecutionPlan | null;
  scheduleResult: GeneralAgentScheduleResult | null;
  watchTopicResult: GeneralAgentWatchTopicResult | null;
  confidence: number;
  needsClarification: boolean;
  clarificationPrompt: string | null;
}> {
  // If we already have a planner intent, use it directly (backward compat)
  if (plannerIntent) {
    const plan: ExecutionPlan = {
      version: 'v1',
      original_command: plannerIntent.original_command,
      summary: plannerIntent.summary,
      ledger_entries: [],
      replan_count: 0,
      steps: plannerIntent.requested_steps.map((step, index) => ({
        key: step.key,
        title: step.title,
        worker_type: step.worker_type,
        action: step.action,
        status: 'pending' as const,
        requested_tools: [],
        input: step.input,
        output: {},
        attempt_count: 0,
        idempotency_key: step.idempotency_key ?? `${step.worker_type}-${step.action}-${index + 1}`,
        recoverable: step.recoverable ?? false,
      })),
    };

    return {
      plan,
      scheduleResult: null,
      watchTopicResult: null,
      confidence: 1.0,
      needsClarification: false,
      clarificationPrompt: null,
    };
  }

  // Single agent run: tool-aware intent assessment + plan building
  const langfuseHandler = tracingService.getHandler();
  const callbacks = langfuseHandler ? [langfuseHandler] : [];
  const llm = new ChatMistralAI({
    apiKey: config.MISTRAL_API_KEY,
    model: config.DEFAULT_LLM_MODEL,
    temperature: 0,
    callbacks,
  });

  const allowedToolNameSet = new Set<string>(GENERAL_AGENT_CONTACT_TOOLS);
  const allMcpTools = await mcpService.getLangChainTools(task.organization_id);
  const contactTools = allMcpTools.filter((tool) => allowedToolNameSet.has(tool.name));

  const isInsufficientScopeError = (message: string): boolean => {
    const lower = message.toLowerCase();
    return (
      lower.includes('insufficient authentication scopes')
      || lower.includes('access_token_scope_insufficient')
      || lower.includes('scope_insufficient')
    );
  };

  // Wrap contact tools so failures don't break planning.
  const safeTools = contactTools.map((tool) => {
    const originalCall = tool.call.bind(tool);
    return Object.assign(Object.create(Object.getPrototypeOf(tool)), tool, {
      call: async (input: string | Record<string, unknown>) => {
        try {
          return await originalCall(input);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          if (isInsufficientScopeError(message)) {
            return [
              `Tool ${tool.name} failed: Google Workspace is connected, but the current token is missing Contacts permissions.`,
              'Fix: reconnect Google Workspace in Settings -> Workspace Integration and approve Contacts access (scope: https://www.googleapis.com/auth/contacts.readonly), then retry.',
            ].join(' ');
          }
          return `Tool ${tool.name} failed: ${message}`;
        }
      },
    });
  });

  const generalAgentTools = [
    ...safeTools,
    createCurrentTimeTool(),
    createScheduleAgentRequestTool(task),
    ...createWatchTopicTools({ organizationId: task.organization_id, userId: task.user_id }),
  ];

  const agent = createAgent({
    model: llm,
    tools: generalAgentTools,
    systemPrompt: getSpecialistPrompt('generalAgent'),
    responseFormat: toolStrategy(GeneralAgentResponseSchema),
    middleware: [modelCallLimitMiddleware({ runLimit: 10 })],
  });

  const result = await agent.invoke({
    messages: [{
      role: 'user',
      content: [
        memoryContextBlock,
        `User request: "${userRequest}"`,
        '',
        'Interpret this request and produce an execution plan.',
        '',
        'HARD CONSTRAINTS:',
        '- If the request is clearly future-oriented or recurring, call get_current_time first, then call schedule_agent_request, and set outcome="schedule".',
        '- For relative one-off timing (e.g. "in 10 minutes"), compute an absolute datetime and pass it in schedule_agent_request.run_at_iso.',
        '- When using run_at_iso, set request to the action text to run later (remove timing words so the scheduled command does not re-schedule itself).',
        '- Do NOT produce immediate execution steps for clearly scheduled requests unless the user explicitly wants both now and later.',
        '- If you set outcome="schedule", include schedule_result copied from the schedule_agent_request tool output and leave steps empty.',
        '- If the request is to watch, monitor, alert on, list, or update mail topics, use manage_watch_topic or list_watch_topics, set outcome="watch_topic", include watch_topic_result copied from the tool output, and leave steps empty.',
        '- Watch-topic requests are mail triage preferences, not calendar alarms. Do not create calendar steps for them.',
        '- worker_type MUST be one of: "gmail", "calendar", "docs", "sheets", "slides", "drive".',
        '- Do NOT specify tool names in your plan — specialists select their own tools.',
        '- If an email task has only a person name and no email after contact lookup, ask the user to provide the email address directly.',
        '- For Gmail steps: do NOT draft the final email subject/body copy unless the user explicitly provided exact text; put the core content in input.message and style requirements in input.instructions.',
      ].join('\n'),
    }],
  }, { callbacks });

  const structured = (result as unknown as { structuredResponse?: unknown }).structuredResponse;
  const parsed = GeneralAgentResponseSchema.parse(structured);

  const supportedWorkerTypeSet = new Set<string>(SUPPORTED_WORKER_TYPES);
  const unsupportedWorkerTypes = parsed.steps
    .map((step) => step.worker_type)
    .filter((workerType) => !supportedWorkerTypeSet.has(workerType));

  const filteredSteps = parsed.steps
    .filter((step) => supportedWorkerTypeSet.has(step.worker_type))
    .map((step) => ({
      ...step,
      worker_type: step.worker_type as (typeof SUPPORTED_WORKER_TYPES)[number],
    }));

  tracingService.handleSuccess();
  await tracingService.flush();

  if (parsed.outcome === 'schedule') {
    let scheduleResult = parsed.schedule_result ?? null;

    if (!scheduleResult || scheduleResult.error) {
      // Fallback guardrail: if the model chose outcome=schedule but forgot to call
      // scheduling tools, execute scheduling directly from backend orchestration.
      scheduleResult = await runScheduleAgentRequest(task, userRequest);
    }

    const scheduleError = scheduleResult?.error ?? null;

    return {
      plan: null,
      scheduleResult: scheduleError ? null : scheduleResult,
      watchTopicResult: null,
      confidence: parsed.confidence,
      needsClarification: parsed.needs_clarification || parsed.confidence < CONFIDENCE_THRESHOLD || !scheduleResult || Boolean(scheduleError),
      clarificationPrompt: scheduleError
        ?? parsed.clarification_prompt
        ?? (!scheduleResult ? 'I could not schedule this yet. Share the exact timing and I will create it now.' : null),
    };
  }

  if (parsed.outcome === 'watch_topic') {
    const watchTopicResult = parsed.watch_topic_result ?? null;
    const error = watchTopicResult ? null : 'I could not update watch topics yet. Please rephrase the topic you want me to watch.';

    return {
      plan: null,
      scheduleResult: null,
      watchTopicResult,
      confidence: parsed.confidence,
      needsClarification: parsed.needs_clarification || parsed.confidence < CONFIDENCE_THRESHOLD || Boolean(error),
      clarificationPrompt: error ?? parsed.clarification_prompt ?? null,
    };
  }

  const plan: ExecutionPlan = {
    version: 'v1',
    original_command: userRequest,
    summary: parsed.summary,
    ledger_entries: [],
    replan_count: 0,
    steps: filteredSteps.map((step, index) => ({
      key: step.key,
      title: step.title,
      worker_type: step.worker_type,
      action: step.action,
      input: step.input,
      requested_tools: [],
      recoverable: step.recoverable ?? false,
      status: 'pending' as const,
      output: {},
      attempt_count: 0,
      idempotency_key: `${step.worker_type}-${step.action}-${index + 1}`,
    })),
  };

  return {
    plan,
    scheduleResult: null,
    watchTopicResult: null,
    confidence: parsed.confidence,
    needsClarification: parsed.needs_clarification
      || parsed.confidence < CONFIDENCE_THRESHOLD
      || unsupportedWorkerTypes.length > 0,
    clarificationPrompt: unsupportedWorkerTypes.length > 0
      ? (parsed.clarification_prompt ?? 'I could not map one or more requested steps to available specialist workers. Please rephrase the request.')
      : (parsed.clarification_prompt ?? null),
  };
}

// --- Handoff Note Validation (Task 23) ---

const MAX_HANDOFF_LENGTH = 1000;

function validateHandoffContent(content: unknown): string | null {
  if (!content || typeof content !== 'string') return null;

  // Escape control characters
  // eslint-disable-next-line no-control-regex
  let sanitized = content.replace(/[\x00-\x1F\x7F]/g, '');

  // Truncate to max length
  if (sanitized.length > MAX_HANDOFF_LENGTH) {
    sanitized = `${sanitized.slice(0, MAX_HANDOFF_LENGTH - 3)}...`;
  }

  // Validate JSON safety
  try {
    JSON.stringify(sanitized);
  } catch {
    return null;
  }

  return sanitized;
}

function hasExplicitSubjectInUserRequest(userRequest: string): boolean {
  const lower = userRequest.toLowerCase();
  return (
    /\b(subject|objet|titre|title)\s*[:-]/.test(lower)
    || /\b(avec\s+pour\s+objet|avec\s+comme\s+objet|with\s+subject)\b/.test(lower)
  );
}

function sanitizeEmailBodyToMessage(body: string): string {
  const rawLines = body.split(/\r?\n/);

  // Drop obvious placeholder signature lines.
  const withoutPlaceholders = rawLines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return true;
    return !/^\[?(?:your\s+name|votre\s+nom)\]?$/i.test(trimmed);
  });

  // If it looks like a full email, strip greeting + sign-off blocks.
  const greetingRegex = /^(bonjour|salut|hello|hi|dear)\b/i;
  const closingRegex = /^(cordialement|sincerely|best(?:\s+regards)?|regards|thanks|thank\s+you|salutations)\b/i;

  const firstNonEmpty = withoutPlaceholders.findIndex((line) => line.trim().length > 0);
  const lastNonEmptyFromEnd = [...withoutPlaceholders].reverse().findIndex((line) => line.trim().length > 0);
  const lastNonEmpty = lastNonEmptyFromEnd === -1
    ? -1
    : withoutPlaceholders.length - 1 - lastNonEmptyFromEnd;

  let start = 0;
  let end = withoutPlaceholders.length - 1;

  if (firstNonEmpty >= 0 && greetingRegex.test(withoutPlaceholders[firstNonEmpty]!.trim())) {
    start = firstNonEmpty + 1;
    while (start < withoutPlaceholders.length && withoutPlaceholders[start]!.trim().length === 0) start += 1;
  }

  // Prefer removing trailing closing/signature if present.
  if (lastNonEmpty >= 0 && closingRegex.test(withoutPlaceholders[lastNonEmpty]!.trim())) {
    end = lastNonEmpty - 1;
  } else {
    // Also handle the common pattern: closing line followed by a name line.
    for (let i = lastNonEmpty; i >= 0; i -= 1) {
      if (closingRegex.test(withoutPlaceholders[i]!.trim())) {
        end = i - 1;
        break;
      }
    }
  }

  while (end >= 0 && withoutPlaceholders[end]!.trim().length === 0) end -= 1;
  if (end < start) {
    return withoutPlaceholders.join('\n').trim();
  }

  const core = withoutPlaceholders.slice(start, end + 1).join('\n').trim();
  return core.length > 0 ? core : withoutPlaceholders.join('\n').trim();
}

function normalizeEmailPlan(plan: ExecutionPlan, userRequest: string): void {
  const keepSubject = hasExplicitSubjectInUserRequest(userRequest);

  for (const step of plan.steps) {
    if (step.worker_type !== 'gmail') continue;

    const input = (step.input ?? {}) as Record<string, unknown>;

    // Normalize recipient key.
    if (!input.recipient && typeof input.to === 'string' && input.to.trim().length > 0) {
      input.recipient = input.to.trim();
    }

    // Prefer message + instructions; never persist a fully drafted body in the plan.
    const message = typeof input.message === 'string' && input.message.trim().length > 0
      ? input.message.trim()
      : (typeof input.body === 'string' && input.body.trim().length > 0
        ? sanitizeEmailBodyToMessage(input.body)
        : null);

    if (message) {
      input.message = message;
    }

    delete input.body;

    if (!keepSubject) {
      delete input.subject;
    }

    if (typeof input.instructions !== 'string' || input.instructions.trim().length === 0) {
      input.instructions = 'Compose a concise email conveying input.message. Choose a short subject. Use the same language as the user request unless specified otherwise. Avoid placeholder signatures.';
    }

    step.input = input;
  }
}

async function reviewCheckpointPlan(state: AgentState, run: NonNullable<AgentState['execution_run']>): Promise<CheckpointReview> {
  const langfuseHandler = tracingService.getHandler();
  const callbacks = langfuseHandler ? [langfuseHandler] : [];
  const llm = new ChatMistralAI({
    apiKey: config.MISTRAL_API_KEY,
    model: config.DEFAULT_LLM_MODEL,
    temperature: 0,
    callbacks,
  }).withStructuredOutput(CheckpointReviewSchema, { name: 'checkpoint_review' });

  const doneStatuses = new Set(['completed', 'skipped', 'failed', 'blocked']);
  const completedSteps = run.plan_json.steps
    .filter((step) => doneStatuses.has(step.status))
    .map((step) => ({
      key: step.key,
      title: step.title,
      worker_type: step.worker_type,
      action: step.action,
      status: step.status,
      handoff_note: step.handoff_note ?? null,
      output: step.output,
    }));

  const remainingSteps = run.plan_json.steps
    .filter((step) => step.status === 'pending' || step.status === 'in_progress')
    .map((step) => ({
      key: step.key,
      title: step.title,
      worker_type: step.worker_type,
      action: step.action,
      input: step.input,
      recoverable: step.recoverable,
    }));

  const response = await llm.invoke([
    'You are reviewing an active execution run checkpoint.',
    'Decide whether the remaining plan should be revised.',
    'Only propose revised steps when the current remaining plan is clearly suboptimal or inconsistent with progress.',
    'If no re-plan is needed, set should_replan=false and revised_steps=[].',
    '',
    buildMemoryContextBlock(state),
    `Original user request: ${run.plan_json.original_command}`,
    `Plan summary: ${run.plan_json.summary}`,
    `Current replan count: ${run.plan_json.replan_count}`,
    '',
    'Completed steps JSON:',
    JSON.stringify(completedSteps, null, 2),
    '',
    'Remaining steps JSON:',
    JSON.stringify(remainingSteps, null, 2),
  ].join('\n'));

  return CheckpointReviewSchema.parse(response);
}

// --- Main Node Function ---

export async function generalAgentNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    if (!state.task.id) {
      return { error: 'Task ID is required for general agent execution.' };
    }

    const userInitiatedChannel = getUserInitiatedChannel(state.task);

    const existingRun = state.execution_run ?? await executionRunService.getByTaskId(state.task.id);
    if (existingRun) {
      if (existingRun.status === 'blocked' || existingRun.status === 'escalated' || existingRun.status === 'failed') {
        const worker = existingRun.current_worker_type ?? 'specialist';
        const step = existingRun.current_step_key ?? 'current step';
        const reason = sanitizeRunErrorForUser(existingRun.last_error)
          ?? `Execution run is ${existingRun.status}.`;
        const executionRunResult = executionRunService.buildTaskResult(existingRun).execution_run;

        const prompt = [
          `J’ai rencontré un blocage pendant l’exécution (${worker} / ${step}).`,
          reason,
          'Donne-moi soit (1) la correction exacte à appliquer, soit (2) une autre approche et je replanifie.',
        ].join('\n\n');

        return {
          execution_run: existingRun,
          router_completed_step_key: null,
          task: {
            ...state.task,
            status: userInitiatedChannel ? 'paused' : 'escalation',
            result: buildEscalationPayload({
              reason,
              prompt,
              confidenceScore: 0,
              trigger: 'ambiguity_detected',
              extra: {
                summary: prompt,
                ...(executionRunResult ? { execution_run: executionRunResult } : {}),
              },
            }),
          },
          trace: [
            AuditLogger.createStep(
              'General Agent',
              userInitiatedChannel
                ? 'Paused: execution run requires user guidance'
                : 'Escalated: execution run requires user guidance',
              { output_summary: prompt },
            ),
          ],
        };
      }

      if (shouldRunCheckpointReview(state, existingRun)) {
        const review = await reviewCheckpointPlan(state, existingRun);

        if (review.should_replan && review.revised_steps.length > 0) {
          const revisedRun = await executionRunService.reviseRemainingSteps(existingRun, {
            revisedSteps: review.revised_steps,
            note: review.summary,
          });

          return {
            execution_run: revisedRun,
            router_completed_step_key: null,
            trace: [
              AuditLogger.createStep(
                'General Agent',
                `Checkpoint review applied re-plan with ${review.revised_steps.length} remaining steps`,
                { output_summary: review.summary },
              ),
            ],
          };
        }

        return {
          execution_run: existingRun,
          router_completed_step_key: null,
          trace: [
            AuditLogger.createStep(
              'General Agent',
              'Checkpoint review complete: no plan changes required',
              { output_summary: review.summary },
            ),
          ],
        };
      }

      return {
        execution_run: existingRun,
        router_completed_step_key: null,
        trace: [AuditLogger.createStep('General Agent', `Loaded execution run ${existingRun.id ?? 'existing-run'}`)],
      };
    }

    const plannerIntent = state.planner_intent;
    const payload = asRecord(state.task.payload);
    const rawUserRequest = plannerIntent?.original_command
      ?? asNonEmptyString(payload.command)
      ?? asNonEmptyString(payload.command_text)
      ?? asNonEmptyString(payload.message_text)
      ?? '';

    const normalizedRawRequest = String(rawUserRequest).trim();
    const confirmationMatch = normalizedRawRequest.match(/^(?:confirm|yes)\s*[:-]?\s+([\s\S]+)$/i);
    const confirmedByPrefix = Boolean(confirmationMatch?.[1]?.trim());

    const conversationEntries = parseConversationContext(payload.conversation_context);
    const resolvedHistoryCommand =
      !confirmedByPrefix && isConfirmationOnlyMessage(normalizedRawRequest)
        ? extractPendingConfirmationCommand(conversationEntries)
        : null;
    const confirmedByHistory = Boolean(resolvedHistoryCommand);

    const userRequest = confirmedByPrefix
      ? confirmationMatch![1]!.trim()
      : resolvedHistoryCommand ?? normalizedRawRequest;

    const confirmed = payload.confirmed === true || confirmedByPrefix || confirmedByHistory;

    if (!userRequest) {
      const escalationResult = buildEscalationPayload({
        reason: 'No user request found',
        prompt: 'Please provide a command or request.',
        confidenceScore: 0,
        trigger: 'ambiguity_detected',
      });

      return {
        task: {
          ...state.task,
          status: userInitiatedChannel ? 'paused' : 'escalation',
          result: escalationResult,
        },
        trace: [AuditLogger.createStep('General Agent', userInitiatedChannel
          ? 'Paused: no user request'
          : 'Escalated: no user request')],
      };
    }

    const memoryContextBlock = buildMemoryContextBlock(state);
    const conversationContextBlock = buildConversationContextBlock(conversationEntries);
    const planningContextBlock = [memoryContextBlock, conversationContextBlock].filter((part) => Boolean(part)).join('\n\n');

    const { plan, scheduleResult, watchTopicResult, confidence, needsClarification, clarificationPrompt } = await buildPlanFromUserInput(
      state.task,
      userRequest,
      plannerIntent,
      planningContextBlock,
    );

    if (scheduleResult) {
      const nextRun = asNonEmptyString(scheduleResult.next_run);
      const summary = nextRun
        ? `Got it — I scheduled this. First run: ${nextRun}.`
        : (scheduleResult.summary ?? 'Got it — your schedule is created.');

      return {
        task: {
          ...state.task,
          result: {
            summary,
            schedule: scheduleResult,
            outcome: 'schedule_created',
          },
        },
        router_completed_step_key: null,
        trace: [
          AuditLogger.createStep('General Agent', 'Created scheduled request', {
            output_summary: summary,
          }),
        ],
      };
    }

    if (watchTopicResult) {
      const listedCount = typeof watchTopicResult.total === 'number' ? watchTopicResult.total : null;
      const summary = watchTopicResult.confirmation_message
        ?? (listedCount !== null
          ? `You have ${listedCount} watch topic${listedCount === 1 ? '' : 's'}.`
          : 'Watch topics updated.');

      return {
        task: {
          ...state.task,
          result: {
            summary,
            watch_topic: watchTopicResult,
            outcome: 'watch_topic_updated',
          },
        },
        router_completed_step_key: null,
        trace: [
          AuditLogger.createStep('General Agent', 'Handled watch-topic request', {
            output_summary: summary,
          }),
        ],
      };
    }

    if (!plan) {
      const prompt = clarificationPrompt ?? 'I could not create a plan for that request. Please rephrase it.';
      return {
        task: {
          ...state.task,
          status: userInitiatedChannel ? 'paused' : 'escalation',
          result: buildEscalationPayload({
            reason: 'Unable to plan request',
            prompt,
            confidenceScore: confidence,
            trigger: 'ambiguity_detected',
            extra: { summary: prompt },
          }),
        },
        router_completed_step_key: null,
        trace: [AuditLogger.createStep('General Agent', 'Unable to create plan', { output_summary: prompt })],
      };
    }

    normalizeEmailPlan(plan, userRequest);

    if ((payload.high_risk === true || planRequiresExplicitConfirmation(plan)) && !confirmed) {
      const recapText = userRequest.trim().replace(/\s+/g, ' ').slice(0, 220);
      const prompt = `Quick recap: you asked me to "${recapText}". This is a high-risk command, so I need explicit confirmation before I run it.\n\nTo confirm, reply: CONFIRM\nTo confirm with edits, reply: CONFIRM: <your updated command>`;

      return {
        task: {
          ...state.task,
          status: userInitiatedChannel ? 'paused' : 'escalation',
          result: buildEscalationPayload({
            reason: 'High-risk command requires confirmation',
            prompt,
            confidenceScore: 0,
            trigger: 'approval_guardrail',
            extra: { summary: prompt },
          }),
        },
        router_completed_step_key: null,
        trace: [
          AuditLogger.createStep(
            'General Agent',
            userInitiatedChannel
              ? 'Paused: high-risk command requires confirmation'
              : 'Escalated: high-risk command requires confirmation',
            { output_summary: prompt },
          ),
        ],
      };
    }

    // Check intent clarification (Task 24)
    if (needsClarification) {
      const prompt = clarificationPrompt ?? 'Could you provide more details about your request?';

      const step = AuditLogger.createStep('General Agent', `Clarification needed: ${prompt}`, {
        confidence_score: confidence,
        ambiguity_detected: true,
      });

      const reason = userInitiatedChannel ? 'Command is ambiguous' : 'Ambiguous request';

      return {
        task: {
          ...state.task,
          status: userInitiatedChannel ? 'paused' : 'escalation',
          result: buildEscalationPayload({
            reason,
            prompt,
            confidenceScore: confidence,
            trigger: 'ambiguity_detected',
            extra: { summary: prompt },
          }),
        },
        router_completed_step_key: null,
        trace: [step],
      };
    }

    // Check capability readiness for each specialist worker type (without tool names — specialists choose their own tools)
    for (const step of plan.steps) {
      if (step.worker_type === 'planner') continue;

      const workerType = step.worker_type as CapabilityWorkerType;
      const readiness = await mcpService.checkCapabilityReadiness(
        state.task.organization_id,
        workerType,
        [], // Empty — specialist agents select their own tools at execution time
      );

      step.capability_readiness = readiness;
      if (!readiness.ready) {
        const prompt = 'Reconnect Google Workspace or enable the required scopes, then retry.';
        const blockedRun = await executionRunService.createRun({
          taskId: state.task.id,
          organizationId: state.task.organization_id,
          plan,
          toolPolicyVersion: workerToolPolicyService.getVersion(),
        });
        const blocked = await executionRunService.markRunStatus(
          blockedRun,
          'blocked',
          readiness.errors.join(' '),
        );

        return {
          execution_run: blocked,
          router_completed_step_key: null,
          task: {
            ...state.task,
            status: userInitiatedChannel ? 'paused' : 'escalation',
            result: buildEscalationPayload({
              reason: readiness.errors.join(' '),
              prompt,
              confidenceScore: 0,
              trigger: 'approval_guardrail',
              extra: { outcome: 'setup_required' as const },
            }),
          },
          trace: [AuditLogger.createStep('General Agent', `Blocked: ${readiness.errors.join(' | ')}`)],
        };
      }
    }

    // Create execution run
    const executionRun = await executionRunService.createRun({
      taskId: state.task.id,
      organizationId: state.task.organization_id,
      plan,
      toolPolicyVersion: workerToolPolicyService.getVersion(),
    });

    // Validate handoff content fields in plan (Task 23)
    for (const step of plan.steps) {
      const input = step.input as Record<string, unknown>;
      if (input.handoff_content) {
        const validated = validateHandoffContent(input.handoff_content);
        if (validated !== null) {
          input.handoff_content = validated;
        }
      }
    }

    return {
      execution_run: executionRun,
      router_completed_step_key: null,
      task: {
        ...state.task,
        result: {
          ...(state.task.result ?? {}),
          execution_run: executionRunService.buildTaskResult(executionRun).execution_run,
        },
      },
      trace: [AuditLogger.createStep('General Agent', `Created execution plan with ${plan.steps.length} steps`, {
        confidence_score: confidence,
        output_summary: plan.summary,
      })],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('EXECUTION_RUNS_UNAVAILABLE')) {
      return {
        task: {
          ...state.task,
          status: 'escalation',
          result: buildEscalationPayload({
            reason: message,
            prompt: 'Execution run system is unavailable. Please apply the required migration and retry.',
            confidenceScore: 0,
            trigger: 'approval_guardrail',
          }),
        },
        router_completed_step_key: null,
        trace: [AuditLogger.createStep('General Agent', message)],
      };
    }

    tracingService.handleFailure(error);
    throw error;
  }
}
