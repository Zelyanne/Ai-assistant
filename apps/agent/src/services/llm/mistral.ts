import { Mistral } from 'mistralai';
import { z } from 'zod';
import { ILLMProvider, LLMOptions, LLMResponse, LLMUsage } from './types.js';

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
    options?: LLMOptions
  ): Promise<LLMResponse<T>> {
    const startTime = performance.now();
    const model = options?.model || this.defaultModel;

    try {
      const response = await this.client.chat.complete({
        model,
        messages: [{ role: 'user', content: prompt }],
        responseFormat: { type: 'json_object' },
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });

      const latencyMs = Math.round(performance.now() - startTime);
      const content = response.choices?.[0]?.message?.content;

      if (typeof content !== 'string') {
        throw new Error('LLM returned empty or invalid content');
      }

      // Mistral sometimes wraps JSON in markdown blocks even in JSON mode
      const cleanContent = content.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(cleanContent);
      const validated = schema.parse(parsed);

      const usage: LLMUsage = {
        promptTokens: response.usage?.promptTokens ?? 0,
        completionTokens: response.usage?.completionTokens ?? 0,
        totalTokens: response.usage?.totalTokens ?? 0,
        latencyMs,
      };

      return {
        data: validated,
        usage,
        model,
      };
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
