/**
 * Specialist MCP Tool Builder
 *
 * Gets native LangChain StructuredTools from the MCP service and filters
 * them per specialist worker type. No manual DynamicStructuredTool wrapping.
 *
 * IMPORTANT: Tool names must match what the MCP server returns via
 * mcpService.getLangChainTools() — these are canonical MCP tool names,
 * not aliases. Aliases are resolved by mcpService.executeWorkerTool().
 */

import type { StructuredTool } from '@langchain/core/tools';
import { mcpService } from '../../services/mcp.js';
import {
  workerToolPolicyService,
  type CapabilityWorkerType,
} from '../../services/WorkerToolPolicyService.js';
import { createCurrentTimeTool } from '../../tools/timeDateTool.js';
import {
  createGetUserSkillTool,
  createListUserSkillsTool,
  createSearchUserSkillsTool,
} from '../../tools/userSkillsTools.js';
import { createSearchWebResearchTool } from '../../tools/researchTools.js';
import { createWatchTopicTools } from '../../tools/watchTopicTools.js';
import type { SpecialistNodeContext } from './types.js';

/**
 * Map from worker type to MCP tool names the specialist needs.
 * These MUST match what the MCP server actually provides.
 *
 * Actual MCP tools from taylorwilsdon/google_workspace_mcp:
 *   Gmail:    draft_gmail_message, send_gmail_message, get_gmail_thread_content
 *   Calendar: manage_event, query_freebusy
 *   Docs:     create_doc, modify_doc_text, get_doc_content
 *   Sheets:   create_spreadsheet, modify_sheet_values, read_sheet_values
 *   Slides:   create_presentation, modify_presentation, batch_update_presentation
 *   Drive:    search_drive_files, get_drive_file_content, create_drive_file, import_to_google_doc
 */
const SPECIALIST_TOOL_NAMES: Record<CapabilityWorkerType, string[]> = {
  gmail: [
    'draft_gmail_message',
    'send_gmail_message',
    'get_gmail_thread_content',
  ],
  calendar: [
    'manage_event',
    'query_freebusy',
  ],
  docs: [
    'create_doc',
    'modify_doc_text',
    'get_doc_content',
  ],
  sheets: [
    'create_spreadsheet',
    'modify_sheet_values',
    'read_sheet_values',
  ],
  slides: [
    'create_presentation',
    'modify_presentation',
    'batch_update_presentation',
  ],
  drive: [
    'search_drive_files',
    'get_drive_file_content',
    'create_drive_file',
    'import_to_google_doc',
  ],
};

/**
 * Get tools for a specific specialist worker type.
 *
 * 1. Fetches all LangChain tools from the MCP server
 * 2. Filters by specialist's canonical tool names + worker policy
 * 3. Adds time/date tools so every agent is time-aware
 *
 * @returns Array of StructuredTool — ready for createAgent()
 */
export async function getSpecialistMcpTools(
  orgId: string,
  workerType: CapabilityWorkerType,
  options?: {
    userId?: string | null;
  },
): Promise<StructuredTool[]> {
  // 1. Get all MCP tools as native LangChain StructuredTool
  const allTools = await mcpService.getLangChainTools(orgId);

  // 2. Filter by specialist's canonical tool names + worker policy
  const allowedNames = new Set(SPECIALIST_TOOL_NAMES[workerType] ?? []);

  const mcpTools = allTools.filter((tool) => {
    const toolName = tool.name;

    // Must be in specialist's allowed list (canonical names only)
    if (!allowedNames.has(toolName)) {
      return false;
    }

    // Must pass worker policy
    if (!workerToolPolicyService.isToolAllowed(workerType, toolName)) {
      return false;
    }

    return true;
  });

  const additionalTools: StructuredTool[] = [];

  if (workerType === 'docs' || workerType === 'gmail') {
    additionalTools.push(createSearchWebResearchTool());

    additionalTools.push(
      createSearchUserSkillsTool({ organizationId: orgId, userId: options?.userId }),
      createListUserSkillsTool({ organizationId: orgId, userId: options?.userId }),
      createGetUserSkillTool({ organizationId: orgId, userId: options?.userId }),
    );
  }

  if (workerType === 'gmail') {
    additionalTools.push(...createWatchTopicTools({ organizationId: orgId, userId: options?.userId }));
  }

  // 3. All agents get current time tool for time awareness
  const timeTools = [createCurrentTimeTool()];

  return [...mcpTools, ...additionalTools, ...timeTools];
}

/**
 * Build a user prompt for a specialist with step context.
 */
export function buildSpecialistContextPrompt(context: SpecialistNodeContext): string {
  const sourceStepKey = typeof context.step.input === 'object' && context.step.input !== null
    ? (context.step.input as Record<string, unknown>).source_step_key
    : null;

  const sourceStep = typeof sourceStepKey === 'string'
    ? context.executionRun.plan_json.steps.find((s) => s.key === sourceStepKey)
    : null;

  const sourceOutput = sourceStep?.output
    ? JSON.stringify(sourceStep.output, null, 2)
    : '{}';

  const memorySections = [
    context.memory?.persona_memory
      ? `Persona memory:\n${context.memory.persona_memory}`
      : null,
    context.memory?.long_term_memory
      ? `Long-term memory:\n${context.memory.long_term_memory}`
      : null,
  ].filter((entry): entry is string => Boolean(entry));

  const memoryBlock = memorySections.length > 0
    ? `User preferences / memory:\n${memorySections.join('\n\n')}`
    : 'User preferences / memory:\n(none available)';

  return [
    `Original user request: ${context.executionRun.plan_json.original_command}`,
    '',
    `Current step: ${context.step.title}`,
    `Current action: ${context.step.action}`,
    'Current step input:',
    JSON.stringify(context.step.input, null, 2),
    '',
    'Source step output:',
    sourceOutput,
    '',
    memoryBlock,
    '',
    'Instructions:',
    '- Complete only the current step using the provided tools.',
    '- If you create an artifact, include its id, URL, and what was produced.',
    '- Populate documents with meaningful initial content when asked.',
    '- Write a concise final handoff note for the next worker.',
  ].join('\n');
}
