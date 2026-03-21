export interface TokenBandDefinition {
  name: 'tiny' | 'small' | 'medium' | 'large' | 'xlarge';
  minTokensInclusive: number;
  maxTokensExclusive: number | null;
  minBatchSize: number;
  maxBatchSize: number;
}

export const TOKEN_BAND_DEFINITIONS: readonly TokenBandDefinition[] = [
  {
    name: 'tiny',
    minTokensInclusive: 0,
    maxTokensExclusive: 800,
    minBatchSize: 16,
    maxBatchSize: 16,
  },
  {
    name: 'small',
    minTokensInclusive: 800,
    maxTokensExclusive: 1500,
    minBatchSize: 8,
    maxBatchSize: 12,
  },
  {
    name: 'medium',
    minTokensInclusive: 1500,
    maxTokensExclusive: 3000,
    minBatchSize: 4,
    maxBatchSize: 6,
  },
  {
    name: 'large',
    minTokensInclusive: 3000,
    maxTokensExclusive: 6000,
    minBatchSize: 2,
    maxBatchSize: 3,
  },
  {
    name: 'xlarge',
    minTokensInclusive: 6000,
    maxTokensExclusive: null,
    minBatchSize: 1,
    maxBatchSize: 1,
  },
];

export const DEFAULT_INPUT_TOKEN_BUDGET = 13_000;
export const DEFAULT_BATCH_CONCURRENCY_LIMIT = 3;

export interface TokenAwareBatchInput<TPayload> {
  id: string;
  subject: string;
  content: string;
  payload: TPayload;
  estimatedTokens?: number;
}

export interface TokenAwareBatchItem<TPayload> {
  id: string;
  payload: TPayload;
  estimatedTokens: number;
  tokenBand: TokenBandDefinition['name'];
  maxBatchSize: number;
}

export interface TokenAwareBatch<TPayload> {
  batchIndex: number;
  batchSize: number;
  estimatedTokens: number;
  concurrencyLimit: number;
  items: TokenAwareBatchItem<TPayload>[];
}

interface InternalBatch<TPayload> {
  estimatedTokens: number;
  maxBatchSize: number;
  items: Array<TokenAwareBatchItem<TPayload> & { originalIndex: number }>;
}

export interface BuildTokenAwareBatchesOptions {
  maxInputTokensPerBatch?: number;
  concurrencyLimit?: number;
  maxItemsPerBatch?: number;
}

export interface SettledSuccess<TValue> {
  index: number;
  status: 'fulfilled';
  value: TValue;
}

export interface SettledFailure {
  index: number;
  status: 'rejected';
  reason: unknown;
}

export type SettledResult<TValue> = SettledSuccess<TValue> | SettledFailure;

export function estimateEmailTokens(subject: string, content: string): number {
  const normalizedSubject = subject.trim();
  const normalizedContent = content.trim();
  const combined = `${normalizedSubject}\n${normalizedContent}`.trim();

  if (!combined) {
    return 1;
  }

  const charEstimate = Math.ceil(combined.length / 4);
  const newlineWeight = (combined.match(/\n/g)?.length ?? 0) * 2;
  const structuralOverhead = 24;

  return Math.max(1, charEstimate + newlineWeight + structuralOverhead);
}

export function getTokenBandForEstimate(estimatedTokens: number): TokenBandDefinition {
  for (const band of TOKEN_BAND_DEFINITIONS) {
    const upperBound = band.maxTokensExclusive;
    if (upperBound === null) {
      if (estimatedTokens >= band.minTokensInclusive) {
        return band;
      }
      continue;
    }

    if (
      estimatedTokens >= band.minTokensInclusive
      && estimatedTokens < upperBound
    ) {
      return band;
    }
  }

  return TOKEN_BAND_DEFINITIONS[TOKEN_BAND_DEFINITIONS.length - 1];
}

