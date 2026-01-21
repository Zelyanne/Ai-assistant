import { AgentState } from '../graph.js';
import { supabase } from '../../services/supabase.js';
import { AuditLogger } from '../../services/AuditLogger.js';

/**
 * Escalation node: Triggered when confidence is low or a Restricted topic is detected.
 * Updates task status to 'error' with an escalation flag in the result.
 */
export async function escalateNode(state: AgentState): Promise<Partial<AgentState>> {
  const { task, error } = state;
  console.log(`[EscalateNode][${task.id}] Escalating task due to: ${error || 'Low confidence'}`);

  const step = AuditLogger.createStep('Escalation', error || 'Confidence below threshold or ambiguity detected', {
    confidence_score: 0,
    ambiguity_detected: true
  });

  try {
    if (!task.id) throw new Error("Task ID is missing");

    // Update status to 'error' per AC 5, with escalation payload
    const escalationResult = {
      escalation: true,
      reason: error || 'The AI is uncertain and requires human clarification.',
      prompt: 'Please review this request and provide additional guidance.'
    };

    const { error: updateError } = await supabase
      .from('tasks')
      .update({ 
        status: 'error', 
        result: escalationResult,
        updated_at: new Date().toISOString() 
      })
      .eq('id', task.id);

    if (updateError) throw new Error(updateError.message);

    return {
      task: { ...task, status: 'error', result: escalationResult },
      trace: [step]
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[EscalateNode][${task.id}] Escalation update failed: ${message}`);
    return {
      error: `Escalation failed: ${message}`,
      trace: [AuditLogger.createStep('Escalation', `Escalation update failed: ${message}`)]
    };
  }
}
