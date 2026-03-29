/**
 * General Agent Node
 *
 * User-facing entry point that receives requests, uses the time/date tool,
 * and produces structured execution plans for the Router to dispatch.
 *
 * @see ADR-001: Router Node Pattern
 * @see Task 24: Intent Clarification Logic
 */

import type { AssistantCommandIntent, ExecutionPlan } from '@ai-assistant/shared';
import { ChatMistralAI } from '@langchain/mistralai';
import { z } from 'zod';
import { config } from '../../config/index.js';
import { tracingService } from '../../services/llm/tracing.js';
import { AuditLogger } from '../../services/AuditLogger.js';
import { executionRunService } from '../../services/ExecutionRunService.js';
import { workerToolPolicyService, type CapabilityWorkerType } from '../../services/WorkerToolPolicyService.js';
import { mcpService } from '../../services/mcp.js';
import { buildAgentSkillAppendix } from '../../prompts/agentSkillInjector.js';
import type { AgentState } from '../graph.js';
import { buildEscalationPayload } from '../escalation.js';

// --- Configuration ---

const CONFIDENCE_THRESHOLD = config.CONFIDENCE_THRESHOLD ?? 0.8;

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

// --- Intent + Plan (merged into a single LLM call) ---

const PlanStepSchema = z.object({
  key: z.string().describe('Unique step identifier (e.g. "step-1")'),
  title: z.string().describe('Human-readable step title'),
  worker_type: z.enum(['gmail', 'calendar', 'docs', 'sheets', 'slides', 'drive']).describe('Specialist agent to execute this step'),
  action: z.string().describe('Natural-language description of what the specialist should do (e.g. "create a spreadsheet with the project budget", "draft an email to the team about the meeting")'),
  input: z.record(z.unknown()).describe('Structured input with the data the specialist needs (fields like recipient, subject, title, description, etc). The specialist decides which tools to call.'),
  recoverable: z.boolean().default(false).describe('Whether this step can recover from failure'),
});

/**
 * Combined schema: one LLM call handles both intent assessment AND plan building.
 * If confidence < threshold, steps will be empty and clarification fields filled.
 */
const GeneralAgentResponseSchema = z.object({
  confidence: z.number().min(0).max(1).describe('Confidence in understanding the request (0-1). Be generous — most natural language requests should be >= 0.8.'),
  interpretation: z.string().describe('How you interpreted the user request'),
  needs_clarification: z.boolean().describe('True ONLY if the request is truly ambiguous (e.g. missing recipient, subject is unclear, dates are completely vague). Default false for clear requests.'),
  clarification_prompt: z.string().optional().describe('What to ask the user if clarification needed'),
  summary: z.string().describe('One-line summary of the plan'),
  reasoning: z.string().describe('Brief reasoning for the plan structure'),
  steps: z.array(PlanStepSchema).describe('Ordered execution steps. Empty if clarification needed.'),
});

/**
 * Build an execution plan from user input.
 * When plannerIntent exists (backward compat from assistant_command processor), uses it directly.
 * Otherwise, makes a single LLM call to assess intent AND build the plan.
 */
