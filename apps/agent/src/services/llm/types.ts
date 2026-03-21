import { z } from 'zod';

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export type StructuredOutputFailureKind =
  | 'empty_content'
  | 'json_parse_failure'
  | 'schema_validation_failure';

export interface StructuredOutputFailureMetadata {
  kind: StructuredOutputFailureKind;
  message: string;
  attempts: number;
  exhausted: boolean;
  rawContent?: string;
}

export interface StructuredOutputResponseMetadata {
  attempts: number;
  repaired: boolean;
}

export interface StructuredOutputResilienceOptions {
  repairMalformedJson?: boolean;
  maxRepairAttempts?: number;
}

export interface LLMResponse<T> {
  data: T;
  usage: LLMUsage;
  model: string;
  structuredOutput?: StructuredOutputResponseMetadata;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  structuredOutput?: StructuredOutputResilienceOptions;
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
