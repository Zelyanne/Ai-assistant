import { Task, ReasoningTrace, ReasoningStep } from '@ai-assistant/shared';

export interface ProcessorResult {
  [key: string]: any;
}

/**
 * Base abstract class for all task processors.
 */
export abstract class BaseProcessor {
  protected trace: ReasoningTrace = [];

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
