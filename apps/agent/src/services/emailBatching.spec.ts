import { describe, expect, it } from 'vitest';
import {
  buildTokenAwareBatches,
  executeBatchesWithConcurrency,
  getTokenBandForEstimate,
  runWithConcurrency,
  type TokenAwareBatchInput,
} from './emailBatching.js';

interface BatchPayload {
  value: string;
}

describe('emailBatching', () => {
  it('maps boundary values to the expected token bands', () => {
    expect(getTokenBandForEstimate(799).name).toBe('tiny');
    expect(getTokenBandForEstimate(800).name).toBe('small');
    expect(getTokenBandForEstimate(1499).name).toBe('small');
    expect(getTokenBandForEstimate(1500).name).toBe('medium');
    expect(getTokenBandForEstimate(2999).name).toBe('medium');
    expect(getTokenBandForEstimate(3000).name).toBe('large');
    expect(getTokenBandForEstimate(5999).name).toBe('large');
    expect(getTokenBandForEstimate(6000).name).toBe('xlarge');
  });

  it('caps tiny-band batches at 16 items', () => {
    const inputs: TokenAwareBatchInput<BatchPayload>[] = Array.from(
      { length: 17 },
      (_, index) => ({
        id: `thread-${index + 1}`,
        subject: 's',
        content: 'c',
        estimatedTokens: 400,
        payload: { value: `payload-${index + 1}` },
      }),
    );

    const batches = buildTokenAwareBatches(inputs, {
      maxInputTokensPerBatch: 13_000,
      concurrencyLimit: 3,
    });

    expect(batches).toHaveLength(2);
    expect(batches[0].batchSize).toBe(16);
    expect(batches[1].batchSize).toBe(1);
    expect(batches[0].concurrencyLimit).toBe(3);
  });

  it('splits batches when input-token budget would be exceeded', () => {
    const inputs: TokenAwareBatchInput<BatchPayload>[] = [
      {
        id: 'a',
        subject: 'A',
        content: 'A',
        estimatedTokens: 5_000,
        payload: { value: 'a' },
      },
      {
        id: 'b',
        subject: 'B',
        content: 'B',
        estimatedTokens: 5_000,
        payload: { value: 'b' },
      },
      {
        id: 'c',
        subject: 'C',
        content: 'C',
        estimatedTokens: 5_000,
        payload: { value: 'c' },
      },
    ];

    const batches = buildTokenAwareBatches(inputs, {
      maxInputTokensPerBatch: 9_000,
      concurrencyLimit: 2,
    });

    expect(batches).toHaveLength(3);
    expect(batches.every((batch) => batch.estimatedTokens <= 9_000)).toBe(true);
  });

  it('runs workers with bounded concurrency', async () => {
    let activeWorkers = 0;
    let maxActiveWorkers = 0;

    const settled = await runWithConcurrency(
      [1, 2, 3, 4, 5, 6],
      2,
      async (value) => {
        activeWorkers += 1;
        maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeWorkers -= 1;
        return value * 2;
      },
    );

    expect(maxActiveWorkers).toBeLessThanOrEqual(2);
    expect(settled.every((result) => result.status === 'fulfilled')).toBe(true);
  });

  it('returns settled results for batch execution without throwing on failures', async () => {
    const batches = buildTokenAwareBatches<BatchPayload>(
      [
        {
          id: 'ok',
          subject: 'subject',
          content: 'content',
          estimatedTokens: 500,
          payload: { value: 'ok' },
        },
        {
          id: 'boom',
          subject: 'subject',
          content: 'content',
          estimatedTokens: 500,
          payload: { value: 'boom' },
        },
      ],
      { maxInputTokensPerBatch: 700, concurrencyLimit: 2 },
    );

    const settled = await executeBatchesWithConcurrency(
      batches,
      2,
      async (batch) => {
        if (batch.items.some((item) => item.id === 'boom')) {
          throw new Error('forced failure');
        }

        return batch.batchSize;
      },
    );

    expect(settled).toHaveLength(2);
    expect(settled.some((result) => result.status === 'rejected')).toBe(true);
    expect(settled.some((result) => result.status === 'fulfilled')).toBe(true);
  });
});
