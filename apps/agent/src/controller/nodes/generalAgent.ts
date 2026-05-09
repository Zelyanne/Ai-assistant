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
import { createAgent, toolStrategy } from 'langchain';
import { z } from 'zod';
import { config } from '../../config/index.js';
import { tracingService } from '../../services/llm/tracing.js';
import { AuditLogger } from '../../services/AuditLogger.js';
import { executionRunService } from '../../services/ExecutionRunService.js';
import { memoryService } from '../../services/MemoryService.js';
import { mcpService } from '../../services/mcp.js';
import { ScheduleManageProcessor } from '../../processors/ScheduleManageProcessor.js';
import { getSpecialistPrompt } from '../../prompts/specialistPrompts.js';
import { createCurrentTimeTool } from '../../tools/timeDateTool.js';
import { createSearchWebResearchTool } from '../../tools/researchTools.js';
import { createWatchTopicTools } from '../../tools/watchTopicTools.js';
import { researchAgent, type ResearchReport } from '../../agents/ResearchAgent.js';
import type { AgentState } from '../graph.js';
import { buildEscalationPayload } from '../escalation.js';
import { createSpecialistAgentTools } from './agentToolRegistry.js';
import type { AgentToolResult, SpecialistNodeContext } from './types.js';

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
const GENERAL_AGENT_INVOKE_TIMEOUT_MS = 300_000;
const GENERAL_AGENT_TIMEOUT_MESSAGE = 'General Agent timed out while handling the request.';
const MEMORY_ENTRY_VALUE_LIMIT = 600;

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

type PendingPausedTurn = {
  previousUserRequest: string;
  pausedAssistantMessage: string;
};

