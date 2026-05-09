import type { ExecutionPlanStep, ExecutionRun, Json, Task } from '@ai-assistant/shared';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { buildPromptScopedSkillAppendix } from '../../prompts/agentSkillInjector.js';
import { calendarAgentNode } from './calendarAgent.js';
import { docsAgentNode } from './docsAgent.js';
import { driveAgentNode } from './driveAgent.js';
import { gmailAgentNode } from './gmailAgent.js';
import { sheetsAgentNode } from './sheetsAgent.js';
import { slidesAgentNode } from './slidesAgent.js';
import type {
  AgentToolResult,
  SpecialistNodeContext,
  SpecialistNodeResult,
  SpecialistWorkerType,
  ToolInvocationRecord,
} from './types.js';

type SpecialistExecutor = (context: SpecialistNodeContext) => Promise<SpecialistNodeResult>;

const SPECIALIST_EXECUTORS: Record<SpecialistWorkerType, SpecialistExecutor> = {
  gmail: gmailAgentNode,
  calendar: calendarAgentNode,
  docs: docsAgentNode,
  sheets: sheetsAgentNode,
  slides: slidesAgentNode,
  drive: driveAgentNode,
};

const SPECIALIST_TOOL_DESCRIPTIONS: Record<SpecialistWorkerType, string> = {
  gmail: 'Call the Gmail specialist agent for Gmail drafting, thread reading, watch-topic, or sending work. Input must be a complete prompt.',
  calendar: 'Call the Calendar specialist agent for event creation, updates, deletion, or availability checks. Input must be a complete prompt.',
  docs: 'Call the Google Docs specialist agent for document creation, reading, or editing. Input must be a complete prompt.',
  sheets: 'Call the Google Sheets specialist agent for spreadsheet creation, reading, or updates. Input must be a complete prompt.',
  slides: 'Call the Google Slides specialist agent for presentation creation or updates. Input must be a complete prompt.',
  drive: 'Call the Google Drive specialist agent for Drive search, file reading, or file creation/import work. Input must be a complete prompt.',
};

const EXPLICIT_GMAIL_SEND_PATTERN = /\b(send|sent|sending|forward|forwarded|forwarding|reply|replied|replying|respond|responded|responding|envoyer|envoie|exp[eé]die|transmets?|r[eé]ponds?|reponds?)\b/i;
const AMBIGUOUS_GMAIL_SEND_PATTERN = /\b(e-?mail|mail|courriel)\b/i;
const DRAFT_ONLY_GMAIL_PATTERN = /\b(draft|write|compose|prepare|brouillon|r[eé]dige|redige|pr[eé]pare|prepare)\b/i;

function toJson(value: unknown): Json {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }
  if (typeof value === 'undefined') return null;
  if (Array.isArray(value)) return value.map((entry) => toJson(entry));
  if (typeof value === 'object') {
    const out: Record<string, Json | undefined> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = toJson(entry);
    }
    return out;
  }
  return String(value);
}

function toJsonRecord(value: unknown): Record<string, Json | undefined> {
  const parsed = parseMaybeJson(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  const out: Record<string, Json | undefined> = {};
  for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
    out[key] = toJson(entry);
  }
  return out;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function buildSyntheticStep(workerType: SpecialistWorkerType, prompt: string, index: number): ExecutionPlanStep {
  return {
    key: `agent-tool-${workerType}-${index}`,
    title: `Ask ${workerType} agent`,
    worker_type: workerType,
    action: 'execute_prompt',
    status: 'in_progress',
    requested_tools: [],
    input: { prompt },
    output: {},
    attempt_count: 0,
    idempotency_key: `agent-tool-${workerType}-${index}`,
    recoverable: false,
  };
}

function buildSyntheticRun(task: Task, originalCommand: string, step: ExecutionPlanStep): ExecutionRun {
  const now = new Date().toISOString();

  return {
    id: `agent-tool-${task.id ?? 'task'}-${step.key}`,
    task_id: task.id ?? 'agent-tool-task',
    organization_id: task.organization_id,
    status: 'processing',
    current_step_key: step.key,
    current_worker_type: step.worker_type,
    last_error: null,
    idempotency_state: {},
    tool_policy_version: 'agent-tool-v1',
    version: 1,
    created_at: now,
    updated_at: now,
    ledger_markdown: `# Agent Tool Run\n\n- ${step.worker_type}: ${step.title}`,
    plan_json: {
      version: 'v1',
      original_command: originalCommand,
      summary: `Prompt-only ${step.worker_type} agent tool call`,
      ledger_entries: [],
      replan_count: 0,
      steps: [step],
    },
  } as ExecutionRun;
}

function extractArtifacts(output: Record<string, Json | undefined>): Record<string, Json | undefined> {
  const artifacts: Record<string, Json | undefined> = {};
  for (const [key, value] of Object.entries(output)) {
    if (typeof value === 'undefined' || value === null) continue;
    if (key === 'summary' || key === 'handoff_content' || key === 'tool_name') continue;
    if (/(^id$|_id$|url$|_url$|link$|html_link$|htmlLink$)/i.test(key)) {
      artifacts[key] = value;
    }
  }
  return artifacts;
}

function getFailureMessage(value: unknown): string | null {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      const message = getFailureMessage(entry);
      if (message) return message;
    }
    return null;
  }

  const record = toJsonRecord(parsed);
  if (record.success === false || record.ok === false) {
    return asString(record.error) ?? asString(record.message) ?? 'Tool returned an unsuccessful result.';
  }

  const status = asString(record.status)?.toLowerCase();
  if (status === 'failed' || status === 'error') {
    return asString(record.error) ?? asString(record.message) ?? `Tool returned status ${status}.`;
  }

  return asString(record.error);
}

