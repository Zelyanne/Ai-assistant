import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { RunnableConfig } from "@langchain/core/runnables";
import { supabase } from "../services/supabase.js";
import { Task, AgencyTier, ReasoningStep, Citation } from "@ai-assistant/shared";
import { ProcessorRegistry } from "../processors/ProcessorRegistry.js";
import { PerimeterGuard } from "../guards/PerimeterGuard.js";
import { AgencyService } from "../services/agency.js";
import { reasoningNode } from "./nodes/reasoning.js";
import { loadProtocol } from "./nodes/protocol.js";
import { escalateNode } from "./nodes/escalate.js";
import { AuditLogger } from "../services/AuditLogger.js";
import { config as appConfig } from "../config/index.js";

const CONFIDENCE_THRESHOLD = appConfig.CONFIDENCE_THRESHOLD;

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
  trace: Annotation<ReasoningStep[]>({
    reducer: (x, y) => (x || []).concat(y || []),
    default: () => [],
  }),
  citations: Annotation<Citation[]>({
    reducer: (x, y) => (x || []).concat(y || []),
    default: () => [],
  }),
  active_protocol_rules: Annotation<string>({
    reducer: (x, y) => (y ?? x),
  }),
});


export type AgentState = typeof AgentStateAnnotation.State;

/**
 * Initialize node: Updates task status to 'processing' in Supabase.
 */
async function initializeTask(state: AgentState, config?: RunnableConfig): Promise<Partial<AgentState>> {
  console.log(`[Graph][${state.task.id}] Initializing task ${state.task.domain_action}...`);
  const step = AuditLogger.createStep('Initialize', `Starting task: ${state.task.domain_action}`);
  
  try {
    if (!state.task.id) throw new Error("Task ID is missing");
    
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', state.task.id);

    if (error) throw new Error(error.message);

    return { 
      task: { ...state.task, status: 'processing' },
      trace: [step]
    };
  } catch (err: any) {
    console.error(`[Graph][${state.task.id}] Initialization failed: ${err.message}`);
    return { 
      error: err.message,
      trace: [AuditLogger.createStep('Initialize', `Initialization failed: ${err.message}`)]
    };
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
    // Respect protocol override if present (AC 5)
    const requiredTier: AgencyTier = task.payload?.protocol_overridden_tier || 
      ((task.domain_action === 'system.analyze') ? 'Controlled' : 'Public');
    
    const guard = new PerimeterGuard();
    const rawData = JSON.stringify(task.payload);
    
    // 3. Run Guard
    const result = guard.filter(rawData, authorizedTier, requiredTier);
    
    // AC 7: Restricted topics always trigger escalation
    const isRestrictedTopic = authorizedTier === 'Restricted';
    const escalationReason = isRestrictedTopic ? 'Restricted topic requires human intervention' : result.reason;
    const shouldEscalate = result.isEscalated || isRestrictedTopic;

    const step = AuditLogger.createStep('Perimeter Check', shouldEscalate ? `Escalated: ${escalationReason}` : 'Perimeter check passed', {
      confidence_score: shouldEscalate ? 0 : 1,
      input_summary: `Topic: ${topic}, AuthTier: ${authorizedTier}, ReqTier: ${requiredTier}`
    });

    if (shouldEscalate) {
      console.log(`[Graph][${task.id}] Perimeter escalation: ${escalationReason}`);
      
      return { 
        task: { ...task, status: 'escalation' },
        error: escalationReason,
        trace: [step]
      };
    }

    // 4. Update task payload with redacted data for downstream processors
    return {
      task: {
        ...task,
        payload: JSON.parse(result.redactedText)
      },
      trace: [step]
    };
  } catch (err: any) {
    console.error(`[Graph][${task.id}] Perimeter check failed: ${err.message}`);
    const errorStep = AuditLogger.createStep('Perimeter Check', `Check failed: ${err.message}`);
    return { 
      error: `Perimeter check error: ${err.message}`,
      trace: [errorStep]
    };
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
    const step = AuditLogger.createStep('Processor Discovery', `Unsupported domain.action: ${domainAction}`);
    return { error: `Unsupported domain.action: ${domainAction}`, trace: [step] };
  }

  try {
    const result = await processor.process(state.task);
    
    // Support processors returning trace/citations
    const processorTrace = (result as any).trace || [];
    const processorCitations = (result as any).citations || [];
    
    const step = AuditLogger.createStep('Tool Execution', `Executed ${domainAction} successfully`, {
      output_summary: JSON.stringify(result).substring(0, 100) + '...'
    });

    return { 
      result, 
      trace: [...processorTrace, step],
      citations: processorCitations
    };
  } catch (err: any) {
    console.error(`[Graph][${state.task.id}] Processor failed: ${err.message}`);
    const step = AuditLogger.createStep('Tool Execution', `Execution failed: ${err.message}`);
    return { error: err.message, trace: [step] };
  }
}


