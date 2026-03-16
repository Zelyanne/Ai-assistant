import {
  type AssistantCommandIntent,
  type ExecutionPlan,
  type ExecutionPlanStep,
  type Json,
} from '@ai-assistant/shared';
import { CapabilityWorkerRegistry } from '../../workers/CapabilityWorkerRegistry.js';
import { AuditLogger } from '../../services/AuditLogger.js';
import { executionRunService } from '../../services/ExecutionRunService.js';
import { mcpService } from '../../services/mcp.js';
import {
  workerToolPolicyService,
  type CapabilityWorkerType,
} from '../../services/WorkerToolPolicyService.js';
import { buildEscalationPayload } from '../escalation.js';
import type { AgentState } from '../graph.js';

function buildExecutionPlan(intent: AssistantCommandIntent): ExecutionPlan {
  return {
    version: 'v1',
    original_command: intent.original_command,
    summary: intent.summary,
    ledger_entries: [],
    replan_count: 0,
    steps: intent.requested_steps.map((step: AssistantCommandIntent['requested_steps'][number], index: number) => ({
      key: step.key,
      title: step.title,
      worker_type: step.worker_type,
      action: step.action,
      status: 'pending',
      requested_tools: step.requested_tools,
      input: step.input,
      output: {},
      attempt_count: 0,
      idempotency_key: step.idempotency_key ?? `${step.worker_type}-${step.action}-${index + 1}`,
      recoverable: step.recoverable,
    })),
  };
}

function toJson(value: unknown): Json {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value;
  }

  if (typeof value === 'undefined') {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toJson(entry));
  }

  if (typeof value === 'object') {
    const output: Record<string, Json | undefined> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = toJson(entry);
    }
    return output;
  }

  return String(value);
}

function toJsonRecord(value: unknown): Record<string, Json | undefined> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { value: toJson(value) };
  }

  const output: Record<string, Json | undefined> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = toJson(entry);
  }
  return output;
}

function getCurrentStep(plan: ExecutionPlan): ExecutionPlanStep | null {
  return plan.steps.find((step: ExecutionPlanStep) => step.status === 'pending' || step.status === 'in_progress') ?? null;
}

function buildEscalatedTask(state: AgentState, reason: string, prompt: string): AgentState['task'] {
  return {
    ...state.task,
    status: 'escalation',
    result: buildEscalationPayload({
      reason,
      prompt,
      confidenceScore: 0,
      trigger: 'approval_guardrail',
    }),
  };
}