function sanitizeToolInvocation(invocation: ToolInvocationRecord): Record<string, Json | undefined> {
  const resultRecord = toJsonRecord(invocation.result);
  const artifacts = extractArtifacts(resultRecord);
  const summary = asString(resultRecord.summary)
    ?? asString(resultRecord.message)
    ?? asString(resultRecord.confirmation_message);
  const error = getFailureMessage(invocation.result);

  const record: Record<string, Json | undefined> = {
    requested_tool: invocation.requestedTool,
    tool_name: invocation.toolName,
  };

  if (summary) record.summary = summary;
  if (error) record.error = error;
  if (typeof resultRecord.success === 'boolean') record.success = resultRecord.success;
  if (typeof resultRecord.ok === 'boolean') record.ok = resultRecord.ok;
  if (asString(resultRecord.status)) record.status = resultRecord.status;
  if (Object.keys(artifacts).length > 0) record.artifacts = artifacts;

  return record;
}

function buildToolInvocationRecord(result: SpecialistNodeResult): Array<Record<string, Json | undefined>> {
  if (result.toolInvocations && result.toolInvocations.length > 0) {
    return result.toolInvocations.map(sanitizeToolInvocation);
  }

  if (!result.toolName) {
    return [];
  }

  return [{ tool_name: result.toolName }];
}

function toAgentToolResult(workerType: SpecialistWorkerType, result: SpecialistNodeResult): AgentToolResult {
  const output = toJsonRecord(result.output);
  const summary = result.summary || asString(output.summary) || `${workerType} agent completed.`;
  const handoff = asString(output.handoff_content) || result.nextWorkerNote || summary;
  const error = getFailureMessage(result.output)
    ?? result.toolInvocations?.map((invocation) => getFailureMessage(invocation.result)).find(Boolean)
    ?? null;

  return {
    agent: workerType,
    status: error ? 'failed' : 'completed',
    summary,
    handoff_content: handoff,
    artifacts: extractArtifacts(output),
    tool_invocations: buildToolInvocationRecord(result),
    next_prompt: result.nextWorkerNote || undefined,
    error: error ?? undefined,
  };
}

function needsGmailConfirmation(workerType: SpecialistWorkerType, prompt: string, allowHighRiskActions: boolean): boolean {
  if (workerType !== 'gmail' || allowHighRiskActions) {
    return false;
  }

  return EXPLICIT_GMAIL_SEND_PATTERN.test(prompt)
    || (AMBIGUOUS_GMAIL_SEND_PATTERN.test(prompt) && !DRAFT_ONLY_GMAIL_PATTERN.test(prompt));
}

export interface CreateSpecialistAgentToolsOptions {
  task: Task;
  originalCommand: string;
  memory?: SpecialistNodeContext['memory'];
  allowHighRiskActions: boolean;
  onResult?: (result: AgentToolResult) => void | Promise<void>;
}

async function emitSpecialistResult(
  options: CreateSpecialistAgentToolsOptions,
  result: AgentToolResult,
): Promise<void> {
  try {
    await options.onResult?.(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[AgentToolRegistry] Failed to record ${result.agent} result: ${message}`);
  }
}

export function createSpecialistAgentTools(options: CreateSpecialistAgentToolsOptions): DynamicStructuredTool[] {
  let callIndex = 0;

  return (Object.keys(SPECIALIST_EXECUTORS) as SpecialistWorkerType[]).map((workerType) => new DynamicStructuredTool({
    name: `ask_${workerType}_agent`,
    description: SPECIALIST_TOOL_DESCRIPTIONS[workerType],
    schema: z.object({
      prompt: z.string().trim().min(1).describe('Complete instructions for the specialist agent. Include all relevant handoff context from prior agent calls.'),
    }),
    func: async ({ prompt }: { prompt: string }) => {
      callIndex += 1;

      if (needsGmailConfirmation(workerType, prompt, options.allowHighRiskActions)) {
        const blocked: AgentToolResult = {
          agent: workerType,
          status: 'needs_confirmation',
          summary: 'Gmail send-like action requires explicit user confirmation before execution.',
          handoff_content: 'Ask the user to confirm the send action or convert it to a draft-only request.',
          artifacts: {},
          tool_invocations: [],
          next_prompt: 'Ask the user for explicit confirmation before sending, or offer to create a draft instead.',
        };
        await emitSpecialistResult(options, blocked);
        return JSON.stringify(blocked);
      }

      try {
        const step = buildSyntheticStep(workerType, prompt, callIndex);
        const relevantSkills = await buildPromptScopedSkillAppendix({
          target: workerType,
          prompt,
          organizationId: options.task.organization_id,
          userId: options.task.user_id,
        });

        const specialistResult = await SPECIALIST_EXECUTORS[workerType]({
          task: options.task,
          executionRun: buildSyntheticRun(options.task, options.originalCommand, step),
          step,
          memory: options.memory,
          agentToolPrompt: prompt,
          relevantSkillContext: relevantSkills.content,
          allowHighRiskActions: options.allowHighRiskActions,
        });

        const result = toAgentToolResult(workerType, specialistResult);
        if (relevantSkills.lookupError) {
          result.tool_invocations.push({
            tool_name: 'user_skill_lookup',
            error: relevantSkills.lookupError,
          });
        }
        await emitSpecialistResult(options, result);
        return JSON.stringify(result);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const failed: AgentToolResult = {
          agent: workerType,
          status: 'failed',
          summary: `${workerType} agent failed: ${message}`,
          handoff_content: '',
          artifacts: {},
          tool_invocations: [],
          error: message,
          next_prompt: `Ask the user for guidance or retry ${workerType} with corrected instructions.`,
        };
        await emitSpecialistResult(options, failed);
        return JSON.stringify(failed);
      }
    },
  }));
}
