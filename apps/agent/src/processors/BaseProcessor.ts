import { Task, ReasoningTrace, ReasoningStep, Citation } from '@ai-assistant/shared';
import { createAgent, modelCallLimitMiddleware } from 'langchain';
import { ChatMistralAI } from '@langchain/mistralai';
import { StructuredTool } from '@langchain/core/tools';
import { config } from '../config/index.js';
import { tracingService } from '../services/llm/tracing.js';

export interface ProcessorResult {
  [key: string]: any;
  trace?: ReasoningStep[];
  citations?: Citation[];
}

/**
 * Base abstract class for all task processors.
 */
export abstract class BaseProcessor {
  protected trace: ReasoningTrace = [];

  /**
   * Creates a LangChain agent instance using Mistral and provided tools.
   */
  protected createAgentInstance(
    systemPrompt: string,
    tools: StructuredTool[],
    mode: 'single-turn' | 'multi-turn' = 'single-turn'
  ) {
    const langfuseHandler = tracingService.getHandler();
    const callbacks = langfuseHandler ? [langfuseHandler] : [];

    const llm = new ChatMistralAI({
      apiKey: config.MISTRAL_API_KEY,
      model: config.DEFAULT_LLM_MODEL,
      temperature: 0,
      callbacks,
    });

    const middleware = [];
    if (mode === 'single-turn') {
      middleware.push(modelCallLimitMiddleware({ runLimit: 3 }));
    } else {
      middleware.push(modelCallLimitMiddleware({ runLimit: 10 }));
    }

    return createAgent({
      model: llm,
      tools,
      systemPrompt,
      middleware,
    });
  }

  /**
   * Runs a LangChain agent using Mistral and provided tools.
   * Supports single-turn and multi-turn execution modes.
   */
  protected async runAgent(
    task: Task,
    systemPrompt: string,
    tools: StructuredTool[],
    mode: 'single-turn' | 'multi-turn' = 'single-turn'
  ): Promise<ProcessorResult> {
    const agent = this.createAgentInstance(systemPrompt, tools, mode);

    const input = typeof task.payload === 'string' 
      ? task.payload 
      : JSON.stringify(task.payload);

    this.addTraceStep('agent_start', `Starting ${mode} agent with ${tools.length} tools`);

    try {
      const langfuseHandler = tracingService.getHandler();
      const callbacks = langfuseHandler ? [langfuseHandler] : [];

      const result = await agent.invoke({
        messages: [{ role: 'user', content: input }],
      }, { 
        callbacks,
        runName: `${task.domain_action} Execution`,
        tags: [task.domain_action, 'processor', config.NODE_ENV].filter(Boolean) as string[],
        metadata: {
          taskId: task.id,
          orgId: task.organization_id,
          mode,
          langfuseUserId: task.user_id,
        }
      });

      await tracingService.flush();
      tracingService.handleSuccess();

      // Extract steps from messages for the trace (LangChain v1 pattern)
      const steps: any[] = [];
      const messages = result.messages || [];
      
      messages.forEach((msg: any) => {
        const role = msg.role || (typeof msg._getType === 'function' ? msg._getType() : msg.type);
        
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          msg.tool_calls.forEach((tc: any) => {
            steps.push({
              type: 'call',
              tool: tc.name,
              args: tc.args
            });
            this.addTraceStep('agent_tool_call', `Tool: ${tc.name}, Args: ${JSON.stringify(tc.args)}`);
          });
        } else if (role === 'tool') {
          steps.push({
            type: 'result',
            tool: msg.name,
            output: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
          });
          this.addTraceStep('agent_tool_result', `Tool: ${msg.name}, Result: ${String(msg.content).substring(0, 100)}...`);
        }
      });

      // The final output is the last message content
      const output = messages.at(-1)?.content || '';

      this.addTraceStep('agent_complete', `Agent finished with output: ${String(output).substring(0, 100)}...`);

      // AC 4: Log to agent_activity_log on Supabase
      await supabase.from('agent_activity_log').insert({
        organization_id: task.organization_id,
        task_id: task.id,
        agent_id: task.user_id || 'system',
        action_taken: `agent_execution_${mode}: ${task.domain_action}`,
        reasoning_trace: {
          mode,
          input: input.substring(0, 500),
          output,
          steps,
          full_trace: this.getTrace()
        }
      } as any);

      return {
        output,
        steps,
      };
    } catch (err: any) {
      tracingService.handleFailure(err);
      this.addTraceStep('agent_error', `Agent failed: ${err.message}`);
      
      // Log error to Supabase
      await supabase.from('agent_activity_log').insert({
        organization_id: task.organization_id,
        task_id: task.id,
        agent_id: task.user_id || 'system',
        action_taken: `agent_error_${mode}: ${task.domain_action}`,
        reasoning_trace: {
          error: err.message,
          trace: this.getTrace()
        }
      } as any);

      throw err;
    }
  }

  /**
   * Processes a task and returns the result.
   * @param task The task to process.
   * @returns A promise that resolves to the processing result.
   */
  abstract process(task: Task): Promise<ProcessorResult>;

  /**
   * Adds a step to the reasoning trace.
   */
  addTraceStep(step_name: string, message: string, confidence_score?: number): void {
    const step: ReasoningStep = {
      timestamp: new Date().toISOString(),
      step_name,
      message,
      confidence_score
    };
    this.trace.push(step);
  }

  /**
   * Returns the collected reasoning trace.
   */
  getTrace(): ReasoningTrace {
    return this.trace;
  }

  /**
   * Clears the reasoning trace.
   */
  clearTrace(): void {
    this.trace = [];
  }
}
