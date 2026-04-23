import type { ContextReference, Task } from '@ai-assistant/shared';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ChatMistralAI } from '@langchain/mistralai';
import { createAgent, modelCallLimitMiddleware } from 'langchain';
import { z } from 'zod';
import { config } from '../../config/index.js';
import { tracingService } from '../../services/llm/tracing.js';
import type { CapabilityWorkerType } from '../../services/WorkerToolPolicyService.js';

const PlannerWorkerTypeSchema = z.enum(['gmail', 'drive', 'docs', 'sheets', 'slides', 'calendar']);

const PlannerStepSchema = z.object({
  title: z.string().trim().min(1),
  worker_type: PlannerWorkerTypeSchema,
  action: z.string().trim().min(1),
  requested_tools: z.array(z.string().trim().min(1)).optional().default([]),
  input: z.record(z.unknown()).default({}),
  recoverable: z.boolean().optional().default(false),
});

const CommandPlanningResponseSchema = z.object({
  decision: z.enum(['plan', 'clarify', 'no_match']),
  summary: z.string().trim().min(1),
  clarification_prompt: z.string().trim().min(1).optional(),
  clarification_details: z.string().trim().min(1).optional(),
  steps: z.array(PlannerStepSchema).default([]),
});

export type CommandPlanningResponse = z.infer<typeof CommandPlanningResponseSchema>;

export type AssistantCommandPlanner = (input: {
  task: Task;
  commandText: string;
  contextReferences: ContextReference[];
  knownFields: Record<string, unknown>;
}) => Promise<CommandPlanningResponse>;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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

function extractJsonEnvelope(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1).trim();
  }

  return null;
}

function buildCapabilityCatalog(): Record<string, unknown> {
  return {
    workspace_capabilities: [
      {
        worker_type: 'gmail',
        supported_actions: ['draft_email', 'send_email'],
        required_inputs: ['recipient'],
        optional_inputs: ['message', 'instructions', 'subject', 'body', 'body_format'],
        tool_defaults: ['draft_gmail_message', 'send_gmail_message'],
      },
      {
        worker_type: 'calendar',
        supported_actions: ['create_event'],
        required_inputs: ['summary', 'startTime', 'endTime'],
        optional_inputs: ['description', 'location', 'attendees'],
        tool_defaults: ['manage_event', 'query_freebusy'],
      },
      {
        worker_type: 'drive',
        supported_actions: ['read_drive_context'],
        required_inputs: ['context_references'],
        optional_inputs: [],
        tool_defaults: ['get_drive_file_content'],
      },
      {
        worker_type: 'docs',
        supported_actions: ['create_document'],
        required_inputs: ['title'],
        optional_inputs: ['content', 'source_step_key'],
        tool_defaults: ['create_doc', 'modify_doc_text', 'get_doc_content'],
      },
      {
        worker_type: 'sheets',
        supported_actions: ['update_sheet'],
        required_inputs: [],
        optional_inputs: ['source_step_key'],
        tool_defaults: ['create_spreadsheet', 'modify_sheet_values', 'read_sheet_values'],
      },
      {
        worker_type: 'slides',
        supported_actions: ['create_presentation'],
        required_inputs: [],
        optional_inputs: ['source_step_key'],
        tool_defaults: ['create_presentation', 'batch_update_presentation', 'get_presentation'],
      },
    ],
  };
}

