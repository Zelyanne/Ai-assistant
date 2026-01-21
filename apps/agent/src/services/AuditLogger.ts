import { supabase } from './supabase.js';
import { ReasoningStep, Citation, Database } from '@ai-assistant/shared';

type AgentActivityLogInsert = Database['public']['Tables']['agent_activity_log']['Insert'];

export class AuditLogger {
  /**
   * Helper to create a reasoning step with consistent structure and timestamp.
   */
  static createStep(
    step_name: string,
    message: string,
    options: Partial<Omit<ReasoningStep, 'step_name' | 'message' | 'timestamp'>> = {}
  ): ReasoningStep {
    return {
      timestamp: new Date().toISOString(),
      step_name,
      message,
      ...options
    };
  }

  /**
   * Helper to create a citation with consistent structure.
   */
  static createCitation(
    source_type: string,
    source_id: string,
    description: string,
    link: string = ''
  ): Citation {
    return {
      source_type,
      source_id,
      description,
      link
    };
  }

  /**
   * Persists the complete reasoning trace and citations to the agent_activity_log.
   */
  static async flush(
    organizationId: string,
    taskId: string | null,
    agentId: string,
    actionTaken: string,
    trace: ReasoningStep[],
    citations: Citation[]
  ): Promise<void> {
    
    // Explicitly type the payload to match Supabase generated types
    const logData: AgentActivityLogInsert = {
      organization_id: organizationId,
      task_id: taskId,
      agent_id: agentId,
      action_taken: actionTaken,
      reasoning_trace: trace as unknown as Database['public']['Tables']['agent_activity_log']['Row']['reasoning_trace'],
      citations: citations as unknown as Database['public']['Tables']['agent_activity_log']['Row']['citations']
    };

    const { error } = await supabase
      .from('agent_activity_log')
      .insert(logData);

    if (error) {
      console.error(`[AuditLogger][${taskId}] Failed to flush log:`, error.message);
      throw new Error(`Audit logging failed: ${error.message}`);
    }
  }
}
