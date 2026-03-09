export type CommandRole = 'user' | 'assistant' | 'system';

export type CommandState =
  | 'intent_preview'
  | 'queued'
  | 'processing'
  | 'done'
  | 'error'
  | 'escalation'
  | 'paused';

export interface CommandTimelineEntry {
  id: string;
  role: CommandRole;
  content: string;
  createdAt: string;
  state?: CommandState;
  taskId?: string;
  correlationId?: string;
}
