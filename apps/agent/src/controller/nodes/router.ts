/**
 * Router Node
 *
 * Reads execution plan, routes to specialist based on current step's worker_type.
 * Includes fallback logic, audit logging, and handoff validation.
 *
 * @see ADR-001: Router Node Pattern
 * @see Task 19: Fallback Logic
 * @see Task 20: Router Validation and Audit Logging
 * @see Task 23: Handoff Note Validation
 */

import type {
  ExecutionPlanStep,
  ExecutionRun,
  Json,
  Task,
} from '@ai-assistant/shared';
import { AuditLogger } from '../../services/AuditLogger.js';
import { executionRunService } from '../../services/ExecutionRunService.js';
import { PerimeterGuard } from '../../guards/PerimeterGuard.js';
import type { AgentState } from '../graph.js';
import type { SpecialistNodeContext, SpecialistNodeResult, SpecialistWorkerType, RouterDecision } from './types.js';

// Import specialist nodes
import { gmailAgentNode } from './gmailAgent.js';
import { calendarAgentNode } from './calendarAgent.js';
import { docsAgentNode } from './docsAgent.js';
import { sheetsAgentNode } from './sheetsAgent.js';
import { slidesAgentNode } from './slidesAgent.js';
import { driveAgentNode } from './driveAgent.js';

// --- Specialist Registry ---

type SpecialistExecutor = (context: SpecialistNodeContext) => Promise<SpecialistNodeResult>;

const SPECIALIST_REGISTRY: Record<string, SpecialistExecutor> = {
  gmail: gmailAgentNode,
  calendar: calendarAgentNode,
  docs: docsAgentNode,
  sheets: sheetsAgentNode,
  slides: slidesAgentNode,
  drive: driveAgentNode,
};

// --- Utility ---

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

const MEMORY_PROMPT_LIMIT = 4000;
const ROUTER_ERROR_SUMMARY_LIMIT = 240;
const routerErrorGuard = new PerimeterGuard();

function sanitizeRouterErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const redacted = routerErrorGuard.redactPII(raw)
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!redacted) {
    return 'Specialist execution failed.';
  }

  if (/\b(body|draft|content)\b\s*[:=]/i.test(redacted)) {
    return 'Specialist execution failed (sensitive draft content hidden).';
  }

  if (redacted.length > ROUTER_ERROR_SUMMARY_LIMIT) {
    return `${redacted.slice(0, ROUTER_ERROR_SUMMARY_LIMIT - 3)}...`;
  }

  return redacted;
}

