import {
  type ExecutionPlanStep,
  type ExecutionRun,
  type Json,
  type Task,
} from '@ai-assistant/shared';
import { CalendarCreateProcessor } from '../processors/CalendarCreateProcessor.js';
import { EmailDraftProcessor } from '../processors/EmailDraftProcessor.js';
import { EmailSendProcessor } from '../processors/EmailSendProcessor.js';
import { mcpService } from '../services/mcp.js';
import { type CapabilityWorkerType } from '../services/WorkerToolPolicyService.js';

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

type WorkerHandler = (
  context: WorkerExecutionContext,
) => Promise<WorkerExecutionResult>;

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
    const record = value as Record<string, unknown>;
    const output: Record<string, Json | undefined> = {};
    for (const [key, entry] of Object.entries(record)) {
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

  const record = value as Record<string, unknown>;
  const output: Record<string, Json | undefined> = {};
  for (const [key, entry] of Object.entries(record)) {
    output[key] = toJson(entry);
  }
  return output;
}

function getSourceStepOutput(
  run: ExecutionRun,
  sourceStepKey: unknown,
): Record<string, Json | undefined> {
  if (typeof sourceStepKey !== 'string') {
    return {};
  }

  const sourceStep = run.plan_json.steps.find((step) => step.key === sourceStepKey);
  return sourceStep ? toJsonRecord(sourceStep.output) : {};
}

function getSourceSummary(run: ExecutionRun, step: ExecutionPlanStep): string {
  const sourceOutput = getSourceStepOutput(run, step.input.source_step_key);
  return typeof sourceOutput.summary === 'string' ? sourceOutput.summary : '';
}

function extractContextReferenceFileId(step: ExecutionPlanStep): string | null {
  const refs = step.input.context_references;
  if (!Array.isArray(refs)) {
    return null;
  }

  const first = refs.find(
    (entry): entry is { file_id?: unknown } => Boolean(entry && typeof entry === 'object'),
  );

  return typeof first?.file_id === 'string' ? first.file_id : null;
}

function buildGenericMcpArgs(
  run: ExecutionRun,
  step: ExecutionPlanStep,
): Record<string, unknown> {
  const args = { ...step.input } as Record<string, unknown>;
  const sourceSummary = getSourceSummary(run, step);
  const fileId = extractContextReferenceFileId(step);

  if (fileId && typeof args.file_id !== 'string') {
    args.file_id = fileId;
  }

  if (sourceSummary && typeof args.content !== 'string') {
    args.content = sourceSummary;
  }

  if (sourceSummary && typeof args.body !== 'string') {
    args.body = sourceSummary;
  }

  return args;
}

async function executeGenericMcpWorker(
  workerType: CapabilityWorkerType,
  context: WorkerExecutionContext,
): Promise<WorkerExecutionResult> {
  const requestedTool =
    context.step.requested_tools[0] ??
    (workerType === 'drive'
      ? 'get_drive_file_content'
      : workerType === 'docs'
        ? 'create_doc'
        : workerType === 'sheets'
          ? 'modify_sheet_values'
          : 'create_presentation');

  const args = buildGenericMcpArgs(context.executionRun, context.step);
  const { toolName, result } = await mcpService.executeWorkerTool(
    context.task.organization_id,
    workerType,
    requestedTool,
    args,
  );

  return {
    summary: `${workerType} worker completed ${context.step.action}`,
    nextWorkerNote: `${workerType} output is ready for the next worker.`,
    toolName,
    output: {
      summary: `${workerType} worker completed ${context.step.action}`,
      tool_name: toolName,
      raw_result: toJson(result),
    },
  };
}

async function executeGmailDraft(
  context: WorkerExecutionContext,
): Promise<WorkerExecutionResult> {
  const sourceSummary = getSourceSummary(context.executionRun, context.step);
  const payload = {
    ...context.step.input,
    body:
      typeof context.step.input.body === 'string' && context.step.input.body.length > 0
        ? context.step.input.body
        : sourceSummary || 'Prepared by planner worker orchestration.',
  };

  const result = await new EmailDraftProcessor().process({
    ...context.task,
    domain_action: 'email.draft',
    payload,
  });

  const output = toJsonRecord(result);
  return {
    summary: String(output.summary ?? 'Gmail draft created.'),
    nextWorkerNote: 'Draft created and ready for review or send.',
    toolName: typeof output.tool_name === 'string' ? output.tool_name : undefined,
    output,
  };
}

async function executeGmailSend(
  context: WorkerExecutionContext,
): Promise<WorkerExecutionResult> {
  const sourceSummary = getSourceSummary(context.executionRun, context.step);
  const payload = {
    ...context.step.input,
    body:
      typeof context.step.input.body === 'string' && context.step.input.body.length > 0
        ? context.step.input.body
        : sourceSummary || 'Prepared by planner worker orchestration.',
  };

  const result = await new EmailSendProcessor().process({
    ...context.task,
    domain_action: 'email.send',
    payload,
  });

  const output = toJsonRecord(result);
  return {
    summary: String(output.summary ?? 'Gmail send worker completed.'),
    nextWorkerNote: 'Gmail send worker finished its side effect.',
    toolName: typeof output.tool_name === 'string' ? output.tool_name : undefined,
    output,
  };
}

async function executeCalendarCreate(
  context: WorkerExecutionContext,
): Promise<WorkerExecutionResult> {
  const result = await new CalendarCreateProcessor().process({
    ...context.task,
    domain_action: 'calendar.create',
    payload: context.step.input,
  });

  const output = toJsonRecord(result);
  return {
    summary: String(output.summary ?? output.message ?? 'Calendar worker completed.'),
    nextWorkerNote: 'Calendar worker completed its event mutation path.',
    toolName: typeof output.tool_name === 'string' ? output.tool_name : undefined,
    output,
  };
}

const WORKER_HANDLERS: Record<CapabilityWorkerType, WorkerHandler> = {
  gmail: async (context) => {
    if (context.step.action === 'send_email') {
      return executeGmailSend(context);
    }

    return executeGmailDraft(context);
  },
  drive: async (context) => executeGenericMcpWorker('drive', context),
  docs: async (context) => executeGenericMcpWorker('docs', context),
  sheets: async (context) => executeGenericMcpWorker('sheets', context),
  slides: async (context) => executeGenericMcpWorker('slides', context),
  calendar: async (context) => executeCalendarCreate(context),
};

export class CapabilityWorkerRegistry {
  static getHandler(workerType: CapabilityWorkerType): WorkerHandler {
    return WORKER_HANDLERS[workerType];
  }

  static async execute(context: WorkerExecutionContext): Promise<WorkerExecutionResult> {
    if (context.step.worker_type === 'planner') {
      throw new Error('Planner steps are not executable by the capability worker registry.');
    }

    const handler = this.getHandler(context.step.worker_type);
    return handler(context);
  }
}
