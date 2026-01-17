import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { RunnableConfig } from "@langchain/core/runnables";
import { supabase } from "../services/supabase.js";
import { Task } from "@ai-assistant/shared";
import { ProcessorRegistry } from "../processors/ProcessorRegistry.js";

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
function routeTask(state: AgentState) {
  if (state.error) return "finalize";
  
  const domainAction = state.task.domain_action;
  
  // Dynamic routing based on registry
  // We assume node names match the domain.action with '.' replaced by '_'
  if (ProcessorRegistry.getProcessor(domainAction)) {
    return domainAction.replace('.', '_');
  }

  return "unsupported_domain";
}

// Define the graph
const workflow = new StateGraph(AgentStateAnnotation)
  .addNode("initialize", initializeTask)
  .addNode("email_draft", processEmailDraft)
  .addNode("calendar_create", processCalendarCreate)
  .addNode("system_analyze", processSystemAnalyze)
  .addNode("unsupported_domain", handleUnsupportedDomain)
  .addNode("finalize", finalizeTask)
  .addEdge(START, "initialize")
  .addConditionalEdges("initialize", routeTask)
  .addEdge("email_draft", "finalize")
  .addEdge("calendar_create", "finalize")
  .addEdge("system_analyze", "finalize")
  .addEdge("unsupported_domain", "finalize")
  .addEdge("finalize", END);

export const graph = workflow.compile();