async function buildPlanFromUserInput(
  userRequest: string,
  plannerIntent: AssistantCommandIntent | null,
): Promise<{ plan: ExecutionPlan; confidence: number; needsClarification: boolean; clarificationPrompt: string | null }> {
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
        recoverable: step.recoverable,
      })),
    };

    return { plan, confidence: 1.0, needsClarification: false, clarificationPrompt: null };
  }

  // Single LLM call: assess intent AND build plan
  const langfuseHandler = tracingService.getHandler();
  const callbacks = langfuseHandler ? [langfuseHandler] : [];
  const llm = new ChatMistralAI({
    apiKey: config.MISTRAL_API_KEY,
    model: config.DEFAULT_LLM_MODEL,
    temperature: 0,
    callbacks,
  });

  const structuredLlm = llm.withStructuredOutput(GeneralAgentResponseSchema, {
    name: 'general_agent_response',
  });

  const result = await structuredLlm.invoke([
    `User request: "${userRequest}"`,
    '',
    'Interpret this request and produce an execution plan.',
    '',
    'AVAILABLE SPECIALIST AGENTS:',
    '- gmail: Draft and send emails',
    '- calendar: Create/update/delete events, check availability',
    '- docs: Create docs, insert/replace text, read content',
    '- sheets: Create spreadsheets, write/read cell values',
    '- slides: Create presentations, apply slide updates',
    '- drive: Search files, read file content',
    '',
    'RULES:',
    '- Be generous with confidence. Most user requests should score >= 0.8.',
    '- Only set needs_clarification=true if the request is genuinely ambiguous.',
    '- Do NOT specify tool names — specialists select their own tools.',
    '- Do NOT convert relative dates. Pass the user\'s original wording (e.g. "tomorrow", "next Monday") as-is. The specialist agent has time tools to resolve dates.',
    '- Each step needs: key, title, worker_type, action (natural language), input.',
    '- Input should contain ALL data the specialist needs to execute.',
    '',
    'EXAMPLES OF GOOD ORCHESTRATION:',
    '',
    'Example 1 — Single step:',
    'User: "Create a spreadsheet to track the Q1 budget"',
    '→ worker_type: "sheets"',
    '→ action: "Create a spreadsheet with Q1 budget tracking columns"',
    '→ input: { title: "Q1 Budget Tracker", description: "Track Q1 expenses and revenue" }',
    '→ requested_tools: [] (specialist chooses create_spreadsheet)',
    '',
    'Example 2 — Multi-step:',
    'User: "Draft an email to the team about Monday\'s meeting and create a calendar event"',
    '→ Step 1: worker_type: "gmail", action: "Draft email to team about Monday meeting", input: { recipient: "team@company.com", subject: "Monday Meeting", body: "..." }',
    '→ Step 2: worker_type: "calendar", action: "Create calendar event for Monday meeting", input: { summary: "Team Meeting", startTime: "Monday 10:00", endTime: "Monday 11:00" }',
    '→ requested_tools: [] for both steps (specialists choose their own tools)',
    '',
    'Example 3 — Drive + Docs:',
    'User: "Read the project brief from Drive and create a summary document"',
    '→ Step 1: worker_type: "drive", action: "Read project brief document", input: { file_name_or_url: "Project Brief" }',
    '→ Step 2: worker_type: "docs", action: "Create summary document from project brief", input: { title: "Project Brief Summary", source_step_key: "step-1" }',
    '→ requested_tools: [] for both steps',
    buildAgentSkillAppendix('generalProjectManagement'),
  ].join('\n'), { callbacks });

  tracingService.handleSuccess();
  await tracingService.flush();

  const plan: ExecutionPlan = {
    version: 'v1',
    original_command: userRequest,
    summary: result.summary,
    ledger_entries: [],
    replan_count: 0,
    steps: result.steps.map((step, index) => ({
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
    confidence: result.confidence,
    needsClarification: result.needs_clarification || result.confidence < CONFIDENCE_THRESHOLD,
    clarificationPrompt: result.clarification_prompt ?? null,
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

// --- Main Node Function ---

export async function generalAgentNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    if (!state.task.id) {
      return { error: 'Task ID is required for general agent execution.' };
    }

    const existingRun = state.execution_run ?? await executionRunService.getByTaskId(state.task.id);
    if (existingRun) {
      return {
        execution_run: existingRun,
        trace: [AuditLogger.createStep('General Agent', `Loaded execution run ${existingRun.id ?? 'existing-run'}`)],
      };
    }

    const plannerIntent = state.planner_intent;
    const userRequest = plannerIntent?.original_command
      ?? (state.task.payload as Record<string, unknown>)?.command as string
      ?? '';

    const userInitiatedChannel = getUserInitiatedChannel(state.task);

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

    // Build execution plan (single LLM call handles intent + plan)
    const { plan, confidence, needsClarification, clarificationPrompt } = await buildPlanFromUserInput(userRequest, plannerIntent);

    // Check intent clarification (Task 24)
    if (needsClarification) {
      const step = AuditLogger.createStep('General Agent', `Clarification needed: ${clarificationPrompt ?? 'Ambiguous request'}`, {
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
            prompt: clarificationPrompt ?? 'Could you provide more details about your request?',
            confidenceScore: confidence,
            trigger: 'ambiguity_detected',
          }),
        },
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
        trace: [AuditLogger.createStep('General Agent', message)],
      };
    }

    tracingService.handleFailure(error);
    throw error;
  }
}
