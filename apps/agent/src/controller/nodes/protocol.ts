import { AgentState } from "../graph.js";
import { ProtocolService } from "../../services/ProtocolService.js";
import { AuditLogger } from "../../services/AuditLogger.js";
import { supabase } from "../../services/supabase.js";

/**
 * Protocol Loading node: Fetches and extracts rules from the user protocol.
 * Also handles blocker detection and dynamic agency tier overrides.
 */
export async function loadProtocol(state: AgentState): Promise<Partial<AgentState>> {
  if (state.error) return {};

  const { task } = state;
  console.log(`[Graph][${task.id}] Loading protocol for org ${task.organization_id}...`);

  try {
    // 1. Fetch Protocol
    const protocolMd = await ProtocolService.fetchProtocol(task.organization_id);
    
    if (!protocolMd) {
      const step = AuditLogger.createStep('Protocol Loading', 'No protocol found for organization. Using defaults.');
      return { trace: [step] };
    }

    // 2. Extract Actionable Rules
    const rules = await ProtocolService.extractRules(protocolMd, task);
    
    // 3. Blocker Detection (AC 6)
    // We check the payload for any indicator of a blocker from previous interactions.
    // In a real scenario, this might involve checking the thread history or specific payload fields.
    const contextEntries = Array.isArray(task.payload?.context) ? task.payload.context : [];
    const hasBlocker = contextEntries.some((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return false;
      const contextEntry = entry as { type?: unknown; content?: unknown };
      return contextEntry.type === 'message'
        && typeof contextEntry.content === 'string'
        && /blocker|blocked|waiting for/i.test(contextEntry.content);
    });

    if (hasBlocker) {
      console.log(`[Graph][${task.id}] Blocker detected. Pausing task.`);
      
      await supabase
        .from('tasks')
        .update({ status: 'paused', updated_at: new Date().toISOString() }) 
        .eq('id', task.id ?? '');

      const step = AuditLogger.createStep('Protocol Engine', 'Blocker detected in context. Task paused.', {
        confidence_score: 1,
      });

      return { 
        task: { ...task, status: 'paused' as any }, 
        error: 'Task paused due to detected blocker in recipient response.',
        trace: [step]
      };
    }

    // 4. Traceability (AC 7)
    const step = AuditLogger.createStep('Protocol Engine', 'Extracted actionable rules from protocol', {
      input_summary: `Rules length: ${rules.length}`
    });

    const citation = AuditLogger.createCitation(
      'protocol',
      'user_protocols',
      'Extracted actionable rules for task execution',
      'protocol.md#Actionable-Rules'
    );

    // 5. Dynamic Agency Tiers (AC 5)
    // Check if the protocol specifies a required agency tier for this context.
    // We look for patterns like "Required Agency Tier: Controlled" in the extracted rules.
    const tierMatch = rules.match(/Required Agency Tier: (Public|Controlled|Restricted)/i);
    let updatedTask = { ...task };
    
    if (tierMatch?.[1]) {
      const overriddenTier = tierMatch[1];
      console.log(`[Graph][${task.id}] Protocol overriding agency tier to: ${overriddenTier}`);
      
      // We store the override in task payload or metadata so checkPerimeter can use it.
      updatedTask = {
        ...task,
        payload: {
          ...task.payload,
          protocol_overridden_tier: overriddenTier
        }
      };
    }

    return {
      task: updatedTask,
      active_protocol_rules: rules,
      trace: [step],
      citations: [citation]
    };

  } catch (err: any) {
    console.error(`[Graph][${task.id}] Protocol loading failed: ${err.message}`);
    const step = AuditLogger.createStep('Protocol Loading', `Failed: ${err.message}`);
    return { 
      error: `Protocol error: ${err.message}`,
      trace: [step]
    };
  }
}
