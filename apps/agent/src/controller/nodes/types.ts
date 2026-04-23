/**
 * Shared types for specialist agent nodes.
 *
 * These types define the contract between the Router node and individual
 * specialist nodes (Gmail, Calendar, Docs, Sheets, Slides).
 *
 * @see ADR-002: Separate Specialist Nodes
 */

import type {
  ExecutionPlanStep,
  ExecutionRun,
  Json,
  Task,
} from '@ai-assistant/shared';

/**
 * Context passed to a specialist node for execution.
 * Replaces the monolithic WorkerExecutionContext from the old CapabilityWorkerRegistry.
 */
export interface SpecialistNodeContext {
  task: Task;
  executionRun: ExecutionRun;
  step: ExecutionPlanStep;
  memory?: {
    persona_memory?: string;
    long_term_memory?: string;
  };
}

/**
 * Result returned by a specialist node after execution.
 * Maps to the WorkerExecutionResult contract for backward compatibility.
 */
export interface SpecialistNodeResult {
  output: Record<string, Json | undefined>;
  summary: string;
  nextWorkerNote: string;
  toolName?: string;
}

/**
 * Record of a tool invocation for audit logging and handoff note building.
 * Preserves the existing ToolInvocationRecord pattern from WorkspaceWorkerAgent.
 */
export interface ToolInvocationRecord {
  requestedTool: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}

/**
 * Valid worker types for specialist routing.
 */
export type SpecialistWorkerType = 'gmail' | 'calendar' | 'docs' | 'sheets' | 'slides' | 'drive';

/**
 * Router decision output.
 */
export interface RouterDecision {
  nextNode: SpecialistWorkerType | 'general_agent' | 'finalize' | 'fallback';
  reason: string;
  auditLog: string;
}
