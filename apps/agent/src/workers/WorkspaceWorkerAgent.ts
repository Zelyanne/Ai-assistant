import { type Json } from '@ai-assistant/shared';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ChatMistralAI } from '@langchain/mistralai';
import { createAgent, modelCallLimitMiddleware } from 'langchain';
import { z } from 'zod';
import { config } from '../config/index.js';
import { EmailDraftProcessor } from '../processors/EmailDraftProcessor.js';
import { EmailSendProcessor } from '../processors/EmailSendProcessor.js';
import { buildAgentSkillAppendix } from '../prompts/agentSkillInjector.js';
import { mcpService } from '../services/mcp.js';
import { tracingService } from '../services/llm/tracing.js';
import { type CapabilityWorkerType } from '../services/WorkerToolPolicyService.js';
import type { WorkerExecutionContext, WorkerExecutionResult } from './CapabilityWorkerRegistry.js';

interface ToolInvocationRecord {
  requestedTool: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}

interface WorkspaceToolSpec {
  name: string;
  description: string;
  prepareArgs?: (
    args: Record<string, unknown>,
    context: WorkerExecutionContext,
    invocations: ToolInvocationRecord[],
  ) => Record<string, unknown>;
  execute: (
    args: Record<string, unknown>,
    context: WorkerExecutionContext,
  ) => Promise<{ toolName: string; result: unknown }>;
}

interface WorkspaceAgentDefinition {
  displayName: string;
  systemPrompt: string;
  buildToolSpecs: (context: WorkerExecutionContext) => WorkspaceToolSpec[];
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

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toJson(value: unknown): Json {
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || value === null
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

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry;
        }

        const record = asRecord(entry);
        return asString(record.text) ?? JSON.stringify(record);
      })
      .join('\n')
      .trim();
  }

  if (content && typeof content === 'object') {
    return JSON.stringify(content);
  }

  return String(content ?? '');
}

function getSourceStepOutput(context: WorkerExecutionContext): Record<string, Json | undefined> {
  const sourceStepKey = asString(asRecord(context.step.input).source_step_key);
  if (!sourceStepKey) {
    return {};
  }

  const sourceStep = context.executionRun.plan_json.steps.find((step) => step.key === sourceStepKey);
  return sourceStep ? toJsonRecord(sourceStep.output) : {};
}

function getSourceSummary(context: WorkerExecutionContext): string {
  const sourceOutput = getSourceStepOutput(context);
  return asString(sourceOutput.handoff_content) ?? asString(sourceOutput.summary) ?? '';
}

