import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { Task } from '@ai-assistant/shared';
import { Mistral } from "mistralai";
import { PerimeterGuard } from "../guards/PerimeterGuard.js";
import { config } from "../config/index.js";
import { supabase } from "../services/supabase.js";

/**
 * Processor for system analysis using Mistral AI.
 */
export class SystemAnalyzeProcessor extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    console.log(`[SystemAnalyzeProcessor][${task.id}] Processing system.analyze...`);
    
    // Log action
    await supabase.from('agent_activity_log').insert({
      organization_id: task.organization_id,
      agent_id: 'agent-controller',
      task_id: task.id,
      action_taken: 'system_analyze_execution',
      reasoning_trace: {
        event: 'processor_started',
        domain_action: task.domain_action
      },
      citations: []
    });

    // 0. Instantiate Guard per-request
    const guard = new PerimeterGuard();
    
    const rawPrompt = task.payload && typeof task.payload === 'object' && 'prompt' in task.payload 
      ? (task.payload as any).prompt 
      : JSON.stringify(task.payload);

    if (!rawPrompt) {
      return { message: "No prompt found in task payload." };
    }

    // 1. Redact PII
    const { redactedText, replacementCount } = guard.redactPIIWithMetadata(rawPrompt);

    // 2. Log redaction telemetry
    if (replacementCount > 0) {
       const { error } = await supabase.from('agent_activity_log').insert({
        organization_id: task.organization_id,
        agent_id: 'agent-controller', 
        task_id: task.id,
        action_taken: 'pii_redaction',
        reasoning_trace: {
          event: 'prompt_redacted',
          replacement_count: replacementCount,
          original_length: rawPrompt.length,
          redacted_length: redactedText.length
        },
        citations: []
      });

      if (error) {
        console.error('Failed to log redaction telemetry:', error);
        // We continue even if logging fails, but we log the error
      }
    }

    // 3. Call Mistral
    const mistral = new Mistral({
        apiKey: config.MISTRAL_API_KEY
    });

    const result = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [
          {
            role: "user",
            content: redactedText,
          },
        ],
    });

    return { ...result };
  }
}
