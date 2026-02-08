import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { Task } from '@ai-assistant/shared';
import { supabase } from "../services/supabase.js";
import { mcpService } from '../services/mcp.js';

/**
 * Processor for calendar event creation using MCP.
 */
export class CalendarCreateProcessor extends BaseProcessor {
  constructor() {
    super();
  }

  async process(task: Task): Promise<ProcessorResult> {
    console.log(`[CalendarCreateProcessor][${task.id}] Processing calendar.create...`);

    const { summary, description, startTime, endTime, location } = task.payload as any;

    if (!summary || !startTime || !endTime) {
      throw new Error('Missing required calendar fields: summary, startTime, or endTime');
    }

    // Execute MCP tool
    const result = await mcpService.executeTool(
      task.organization_id,
      'create_calendar_event',
      {
        calendarId: 'primary',
        event: {
          summary,
          description,
          start: { dateTime: startTime },
          end: { dateTime: endTime },
          location
        }
      }
    );

    return {
      message: "Calendar event created successfully via MCP",
      task_id: task.id,
      domain_action: task.domain_action,
      result: result
    };
  }
}