function inferQuotedTitle(command: string): string | null {
  const quoted = command.match(/(?:s[' ]?appelle|called|named)\s+["“](.+?)["”]/i);
  if (quoted?.[1]) {
    return quoted[1].trim();
  }

  const simpleQuoted = command.match(/["“](.+?)["”]/);
  return simpleQuoted?.[1]?.trim() ?? null;
}

function findFirstString(raw: unknown, keys: string[]): string | null {
  const candidates = [asRecord(raw), asRecord(asRecord(raw).structuredContent), asRecord(asRecord(raw).result)];

  for (const candidate of candidates) {
    for (const key of keys) {
      const value = asString(candidate[key]);
      if (value) {
        return value;
      }
    }
  }

  const text = stringifyContent(raw);
  for (const key of keys) {
    const regex = new RegExp(`${key}["']?\s*[:=]\s*["']?([^\s"']+)`, 'i');
    const match = text.match(regex);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function findFirstUrl(raw: unknown): string | null {
  const direct = findFirstString(raw, ['url', 'webViewLink', 'link']);
  if (direct) {
    return direct;
  }

  const match = stringifyContent(raw).match(/https?:\/\/[^\s)\]>"']+/i);
  return match?.[0] ?? null;
}

function findToolInvocation(
  invocations: ToolInvocationRecord[],
  requestedTool: string,
): ToolInvocationRecord | null {
  for (let index = invocations.length - 1; index >= 0; index -= 1) {
    if (invocations[index]?.requestedTool === requestedTool) {
      return invocations[index] ?? null;
    }
  }

  return null;
}

function buildToolObservation(result: unknown): string {
  const asText = stringifyContent(result).trim();
  if (asText.length === 0) {
    return 'Tool executed successfully.';
  }

  return asText.length > 1200 ? `${asText.slice(0, 1197)}...` : asText;
}

function buildWorkspaceUserPrompt(
  context: WorkerExecutionContext,
  definition: WorkspaceAgentDefinition,
): string {
  const sourceOutput = getSourceStepOutput(context);

  return [
    `Original user request: ${context.executionRun.plan_json.original_command}`,
    '',
    `Current worker: ${definition.displayName}`,
    `Current action: ${context.step.action}`,
    `Current title: ${context.step.title}`,
    'Current step input JSON:',
    JSON.stringify(context.step.input, null, 2),
    '',
    'Source step output JSON:',
    JSON.stringify(sourceOutput, null, 2),
    '',
    'Instructions:',
    '- Complete only the current step.',
    '- Use the provided tools instead of pretending work is done.',
    '- If you create an artifact, include its id, URL, and what was produced in your final reply.',
    '- If the step creates a Google Doc, Spreadsheet, or Presentation, populate it with meaningful initial content when the request asks for content.',
    '- Write a concise final handoff note for the next worker.',
  ].join('\n');
}

function createMcpToolSpec(
  workerType: CapabilityWorkerType,
  requestedTool: string,
  description: string,
  prepareArgs?: WorkspaceToolSpec['prepareArgs'],
): WorkspaceToolSpec {
  return {
    name: requestedTool,
    description,
    prepareArgs,
    execute: async (args, context) =>
      mcpService.executeWorkerTool(
        context.task.organization_id,
        workerType,
        requestedTool,
        args,
      ),
  };
}

function createGmailDraftToolSpec(): WorkspaceToolSpec {
  return {
    name: 'draft_gmail_message',
    description: 'Create a Gmail draft. Preferred args: { to, subject, body, body_format?, thread_id? }.',
    prepareArgs: (args, context) => {
      const stepInput = asRecord(context.step.input);
      return {
        recipient: asString(args.to) ?? asString(args.recipient) ?? asString(stepInput.to) ?? asString(stepInput.recipient),
        subject: asString(args.subject) ?? asString(stepInput.subject),
        body: asString(args.body)
          ?? asString(stepInput.body)
          ?? asString(stepInput.message)
          ?? getSourceSummary(context)
          ?? 'Prepared by workspace Gmail agent.',
        body_format: asString(args.body_format) ?? asString(stepInput.body_format) ?? 'plain',
        thread_external_id: asString(args.thread_id) ?? asString(stepInput.thread_external_id),
      };
    },
    execute: async (args, context) => {
      const result = await new EmailDraftProcessor().process({
        ...context.task,
        domain_action: 'email.draft',
        payload: args,
      });

      return {
        toolName: asString(result.tool_name) ?? 'draft_gmail_message',
        result,
      };
    },
  };
}

function createGmailSendToolSpec(): WorkspaceToolSpec {
  return {
    name: 'send_gmail_message',
    description: 'Send a Gmail message using the approved workflow. Preferred args: { to, subject, body, body_format?, thread_id? }.',
    prepareArgs: (args, context) => {
      const stepInput = asRecord(context.step.input);
      return {
        to: asString(args.to) ?? asString(args.recipient) ?? asString(stepInput.to) ?? asString(stepInput.recipient),
        subject: asString(args.subject) ?? asString(stepInput.subject),
        body: asString(args.body)
          ?? asString(stepInput.body)
          ?? asString(stepInput.message)
          ?? getSourceSummary(context)
          ?? 'Prepared by workspace Gmail agent.',
        body_format: asString(args.body_format) ?? asString(stepInput.body_format) ?? 'plain',
        thread_external_id: asString(args.thread_id) ?? asString(stepInput.thread_external_id),
        approved_by: asString(stepInput.approved_by),
        approved_at: asString(stepInput.approved_at),
        source_task_id: asString(stepInput.source_task_id),
      };
    },
    execute: async (args, context) => {
      const result = await new EmailSendProcessor().process({
        ...context.task,
        domain_action: 'email.send',
        payload: args,
      });

      return {
        toolName: asString(result.tool_name) ?? 'send_gmail_message',
        result,
      };
    },
  };
}

function buildDocsToolSpecs(context: WorkerExecutionContext): WorkspaceToolSpec[] {
  return [
    createMcpToolSpec(
      'docs',
      'create_doc',
      'Create a Google Doc with arguments like { title, content? }. Use this first when the step needs a new document.',
      (args) => ({
        title: asString(args.title) ?? inferQuotedTitle(context.executionRun.plan_json.original_command) ?? asString(asRecord(context.step.input).title) ?? 'Planner-generated document',
        content: asString(args.content) ?? asString(args.body) ?? '',
      }),
    ),
    createMcpToolSpec(
      'docs',
      'modify_doc_text',
      'Insert or replace text in a Google Doc. Preferred args: { document_id, text, start_index?, end_index? }.',
      (args, _ctx, invocations) => ({
        document_id: asString(args.document_id)
          ?? asString(args.doc_id)
          ?? findFirstString(findToolInvocation(invocations, 'create_doc')?.result, ['documentId', 'document_id', 'id']),
        text: asString(args.text) ?? asString(args.content) ?? asString(args.body) ?? '',
        start_index: asNumber(args.start_index) ?? 1,
        end_index: asNumber(args.end_index) ?? undefined,
      }),
    ),
    createMcpToolSpec(
      'docs',
      'get_doc_content',
      'Read Google Doc content. Preferred args: { document_id }.',
      (args, _ctx, invocations) => ({
        document_id: asString(args.document_id)
          ?? asString(args.doc_id)
          ?? findFirstString(findToolInvocation(invocations, 'create_doc')?.result, ['documentId', 'document_id', 'id']),
      }),
    ),
  ];
}

function buildDriveToolSpecs(context: WorkerExecutionContext): WorkspaceToolSpec[] {
  return [
    createMcpToolSpec(
      'drive',
      'search_drive_files',
      'Search Google Drive files with a free-text query or Drive query syntax. Preferred args: { query }.',
      (args) => ({ query: asString(args.query) ?? context.executionRun.plan_json.original_command }),
    ),
    createMcpToolSpec(
      'drive',
      'get_drive_file_content',
      'Read content from Google Docs, Sheets, and Office files. Preferred args: { file_id }.',
      (args) => ({
        file_id: asString(args.file_id)
          ?? asString(args.document_id)
          ?? (() => {
            const refs = asRecord(context.step.input).context_references;
            if (!Array.isArray(refs)) {
              return null;
            }
            const first = refs.find((entry) => entry && typeof entry === 'object' && typeof (entry as { file_id?: unknown }).file_id === 'string');
            return first ? String((first as { file_id: string }).file_id) : null;
          })(),
      }),
    ),
    createMcpToolSpec(
      'drive',
      'get_drive_shareable_link',
      'Get a shareable link for a Google Drive file. Preferred args: { file_id }.',
      (args, _ctx, invocations) => ({
        file_id: asString(args.file_id)
          ?? findFirstString(findToolInvocation(invocations, 'search_drive_files')?.result, ['file_id', 'id'])
          ?? findFirstString(findToolInvocation(invocations, 'get_drive_file_content')?.args, ['file_id']),
      }),
    ),
  ];
}

function buildSheetsToolSpecs(): WorkspaceToolSpec[] {
  return [
    createMcpToolSpec(
      'sheets',
      'create_spreadsheet',
      'Create a spreadsheet, optionally with multiple sheets. Preferred args: { title, sheets? }.',
    ),
    createMcpToolSpec(
      'sheets',
      'modify_sheet_values',
      'Write or update values in a spreadsheet. Preferred args: { spreadsheet_id, range, values }.',
    ),
    createMcpToolSpec(
      'sheets',
      'read_sheet_values',
      'Read cell values from a spreadsheet. Preferred args: { spreadsheet_id, range }.',
    ),
    createMcpToolSpec(
      'sheets',
      'get_spreadsheet_info',
      'Read spreadsheet metadata, sheet list, and structure. Preferred args: { spreadsheet_id }.',
    ),
  ];
}

function buildSlidesToolSpecs(): WorkspaceToolSpec[] {
  return [
    createMcpToolSpec(
      'slides',
      'create_presentation',
      'Create a Google Slides presentation. Preferred args: { title }.',
    ),
    createMcpToolSpec(
      'slides',
      'batch_update_presentation',
      'Apply slide updates such as creating slides or shapes. Preferred args: { presentation_id, requests }.',
    ),
    createMcpToolSpec(
      'slides',
      'get_presentation',
      'Read presentation metadata and extracted slide text. Preferred args: { presentation_id }.',
    ),
  ];
}

function buildCalendarToolSpecs(context: WorkerExecutionContext): WorkspaceToolSpec[] {
  return [
    createMcpToolSpec(
      'calendar',
      'manage_event',
      'Create, update, or delete calendar events. Preferred args for create: { action: "create", summary, start_time, end_time, attendees?, description?, location? }.',
      (args) => {
        const stepInput = asRecord(context.step.input);
        return {
          action: asString(args.action) ?? 'create',
          summary: asString(args.summary) ?? asString(stepInput.summary),
          start_time: asString(args.start_time) ?? asString(args.startTime) ?? asString(stepInput.start_time) ?? asString(stepInput.startTime),
          end_time: asString(args.end_time) ?? asString(args.endTime) ?? asString(stepInput.end_time) ?? asString(stepInput.endTime),
          description: asString(args.description) ?? asString(stepInput.description),
          location: asString(args.location) ?? asString(stepInput.location),
          attendees: Array.isArray(args.attendees) ? args.attendees : stepInput.attendees,
        };
      },
    ),
    createMcpToolSpec(
      'calendar',
      'get_events',
      'Query calendar events by time range or event id.',
    ),
    createMcpToolSpec(
      'calendar',
      'list_calendars',
      'List calendars accessible to the connected Google account.',
    ),
  ];
}

function buildGmailToolSpecs(context: WorkerExecutionContext): WorkspaceToolSpec[] {
  if (context.step.action === 'send_email') {
    return [
      createGmailSendToolSpec(),
      createGmailDraftToolSpec(),
      createMcpToolSpec(
        'gmail',
        'get_gmail_thread_content',
        'Read Gmail thread context when you need to reply or preserve thread details. Preferred args: { thread_id }.',
      ),
    ];
  }

  return [
    createGmailDraftToolSpec(),
    createMcpToolSpec(
      'gmail',
      'get_gmail_thread_content',
      'Read Gmail thread context when drafting a reply. Preferred args: { thread_id }.',
    ),
  ];
}

const WORKSPACE_AGENT_DEFINITIONS: Record<CapabilityWorkerType, WorkspaceAgentDefinition> = {
  gmail: {
    displayName: 'Google Gmail specialist',
    systemPrompt: [
      'You are the Gmail specialist inside a LangGraph planner-worker orchestration.',
      'Only perform Gmail work for the current step.',
      'Use the provided Gmail tools to create or send the message.',
      'If the request references a prior artifact, include the relevant artifact URL or summary in the email body.',
      'Never say an email was sent or drafted unless you actually called the Gmail tool.',
      'End with a concise handoff note describing the resulting draft or send status.',
    ].join('\n'),
    buildToolSpecs: buildGmailToolSpecs,
  },
  drive: {
    displayName: 'Google Drive specialist',
    systemPrompt: [
      'You are the Google Drive specialist inside a LangGraph planner-worker orchestration.',
      'Only perform Drive retrieval or file-link work for the current step.',
      'Use Drive tools to locate or read the requested file.',
      'Return a concise handoff note with the file identity, link, and the most useful extracted context for the next worker.',
    ].join('\n'),
    buildToolSpecs: buildDriveToolSpecs,
  },
  docs: {
    displayName: 'Google Docs specialist',
    systemPrompt: [
      'You are the Google Docs specialist inside a LangGraph planner-worker orchestration.',
      'Only perform Google Docs work for the current step.',
      'If the user asks for a document with content, you must create the document and populate it before finishing.',
      'Prefer create_doc with initial content when possible; use modify_doc_text to insert or revise text after creation.',
      'Return a handoff note containing the document title, document id, and URL for the next worker.',
    ].join('\n'),
    buildToolSpecs: buildDocsToolSpecs,
  },
  sheets: {
    displayName: 'Google Sheets specialist',
    systemPrompt: [
      'You are the Google Sheets specialist inside a LangGraph planner-worker orchestration.',
      'Only perform spreadsheet work for the current step.',
      'If the step requires a new spreadsheet or data population, use the provided Sheets tools to create and populate it.',
      'Return a handoff note with the spreadsheet id, URL, and the key data that was written.',
    ].join('\n') + buildAgentSkillAppendix('sheets'),
    buildToolSpecs: buildSheetsToolSpecs,
  },
  slides: {
    displayName: 'Google Slides specialist',
    systemPrompt: [
      'You are the Google Slides specialist inside a LangGraph planner-worker orchestration.',
      'Only perform presentation work for the current step.',
      'If the request needs a populated presentation, create it and apply updates before finishing.',
      'Return a handoff note with the presentation id, URL, and the created slide structure.',
    ].join('\n') + buildAgentSkillAppendix('slides'),
    buildToolSpecs: buildSlidesToolSpecs,
  },
  calendar: {
    displayName: 'Google Calendar specialist',
    systemPrompt: [
      'You are the Google Calendar specialist inside a LangGraph planner-worker orchestration.',
      'Only perform calendar work for the current step.',
      'Use manage_event for side-effecting calendar actions and list/read tools when you need context.',
      'Return a handoff note with the event id, timing, and any attendee or visibility details that matter downstream.',
    ].join('\n'),
    buildToolSpecs: buildCalendarToolSpecs,
  },
};

function createTrackedTool(
  spec: WorkspaceToolSpec,
  context: WorkerExecutionContext,
  invocations: ToolInvocationRecord[],
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: spec.name,
    description: spec.description,
    schema: z.object({}).passthrough(),
    func: async (input: Record<string, unknown>) => {
      const args = spec.prepareArgs
        ? spec.prepareArgs(input, context, invocations)
        : input;
      const execution = await spec.execute(args, context);
      invocations.push({
        requestedTool: spec.name,
        toolName: execution.toolName,
        args,
        result: execution.result,
      });
      return buildToolObservation(execution.result);
    },
  });
}

function buildWorkerSummary(
  context: WorkerExecutionContext,
  invocations: ToolInvocationRecord[],
  finalMessage: string,
): { summary: string; nextWorkerNote: string; output: Record<string, Json | undefined>; toolName?: string } {
  const lastInvocation = invocations[invocations.length - 1];
  const lastResult = lastInvocation?.result;
  const summaryFromResult = asString(asRecord(lastResult).summary);

  if (context.step.worker_type === 'docs') {
    const createDocInvocation = findToolInvocation(invocations, 'create_doc');
    const modifyInvocation = findToolInvocation(invocations, 'modify_doc_text');
    const documentId = findFirstString(createDocInvocation?.result, ['documentId', 'document_id', 'id']);
    const documentUrl = findFirstUrl(createDocInvocation?.result);
    const title = asString(createDocInvocation?.args.title)
      ?? inferQuotedTitle(context.executionRun.plan_json.original_command)
      ?? asString(asRecord(context.step.input).title)
      ?? 'Google Doc';
    const wroteContent = Boolean(modifyInvocation || asString(createDocInvocation?.args.content));
    const summary = summaryFromResult
      ?? finalMessage
      ?? `Docs agent created ${title}${documentUrl ? ` at ${documentUrl}` : ''}.`;
    const nextWorkerNote = documentUrl
      ? `Google Doc ready: ${title} (${documentUrl})${wroteContent ? '; initial content populated.' : '.'}`
      : `Google Doc ready: ${title}${wroteContent ? '; initial content populated.' : '.'}`;

    return {
      summary,
      nextWorkerNote,
      toolName: createDocInvocation?.toolName ?? lastInvocation?.toolName,
      output: {
        summary,
        handoff_content: nextWorkerNote,
        document_id: documentId ?? undefined,
        document_url: documentUrl ?? undefined,
        document_title: title,
        tool_name: createDocInvocation?.toolName ?? lastInvocation?.toolName,
        raw_result: toJson(lastResult),
        tool_results: toJson(invocations.map((entry) => ({
          requested_tool: entry.requestedTool,
          tool_name: entry.toolName,
          args: entry.args,
          result: entry.result,
        }))),
      },
    };
  }

  if (context.step.worker_type === 'drive') {
    const driveInvocation = findToolInvocation(invocations, 'get_drive_file_content') ?? invocations[0] ?? null;
    const summaryText = findFirstString(driveInvocation?.result, ['summary', 'content']) ?? finalMessage;
    const fileId = findFirstString(driveInvocation?.args, ['file_id']) ?? findFirstString(driveInvocation?.result, ['file_id', 'id']);
    const fileUrl = findFirstUrl(findToolInvocation(invocations, 'get_drive_shareable_link')?.result ?? driveInvocation?.result);
    const summary = summaryText && summaryText.length > 0
      ? summaryText
      : 'Drive agent gathered source context.';
    const nextWorkerNote = fileUrl
      ? `Drive context ready from file ${fileId ?? 'unknown'} (${fileUrl}).`
      : `Drive context ready from file ${fileId ?? 'unknown'}.`;

    return {
      summary,
      nextWorkerNote,
      toolName: driveInvocation?.toolName ?? lastInvocation?.toolName,
      output: {
        summary,
        handoff_content: nextWorkerNote,
        file_id: fileId ?? undefined,
        file_url: fileUrl ?? undefined,
        tool_name: driveInvocation?.toolName ?? lastInvocation?.toolName,
        raw_result: toJson(lastResult),
        tool_results: toJson(invocations.map((entry) => ({
          requested_tool: entry.requestedTool,
          tool_name: entry.toolName,
          args: entry.args,
          result: entry.result,
        }))),
      },
    };
  }

  if (context.step.worker_type === 'gmail') {
    const resultRecord = asRecord(lastResult);
    const summary = asString(resultRecord.summary) ?? finalMessage ?? 'Gmail worker completed.';
    const nextWorkerNote = summary;

    return {
      summary,
      nextWorkerNote,
      toolName: lastInvocation?.toolName,
      output: {
        ...toJsonRecord(lastResult),
        summary,
        handoff_content: nextWorkerNote,
        tool_name: lastInvocation?.toolName,
      },
    };
  }

  if (context.step.worker_type === 'calendar') {
    const eventId = findFirstString(lastResult, ['event_id', 'eventId', 'id']);
    const summary = asString(asRecord(lastResult).summary) ?? finalMessage ?? 'Calendar event processed.';
    const nextWorkerNote = eventId
      ? `Calendar event ready with id ${eventId}.`
      : summary;

    return {
      summary,
      nextWorkerNote,
      toolName: lastInvocation?.toolName,
      output: {
        ...toJsonRecord(lastResult),
        summary,
        handoff_content: nextWorkerNote,
        event_id: eventId ?? undefined,
        tool_name: lastInvocation?.toolName,
      },
    };
  }

  const resourceId = findFirstString(lastResult, ['spreadsheet_id', 'presentation_id', 'id']);
  const resourceUrl = findFirstUrl(lastResult);
  const summary = asString(asRecord(lastResult).summary)
    ?? finalMessage
    ?? `${context.step.worker_type} worker completed ${context.step.action}.`;
  const nextWorkerNote = resourceUrl
    ? `${context.step.worker_type} artifact ready${resourceId ? ` (${resourceId})` : ''}: ${resourceUrl}`
    : summary;

  return {
    summary,
    nextWorkerNote,
    toolName: lastInvocation?.toolName,
    output: {
      ...toJsonRecord(lastResult),
      summary,
      handoff_content: nextWorkerNote,
      tool_name: lastInvocation?.toolName,
      resource_id: resourceId ?? undefined,
      resource_url: resourceUrl ?? undefined,
      tool_results: toJson(invocations.map((entry) => ({
        requested_tool: entry.requestedTool,
        tool_name: entry.toolName,
        args: entry.args,
        result: entry.result,
      }))),
    },
  };
}

export async function executeWorkspaceWorkerAgent(
  context: WorkerExecutionContext,
): Promise<WorkerExecutionResult> {
  const definition = WORKSPACE_AGENT_DEFINITIONS[context.step.worker_type as CapabilityWorkerType];
  if (!definition) {
    throw new Error(`No specialized workspace agent is registered for ${context.step.worker_type}.`);
  }

  const invocations: ToolInvocationRecord[] = [];
  const tools = definition.buildToolSpecs(context).map((spec) => createTrackedTool(spec, context, invocations));
  if (tools.length === 0) {
    throw new Error(`No tools are configured for ${context.step.worker_type}:${context.step.action}.`);
  }

  const langfuseHandler = tracingService.getHandler();
  const callbacks = langfuseHandler ? [langfuseHandler] : [];
  const llm = new ChatMistralAI({
    apiKey: config.MISTRAL_API_KEY,
    model: config.DEFAULT_LLM_MODEL,
    temperature: 0,
    callbacks,
  });

  try {
    const agent = createAgent({
      model: llm,
      tools,
      systemPrompt: definition.systemPrompt,
      middleware: [modelCallLimitMiddleware({ runLimit: 6 })],
    });

    const result = await agent.invoke({
      messages: [{ role: 'user', content: buildWorkspaceUserPrompt(context, definition) }],
    }, {
      callbacks,
    });

    const finalMessage = stringifyContent(result.messages?.at(-1)?.content).trim();
    if (invocations.length === 0) {
      throw new Error(`${definition.displayName} did not execute any tool.`);
    }

    tracingService.handleSuccess();
    await tracingService.flush();

    return buildWorkerSummary(context, invocations, finalMessage);
  } catch (error) {
    tracingService.handleFailure(error);
    throw error;
  }
}
