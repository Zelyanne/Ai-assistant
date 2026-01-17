import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { Task } from '@ai-assistant/shared';
import { supabase } from "../services/supabase.js";
import { MCPService } from '../services/mcp.js';

/**
 * Processor for email drafting using MCP.
 */
export class EmailDraftProcessor extends BaseProcessor {
  private mcpService: MCPService;

  constructor() {
    super();
    this.mcpService = new MCPService();
  }

  async process(task: Task): Promise<ProcessorResult> {
    console.log(`[EmailDraftProcessor][${task.id}] Processing email.draft...`);

    const { recipient, subject, body } = task.payload as any;

    if (!recipient || !subject || !body) {
      throw new Error('Missing required email fields: recipient, subject, or body');
    }

    // Execute MCP tool
    const result = await this.mcpService.executeTool(
      task.organization_id,
      'create_gmail_draft',
      {
        userId: 'me',
        draft: {
          message: {
            raw: btoa(
              `To: ${recipient}\r\n` +
              `Subject: ${subject}\r\n\r\n` +
              `${body}`
            )
          }
        }
      }
    );

    return {
      message: "Email draft created successfully via MCP",
      task_id: task.id,
      domain_action: task.domain_action,
      result: result
    };
  }
}
