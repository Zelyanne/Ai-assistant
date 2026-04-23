/**
 * Gmail Specialist Node
 *
 * Uses native MCP tools from the Google Workspace MCP server via
 * mcpService.getLangChainTools() — no manual DynamicStructuredTool wrapping.
 *
 * @see ADR-002: Separate Specialist Nodes
 */

import type { Json } from '@ai-assistant/shared';
import { ChatMistralAI } from '@langchain/mistralai';
import { createAgent, modelCallLimitMiddleware } from 'langchain';
import { config } from '../../config/index.js';
import { tracingService } from '../../services/llm/tracing.js';
import { getSpecialistPrompt } from '../../prompts/specialistPrompts.js';
import { getSpecialistMcpTools, buildSpecialistContextPrompt } from './specialistToolBuilder.js';
import type { SpecialistNodeContext, SpecialistNodeResult, ToolInvocationRecord } from './types.js';

// --- Utility ---

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
    return content
      .map((entry) => (typeof entry === 'string' ? entry : asString(asRecord(entry).text) ?? JSON.stringify(entry)))
      .join('\n')
      .trim();
  }
  if (content && typeof content === 'object') return JSON.stringify(content);
  return String(content ?? '');
}

// --- Handoff Note Builder ---

function buildGmailHandoff(
  invocations: ToolInvocationRecord[],
  finalMessage: string,
): SpecialistNodeResult {
  const lastInvocation = invocations[invocations.length - 1];
  const lastResult = lastInvocation?.result;
  const resultRecord = asRecord(lastResult);
  const summary = asString(resultRecord.summary) ?? finalMessage ?? 'Gmail specialist completed.';

  return {
    summary,
    nextWorkerNote: summary,
    toolName: lastInvocation?.toolName,
    output: {
      summary,
      handoff_content: summary,
      tool_name: lastInvocation?.toolName,
    },
  };
}

// --- Main Node Function ---

export async function gmailAgentNode(context: SpecialistNodeContext): Promise<SpecialistNodeResult> {
  const invocations: ToolInvocationRecord[] = [];

  // Get native MCP tools — no manual wrapping!
  const mcpTools = await getSpecialistMcpTools(context.task.organization_id, 'gmail', {
    userId: context.task.user_id,
  });

  if (mcpTools.length === 0) {
    throw new Error('No Gmail MCP tools available for this organization.');
  }

  // Wrap with invocation tracking only (for handoff notes)
  const trackedTools = mcpTools.map((tool) => {
    const originalCall = tool.call.bind(tool);
    return Object.assign(Object.create(Object.getPrototypeOf(tool)), tool, {
      call: async (input: string | Record<string, unknown>) => {
        const args = typeof input === 'string' ? JSON.parse(input) : input;
        const result = await originalCall(input);
        invocations.push({
          requestedTool: tool.name,
          toolName: tool.name,
          args,
          result,
        });
        return result;
      },
    });
  });

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
      tools: trackedTools,
      systemPrompt: getSpecialistPrompt('gmail'),
      middleware: [modelCallLimitMiddleware({ runLimit: 6 })],
    });

    const result = await agent.invoke({
      messages: [{
        role: 'user',
        content: buildSpecialistContextPrompt(context),
      }],
    }, { callbacks });

    const finalMessage = stringifyContent(result.messages?.at(-1)?.content).trim();
    if (invocations.length === 0) {
      throw new Error('Gmail specialist did not execute any tool.');
    }

    tracingService.handleSuccess();
    await tracingService.flush();

    return buildGmailHandoff(invocations, finalMessage);
  } catch (error) {
    tracingService.handleFailure(error);
    throw error;
  }
}