function buildPlannerSystemPrompt(currentDateIso: string, timezone: string | null): string {
  return [
    'You are the Command Center orchestration planner for a workspace assistant.',
    'Your job is to interpret a natural-language command and produce a structured execution decision.',
    'You may use the provided planning tools to inspect supported capabilities and readiness before deciding.',
    'You NEVER execute side effects yourself. You only plan, clarify, or decline to match.',
    '',
    'Current date/time:',
    `- now_iso: ${currentDateIso}`,
    `- user_timezone: ${timezone ?? 'unknown'}`,
    '',
    'AVAILABLE SPECIALIST AGENTS:',
    '- **Gmail**: Draft and send emails, read thread content',
    '- **Calendar**: Create/update/delete events, query events, list calendars',
    '- **Docs**: Create docs, insert/replace text, read content',
    '- **Sheets**: Create spreadsheets, write/read cell values, get metadata',
    '- **Slides**: Create presentations, apply slide updates, read metadata',
    '- **Drive**: Search files, read file content, get shareable links',
    '',
    'Rules:',
    '1. Prefer decision="plan" for Gmail, Calendar, Drive, Docs, Sheets, and Slides tasks.',
    '2. Prefer decision="clarify" instead of failing when required fields are missing or ambiguous.',
    '3. Prefer decision="no_match" when the request is better handled by deterministic routing outside workspace planning.',
    '4. Never guess unsafe or externally-visible values such as recipient email addresses, external ids, or unclear calendar times.',
    '5. For Gmail steps, do NOT draft final email subject/body copy unless the user explicitly provided exact text. Prefer input.message (verbatim) + input.instructions (tone/language/length).',
    '6. You may convert clear natural-language scheduling instructions into ISO-8601 datetimes when the date, time, and timezone are sufficiently clear.',
    '7. If the user request includes file URLs or source artifacts, include a Drive read step before downstream artifact creation when needed.',
    '8. Never claim that a draft, email, document, spreadsheet, slide deck, or calendar event already exists unless you are only referencing the user request.',
    '9. Output ONLY JSON matching the schema. No markdown.',
    '10. When the user says "tomorrow", "next week", "in 3 days" etc., convert to ISO-8601 using the current date as anchor.',
    '',
    'Use only these worker_type/action pairs when planning:',
    '- gmail / draft_email',
    '- gmail / send_email',
    '- calendar / create_event',
    '- drive / read_drive_context',
    '- docs / create_document',
    '- sheets / update_sheet',
    '- slides / create_presentation',
    '',
    'Output schema:',
    '{',
    '  "decision": "plan" | "clarify" | "no_match",',
    '  "summary": string,',
    '  "clarification_prompt"?: string,',
    '  "clarification_details"?: string,',
    '  "steps"?: [',
    '    {',
    '      "title": string,',
    '      "worker_type": "gmail" | "drive" | "docs" | "sheets" | "slides" | "calendar",',
    '      "action": string,',
    '      "requested_tools"?: string[],',
    '      "input": object,',
    '      "recoverable"?: boolean',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}

function buildPlannerUserPrompt(input: {
  commandText: string;
  contextReferences: ContextReference[];
  knownFields: Record<string, unknown>;
}): string {
  return [
    'Plan this command.',
    '',
    `Command: ${input.commandText}`,
    '',
    'Known fields:',
    JSON.stringify(input.knownFields, null, 2),
    '',
    'Context references:',
    JSON.stringify(input.contextReferences, null, 2),
    '',
    'Return only JSON.',
  ].join('\n');
}

function buildPlanningTools(task: Task): DynamicStructuredTool[] {
  return [
    new DynamicStructuredTool({
      name: 'list_workspace_capabilities',
      description: 'Return the supported workspace capabilities, actions, and required inputs for planning.',
      schema: z.object({}).passthrough(),
      func: async () => JSON.stringify(buildCapabilityCatalog()),
    }),
    new DynamicStructuredTool({
      name: 'check_workspace_capability_readiness',
      description: 'Check whether a workspace capability is connected and ready for this organization before planning execution.',
      schema: z.object({
        worker_type: PlannerWorkerTypeSchema,
        requested_tools: z.array(z.string().trim().min(1)).optional().default([]),
      }),
      func: async ({ worker_type, requested_tools }) => {
        const { mcpService } = await import('../../services/mcp.js');
        const readiness = await mcpService.checkCapabilityReadiness(
          task.organization_id,
          worker_type as CapabilityWorkerType,
          requested_tools,
        );
        return JSON.stringify(readiness);
      },
    }),
  ];
}

export const planAssistantCommandWithAgent: AssistantCommandPlanner = async ({
  task,
  commandText,
  contextReferences,
  knownFields,
}) => {
  const runningUnderVitest = process.env.VITEST === 'true'
    || process.argv.some((arg) => arg.toLowerCase().includes('vitest'));

  if (process.env.NODE_ENV === 'test' || runningUnderVitest || !config.MISTRAL_API_KEY) {
    return {
      decision: 'no_match',
      summary: 'Planner unavailable in test mode',
      steps: [],
    };
  }

  const langfuseHandler = tracingService.getHandler();
  const callbacks = langfuseHandler ? [langfuseHandler] : [];
  const llm = new ChatMistralAI({
    apiKey: config.MISTRAL_API_KEY,
    model: config.DEFAULT_LLM_MODEL,
    temperature: 0,
    callbacks,
  });

  const timezone = asString(asRecord(knownFields.channel_metadata).timezone);
  const agent = createAgent({
    model: llm,
    tools: buildPlanningTools(task),
    systemPrompt: buildPlannerSystemPrompt(new Date().toISOString(), timezone),
    middleware: [modelCallLimitMiddleware({ runLimit: 4 })],
  });

  const result = await agent.invoke({
    messages: [{ role: 'user', content: buildPlannerUserPrompt({ commandText, contextReferences, knownFields }) }],
  }, {
    callbacks,
  });

  const rawOutput = stringifyContent(result.messages?.at(-1)?.content).trim();
  const jsonEnvelope = extractJsonEnvelope(rawOutput);
  if (!jsonEnvelope) {
    return {
      decision: 'no_match',
      summary: 'Planner output was not parseable',
      steps: [],
    };
  }

  const parsed = CommandPlanningResponseSchema.safeParse(JSON.parse(jsonEnvelope));
  if (!parsed.success) {
    return {
      decision: 'no_match',
      summary: 'Planner output failed schema validation',
      steps: [],
    };
  }

  tracingService.handleSuccess();
  await tracingService.flush();

  return parsed.data;
};