export function buildTokenAwareBatches<TPayload>(
  inputs: TokenAwareBatchInput<TPayload>[],
  options?: BuildTokenAwareBatchesOptions,
): TokenAwareBatch<TPayload>[] {
  if (inputs.length === 0) {
    return [];
  }

  const maxInputTokensPerBatch = Math.max(
    1,
    Math.floor(options?.maxInputTokensPerBatch ?? DEFAULT_INPUT_TOKEN_BUDGET),
  );
  const concurrencyLimit = normalizeConcurrencyLimit(options?.concurrencyLimit);
  const maxItemsPerBatch = options?.maxItemsPerBatch;

  const computedItems = inputs
    .map((input, index) => {
      const estimatedTokens = Math.max(
        1,
        Math.floor(
          input.estimatedTokens
            ?? estimateEmailTokens(input.subject, input.content),
        ),
      );
      const band = getTokenBandForEstimate(estimatedTokens);

      return {
        id: input.id,
        payload: input.payload,
        estimatedTokens,
        tokenBand: band.name,
        maxBatchSize: maxItemsPerBatch
          ? Math.max(1, Math.min(interpolateBatchCap(estimatedTokens, band), Math.floor(maxItemsPerBatch)))
          : interpolateBatchCap(estimatedTokens, band),
        originalIndex: index,
      };
    })
    .sort((left, right) => right.estimatedTokens - left.estimatedTokens);

  const internalBatches: InternalBatch<TPayload>[] = [];

  for (const item of computedItems) {
    let targetBatchIndex = -1;
    let smallestRemainder = Number.POSITIVE_INFINITY;

    for (let index = 0; index < internalBatches.length; index += 1) {
      const batch = internalBatches[index];
      const nextBatchSize = batch.items.length + 1;
      const maxAllowedSize = Math.min(batch.maxBatchSize, item.maxBatchSize);
      const nextEstimatedTokens = batch.estimatedTokens + item.estimatedTokens;

      if (nextBatchSize > maxAllowedSize || nextEstimatedTokens > maxInputTokensPerBatch) {
        continue;
      }

      const remainder = maxInputTokensPerBatch - nextEstimatedTokens;
      if (remainder < smallestRemainder) {
        smallestRemainder = remainder;
        targetBatchIndex = index;
      }
    }

    if (targetBatchIndex === -1) {
      internalBatches.push({
        estimatedTokens: item.estimatedTokens,
        maxBatchSize: item.maxBatchSize,
        items: [item],
      });
      continue;
    }

    const targetBatch = internalBatches[targetBatchIndex];
    targetBatch.items.push(item);
    targetBatch.estimatedTokens += item.estimatedTokens;
    targetBatch.maxBatchSize = Math.min(targetBatch.maxBatchSize, item.maxBatchSize);
  }

  return internalBatches.map((batch, index) => {
    const sortedItems = [...batch.items]
      .sort((left, right) => left.originalIndex - right.originalIndex)
      .map(({ originalIndex: _ignored, ...rest }) => rest);

    return {
      batchIndex: index + 1,
      batchSize: sortedItems.length,
      estimatedTokens: batch.estimatedTokens,
      concurrencyLimit,
      items: sortedItems,
    };
  });
}

export async function runWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrencyLimit: number,
  worker: (item: TItem, index: number) => Promise<TResult>,
): Promise<SettledResult<TResult>[]> {
  if (items.length === 0) {
    return [];
  }

  const normalizedLimit = normalizeConcurrencyLimit(concurrencyLimit);
  const workerCount = Math.min(normalizedLimit, items.length);
  const results: SettledResult<TResult>[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;

      try {
        const value = await worker(items[currentIndex], currentIndex);
        results[currentIndex] = {
          index: currentIndex,
          status: 'fulfilled',
          value,
        };
      } catch (error) {
        results[currentIndex] = {
          index: currentIndex,
          status: 'rejected',
          reason: error,
        };
      }
    }
  });

  await Promise.all(workers);

  return results;
}

export async function executeBatchesWithConcurrency<TPayload, TResult>(
  batches: TokenAwareBatch<TPayload>[],
  concurrencyLimit: number,
  worker: (batch: TokenAwareBatch<TPayload>) => Promise<TResult>,
): Promise<SettledResult<TResult>[]> {
  return runWithConcurrency(batches, concurrencyLimit, worker);
}

export function rebuildSmallerBatches<TPayload>(
  batch: TokenAwareBatch<TPayload>,
  options?: BuildTokenAwareBatchesOptions,
): TokenAwareBatch<TPayload>[] {
  if (batch.items.length <= 1) {
    return [batch];
  }

  const nextMaxItemsPerBatch = batch.items.length <= 2
    ? 1
    : Math.max(1, Math.floor(batch.items.length / 2));

  return buildTokenAwareBatches(
    batch.items.map((item) => ({
      id: item.id,
      subject: '',
      content: '',
      payload: item.payload,
      estimatedTokens: item.estimatedTokens,
    })),
    {
      maxInputTokensPerBatch: options?.maxInputTokensPerBatch ?? DEFAULT_INPUT_TOKEN_BUDGET,
      concurrencyLimit: options?.concurrencyLimit ?? batch.concurrencyLimit,
      maxItemsPerBatch: options?.maxItemsPerBatch ?? nextMaxItemsPerBatch,
    },
  );
}

function normalizeConcurrencyLimit(concurrencyLimit?: number): number {
  if (!concurrencyLimit || Number.isNaN(concurrencyLimit)) {
    return DEFAULT_BATCH_CONCURRENCY_LIMIT;
  }

  return Math.max(1, Math.floor(concurrencyLimit));
}

function interpolateBatchCap(
  estimatedTokens: number,
  band: TokenBandDefinition,
): number {
  if (band.minBatchSize === band.maxBatchSize) {
    return band.maxBatchSize;
  }

  if (band.maxTokensExclusive === null) {
    return band.minBatchSize;
  }

  const bandRange = band.maxTokensExclusive - band.minTokensInclusive;
  if (bandRange <= 0) {
    return band.minBatchSize;
  }

  const clampedOffset = Math.min(
    Math.max(estimatedTokens - band.minTokensInclusive, 0),
    bandRange,
  );
  const ratio = clampedOffset / bandRange;

  const scaled = band.maxBatchSize - ratio * (band.maxBatchSize - band.minBatchSize);

  return Math.max(
    band.minBatchSize,
    Math.min(band.maxBatchSize, Math.round(scaled)),
  );
}
