/**
 * Calendar Specialist Node
 *
 * Uses native MCP tools from the Google Workspace MCP server.
 * No manual DynamicStructuredTool wrapping.
 */

import { ChatMistralAI } from '@langchain/mistralai';
import { createAgent, modelCallLimitMiddleware } from 'langchain';
import { config } from '../../config/index.js';
import { tracingService } from '../../services/llm/tracing.js';
import { getSpecialistPrompt } from '../../prompts/specialistPrompts.js';
import { getSpecialistMcpTools, buildSpecialistContextPrompt } from './specialistToolBuilder.js';
import type { SpecialistNodeContext, SpecialistNodeResult, ToolInvocationRecord } from './types.js';

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((entry) => (typeof entry === 'string' ? entry : asString(asRecord(entry).text) ?? JSON.stringify(entry))).join('\n').trim();
  }
  if (content && typeof content === 'object') return JSON.stringify(content);
  return String(content ?? '');
}

function buildCalendarHandoff(invocations: ToolInvocationRecord[], finalMessage: string): SpecialistNodeResult {
  const lastInvocation = invocations[invocations.length - 1];
  const lastResult = lastInvocation?.result;
  const eventId = asString(asRecord(lastResult).event_id) ?? asString(asRecord(lastResult).eventId) ?? asString(asRecord(lastResult).id);
  const summary = asString(asRecord(lastResult).summary) ?? finalMessage ?? 'Calendar event processed.';
  const nextWorkerNote = eventId ? `Calendar event ready with id ${eventId}.` : summary;
  return {
    summary,
    nextWorkerNote,
    toolName: lastInvocation?.toolName,
    output: { summary, handoff_content: nextWorkerNote, event_id: eventId ?? undefined, tool_name: lastInvocation?.toolName },
  };
}

export async function calendarAgentNode(context: SpecialistNodeContext): Promise<SpecialistNodeResult> {
  const invocations: ToolInvocationRecord[] = [];
  const mcpTools = await getSpecialistMcpTools(context.task.organization_id, 'calendar', {
    userId: context.task.user_id,
  });

  if (mcpTools.length === 0) {
    throw new Error('No Calendar MCP tools available for this organization.');
  }

  const trackedTools = mcpTools.map((tool) => {
    const originalCall = tool.call.bind(tool);
    return Object.assign(Object.create(Object.getPrototypeOf(tool)), tool, {
      call: async (input: string | Record<string, unknown>) => {
        const args = typeof input === 'string' ? JSON.parse(input) : input;
        const result = await originalCall(input);
        invocations.push({ requestedTool: tool.name, toolName: tool.name, args, result });
        return result;
      },
    });
  });

  const langfuseHandler = tracingService.getHandler();
  const callbacks = langfuseHandler ? [langfuseHandler] : [];
  const llm = new ChatMistralAI({ apiKey: config.MISTRAL_API_KEY, model: config.DEFAULT_LLM_MODEL, temperature: 0, callbacks });

  try {
    const agent = createAgent({
      model: llm,
      tools: trackedTools,
      systemPrompt: getSpecialistPrompt('calendar'),
      middleware: [modelCallLimitMiddleware({ runLimit: 6 })],
    });

    const result = await agent.invoke({
      messages: [{ role: 'user', content: buildSpecialistContextPrompt(context) }],
    }, { callbacks });

    const finalMessage = stringifyContent(result.messages?.at(-1)?.content).trim();
    if (invocations.length === 0) throw new Error('Calendar specialist did not execute any tool.');

    tracingService.handleSuccess();
    await tracingService.flush();
    return buildCalendarHandoff(invocations, finalMessage);
  } catch (error) {
    tracingService.handleFailure(error);
    throw error;
  }
}
