import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { Task } from '@ai-assistant/shared';
import { supabase } from "../services/supabase.js";

/**
 * Stub processor for email drafting.
 */
export class EmailDraftProcessor extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    console.log(`[EmailDraftProcessor][${task.id}] Processing email.draft...`);

    // Log action
    await supabase.from('agent_activity_log').insert({
      organization_id: task.organization_id,
      agent_id: 'agent-controller',
      task_id: task.id,
      action_taken: 'email_draft_execution',
      reasoning_trace: {
        event: 'processor_started',
        domain_action: task.domain_action
      },
      citations: []
    });

    // Stub implementation
    return {
      message: "Email draft created (stub)",
      task_id: task.id,
      domain_action: task.domain_action
    };
  }
}