type RecentTurnResolution = {
  use_conversation_context: boolean;
  confirmed: boolean;
  resolved_request: string;
  reasoning: string;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function summarizeAgentToolTrace(result: AgentToolResult): string {
  const artifactKeys = Object.keys(asRecord(result.artifacts));
  const invocationNames = Array.isArray(result.tool_invocations)
    ? result.tool_invocations
      .map((invocation) => asNonEmptyString(asRecord(invocation).tool_name) ?? asNonEmptyString(asRecord(invocation).requested_tool))
      .filter((name): name is string => Boolean(name))
    : [];
  const errorCount = Array.isArray(result.tool_invocations)
    ? result.tool_invocations.filter((invocation) => asNonEmptyString(asRecord(invocation).error)).length
    : 0;

  return [
    `status=${result.status}`,
    invocationNames.length > 0 ? `tools=${invocationNames.join(', ')}` : null,
    artifactKeys.length > 0 ? `artifacts=${artifactKeys.join(', ')}` : null,
    errorCount > 0 ? `tool_errors=${errorCount}` : null,
    result.error ? `error=${result.error}` : null,
  ].filter((part): part is string => Boolean(part)).join(' | ');
}

function summarizeMemoryValue(value: unknown): string | null {
  if (typeof value === 'undefined' || value === null || value === '') {
    return null;
  }

  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  return normalized.length <= MEMORY_ENTRY_VALUE_LIMIT
    ? normalized
    : `${normalized.slice(0, MEMORY_ENTRY_VALUE_LIMIT - 3)}...`;
}

async function appendAgentMemoryEntry(
  task: Task,
  title: string,
  fields: Array<[string, unknown]>,
): Promise<void> {
  if (!task.id || !task.user_id) {
    return;
  }

  const lines = [
    `### ${new Date().toISOString()} - ${title}`,
    `- Task: ${task.id}`,
    ...fields.flatMap(([label, value]) => {
      const summary = summarizeMemoryValue(value);
      return summary ? [`- ${label}: ${summary}`] : [];
    }),
  ];

  try {
    await memoryService.appendShortTermMemoryEntry(
      task.organization_id,
      task.user_id,
      lines.join('\n'),
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[GeneralAgent] Failed to append short-term memory entry: ${message}`);
  }
}

function getToolNames(result: AgentToolResult): string[] {
  if (!Array.isArray(result.tool_invocations)) {
    return [];
  }

  return result.tool_invocations
    .map((invocation) => asRecord(invocation))
    .map((invocation) => asNonEmptyString(invocation.tool_name) ?? asNonEmptyString(invocation.requested_tool))
    .filter((toolName): toolName is string => Boolean(toolName));
}

function buildReviewedCompletion(state: AgentState): Partial<AgentState> | null {
  const result = asRecord(state.task.result);
  const verification = asRecord(result.agent_tool_verification);

  if (
    verification.status !== 'passed'
    || result.final_response_ready === true
    || !Array.isArray(result.agent_tool_results)
  ) {
    return null;
  }

  const specialistSummaries = result.agent_tool_results
    .map((entry) => asNonEmptyString(asRecord(entry).summary))
    .filter((summary): summary is string => Boolean(summary));
  const summary = [
    asNonEmptyString(result.agent_tool_summary) ?? asNonEmptyString(result.summary) ?? 'The requested workspace action is complete.',
    `Review passed: ${asNonEmptyString(verification.summary) ?? 'Execution evidence matched the request.'}`,
    specialistSummaries.length > 0 ? `Details: ${specialistSummaries.join(' ')}` : null,
  ].filter((part): part is string => Boolean(part)).join('\n\n');

  return {
    review_feedback: null,
    task: {
      ...state.task,
      result: {
        ...result,
        outcome: 'agent_tools_reviewed',
        summary,
        final_response_ready: true,
      },
    },
    trace: [
      AuditLogger.createStep('General Agent', 'Prepared reviewed completion response', {
        output_summary: summary,
      }),
    ],
  };
}

function asConversationRole(value: unknown): ConversationRole | null {
  const role = asNonEmptyString(value);
  if (!role) return null;
  if (role === 'user' || role === 'assistant' || role === 'system') return role;
  return null;
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

function findPendingPausedTurn(entries: ConversationContextEntry[]): PendingPausedTurn | null {
  if (entries.length === 0) return null;

  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]!;
    if (entry.role !== 'assistant') continue;
    if (entry.state !== 'paused') continue;

    for (let j = i - 1; j >= 0; j -= 1) {
      const prior = entries[j]!;
      if (prior.role !== 'user') continue;
      const candidate = prior.content.trim();
      if (!candidate) continue;
      return {
        previousUserRequest: candidate,
        pausedAssistantMessage: entry.content.trim(),
      };
    }
  }

  return null;
}

function shouldResolveRecentTurnWithAgent(currentUserMessage: string, entries: ConversationContextEntry[]): boolean {
  if (entries.length === 0) return false;
  if (currentUserMessage.trim().length > 240) return false;
  return entries.some((entry) => entry.role === 'assistant');
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

const PausedTurnResolutionSchema = z.object({
  use_previous_request: z.boolean().describe('True when the latest user message continues, confirms, or edits the paused previous request.'),
  confirmed: z.boolean().describe('True only when the latest user message clearly authorizes the paused action to proceed.'),
  resolved_request: z.string().trim().min(1).describe('The request the agent should handle next. If use_previous_request=true, restate the full previous request with any latest-user edits applied.'),
  reasoning: z.string().describe('Brief explanation of the decision.'),
});

type PausedTurnResolution = z.infer<typeof PausedTurnResolutionSchema>;

const RecentTurnResolutionSchema = z.object({
  use_conversation_context: z.boolean().describe('True when the latest user message depends on recent conversation or prior assistant actions.'),
  confirmed: z.boolean().describe('True only when the latest user message clearly authorizes a pending high-risk action from the recent conversation, such as sending a previously prepared email.'),
  resolved_request: z.string().trim().min(1).describe('The full request the agent should handle next. If use_conversation_context=true, include the relevant prior action, artifact, recipient, and latest-user intent.'),
  reasoning: z.string().describe('Brief explanation of the decision.'),
});

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
  outcome: z.enum(['chat', 'plan', 'schedule', 'watch_topic', 'agent_tools']).default('plan').describe('Use "agent_tools" after calling one or more specialist-agent tools. Use "chat" for ordinary conversation that does not require Google Workspace action. Use "schedule" only after you have already created the schedule via schedule_agent_request. Use "watch_topic" only after calling a watch-topic tool.'),
  confidence: z.number().min(0).max(1).describe('Confidence in understanding the request (0-1). Be generous — most natural language requests should be >= 0.8.'),
  interpretation: z.string().describe('How you interpreted the user request'),
  needs_clarification: z.boolean().describe('True ONLY if the request is truly ambiguous (e.g. missing recipient, subject is unclear, dates are completely vague). Default false for clear requests.'),
  clarification_prompt: z.string().optional().describe('What to ask the user if clarification needed'),
  summary: z.string().describe('One-line summary of the plan'),
  reasoning: z.string().describe('Brief reasoning for the plan structure'),
  steps: z.array(PlanStepSchema).describe('Ordered execution steps. Empty if clarification needed.'),
  chat_response: z.string().optional().describe('Required when outcome is "chat". A concise, natural reply to the user.'),
  schedule_result: GeneralAgentScheduleResultSchema.optional().describe('Required when outcome is "schedule". Copy the JSON returned by schedule_agent_request.'),
  watch_topic_result: GeneralAgentWatchTopicResultSchema.optional().describe('Required when outcome is "watch_topic". Copy the JSON returned by manage_watch_topic or list_watch_topics.'),
  agent_tool_summary: z.string().optional().describe('Required when outcome is "agent_tools". Summarize what the specialist-agent tool calls completed and any next step.'),
});

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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function isGeneralAgentTimeoutMessage(message: string): boolean {
  return message === GENERAL_AGENT_TIMEOUT_MESSAGE
    || message.includes('General Agent timed out');
}

function isLikelyDirectResearchRequest(userRequest: string): boolean {
  const lower = userRequest.toLowerCase();
  const asksForResearch = /\b(news|actualit[eé]s?|recherche|chercher|cherche|web|internet|sources?|r[eé]cent(?:e|es|s)?|latest|current|202\d)\b/.test(lower)
    || lower.includes('entendu parler')
    || lower.includes('explique')
    || lower.includes('expliquer')
    || lower.includes('qu est-ce')
    || lower.includes("qu'est-ce");
  const asksWorkspaceAction = /\b(gmail|email|mail|agenda|calendar|drive|doc|docs|document|sheet|sheets|slide|slides|envoie|envoyer|send|draft|brouillon|cr[eé]e|create|modifie|update)\b/.test(lower);

  return asksForResearch && !asksWorkspaceAction;
}

function detectResearchLanguage(userRequest: string): string | undefined {
  const lower = userRequest.toLowerCase();
  if (/[àâçéèêëîïôùûüÿœ]/i.test(userRequest)
    || /\b(stp|s'il|salut|actualit[eé]s?|explique|peux|quoi|ovni|je|tu|les|des)\b/.test(lower)) {
    return 'fr';
  }

  return undefined;
}

function formatResearchSourceList(report: ResearchReport): string[] {
  return report.sources.slice(0, 5).map((source, index) => {
    const title = source.title.replace(/\s+/g, ' ').trim();
    return `${index + 1}. ${title}: ${source.url}`;
  });
}

function formatDirectResearchResponse(userRequest: string, report: ResearchReport): string {
  const lines: string[] = [];

  if (/\bovni\b|\bufo\b/i.test(userRequest)) {
    lines.push('Un OVNI est simplement un Objet Volant Non Identifie: un phenomene observe dans le ciel qu on ne sait pas encore identifier. Ca ne veut pas dire automatiquement extraterrestre; ca peut aussi etre un drone, un avion, un phenomene météo, un ballon, une erreur d observation, ou quelque chose qui merite une vraie enquete.');
    lines.push('');
  }

  if (report.key_findings.length > 0) {
    lines.push(`J ai trouve ${report.sources.length} source${report.sources.length === 1 ? '' : 's'} recentes. Points principaux:`);
    for (const finding of report.key_findings.slice(0, 5)) {
      lines.push(`- ${finding}`);
    }
  } else {
    lines.push('J ai pu interroger la recherche web, mais aucune source exploitable n est remontee pour cette question.');
  }

  const sourceLines = formatResearchSourceList(report);
  if (sourceLines.length > 0) {
    lines.push('');
    lines.push('Sources:');
    lines.push(...sourceLines);
  }

  return lines.join('\n');
}

async function buildDirectResearchChatResponse(userRequest: string): Promise<string> {
  try {
    const report = await researchAgent.run({
      query: userRequest,
      language: detectResearchLanguage(userRequest),
      safesearch: 1,
    });

    return formatDirectResearchResponse(userRequest, report);
  } catch {
    return 'Je n arrive pas a interroger la recherche web pour le moment. Reessaie dans quelques instants, ou pose-moi la question sans les actualites recentes et je te repondrai avec mes connaissances generales.';
  }
}

async function resolvePausedTurnWithAgent(
  currentUserMessage: string,
  pendingTurn: PendingPausedTurn,
): Promise<PausedTurnResolution | null> {
  const langfuseHandler = tracingService.getHandler();
  const callbacks = langfuseHandler ? [langfuseHandler] : [];
  const llm = new ChatMistralAI({
    apiKey: config.MISTRAL_API_KEY,
    model: config.DEFAULT_LLM_MODEL,
    temperature: 0,
    callbacks,
  });

  const resolver = createAgent({
    model: llm,
    tools: [],
    systemPrompt: [
      'You are the General Agent resolving a paused conversation turn.',
      'Decide from the conversation, not from hardcoded keywords, whether the latest user message continues/confirms the paused previous request or starts a new request.',
      'Only set confirmed=true when the latest user message clearly authorizes proceeding with the paused action.',
      'If the latest message merely asks a question, changes topic, or is unclear, set use_previous_request=false and confirmed=false.',
    ].join(' '),
    responseFormat: toolStrategy(PausedTurnResolutionSchema),
  });

  try {
    const result = await withTimeout(
      resolver.invoke({
        messages: [{
          role: 'user',
          content: [
            'Previous user request:',
            pendingTurn.previousUserRequest,
            '',
            'Assistant paused with:',
            pendingTurn.pausedAssistantMessage,
            '',
            'Latest user message:',
            currentUserMessage,
            '',
            'Return the full resolved request and whether this latest message confirms the paused action.',
          ].join('\n'),
        }],
      }, { callbacks }),
      30_000,
      'General Agent timed out while resolving paused conversation turn.',
    );

    const structured = (result as unknown as { structuredResponse?: unknown }).structuredResponse;
    return PausedTurnResolutionSchema.parse(structured);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[GeneralAgent] Could not resolve paused conversation turn: ${message}`);
    return null;
  }
}

async function resolveRecentTurnWithAgent(
  currentUserMessage: string,
  conversationEntries: ConversationContextEntry[],
): Promise<RecentTurnResolution | null> {
  if (conversationEntries.length === 0) {
    return null;
  }

  const langfuseHandler = tracingService.getHandler();
  const callbacks = langfuseHandler ? [langfuseHandler] : [];
  const llm = new ChatMistralAI({
    apiKey: config.MISTRAL_API_KEY,
    model: config.DEFAULT_LLM_MODEL,
    temperature: 0,
    callbacks,
  });

  const resolver = createAgent({
    model: llm,
    tools: [],
    systemPrompt: [
      'You are the General Agent resolving whether the latest user message continues recent conversation context.',
      'Decide from the conversation, not from hardcoded keywords, whether the latest message refers to prior assistant work, artifacts, drafts, recipients, or actions.',
      'Only set confirmed=true when the latest message clearly authorizes a high-risk pending action already prepared or discussed in context.',
      'When resolving a continuation, describe only the next action to execute now; keep prior completed setup or artifacts as context, not as work to repeat.',
      'If the latest message asks to send a message that is already a draft, resolve to a Gmail send action for that existing/prepared draft context; do not ask Docs/Drive to recreate prior artifacts.',
      'If the latest message starts a new request or is unclear, set use_conversation_context=false and confirmed=false.',
    ].join(' '),
    responseFormat: toolStrategy(RecentTurnResolutionSchema),
  });

  try {
    const result = await withTimeout(
      resolver.invoke({
        messages: [{
          role: 'user',
          content: [
            buildConversationContextBlock(conversationEntries),
            '',
            'Latest user message:',
            currentUserMessage,
            '',
            'Return the full resolved request and whether this latest message confirms a pending high-risk action from the recent conversation.',
          ].join('\n'),
        }],
      }, { callbacks }),
      30_000,
      'General Agent timed out while resolving recent conversation turn.',
    );

    const structured = (result as unknown as { structuredResponse?: unknown }).structuredResponse;
    return RecentTurnResolutionSchema.parse(structured);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[GeneralAgent] Could not resolve recent conversation turn: ${message}`);
    return null;
  }
}

function isLikelyWorkspaceActionRequest(userRequest: string): boolean {
  return /\b(gmail|e-?mail|mail|calendar|event|meeting|doc|docs|document|sheet|sheets|spreadsheet|slide|slides|presentation|deck|google drive|drive)\b/i.test(userRequest);
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
  options: {
    confirmed: boolean;
    agentToolMemory?: SpecialistNodeContext['memory'];
  },
): Promise<{
  plan: ExecutionPlan | null;
  scheduleResult: GeneralAgentScheduleResult | null;
  watchTopicResult: GeneralAgentWatchTopicResult | null;
  agentToolResults: AgentToolResult[];
  agentToolSummary: string | null;
  chatResponse: string | null;
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
      agentToolResults: [],
      agentToolSummary: null,
      chatResponse: null,
      confidence: 1.0,
      needsClarification: false,
      clarificationPrompt: null,
    };
  }

  if (isLikelyDirectResearchRequest(userRequest)) {
    return {
      plan: null,
      scheduleResult: null,
      watchTopicResult: null,
      agentToolResults: [],
      agentToolSummary: null,
      chatResponse: await buildDirectResearchChatResponse(userRequest),
      confidence: 1,
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
  const mcpToolFetchError = (mcpService as { getLastLangChainToolError?: (orgId: string) => string | null })
    .getLastLangChainToolError?.(task.organization_id) ?? null;
  if (allMcpTools.length === 0 && mcpToolFetchError && isLikelyWorkspaceActionRequest(userRequest)) {
    return {
      plan: null,
      scheduleResult: null,
      watchTopicResult: null,
      agentToolResults: [],
      agentToolSummary: null,
      chatResponse: null,
      confidence: 0,
      needsClarification: true,
      clarificationPrompt: `Google Workspace tools are temporarily unavailable: ${mcpToolFetchError}. Please retry in a moment; if this persists, restart the agent process and check that \`uvx workspace-mcp --transport streamable-http --tool-tier extended\` can start.`,
    };
  }
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

  const agentToolResults: AgentToolResult[] = [];

  const generalAgentTools = [
    ...safeTools,
    createSearchWebResearchTool(),
    createCurrentTimeTool(),
    createScheduleAgentRequestTool(task),
    ...createWatchTopicTools({ organizationId: task.organization_id, userId: task.user_id }),
    ...createSpecialistAgentTools({
      task,
      originalCommand: userRequest,
      memory: options.agentToolMemory,
      allowHighRiskActions: options.confirmed,
      onResult: async (result) => {
        agentToolResults.push(result);
        await appendAgentMemoryEntry(task, `${result.agent} specialist-agent call`, [
          ['Status', result.status],
          ['Summary', result.summary],
          ['Tools', getToolNames(result).join(', ')],
          ['Artifacts', Object.keys(asRecord(result.artifacts)).join(', ')],
          ['Next prompt', result.next_prompt],
          ['Error', result.error],
        ]);
      },
    }),
  ];

  const agent = createAgent({
    model: llm,
    tools: generalAgentTools,
    systemPrompt: getSpecialistPrompt('generalAgent'),
    responseFormat: toolStrategy(GeneralAgentResponseSchema),
  });

  const result = await withTimeout(
    agent.invoke({
      messages: [{
        role: 'user',
        content: [
          memoryContextBlock,
          `User request: "${userRequest}"`,
          '',
          'Interpret this request and produce an execution plan.',
          '',
          'HARD CONSTRAINTS:',
          '- If the request is ordinary conversation, greeting, small talk, or a general assistant question that does not require Google Workspace action, set outcome="chat", answer in chat_response, and leave steps empty.',
          '- If EXECUTION REVIEW FEEDBACK FOR RETRY is present, correct the previous execution issue before finalizing. Do not repeat the reviewed mistake.',
          '- If EXECUTION REVIEW FEEDBACK FOR RETRY says the user must clarify or confirm something, ask the user directly and do not call specialist tools.',
          '- For immediate Google Workspace actions, call specialist-agent tools (`ask_gmail_agent`, `ask_calendar_agent`, `ask_docs_agent`, `ask_sheets_agent`, `ask_slides_agent`, `ask_drive_agent`) instead of producing router steps.',
          '- Call specialist-agent tools sequentially, one at a time. Include prior specialist handoff_content in the next specialist prompt when the next action depends on it.',
          '- After specialist-agent tools run, set outcome="agent_tools", include agent_tool_summary, and leave steps empty.',
          '- Do not use outcome="plan" for immediate workspace execution. The legacy router/worker execution plan path is disabled.',
          '- Use search_web_research only when the request needs current/public external facts, news, market data, or source-backed research. Do not use web research for greetings, small talk, private user data, or Google Workspace content.',
          '- If search_web_research returns ok=false, continue gracefully: answer that web research is unavailable or ask whether to proceed without external research.',
          '- If the request is clearly future-oriented or recurring, call get_current_time first, then call schedule_agent_request, and set outcome="schedule".',
          '- For relative one-off timing (e.g. "in 10 minutes"), compute an absolute datetime and pass it in schedule_agent_request.run_at_iso.',
          '- When using run_at_iso, set request to the action text to run later (remove timing words so the scheduled command does not re-schedule itself).',
          '- Do NOT produce immediate execution steps for clearly scheduled requests unless the user explicitly wants both now and later.',
          '- If you set outcome="schedule", include schedule_result copied from the schedule_agent_request tool output and leave steps empty.',
          '- If the request is to watch, monitor, alert on, list, or update mail topics, use manage_watch_topic or list_watch_topics, set outcome="watch_topic", include watch_topic_result copied from the tool output, and leave steps empty.',
          '- If a watch-topic request includes a finite duration such as "for two weeks", pass duration_days to manage_watch_topic; pass expires_at only for an explicit end datetime.',
          '- Watch-topic requests are mail triage preferences, not calendar alarms. Do not create calendar steps for them.',
          '- worker_type MUST be one of: "gmail", "calendar", "docs", "sheets", "slides", "drive".',
          '- Do NOT specify tool names in your plan — specialists select their own tools.',
          '- If an email task has only a person name and no email after contact lookup, ask the user to provide the email address directly.',
          '- For Gmail steps: do NOT draft the final email subject/body copy unless the user explicitly provided exact text; put the core content in input.message and style requirements in input.instructions.',
        ].join('\n'),
      }],
    }, { callbacks }),
    GENERAL_AGENT_INVOKE_TIMEOUT_MS,
    GENERAL_AGENT_TIMEOUT_MESSAGE,
  );

  const structured = (result as unknown as { structuredResponse?: unknown }).structuredResponse;
  const parsedResult = GeneralAgentResponseSchema.safeParse(structured);
  if (!parsedResult.success) {
    const issueSummary = parsedResult.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    console.warn(`[GeneralAgent] Structured planning response was invalid: ${issueSummary}`);

    if (agentToolResults.length > 0) {
      return {
        plan: null,
        scheduleResult: null,
        watchTopicResult: null,
        agentToolResults,
        agentToolSummary: agentToolResults.map((toolResult) => toolResult.summary).filter(Boolean).join(' ') || 'Specialist agents completed.',
        chatResponse: null,
        confidence: 0.8,
        needsClarification: false,
        clarificationPrompt: null,
      };
    }

    return {
      plan: null,
      scheduleResult: null,
      watchTopicResult: null,
      agentToolResults: [],
      agentToolSummary: null,
      chatResponse: null,
      confidence: 0,
      needsClarification: true,
      clarificationPrompt: 'I could not reliably interpret this request. Please retry or rephrase it, and I will continue from there.',
    };
  }

  const parsed = parsedResult.data;

  if (agentToolResults.length > 0 || parsed.outcome === 'agent_tools') {
    return {
      plan: null,
      scheduleResult: null,
      watchTopicResult: null,
      agentToolResults,
      agentToolSummary: parsed.agent_tool_summary ?? parsed.summary,
      chatResponse: null,
      confidence: parsed.confidence,
      needsClarification: parsed.needs_clarification || parsed.confidence < CONFIDENCE_THRESHOLD || agentToolResults.length === 0,
      clarificationPrompt: agentToolResults.length === 0
        ? parsed.clarification_prompt ?? 'I could not call the required specialist agent. Please rephrase the request.'
        : parsed.clarification_prompt ?? null,
    };
  }

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

  if (parsed.outcome === 'chat') {
    return {
      plan: null,
      scheduleResult: null,
      watchTopicResult: null,
      agentToolResults: [],
      agentToolSummary: null,
      chatResponse: parsed.chat_response ?? parsed.summary,
      confidence: parsed.confidence,
      needsClarification: false,
      clarificationPrompt: null,
    };
  }

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
      agentToolResults: [],
      agentToolSummary: null,
      chatResponse: null,
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
      agentToolResults: [],
      agentToolSummary: null,
      chatResponse: null,
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

  const hasNoExecutableSteps = plan.steps.length === 0;
  if (hasNoExecutableSteps && !parsed.needs_clarification && unsupportedWorkerTypes.length === 0) {
    return {
      plan: null,
      scheduleResult: null,
      watchTopicResult: null,
      agentToolResults: [],
      agentToolSummary: null,
      chatResponse: parsed.chat_response ?? parsed.summary,
      confidence: parsed.confidence,
      needsClarification: false,
      clarificationPrompt: null,
    };
  }

  return {
    plan,
    scheduleResult: null,
    watchTopicResult: null,
    agentToolResults: [],
    agentToolSummary: null,
    chatResponse: null,
    confidence: parsed.confidence,
    needsClarification: parsed.needs_clarification
      || parsed.confidence < CONFIDENCE_THRESHOLD
      || unsupportedWorkerTypes.length > 0,
    clarificationPrompt: unsupportedWorkerTypes.length > 0
      ? (parsed.clarification_prompt ?? 'I could not map one or more requested steps to available specialist workers. Please rephrase the request.')
      : (parsed.clarification_prompt ?? null),
  };
}

