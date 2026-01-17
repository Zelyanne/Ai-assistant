import { Task } from '@ai-assistant/shared';

export interface ProcessorResult {
  [key: string]: any;
}

/**
 * Base abstract class for all task processors.
 */
export abstract class BaseProcessor {
  /**
   * Processes a task and returns the result.
   * @param task The task to process.
   * @returns A promise that resolves to the processing result.
   */
  abstract process(task: Task): Promise<ProcessorResult>;
}
