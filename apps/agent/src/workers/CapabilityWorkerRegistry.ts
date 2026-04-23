/**
 * @deprecated Use the Router node pattern instead (router.ts).
 * This registry is kept for backward compatibility as a fallback target
 * in the Router node. Plan to deprecate after 2-3 successful production runs.
 *
 * @see ADR-001: Router Node Pattern
 * @see ADR-005: Fallback Compatibility Pattern
 */

import {
  type ExecutionPlanStep,
  type ExecutionRun,
  type Json,
  type Task,
} from '@ai-assistant/shared';
import { executeWorkspaceWorkerAgent } from './WorkspaceWorkerAgent.js';

export interface WorkerExecutionContext {
  task: Task;
  executionRun: ExecutionRun;
  step: ExecutionPlanStep;
}

export interface WorkerExecutionResult {
  output: Record<string, Json | undefined>;
  summary: string;
  nextWorkerNote: string;
  toolName?: string;
}

/**
 * @deprecated Use routerNode from controller/nodes/router.ts instead.
 * The router dispatches to specialist nodes (Gmail, Calendar, Docs, etc.)
 * which use native MCP tools directly, and falls back to this registry
 * if a specialist is unavailable.
 */
export class CapabilityWorkerRegistry {
  static async execute(context: WorkerExecutionContext): Promise<WorkerExecutionResult> {
    if (context.step.worker_type === 'planner') {
      throw new Error('Planner steps are not executable by the capability worker registry.');
    }

    return executeWorkspaceWorkerAgent(context);
  }
}
