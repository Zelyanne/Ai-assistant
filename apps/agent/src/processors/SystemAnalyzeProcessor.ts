import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { Task } from '@ai-assistant/shared';
import { Mistral } from "mistralai";
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

    let prompt: string | undefined;
    
    if (task.payload && typeof task.payload === 'object' && 'prompt' in task.payload) {
      prompt = (task.payload as any).prompt;
    } else if (task.payload && typeof task.payload === 'string') {
      prompt = task.payload;
    }

    if (!prompt) {
      return { message: "No prompt found in task payload." };
    }

    // Call Mistral
    const mistral = new Mistral({
        apiKey: config.MISTRAL_API_KEY
    });

    const result = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
    });

    return { ...result };
  }
}

