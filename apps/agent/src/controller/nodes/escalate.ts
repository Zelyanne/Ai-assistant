import type { AgentState } from '../graph.js';
import { supabase } from '../../services/supabase.js';
import { AuditLogger } from '../../services/AuditLogger.js';
import type { EscalationTrigger, Json } from '@ai-assistant/shared';
import { buildEscalationPayload, CONFIDENCE_THRESHOLD } from '../escalation.js';

function normalizeConfidenceScore(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, value));
}

function deriveEscalationTrigger(confidenceScore: number | undefined, ambiguityDetected: boolean): EscalationTrigger {
  if (ambiguityDetected) {
    return 'ambiguity_detected';
  }

  if (typeof confidenceScore === 'number' && confidenceScore < CONFIDENCE_THRESHOLD) {
    return 'low_confidence';
  }

  return 'approval_guardrail';
}

function deriveEscalationReason(confidenceScore: number | undefined, ambiguityDetected: boolean, error: string | undefined): string {
  if (error && error.length > 0) {
    return error;
  }

  if (ambiguityDetected) {
    return 'Ambiguity detected during reasoning; human review required.';
  }

  if (typeof confidenceScore === 'number' && confidenceScore < CONFIDENCE_THRESHOLD) {
    return 'Confidence below threshold; human review required.';
  }

  return 'The AI is uncertain and requires human clarification.';
}

/**
 * Escalation node: Triggered when confidence is low or a Restricted topic is detected.
 * Updates task status to 'escalation' with an escalation payload in the result.
 */
export async function escalateNode(state: AgentState): Promise<Partial<AgentState>> {
  const { task, error } = state;
  const latestTraceStep = state.trace[state.trace.length - 1];
  const confidenceScore = normalizeConfidenceScore(latestTraceStep?.confidence_score);
  const ambiguityDetected = Boolean(latestTraceStep?.ambiguity_detected);
  const escalationTrigger = deriveEscalationTrigger(confidenceScore, ambiguityDetected);

  const reason = deriveEscalationReason(confidenceScore, ambiguityDetected, error);
  const prompt = 'Please review this request and provide additional guidance.';

  console.log(`[EscalateNode][${task.id}] Escalating task due to: ${reason}`);

  const step = AuditLogger.createStep('Escalation', reason, {
    confidence_score: confidenceScore,
    confidence_threshold: CONFIDENCE_THRESHOLD,
    ambiguity_detected: ambiguityDetected,
    escalation_trigger: escalationTrigger,
  });

  try {
    if (!task.id) throw new Error("Task ID is missing");

    const previousResult = task.result as Record<string, Json | undefined> | undefined;
    const basePayload = buildEscalationPayload({
      reason,
      prompt,
      confidenceScore,
      trigger: escalationTrigger,
    });

    const escalationResult: Record<string, Json | undefined> = {
      ...(previousResult ?? {}),
      ...basePayload,
    };

    const { error: updateError } = await supabase
      .from('tasks')
      .update({ 
        status: 'escalation', 
        result: escalationResult,
        updated_at: new Date().toISOString() 
      })
      .eq('id', task.id);

    if (updateError) throw new Error(updateError.message);

    return {
      task: { ...task, status: 'escalation', result: escalationResult },
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
