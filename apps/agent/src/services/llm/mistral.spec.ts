import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { MistralProvider } from './mistral.js';

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
}));

vi.mock('mistralai', () => ({
  Mistral: class {
    chat = {
      complete: mocks.complete,
    };
  },
}));

describe('MistralProvider', () => {
  let provider: MistralProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new MistralProvider('fake-key', 'fake-model');
  });

  it('should generate structured output correctly', async () => {
    const schema = z.object({ foo: z.string() });
    mocks.complete.mockResolvedValue({
      choices: [{ message: { content: '{"foo": "bar"}' } }],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'fake-model',
    });

    const result = await provider.generateStructured('test prompt', schema);

    expect(result.data).toEqual({ foo: 'bar' });
    expect(result.usage.totalTokens).toBe(15);
    expect(result.model).toBe('fake-model');
    expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({
      responseFormat: { type: 'json_object' }
    }));
  });

  it('should handle markdown wrapped JSON in structured output', async () => {
    const schema = z.object({ foo: z.string() });
    mocks.complete.mockResolvedValue({
      choices: [{ message: { content: '```json\n{"foo": "bar"}\n```' } }],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'fake-model',
    });

    const result = await provider.generateStructured('test prompt', schema);

    expect(result.data).toEqual({ foo: 'bar' });
  });

  it('should allow top-level array schemas without forcing json_object mode', async () => {
    const schema = z.array(z.object({ foo: z.string() }));
    mocks.complete.mockResolvedValue({
      choices: [{ message: { content: '[{"foo": "bar"}]' } }],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'fake-model',
    });

    const result = await provider.generateStructured('test prompt', schema);

    expect(result.data).toEqual([{ foo: 'bar' }]);
    const requestPayload = mocks.complete.mock.calls[0][0] as {
      responseFormat?: { type: string };
    };
    expect(requestPayload.responseFormat).toBeUndefined();
  });

  it('should detect array schemas by typeName even when not instanceof local zod', async () => {
    const foreignArraySchema = {
      _def: { typeName: 'ZodArray' },
      parse: vi.fn((value: unknown) => value),
    } as unknown as z.ZodSchema<Array<{ foo: string }>>;

    mocks.complete.mockResolvedValue({
      choices: [{ message: { content: '[{"foo": "bar"}]' } }],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'fake-model',
    });

    const result = await provider.generateStructured('test prompt', foreignArraySchema);

    expect(result.data).toEqual([{ foo: 'bar' }]);
    const requestPayload = mocks.complete.mock.calls[0][0] as {
      responseFormat?: { type: string };
    };
    expect(requestPayload.responseFormat).toBeUndefined();
  });

  it('should generate plain text correctly', async () => {
    mocks.complete.mockResolvedValue({
      choices: [{ message: { content: 'plain text response' } }],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'fake-model',
    });

    const result = await provider.generateText('test prompt');

    expect(result.data).toBe('plain text response');
    expect(result.usage.promptTokens).toBe(10);
  });

  it('should throw error if validation fails', async () => {
    const schema = z.object({ foo: z.number() }); // Expect number
    mocks.complete.mockResolvedValue({
      choices: [{ message: { content: '{"foo": "not-a-number"}' } }],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });

    await expect(provider.generateStructured('test prompt', schema))
      .rejects.toThrow(/Structured output validation failed/);
  });
});