// --- Main Node Function ---

export async function generalAgentNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    if (!state.task.id) {
      return { error: 'Task ID is required for general agent execution.' };
    }

    const reviewedCompletion = buildReviewedCompletion(state);
    if (reviewedCompletion) {
      await appendAgentMemoryEntry(state.task, 'General Agent final response after review', [
        ['Summary', asRecord(reviewedCompletion.task?.result).summary],
        ['Review status', 'passed'],
      ]);
      return reviewedCompletion;
    }

    const userInitiatedChannel = getUserInitiatedChannel(state.task);

    const existingRun = state.execution_run ?? await executionRunService.getByTaskId(state.task.id);
    if (existingRun) {
      const executionRunResult = executionRunService.buildTaskResult(existingRun).execution_run;
      const prompt = 'Legacy execution-run worker orchestration has been disabled. Please submit the request again so the General Agent can run it through direct specialist-agent tools.';
      return {
        execution_run: existingRun,
        router_completed_step_key: null,
        task: {
          ...state.task,
          status: userInitiatedChannel ? 'paused' : 'escalation',
          result: buildEscalationPayload({
            reason: 'Legacy worker orchestration disabled',
            prompt,
            confidenceScore: 0,
            trigger: 'approval_guardrail',
            extra: {
              summary: prompt,
              ...(executionRunResult ? { execution_run: executionRunResult } : {}),
            },
          }),
        },
        trace: [AuditLogger.createStep('General Agent', 'Blocked legacy execution-run worker orchestration', { output_summary: prompt })],
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
    const pendingPausedTurn = !confirmedByPrefix ? findPendingPausedTurn(conversationEntries) : null;
    const pausedTurnResolution = pendingPausedTurn
      ? await resolvePausedTurnWithAgent(normalizedRawRequest, pendingPausedTurn)
      : null;
    const recentTurnResolution = !confirmedByPrefix && !pausedTurnResolution && shouldResolveRecentTurnWithAgent(normalizedRawRequest, conversationEntries)
      ? await resolveRecentTurnWithAgent(normalizedRawRequest, conversationEntries)
      : null;
    const userRequest = confirmedByPrefix
      ? confirmationMatch![1]!.trim()
      : (pausedTurnResolution?.use_previous_request === true
        ? pausedTurnResolution.resolved_request
        : (recentTurnResolution?.use_conversation_context === true ? recentTurnResolution.resolved_request : normalizedRawRequest));

    const confirmed = payload.confirmed === true
      || confirmedByPrefix
      || pausedTurnResolution?.confirmed === true
      || recentTurnResolution?.confirmed === true;

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

    await appendAgentMemoryEntry(state.task, 'General Agent request', [
      ['Request', userRequest],
      ['Review feedback', state.review_feedback],
      ['Confirmed', confirmed],
    ]);

    const memoryContextBlock = buildMemoryContextBlock(state);
    const conversationContextBlock = buildConversationContextBlock(conversationEntries);
    const reviewFeedbackBlock = state.review_feedback
      ? `EXECUTION REVIEW FEEDBACK FOR RETRY:\n${state.review_feedback}`
      : '';
    const planningContextBlock = [memoryContextBlock, conversationContextBlock, reviewFeedbackBlock].filter((part) => Boolean(part)).join('\n\n');

    if (payload.high_risk === true && !confirmed) {
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
        trace: [AuditLogger.createStep('General Agent', userInitiatedChannel
          ? 'Paused: high-risk command requires confirmation'
          : 'Escalated: high-risk command requires confirmation', { output_summary: prompt })],
      };
    }

    const { plan, scheduleResult, watchTopicResult, agentToolResults, agentToolSummary, chatResponse, confidence, clarificationPrompt } = await buildPlanFromUserInput(
      state.task,
      userRequest,
      plannerIntent,
      planningContextBlock,
      {
        confirmed,
        agentToolMemory: {
          persona_memory: truncateMemory(state.persona_memory) ?? undefined,
          long_term_memory: truncateMemory(state.long_term_memory) ?? undefined,
        },
      },
    );

    if (agentToolResults.length > 0) {
      const summary = agentToolSummary
        ?? agentToolResults.map((result) => result.summary).filter(Boolean).join(' ')
        ?? 'Specialist agents completed.';

      return {
        task: {
          ...state.task,
          result: {
            ...(state.task.result ?? {}),
            summary,
            outcome: 'agent_tools_completed',
            agent_tool_original_request: userRequest,
            agent_tool_results: agentToolResults,
          },
        },
        router_completed_step_key: null,
        trace: [
          AuditLogger.createStep('General Agent', `Called ${agentToolResults.length} specialist-agent tool(s)`, { output_summary: summary }),
          ...agentToolResults.map((result) => AuditLogger.createStep(
            `${result.agent} Agent Tool`,
            result.summary,
            { output_summary: summarizeAgentToolTrace(result) },
          )),
        ],
      };
    }

    if (chatResponse) {
      return {
        task: {
          ...state.task,
          result: {
            summary: chatResponse,
            chat_response: chatResponse,
            outcome: 'chat_response',
          },
        },
        router_completed_step_key: null,
        trace: [AuditLogger.createStep('General Agent', 'Responded conversationally', { output_summary: chatResponse })],
      };
    }

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

    const prompt = 'I resolved this into a legacy execution plan, but the old worker/router orchestration is disabled. Please retry the request so I can execute it through direct specialist-agent tools, or make the request more explicit about the workspace apps to use.';
    return {
      router_completed_step_key: null,
      task: {
        ...state.task,
        status: userInitiatedChannel ? 'paused' : 'escalation',
        result: buildEscalationPayload({
          reason: 'Legacy worker orchestration disabled',
          prompt,
          confidenceScore: confidence,
          trigger: 'ambiguity_detected',
          extra: { summary: prompt },
        }),
      },
      trace: [AuditLogger.createStep('General Agent', 'Rejected legacy execution plan fallback', {
        confidence_score: confidence,
        output_summary: prompt,
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

    if (isGeneralAgentTimeoutMessage(message)) {
      tracingService.handleFailure(error);
      const userInitiatedChannel = getUserInitiatedChannel(state.task);
      const prompt = [
        'I could not verify completion before the execution timeout.',
        'Some tool calls may still have been attempted, so check Google Docs and Gmail before asking me to retry to avoid duplicates.',
        'If nothing was created or sent, reply "retry" and I will run it again with the review context.',
      ].join(' ');

      await appendAgentMemoryEntry(state.task, 'General Agent timeout', [
        ['Error', message],
        ['Next step', prompt],
      ]);

      return {
        task: {
          ...state.task,
          status: userInitiatedChannel ? 'paused' : 'escalation',
          result: buildEscalationPayload({
            reason: 'General Agent execution timed out',
            prompt,
            confidenceScore: 0,
            trigger: 'approval_guardrail',
            extra: {
              summary: prompt,
              outcome: 'execution_timeout',
            },
          }),
        },
        router_completed_step_key: null,
        trace: [
          AuditLogger.createStep(
            'General Agent',
            userInitiatedChannel
              ? 'Paused: execution timed out before verification'
              : 'Escalated: execution timed out before verification',
            { output_summary: prompt },
          ),
        ],
      };
    }

    tracingService.handleFailure(error);
    throw error;
  }
}
