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

  it('retries malformed JSON once with stricter instructions when enabled', async () => {
    const schema = z.object({ foo: z.string() });

    mocks.complete
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"foo": "bar"' } }],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"foo": "bar"}' } }],
        usage: { promptTokens: 12, completionTokens: 6, totalTokens: 18 },
      });

    const result = await provider.generateStructured('repair me', schema, {
      structuredOutput: {
        repairMalformedJson: true,
        maxRepairAttempts: 1,
      },
    });

    expect(result.data).toEqual({ foo: 'bar' });
    expect(result.structuredOutput).toEqual({ attempts: 2, repaired: true });
    expect(result.usage).toMatchObject({
      promptTokens: 22,
      completionTokens: 11,
      totalTokens: 33,
    });
    expect(mocks.complete).toHaveBeenCalledTimes(2);
    expect(mocks.complete.mock.calls[1][0]).toEqual(expect.objectContaining({
      messages: [
        expect.objectContaining({
          content: expect.stringContaining('RETRY INSTRUCTIONS:'),
        }),
      ],
    }));
  });

  it('throws a structured output error after malformed JSON exhausts the repair limit', async () => {
    const schema = z.object({ foo: z.string() });

    mocks.complete
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"foo": "bar"' } }],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"foo": "baz"' } }],
        usage: { promptTokens: 11, completionTokens: 5, totalTokens: 16 },
      });

    await expect(provider.generateStructured('still broken', schema, {
      structuredOutput: {
        repairMalformedJson: true,
        maxRepairAttempts: 1,
      },
    })).rejects.toMatchObject({
      name: 'StructuredOutputError',
      metadata: expect.objectContaining({
        kind: 'json_parse_failure',
        attempts: 2,
        exhausted: true,
      }),
    });
  });

  it('keeps exhausted empty-content failures distinct from parse exhaustion metadata', async () => {
    const schema = z.object({ foo: z.string() });

    mocks.complete
      .mockResolvedValueOnce({
        choices: [{ message: { content: null } }],
        usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: null } }],
        usage: { promptTokens: 11, completionTokens: 0, totalTokens: 11 },
      });

    await expect(provider.generateStructured('empty output', schema, {
      structuredOutput: {
        repairMalformedJson: true,
        maxRepairAttempts: 1,
      },
    })).rejects.toMatchObject({
      name: 'StructuredOutputError',
      metadata: expect.objectContaining({
        kind: 'empty_content',
        attempts: 2,
        exhausted: true,
      }),
    });
  });
});
