import { z } from 'zod';

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export interface LLMResponse<T> {
  data: T;
  usage: LLMUsage;
  model: string;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ILLMProvider {
  /**
   * Generates structured output from the LLM based on a Zod schema.
   */
  generateStructured<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: LLMOptions
  ): Promise<LLMResponse<T>>;

  /**
   * Generates a plain text response from the LLM.
   */
  generateText(
    prompt: string,
    options?: LLMOptions
  ): Promise<LLMResponse<string>>;
}