/**
 * Processor-specific nodes (wrapping executeProcessor)
 */
async function processEmailDraft(state: AgentState) { return executeProcessor(state); }
async function processCalendarCreate(state: AgentState) { return executeProcessor(state); }
async function processProtocolGenerate(state: AgentState) { return executeProcessor(state); }

/**
 * Finalize node: Updates task status to 'done' or 'error' in Supabase.
 */
async function finalizeTask(state: AgentState, config?: RunnableConfig): Promise<Partial<AgentState>> {
  let status: Task['status'] = 'done';
  
  if (state.task.status === 'escalation' || state.task.status === 'error') {
    status = state.task.status;
  } else if (state.error) {
    status = 'error';
  }

  console.log(`[Graph][${state.task.id}] Finalizing task with status: ${status}`);

  const step = AuditLogger.createStep('Finalize', `Task finalized with status: ${status}`);
  const finalTrace = (state.trace || []).concat([step]);

  try {
    if (!state.task.id) throw new Error("Task ID is missing");

    // 1. Update task status
    const { error: taskError } = await supabase
      .from('tasks')
      .update({ 
        status: status as any, 
        result: status === 'done' ? (state.result || {}) : (state.task.result || { error: state.error }),
        updated_at: new Date().toISOString() 
      })
      .eq('id', state.task.id);

    if (taskError) throw new Error(taskError.message);

    // 2. Flush Audit Log
    await AuditLogger.flush(
      state.task.organization_id,
      state.task.id,
      'agent-controller',
      status === 'done' ? 'task_completed' : `task_${status}`,
      finalTrace,
      state.citations || []
    );

  } catch (err: any) {
    console.error(`[Graph][${state.task.id}] Finalization failed: ${err.message}`);
  }

  return { trace: [step] };
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
  return "load_protocol";
}

/**
 * Routing logic after protocol loading
 */
function routeAfterProtocol(state: AgentState) {
  if (state.error) return "finalize";
  return "check_perimeter";
}


/**
 * Routing logic after reasoning
 */
function routeAfterReasoning(state: AgentState) {
  if (state.error) return "finalize";

  const lastStep = state.trace[state.trace.length - 1];
  const confidence = lastStep?.confidence_score ?? 1.0;
  const ambiguity = lastStep?.ambiguity_detected ?? false;

  if (confidence < CONFIDENCE_THRESHOLD || ambiguity) {
    return "escalate";
  }

  return "finalize";
}

/**
 * Routing logic after perimeter check
 */
function routeTask(state: AgentState) {
  if (state.error) {
    return state.task.status === 'escalation' ? "escalate" : "finalize";
  }
  
  const domainAction = state.task.domain_action;
  
  if (domainAction === 'system.analyze') {
    return "reasoning";
  }
  
  // Dynamic routing based on registry
  if (ProcessorRegistry.getProcessor(domainAction)) {
    return domainAction.replace('.', '_');
  }

  return "unsupported_domain";
}

// Define the graph
const workflow = new StateGraph(AgentStateAnnotation)
  .addNode("initialize", initializeTask)
  .addNode("load_protocol", loadProtocol)
  .addNode("check_perimeter", checkPerimeter)
  .addNode("reasoning", reasoningNode)
  .addNode("escalate", escalateNode)
  .addNode("email_draft", processEmailDraft)
  .addNode("calendar_create", processCalendarCreate)
  .addNode("protocol_generate", processProtocolGenerate)
  .addNode("unsupported_domain", handleUnsupportedDomain)
  .addNode("finalize", finalizeTask)
  .addEdge(START, "initialize")
  .addConditionalEdges("initialize", routeAfterInit)
  .addConditionalEdges("load_protocol", routeAfterProtocol)
  .addConditionalEdges("check_perimeter", routeTask)
  .addConditionalEdges("reasoning", routeAfterReasoning)

  .addEdge("escalate", "finalize")
  .addEdge("email_draft", "finalize")
  .addEdge("calendar_create", "finalize")
  .addEdge("protocol_generate", "finalize")
  .addEdge("unsupported_domain", "finalize")
  .addEdge("finalize", END);

export const graph = workflow.compile();
