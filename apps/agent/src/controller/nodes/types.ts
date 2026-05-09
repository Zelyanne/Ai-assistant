/**
 * Shared types for specialist agent nodes.
 *
 * These types define the contract between the General Agent's specialist-agent
 * tools and individual specialist nodes (Gmail, Calendar, Docs, Sheets, Slides).
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
 * Context passed when the General Agent calls a specialist as a tool.
 */
export interface SpecialistNodeContext {
  task: Task;
  executionRun: ExecutionRun;
  step: ExecutionPlanStep;
  memory?: {
    persona_memory?: string;
    long_term_memory?: string;
  };
  agentToolPrompt?: string;
  relevantSkillContext?: string;
  allowHighRiskActions?: boolean;
}

/**
 * Result returned by a specialist node after execution.
 * Result returned to the General Agent after specialist execution.
 */
export interface SpecialistNodeResult {
  output: Record<string, Json | undefined>;
  summary: string;
  nextWorkerNote: string;
  toolName?: string;
  toolInvocations?: ToolInvocationRecord[];
}

/**
 * Record of a tool invocation for audit logging and handoff note building.
 * Record of one MCP or internal tool invocation.
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

export interface AgentToolPromptInput {
  prompt: string;
}

export type AgentToolStatus = 'completed' | 'needs_confirmation' | 'failed';

export interface AgentToolResult extends Record<string, Json | undefined> {
  agent: SpecialistWorkerType;
  status: AgentToolStatus;
  summary: string;
  handoff_content: string;
  artifacts: Record<string, Json | undefined>;
  tool_invocations: Array<Record<string, Json | undefined>>;
  next_prompt?: string;
  error?: string;
}

export interface ExecutionVerifierResult {
  status: 'passed' | 'failed';
  summary: string;
  repair_prompt?: string;
}
