import { Mistral } from 'mistralai';
import { z } from 'zod';
import { ILLMProvider, LLMOptions, LLMResponse, LLMUsage } from './types.js';
import {
  buildStrictJsonRetryPrompt,
  buildStructuredOutputFailureMetadata,
  buildStructuredOutputResponseMetadata,
  createStructuredOutputAttemptState,
  recordStructuredOutputAttempt,
  stripMarkdownFences,
  StructuredOutputError,
} from './structuredOutput.js';

const ARRAY_TYPE_NAME = 'ZodArray';

function isSchemaLike(value: unknown): value is z.ZodTypeAny {
  return typeof value === 'object' && value !== null && '_def' in value;
}

function unwrapSchemaTypeName(schema: z.ZodSchema<unknown>): string | undefined {
  const unwrapMap: Record<string, string[]> = {
    ZodEffects: ['schema'],
    ZodOptional: ['innerType'],
    ZodNullable: ['innerType'],
    ZodDefault: ['innerType'],
    ZodCatch: ['innerType'],
    ZodBranded: ['type'],
    ZodPipeline: ['out'],
    ZodReadonly: ['innerType'],
  };

  const seen = new Set<z.ZodTypeAny>();
  let current: z.ZodTypeAny = schema as z.ZodTypeAny;

  while (!seen.has(current)) {
    seen.add(current);

    const def = (current as { _def?: Record<string, unknown> })._def;
    const typeName = typeof def?.typeName === 'string' ? def.typeName : undefined;

    if (!typeName) {
      return undefined;
    }

    const unwrapKeys = unwrapMap[typeName];
    if (!unwrapKeys) {
      return typeName;
    }

    let nextSchema: z.ZodTypeAny | null = null;
    for (const key of unwrapKeys) {
      const candidate = def?.[key];
      if (isSchemaLike(candidate)) {
        nextSchema = candidate;
        break;
      }
    }

    if (!nextSchema) {
      return typeName;
    }

    current = nextSchema;
  }

  return undefined;
}

function isTopLevelArraySchema(schema: z.ZodSchema<unknown>): boolean {
  const typeName = unwrapSchemaTypeName(schema);
  return typeName === ARRAY_TYPE_NAME;
}

export class MistralProvider implements ILLMProvider {
  private client: Mistral;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = 'mistral-small-latest') {
    this.client = new Mistral({ apiKey });
    this.defaultModel = defaultModel;
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: LLMOptions,
  ): Promise<LLMResponse<T>> {
    const startTime = performance.now();
    const model = options?.model || this.defaultModel;
    const parseAttemptState = createStructuredOutputAttemptState();
    let accumulatedPromptTokens = 0;
    let accumulatedCompletionTokens = 0;
    let accumulatedTotalTokens = 0;
    const repairMalformedJson = options?.structuredOutput?.repairMalformedJson ?? false;
    const maxRepairAttempts = repairMalformedJson
      ? Math.max(0, Math.floor(options?.structuredOutput?.maxRepairAttempts ?? 1))
      : 0;

    try {
      for (let attempt = 0; attempt <= maxRepairAttempts; attempt += 1) {
        const usedRepairPrompt = attempt > 0;
        const requestPrompt = usedRepairPrompt
          ? buildStrictJsonRetryPrompt(prompt)
          : prompt;

        const requestPayload: {
          model: string;
          messages: Array<{ role: 'user'; content: string }>;
          responseFormat?: { type: 'json_object' };
          temperature?: number;
          maxTokens?: number;
        } = {
          model,
          messages: [{ role: 'user', content: requestPrompt }],
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
        };

        if (!isTopLevelArraySchema(schema)) {
          requestPayload.responseFormat = { type: 'json_object' };
        }

        const response = await this.client.chat.complete(requestPayload);
        accumulatedPromptTokens += response.usage?.promptTokens ?? 0;
        accumulatedCompletionTokens += response.usage?.completionTokens ?? 0;
        accumulatedTotalTokens += response.usage?.totalTokens ?? 0;
        const latencyMs = Math.round(performance.now() - startTime);
        const content = response.choices?.[0]?.message?.content;

        if (typeof content !== 'string') {
          const metadata = buildStructuredOutputFailureMetadata(
            new Error('LLM returned empty or invalid content'),
            undefined,
            attempt + 1,
            attempt >= maxRepairAttempts,
          );

          recordStructuredOutputAttempt(parseAttemptState, {
            attemptNumber: attempt + 1,
            usedRepairPrompt,
            failureKind: metadata.kind,
          });

          if (attempt >= maxRepairAttempts) {
            throw new StructuredOutputError(metadata);
          }

          continue;
        }

        const cleanContent = stripMarkdownFences(content);

        try {
          const parsed = JSON.parse(cleanContent);
          const validated = schema.parse(parsed);

          recordStructuredOutputAttempt(parseAttemptState, {
            attemptNumber: attempt + 1,
            usedRepairPrompt,
            rawContent: cleanContent,
          });

          const usage: LLMUsage = {
            promptTokens: accumulatedPromptTokens,
            completionTokens: accumulatedCompletionTokens,
            totalTokens: accumulatedTotalTokens,
            latencyMs,
          };

          return {
            data: validated,
            usage,
            model,
            structuredOutput: buildStructuredOutputResponseMetadata(parseAttemptState),
          };
        } catch (error) {
          if (error instanceof z.ZodError) {
            console.error('LLM output validation failed:', error.errors);
            throw new Error(`Structured output validation failed: ${error.message}`);
          }

          const metadata = buildStructuredOutputFailureMetadata(
            error,
            cleanContent,
            attempt + 1,
            attempt >= maxRepairAttempts,
          );

          recordStructuredOutputAttempt(parseAttemptState, {
            attemptNumber: attempt + 1,
            usedRepairPrompt,
            rawContent: cleanContent,
            failureKind: metadata.kind,
          });

          if (attempt >= maxRepairAttempts) {
            throw new StructuredOutputError(metadata);
          }
        }
      }

      throw new Error('Structured output recovery exited unexpectedly');
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('LLM output validation failed:', error.errors);
        throw new Error(`Structured output validation failed: ${error.message}`);
      }
      console.error('Mistral API error:', error);
      throw error;
    }
  }

  async generateText(
    prompt: string,
    options?: LLMOptions
  ): Promise<LLMResponse<string>> {
    const startTime = performance.now();
    const model = options?.model || this.defaultModel;

    try {
      const response = await this.client.chat.complete({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });

      const latencyMs = Math.round(performance.now() - startTime);
      const content = response.choices?.[0]?.message?.content;

      if (typeof content !== 'string') {
        throw new Error('LLM returned empty or invalid content');
      }

      const usage: LLMUsage = {
        promptTokens: response.usage?.promptTokens ?? 0,
        completionTokens: response.usage?.completionTokens ?? 0,
        totalTokens: response.usage?.totalTokens ?? 0,
        latencyMs,
      };

      return {
        data: content,
        usage,
        model,
      };
    } catch (error) {
      console.error('Mistral API error:', error);
      throw error;
    }
  }
}
