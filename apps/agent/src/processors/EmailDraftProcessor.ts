import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { Task } from '@ai-assistant/shared';
import { mcpService } from '../services/mcp.js';

function encodeRawEmail(recipient: string, subject: string, body: string): string {
  return Buffer.from(
    `To: ${recipient}\r\nSubject: ${subject}\r\n\r\n${body}`,
    'utf-8',
  ).toString('base64');
}

/**
 * Processor for email drafting using MCP.
 */
export class EmailDraftProcessor extends BaseProcessor {
  constructor() {
    super();
  }

  async process(task: Task): Promise<ProcessorResult> {
    console.log(`[EmailDraftProcessor][${task.id}] Processing email.draft...`);

    const payload = (task.payload ?? {}) as Record<string, unknown>;
    const recipient = typeof payload.recipient === 'string' ? payload.recipient : null;
    const subject = typeof payload.subject === 'string' ? payload.subject : null;
    const body = typeof payload.body === 'string' ? payload.body : null;

    if (!recipient || !subject || !body) {
      throw new Error('Missing required email fields: recipient, subject, or body');
    }

    const resolution = await mcpService.resolveToolName(
      task.organization_id,
      'draft_gmail_message',
    );

    const actualTool = resolution.resolvedTool ?? 'draft_gmail_message';
    // Use MCP tool format (draft_gmail_message params)
    const args = {
      to: recipient,
      subject,
      body,
      body_format: typeof payload.body_format === 'string' ? payload.body_format : 'plain',
      thread_id: typeof payload.thread_external_id === 'string' ? payload.thread_external_id : undefined,
    };

    const { toolName, result } = await mcpService.executeWorkerTool(
      task.organization_id,
      'gmail',
      'draft_gmail_message',
      args,
    );

    return {
      summary: 'Email draft created successfully via MCP',
      message: 'Email draft created successfully via MCP',
      task_id: task.id,
      domain_action: task.domain_action,
      tool_name: toolName,
      result,
    };
  }
}