function truncateMemorySegment(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  if (normalized.length <= MEMORY_PROMPT_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(0, MEMORY_PROMPT_LIMIT - 3)}...`;
}

function getCurrentStep(plan: ExecutionRun['plan_json']): ExecutionPlanStep | null {
  return plan.steps.find(
    (step: ExecutionPlanStep) => step.status === 'pending' || step.status === 'in_progress',
  ) ?? null;
}

function toJson(value: unknown): Json {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }
  if (typeof value === 'undefined') return null;
  if (Array.isArray(value)) return value.map((item) => toJson(item));
  if (typeof value === 'object') {
    const out: Record<string, Json | undefined> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toJson(v);
    }
    return out;
  }
  return String(value);
}

function toJsonRecord(value: unknown): Record<string, Json | undefined> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { value: toJson(value) };
  const output: Record<string, Json | undefined> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = toJson(entry);
  }
  return output;
}

function buildRouterFailureTaskResult(
  task: Task,
  run: ExecutionRun,
  reason: string,
  prompt: string,
): Record<string, Json | undefined> {
  const base = task.result && typeof task.result === 'object' && !Array.isArray(task.result)
    ? (task.result as Record<string, Json | undefined>)
    : {};

  const executionRun = executionRunService.buildTaskResult(run).execution_run;

  return {
    ...base,
    ...(executionRun ? { execution_run: executionRun } : {}),
    router_failure: {
      reason,
      prompt,
      requires_user_guidance: true,
    },
  };
}

// --- Handoff Note Validation (Task 23) ---

const MAX_HANDOFF_LENGTH = 1000;

function validateAndSanitizeHandoff(handoff: unknown): string | null {
  if (!handoff || typeof handoff !== 'string') return null;

  let sanitized = handoff.replace(/[\x00-\x1F\x7F]/g, '');

  if (sanitized.length > MAX_HANDOFF_LENGTH) {
    sanitized = `${sanitized.slice(0, MAX_HANDOFF_LENGTH - 3)}...`;
  }

  try {
    JSON.stringify(sanitized);
  } catch {
    return null;
  }

  return sanitized;
}

// --- Routing Logic ---

/**
 * Determine the routing decision based on execution state.
 * Task 20: Router Validation and Audit Logging
 */
function determineRoute(state: AgentState): RouterDecision {
  const run = state.execution_run;
  if (!run) {
    return {
      nextNode: 'finalize',
      reason: 'No execution run found',
      auditLog: 'Router: no execution run — finalizing',
    };
  }

  // Check if run is completed
  if (run.status === 'completed' || run.status === 'failed' || run.status === 'escalated' || run.status === 'blocked') {
    return {
      nextNode: 'general_agent',
      reason: `Execution run status: ${run.status}`,
      auditLog: `Router: run ${run.status} — returning to general agent`,
    };
  }

  // Get current step
  const currentStep = getCurrentStep(run.plan_json);
  if (!currentStep) {
    return {
      nextNode: 'general_agent',
      reason: 'All steps completed',
      auditLog: 'Router: no remaining steps — returning to general agent',
    };
  }

  // Route to specialist
  const workerType = currentStep.worker_type;
  if (workerType in SPECIALIST_REGISTRY) {
    return {
      nextNode: workerType as SpecialistWorkerType,
      reason: `Step "${currentStep.key}" → ${workerType}`,
      auditLog: `Router: routing step "${currentStep.key}" to ${workerType} specialist`,
    };
  }

  // Fallback: unknown worker type
  return {
    nextNode: 'fallback',
    reason: `Unknown worker type: ${workerType}`,
    auditLog: `Router: unknown worker type "${workerType}" — using fallback`,
  };
}

// --- Fallback Handler (Task 19) ---

/**
 * Execute fallback using the legacy WorkspaceWorkerAgent.
 * Plan to deprecate after 2-3 successful production runs.
 */
async function executeFallback(
  context: SpecialistNodeContext,
): Promise<SpecialistNodeResult> {
  console.log(`[Router] Falling back to legacy WorkspaceWorkerAgent for ${context.step.worker_type}:${context.step.action}`);

  try {
    // Dynamic import to avoid circular deps
    const { CapabilityWorkerRegistry } = await import('../../workers/CapabilityWorkerRegistry.js');
    return await CapabilityWorkerRegistry.execute({
      task: context.task,
      executionRun: context.executionRun,
      step: context.step,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      summary: `Fallback failed: ${message}`,
      nextWorkerNote: `Fallback execution failed for ${context.step.worker_type}:${context.step.action}.`,
      output: {
        error: message,
        handoff_content: `Fallback failed: ${message}`,
      },
    };
  }
}

// --- Timeout Safety (Task 20) ---

const ROUTER_TIMEOUT_MS = 60_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`Router timeout (${label}): ${timeoutMs}ms exceeded`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

// --- Main Router Node Function ---

export async function routerNode(state: AgentState): Promise<Partial<AgentState>> {
  if (state.error) return {};

  const decision = determineRoute(state);

  // Log routing decision
  const routingStep = AuditLogger.createStep('Router', decision.auditLog, {
    output_summary: decision.reason,
  });

  // Return to general agent if run is complete
  if (decision.nextNode === 'general_agent') {
    return {
      router_completed_step_key: null,
      trace: [routingStep],
    };
  }

  // Finalize if no run
  if (decision.nextNode === 'finalize') {
    return {
      router_completed_step_key: null,
      trace: [routingStep],
    };
  }

  const run = state.execution_run!;
  const currentStep = getCurrentStep(run.plan_json);
  if (!currentStep) {
    return {
      router_completed_step_key: null,
      trace: [routingStep],
    };
  }

  // Mark step in progress
  const inProgressRun = await executionRunService.markStepInProgress(run, currentStep.key);
  const latestStep = getCurrentStep(inProgressRun.plan_json) ?? currentStep;

  // Check idempotency
  const idempotentResult = inProgressRun.idempotency_state[latestStep.idempotency_key];
  if (idempotentResult?.status === 'completed') {
    const recoveredRun = await executionRunService.completeStep(inProgressRun, {
      stepKey: latestStep.key,
      output: toJsonRecord(idempotentResult.output),
      nextWorkerNote: 'Recovered prior side effect from idempotency state.',
      toolName: idempotentResult.tool_name,
    });

    return {
      execution_run: recoveredRun,
      router_completed_step_key: latestStep.key,
      trace: [
        routingStep,
        AuditLogger.createStep('Router', `Recovered idempotent result for ${latestStep.key}`),
      ],
    };
  }

  // Build specialist context
  const specialistContext: SpecialistNodeContext = {
    task: state.task,
    executionRun: inProgressRun,
    step: latestStep,
    memory: {
      persona_memory: truncateMemorySegment(state.persona_memory),
      long_term_memory: truncateMemorySegment(state.long_term_memory),
    },
  };

  // Execute specialist (with timeout safety)
  let specialistResult: SpecialistNodeResult;
  let usedFallback = false;

  try {
    const specialist = SPECIALIST_REGISTRY[latestStep.worker_type];
    if (!specialist) {
      // Task 19: Fallback to legacy WorkerAgent
      specialistResult = await withTimeout(
        executeFallback(specialistContext),
        ROUTER_TIMEOUT_MS,
        'fallback',
      );
      usedFallback = true;
    } else {
      console.log(`[Router] Executing ${latestStep.worker_type} specialist for step "${latestStep.key}"...`);
      specialistResult = await withTimeout(
        specialist(specialistContext),
        ROUTER_TIMEOUT_MS,
        latestStep.worker_type,
      );
    }
  } catch (error: unknown) {
    // Task 19: Single fallback attempt, then escalate
    const safeMessage = sanitizeRouterErrorMessage(error);

    if (!usedFallback && latestStep.recoverable && inProgressRun.plan_json.replan_count < 1) {
      // Replan for recoverable steps
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
        note: safeMessage,
        markSkipped: !(latestStep.worker_type === 'gmail' && latestStep.action === 'send_email'),
      });

      return {
        execution_run: replannedRun,
        router_completed_step_key: null,
        trace: [
          routingStep,
          AuditLogger.createStep('Router', `Replanned for ${latestStep.key}: ${safeMessage}`),
        ],
      };
    }

    // Try fallback once
    if (!usedFallback) {
      try {
        specialistResult = await withTimeout(
          executeFallback(specialistContext),
          ROUTER_TIMEOUT_MS,
          'fallback',
        );
        usedFallback = true;
      } catch {
        // Escalate
        const failedRun = await executionRunService.failStep(inProgressRun, {
          stepKey: latestStep.key,
          errorMessage: safeMessage,
          status: 'escalated',
        });

        return {
          execution_run: failedRun,
          router_completed_step_key: null,
          task: {
            ...state.task,
            result: buildRouterFailureTaskResult(
              state.task,
              failedRun,
              `Specialist ${latestStep.worker_type} failed`,
              'Need user guidance to continue this plan safely.',
            ),
          },
          trace: [
            routingStep,
            AuditLogger.createStep('Router', `Escalated: ${safeMessage}`),
          ],
        };
      }
    } else {
      // Already used fallback — escalate
      const failedRun = await executionRunService.failStep(inProgressRun, {
        stepKey: latestStep.key,
        errorMessage: safeMessage,
        status: 'escalated',
      });

      return {
        execution_run: failedRun,
        router_completed_step_key: null,
        task: {
          ...state.task,
          result: buildRouterFailureTaskResult(
            state.task,
            failedRun,
            `Specialist and fallback both failed for ${latestStep.worker_type}`,
            'Need user guidance to continue this plan safely.',
          ),
        },
        trace: [
          routingStep,
          AuditLogger.createStep('Router', `Escalated after fallback: ${safeMessage}`),
        ],
      };
    }
  }

  // Validate handoff content (Task 23)
  const handoffContent = specialistResult.output?.handoff_content;
  if (handoffContent && typeof handoffContent === 'string') {
    const validated = validateAndSanitizeHandoff(handoffContent);
    if (validated !== null) {
      specialistResult.output.handoff_content = validated;
    }
  }

  // Complete step
  const completedRun = await executionRunService.completeStep(inProgressRun, {
    stepKey: latestStep.key,
    output: specialistResult.output,
    nextWorkerNote: specialistResult.nextWorkerNote,
    toolName: specialistResult.toolName,
  });

  const specialistStep = AuditLogger.createStep('Router', usedFallback
    ? `Fallback executed ${latestStep.worker_type}:${latestStep.action}`
    : `Specialist executed ${latestStep.worker_type}:${latestStep.action}`,
    {
      output_summary: specialistResult.summary?.slice(0, 200),
    },
  );

  return {
    execution_run: completedRun,
    router_completed_step_key: latestStep.key,
    task: {
      ...state.task,
      result: {
        ...(state.task.result ?? {}),
        ...executionRunService.buildTaskResult(completedRun),
      },
    },
    trace: [routingStep, specialistStep],
  };
}