function buildPausedTask(state: AgentState, reason: string, prompt: string): AgentState['task'] {
  return {
    ...state.task,
    status: 'paused',
    result: {
      ...buildEscalationPayload({
        reason,
        prompt,
        confidenceScore: 0,
        trigger: 'approval_guardrail',
      }),
      outcome: 'setup_required',
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isTrustedUserInitiatedPlannerTask(task: AgentState['task']): boolean {
  if (task.domain_action !== 'assistant.command') {
    return false;
  }

  const payload = asRecord(task.payload);
  const channel = asString(payload.channel);
  const source = asString(payload.source);

  if (channel === 'web') {
    return task.topic === 'Command Center' || source === 'dashboard-command-center';
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

function getPlannerIntent(state: AgentState): AssistantCommandIntent | null {
  const intent = state.planner_intent;
  return intent ?? null;
}

export async function plannerNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    if (!state.task.id) {
      return { error: 'Task ID is required for planner execution.' };
    }

    const existingRun = state.execution_run ?? await executionRunService.getByTaskId(state.task.id);
    if (existingRun) {
      return {
        execution_run: existingRun,
        trace: [AuditLogger.createStep('Planner', `Loaded execution run ${existingRun.id ?? 'existing-run'}`)],
      };
    }

    const plannerIntent = getPlannerIntent(state);
    if (!plannerIntent) {
      return { error: 'Planner intent is missing for assistant.command execution.' };
    }

    const plan = buildExecutionPlan(plannerIntent);

    for (const step of plan.steps) {
      if (step.worker_type === 'planner') {
        continue;
      }

      const workerType = step.worker_type as CapabilityWorkerType;

      const readiness = await mcpService.checkCapabilityReadiness(
        state.task.organization_id,
        workerType,
        step.requested_tools,
      );

      step.capability_readiness = readiness;
      if (!readiness.ready) {
        const prompt = 'Reconnect Google Workspace or enable the required scopes/tools, then retry.';
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
          task: isTrustedUserInitiatedPlannerTask(state.task)
            ? buildPausedTask(state, readiness.errors.join(' '), prompt)
            : buildEscalatedTask(state, readiness.errors.join(' '), prompt),
          trace: [AuditLogger.createStep('Planner', `Blocked: ${readiness.errors.join(' | ')}`)],
        };
      }
    }

    const executionRun = await executionRunService.createRun({
      taskId: state.task.id,
      organizationId: state.task.organization_id,
      plan,
      toolPolicyVersion: workerToolPolicyService.getVersion(),
    });

    return {
      execution_run: executionRun,
      task: {
        ...state.task,
        result: {
          ...(state.task.result ?? {}),
          execution_run: executionRunService.buildTaskResult(executionRun).execution_run,
        },
      },
      trace: [AuditLogger.createStep('Planner', `Created execution run ${executionRun.id ?? 'new-run'}`)],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('EXECUTION_RUNS_UNAVAILABLE')) {
      const prompt = 'Planner orchestration requires the execution run migration. Apply supabase/migrations/20260312113000_create_execution_runs.sql to the target Supabase project, then retry.';
      return {
        task: isTrustedUserInitiatedPlannerTask(state.task)
          ? buildPausedTask(state, message, prompt)
          : buildEscalatedTask(state, message, prompt),
        trace: [AuditLogger.createStep('Planner', message)],
      };
    }

    throw error;
  }
}

export async function workspaceWorkerNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const run = state.execution_run;
  if (!run) {
    return { error: 'Execution run state is missing.' };
  }

  if (run.status === 'completed' || run.status === 'failed' || run.status === 'escalated' || run.status === 'blocked') {
    return {
      task: {
        ...state.task,
        result: {
          ...(state.task.result ?? {}),
          ...executionRunService.buildTaskResult(run),
        },
      },
    };
  }

  const currentStep = getCurrentStep(run.plan_json);
  if (!currentStep) {
    const completedRun = await executionRunService.markRunStatus(run, 'completed');
    return {
      execution_run: completedRun,
      task: {
        ...state.task,
        result: {
          ...(state.task.result ?? {}),
          ...executionRunService.buildTaskResult(completedRun),
        },
      },
      trace: [AuditLogger.createStep('Planner Worker', 'No remaining steps; marked run completed.')],
    };
  }

  const idempotentResult = run.idempotency_state[currentStep.idempotency_key];
  if (idempotentResult?.status === 'completed') {
      const recoveredRun = await executionRunService.completeStep(run, {
        stepKey: currentStep.key,
        output: toJsonRecord(idempotentResult.output),
        nextWorkerNote: 'Recovered prior side effect from idempotency state.',
        toolName: idempotentResult.tool_name,
      });

    return {
      execution_run: recoveredRun,
      task: {
        ...state.task,
        result: {
          ...(state.task.result ?? {}),
          ...executionRunService.buildTaskResult(recoveredRun),
        },
      },
      trace: [AuditLogger.createStep('Planner Worker', `Recovered idempotent result for ${currentStep.key}`)],
    };
  }

  const inProgressRun = await executionRunService.markStepInProgress(run, currentStep.key);
  const latestStep = getCurrentStep(inProgressRun.plan_json) ?? currentStep;

  try {
    const workerResult = await CapabilityWorkerRegistry.execute({
      task: state.task,
      executionRun: inProgressRun,
      step: latestStep,
    });

    const completedRun = await executionRunService.completeStep(inProgressRun, {
      stepKey: latestStep.key,
      output: workerResult.output,
      nextWorkerNote: workerResult.nextWorkerNote,
      toolName: workerResult.toolName,
    });

    return {
      execution_run: completedRun,
      task: {
        ...state.task,
        result: {
          ...(state.task.result ?? {}),
          ...executionRunService.buildTaskResult(completedRun),
        },
      },
      trace: [AuditLogger.createStep('Planner Worker', workerResult.summary)],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (latestStep.recoverable && inProgressRun.plan_json.replan_count < 1) {
      const replannedRun = await executionRunService.recordReplan(inProgressRun, {
        stepKey: latestStep.key,
        nextStep:
          latestStep.worker_type === 'gmail' && latestStep.action === 'send_email'
            ? {
                action: 'draft_email',
                title: 'Draft Gmail message after send fallback',
                requested_tools: ['draft_gmail_message'],
                recoverable: false,
              }
            : undefined,
        note: message,
        markSkipped: !(latestStep.worker_type === 'gmail' && latestStep.action === 'send_email'),
      });

      return {
        execution_run: replannedRun,
        trace: [AuditLogger.createStep('Planner Worker', `Recorded automatic re-plan for ${latestStep.key}`)],
      };
    }

    const failedRun = await executionRunService.failStep(inProgressRun, {
      stepKey: latestStep.key,
      errorMessage: message,
      status: 'escalated',
    });

    return {
      execution_run: failedRun,
      task: buildEscalatedTask(
        state,
        message,
        'Manual review is required before the planner can continue safely.',
      ),
      trace: [AuditLogger.createStep('Planner Worker', `Escalated: ${message}`)],
    };
  }
}
