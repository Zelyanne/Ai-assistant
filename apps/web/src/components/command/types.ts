export type CommandRole = 'user' | 'assistant' | 'system';

export type CommandState =
  | 'intent_preview'
  | 'queued'
  | 'processing'
  | 'done'
  | 'error'
  | 'escalation'
  | 'paused';

export interface CommandExecutionRunSummary {
  id: string;
  status: string;
  currentStepKey?: string | null;
  currentWorkerType?: string | null;
  summary?: string | null;
  replanCount?: number;
  completedSteps?: number;
  totalSteps?: number;
  ledgerMarkdown?: string | null;
  lastError?: string | null;
  updatedAt?: string;
}

export interface CommandTimelineEntry {
  id: string;
  role: CommandRole;
  content: string;
  createdAt: string;
  state?: CommandState;
  taskId?: string;
  correlationId?: string;
  executionRun?: CommandExecutionRunSummary;
}
