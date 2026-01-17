import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { RunnableConfig } from "@langchain/core/runnables";
import { supabase } from "../services/supabase.js";
import { Task, AgencyTier } from "@ai-assistant/shared";
import { ProcessorRegistry } from "../processors/ProcessorRegistry.js";
import { PerimeterGuard } from "../guards/PerimeterGuard.js";
import { AgencyService } from "../services/agency.js";

export const AgentStateAnnotation = Annotation.Root({
  task: Annotation<Task>({
    reducer: (x, y) => (y ?? x),
  }),
  error: Annotation<string>({
    reducer: (x, y) => (y ?? x),
  }),
  result: Annotation<any>({
    reducer: (x, y) => (y ?? x),
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;

/**
 * Initialize node: Updates task status to 'processing' in Supabase.
 */
async function initializeTask(state: AgentState, config?: RunnableConfig): Promise<Partial<AgentState>> {
  console.log(`[Graph][${state.task.id}] Initializing task ${state.task.domain_action}...`);
  
  try {
    if (!state.task.id) throw new Error("Task ID is missing");
    
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', state.task.id);

    if (error) throw new Error(error.message);

    return { 
      task: { ...state.task, status: 'processing' }
    };
  } catch (err: any) {
    console.error(`[Graph][${state.task.id}] Initialization failed: ${err.message}`);
    return { error: err.message };
  }
}

/**
 * Perimeter Check node: Enforces agency tiers and redacts PII for telemetry.
 */
async function checkPerimeter(state: AgentState): Promise<Partial<AgentState>> {
  if (state.error) return {};

  const task = state.task;
  const topic = task.topic || 'General';
  
  try {
    // 1. Get Authorized Tier
    const authorizedTier = await AgencyService.getTierForTopic(task.organization_id, topic);
    
    // 2. Determine Required Tier
    // Routine actions might be Public, sensitive ones Controlled.
    const requiredTier: AgencyTier = (task.domain_action === 'system.analyze') ? 'Controlled' : 'Public';
    
    const guard = new PerimeterGuard();
    const rawData = JSON.stringify(task.payload);
    
    // 3. Run Guard
    const result = guard.filter(rawData, authorizedTier, requiredTier);
    
    if (result.isEscalated) {
      console.log(`[Graph][${task.id}] Perimeter escalation: ${result.reason}`);
      
      await supabase.from('agent_activity_log').insert({
        organization_id: task.organization_id,
        agent_id: 'agent-controller',
        task_id: task.id,
        action_taken: 'perimeter_escalation',
        reasoning_trace: {
          event: 'escalated_to_user',
          reason: result.reason,
          topic: topic,
          authorized_tier: authorizedTier,
          required_tier: requiredTier
        },
        citations: []
      });

      return { 
        task: { ...task, status: 'escalation' },
        error: result.reason 
      };
    }

    // 4. Update task payload with redacted data for downstream processors
    return {
      task: {
        ...task,
        payload: JSON.parse(result.redactedText)
      }
    };
  } catch (err: any) {
    console.error(`[Graph][${task.id}] Perimeter check failed: ${err.message}`);
    return { error: `Perimeter check error: ${err.message}` };
  }
}

/**
 * Generic processor execution logic.
 */
async function executeProcessor(state: AgentState): Promise<Partial<AgentState>> {
  if (state.error) return {};

  const domainAction = state.task.domain_action;
  const processor = ProcessorRegistry.getProcessor(domainAction);

  if (!processor) {
    return { error: `Unsupported domain.action: ${domainAction}` };
  }

  try {
    const result = await processor.process(state.task);
    return { result };
  } catch (err: any) {
    console.error(`[Graph][${state.task.id}] Processor failed: ${err.message}`);
    return { error: err.message };
  }
}

/**
 * Processor-specific nodes (wrapping executeProcessor)
 */
async function processEmailDraft(state: AgentState) { return executeProcessor(state); }
async function processCalendarCreate(state: AgentState) { return executeProcessor(state); }
async function processSystemAnalyze(state: AgentState) { return executeProcessor(state); }

/**
 * Finalize node: Updates task status to 'done' or 'error' in Supabase.
 */
async function finalizeTask(state: AgentState, config?: RunnableConfig): Promise<Partial<AgentState>> {
  const status = state.error ? 'error' : 'done';
  console.log(`[Graph][${state.task.id}] Finalizing task with status: ${status}`);

  try {
    if (!state.task.id) throw new Error("Task ID is missing");

    const { error } = await supabase
      .from('tasks')
      .update({ 
        status, 
        result: state.error ? { error: state.error } : (state.result || {}),
        updated_at: new Date().toISOString() 
      })
      .eq('id', state.task.id);

    if (error) throw new Error(error.message);
  } catch (err: any) {
    console.error(`[Graph][${state.task.id}] Finalization failed: ${err.message}`);
  }

  return {};
}

/**
 * Node for unsupported domains.
 */
async function handleUnsupportedDomain(state: AgentState): Promise<Partial<AgentState>> {
  return { error: `Unsupported domain.action: ${state.task.domain_action}` };
}

/**
 * Routing logic after initialization
 */
function routeAfterInit(state: AgentState) {
  if (state.error) return "finalize";
  return "check_perimeter";
}

/**
 * Routing logic after perimeter check
 */
function routeTask(state: AgentState) {
  if (state.error) return "finalize";
  
  const domainAction = state.task.domain_action;
  
  // Dynamic routing based on registry
  if (ProcessorRegistry.getProcessor(domainAction)) {
    return domainAction.replace('.', '_');
  }

  return "unsupported_domain";
}

// Define the graph
const workflow = new StateGraph(AgentStateAnnotation)
  .addNode("initialize", initializeTask)
  .addNode("check_perimeter", checkPerimeter)
  .addNode("email_draft", processEmailDraft)
  .addNode("calendar_create", processCalendarCreate)
  .addNode("system_analyze", processSystemAnalyze)
  .addNode("unsupported_domain", handleUnsupportedDomain)
  .addNode("finalize", finalizeTask)
  .addEdge(START, "initialize")
  .addConditionalEdges("initialize", routeAfterInit)
  .addConditionalEdges("check_perimeter", routeTask)
  .addEdge("email_draft", "finalize")
  .addEdge("calendar_create", "finalize")
  .addEdge("system_analyze", "finalize")
  .addEdge("unsupported_domain", "finalize")
  .addEdge("finalize", END);

export const graph = workflow.compile();
