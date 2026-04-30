import {
  BatchedEmailTriageResultSchema,
  type BatchedEmailTriageResult,
  type EmailTriageClassification,
  type Task,
} from '@ai-assistant/shared';
import { z } from 'zod';
import { BaseProcessor, type ProcessorResult } from './BaseProcessor.js';
import { supabase } from '../services/supabase.js';
import { PerimeterGuard } from '../guards/PerimeterGuard.js';
import { AuditLogger } from '../services/AuditLogger.js';
import { LLMProviderFactory } from '../services/llm/factory.js';
import { type ILLMProvider } from '../services/llm/types.js';
import {
  buildTokenAwareBatches,
  executeBatchesWithConcurrency,
  rebuildSmallerBatches,
  type TokenAwareBatch,
  type TokenAwareBatchInput,
} from '../services/emailBatching.js';
import { isStructuredOutputError } from '../services/llm/structuredOutput.js';
import { topicWatchAlertService } from '../services/TopicWatchAlertService.js';

const DEFAULT_BATCH_INPUT_TOKENS = 13_000;
const MIN_BATCH_INPUT_TOKENS = 12_000;
const MAX_BATCH_INPUT_TOKENS = 14_000;
const DEFAULT_BATCH_CONCURRENCY = 1;
const MIN_BATCH_CONCURRENCY = 1;
const MAX_BATCH_CONCURRENCY = 1;
const DEFAULT_OUTPUT_TOKEN_RESERVE = 1_800;
const MAX_TRIAGE_RETRY_ATTEMPTS = 3;
const MAX_LOGGED_THREAD_IDS = 10;

interface RetryContext {
  requestedThreadIds: string[];
  retryAttempt: number;
  isScopedRetry: boolean;
}

interface RetryQueueResult {
  enqueued: boolean;
  nextRetryAttempt: number | null;
  reason: 'not_needed' | 'queued' | 'retry_limit_reached' | 'queue_failed';
}

interface UnclassifiedThread {
  id: string;
  subject: string | null;
  metadata: Record<string, unknown> | null;
  summary: string | null;
  summary_json: Record<string, unknown> | null;
}

interface WatchTopic {
  topic: string;
  priority: string;
  keywords_array?: string[] | null;
}

interface TriageBatchPayload {
  thread: UnclassifiedThread;
  filteredSubject: string;
  filteredSnippet: string;
}

type TriageBatchItem = TokenAwareBatch<TriageBatchPayload>['items'][number];

interface BatchSummary {
  processedCount: number;
  retryableThreadIds: string[];
  nonRetryableThreadIds: string[];
}

interface SingleThreadClassificationResult {
  classification: EmailTriageClassification | null;
  failureHint: FailureHint | null;
}

type FailureHint =
  | 'empty_content'
  | 'retryable_external_failure'
  | 'schema_validation_failure'
  | 'json_parse_failure'
  | 'parse_exhausted_failure'
  | 'non_retryable_failure';

const BatchedEmailTriageEnvelopeSchema = z.object({
  results: BatchedEmailTriageResultSchema,
});

export class EmailTriageProcessor extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    console.log(
      `[EmailTriageProcessor][${task.id}] Processing email.triage with token-aware batching...`,
    );

    const { organization_id, user_id } = task;
    const retryContext = this.resolveRetryContext(task.payload);

    if (retryContext.isScopedRetry && retryContext.requestedThreadIds.length === 0) {
      return {
        message: 'No valid retry thread IDs provided; skipped scoped email.triage retry',
        processed_count: 0,
        task_id: task.id,
        skipped_thread_ids: [],
      };
    }

    let threadQuery = supabase
      .from('ingested_threads')
      .select('id, subject, metadata, summary, summary_json')
      .eq('organization_id', organization_id)
      .eq('classification', '{}');

    if (retryContext.requestedThreadIds.length > 0) {
      threadQuery = threadQuery.in('id', retryContext.requestedThreadIds);
      console.log(
        `[EmailTriageProcessor] Scoped retry task to ${retryContext.requestedThreadIds.length} thread(s).`,
      );
    }

    const { data: threads, error: threadError } = await threadQuery as {
      data: UnclassifiedThread[] | null;
      error: unknown;
    };

    if (threadError) {
      throw threadError;
    }

    if (!threads || threads.length === 0) {
      if (retryContext.isScopedRetry) {
        return {
          message: `No unclassified threads found for requested retry thread(s): ${retryContext.requestedThreadIds.join(', ')}`,
          processed_count: 0,
          task_id: task.id,
          skipped_thread_ids: retryContext.requestedThreadIds,
        };
      }

      return { message: 'No unclassified threads found', processed_count: 0 };
    }

    let topicQuery = supabase
      .from('watch_topics')
      .select('topic, priority, keywords_array')
      .eq('organization_id', organization_id);

    if (user_id) {
      topicQuery = topicQuery.or(`user_id.eq.${user_id},user_id.is.null`);
    } else {
      topicQuery = topicQuery.is('user_id', null);
    }

    const { data: topics, error: topicError } = await topicQuery as {
      data: WatchTopic[] | null;
      error: unknown;
    };

    if (topicError) {
      throw topicError;
    }

    const effectiveTopics: WatchTopic[] =
      topics && topics.length > 0
        ? topics
        : [{ topic: 'General', priority: 'Low' }];

    const guard = new PerimeterGuard();
    const batchInputs: TokenAwareBatchInput<TriageBatchPayload>[] = [];
    const missingSnippetThreadIds: string[] = [];

    for (const thread of threads) {
      const snippet = this.extractSnippet(thread);

      if (!snippet) {
        missingSnippetThreadIds.push(thread.id);
      }

      const filteredSubject = guard.redactPII(thread.subject ?? '');
      const filteredSnippet = guard.redactPII(snippet);

      batchInputs.push({
        id: thread.id,
        subject: filteredSubject,
        content: filteredSnippet,
        payload: {
          thread,
          filteredSubject,
          filteredSnippet,
        },
      });
    }

    if (missingSnippetThreadIds.length > 0) {
      await this.logSnippetExtractionSummary(task, missingSnippetThreadIds);
    }

    if (batchInputs.length === 0) {
      return {
        message: 'No eligible threads found for triage',
        processed_count: 0,
        task_id: task.id,
      };
    }

    const batchConcurrencyLimit = this.resolveBatchConcurrencyLimit();
    const batches = buildTokenAwareBatches(batchInputs, {
      maxInputTokensPerBatch: this.resolveBatchInputTokenBudget(),
      concurrencyLimit: batchConcurrencyLimit,
    });

    const llmProvider = LLMProviderFactory.getProvider();

    const settledBatches = await executeBatchesWithConcurrency(
      batches,
      batchConcurrencyLimit,
      async (batch) =>
        this.processBatch(task, batch, effectiveTopics, guard, llmProvider),
    );

    let processedCount = 0;
    const retryableThreadIds = new Set<string>();
    const nonRetryableThreadIds = new Set<string>();

    for (const settledBatch of settledBatches) {
      if (settledBatch.status === 'fulfilled') {
        processedCount += settledBatch.value.processedCount;
        for (const threadId of settledBatch.value.retryableThreadIds) {
          retryableThreadIds.add(threadId);
        }
        for (const threadId of settledBatch.value.nonRetryableThreadIds) {
          nonRetryableThreadIds.add(threadId);
        }
        continue;
      }

      const failedBatch = batches[settledBatch.index];
      const failureHint = this.classifyFailureHint(settledBatch.reason);
      console.error(
        `[EmailTriageProcessor] Batch ${failedBatch?.batchIndex ?? settledBatch.index + 1} failed (${failureHint}): ${this.formatErrorForLog(settledBatch.reason)}`,
      );

      if (failedBatch) {
        for (const batchItem of failedBatch.items) {
          if (failureHint === 'parse_exhausted_failure') {
            nonRetryableThreadIds.add(batchItem.id);
          } else {
            retryableThreadIds.add(batchItem.id);
          }
        }
      }
    }

    const retryableThreadIdList = [...retryableThreadIds];
    const nonRetryableThreadIdList = [...nonRetryableThreadIds];

    if (nonRetryableThreadIdList.length > 0) {
      await this.logRetryQueueIssue(
        task,
        'triage_parse_exhausted',
        'Structured output recovery was exhausted; these thread classifications were not re-queued.',
        nonRetryableThreadIdList,
      );
    }

    const retryResult: RetryQueueResult = retryableThreadIdList.length > 0
      ? await this.queueTriageRetry(task, retryableThreadIdList, retryContext.retryAttempt)
      : {
          enqueued: false,
          nextRetryAttempt: null,
          reason: 'not_needed',
        };

    const skippedThreadIds = [...new Set([...retryableThreadIdList, ...nonRetryableThreadIdList])];

    return {
      message: this.buildProcessResultMessage(
        processedCount,
        batches.length,
        retryableThreadIdList.length,
        nonRetryableThreadIdList.length,
        retryResult,
      ),
      processed_count: processedCount,
      task_id: task.id,
      skipped_thread_ids: skippedThreadIds,
    };
  }

  private async processBatch(
    task: Task,
    batch: TokenAwareBatch<TriageBatchPayload>,
    topics: WatchTopic[],
    guard: PerimeterGuard,
    llmProvider: ILLMProvider,
    options?: { allowBatchDegradation?: boolean },
  ): Promise<BatchSummary> {
    console.log(
      `[EmailTriageProcessor] Processing batch ${batch.batchIndex} (size=${batch.batchSize}, estimated_tokens=${batch.estimatedTokens}, concurrency_limit=${batch.concurrencyLimit})`,
    );

    const allowBatchDegradation = options?.allowBatchDegradation ?? true;
    let results: BatchedEmailTriageResult;

    try {
      const prompt = this.buildBatchPrompt(batch, topics);
      results = await this.generateBatchClassifications(prompt, llmProvider);
    } catch (error) {
      const failureHint = this.classifyFailureHint(error);

      if (failureHint === 'parse_exhausted_failure') {
        if (batch.batchSize > 1 && allowBatchDegradation) {
          return this.salvageMalformedBatch(task, batch, topics, guard, llmProvider);
        }

        if (batch.batchSize > 1) {
          return this.salvageBatchAsSingleThreadCalls(task, batch, topics, guard, llmProvider);
        }

        return {
          processedCount: 0,
          retryableThreadIds: [],
          nonRetryableThreadIds: batch.items.map((item) => item.id),
        };
      }

      throw error;
    }

    const resultsByThreadId = new Map(
      results.map((item) => [item.thread_id, item.classification]),
    );

    let processedCount = 0;
    const retryableThreadIds: string[] = [];
    const nonRetryableThreadIds: string[] = [];

    for (const item of batch.items) {
      const threadId = item.id;
      let classification: EmailTriageClassification | null | undefined =
        resultsByThreadId.get(threadId);

      if (!classification) {
        console.warn(
          `[EmailTriageProcessor] Batch ${batch.batchIndex} missing classification for thread ${threadId}; retrying as single-thread call.`,
        );

        const singleThreadResult = await this.classifySingleThreadFromBatchItem(
          item,
          topics,
          llmProvider,
        );
        classification = singleThreadResult.classification;

        if (!classification) {
          if (singleThreadResult.failureHint === 'parse_exhausted_failure') {
            nonRetryableThreadIds.push(threadId);
          } else {
            retryableThreadIds.push(threadId);
          }
          continue;
        }
      }

      const classificationWithRecoveredPii = this.recoverClassificationPII(
        classification,
        guard,
      );

      try {
        await this.persistClassification(threadId, classificationWithRecoveredPii);
        await this.queueSummarizationIfNeeded(
          task.organization_id,
          task.user_id ?? null,
          threadId,
          classificationWithRecoveredPii,
        );
        await this.logThreadTriage(
          task,
          threadId,
          item.payload.thread.subject,
          classificationWithRecoveredPii,
        );
        await this.alertForTopicMatches(task, item.payload.thread, classificationWithRecoveredPii);

        processedCount += 1;
      } catch (error) {
        console.error(
          `[EmailTriageProcessor] Failed to persist triage result for thread ${threadId}:`,
          error,
        );
      }
    }

    console.log(
      `[EmailTriageProcessor] Completed batch ${batch.batchIndex} with ${processedCount}/${batch.batchSize} successful thread updates.`,
    );

    return {
      processedCount,
      retryableThreadIds,
      nonRetryableThreadIds,
    };
  }

  private async classifySingleThreadFromBatchItem(
    item: TriageBatchItem,
    topics: WatchTopic[],
    llmProvider: ILLMProvider,
  ): Promise<SingleThreadClassificationResult> {
    const singleItemBatch: TokenAwareBatch<TriageBatchPayload> = {
      batchIndex: 1,
      batchSize: 1,
      estimatedTokens: item.estimatedTokens,
      concurrencyLimit: 1,
      items: [item],
    };

    try {
      const prompt = this.buildBatchPrompt(singleItemBatch, topics);
      const results = await this.generateBatchClassifications(prompt, llmProvider);

      const result = results.find((entry) => entry.thread_id === item.id);
      if (!result) {
        console.warn(
          `[EmailTriageProcessor] Single-thread retry still missing classification for thread ${item.id}.`,
        );
        return { classification: null, failureHint: null };
      }

      return { classification: result.classification, failureHint: null };
    } catch (error) {
      const failureHint = this.classifyFailureHint(error);
      console.error(
        `[EmailTriageProcessor] Single-thread retry failed for thread ${item.id}: ${this.formatErrorForLog(error)}`,
      );
      return { classification: null, failureHint };
    }
  }

  private async generateBatchClassifications(
    prompt: string,
    llmProvider: ILLMProvider,
  ): Promise<BatchedEmailTriageResult> {
    const response = await this.retryExternalOperation(async () =>
      llmProvider.generateStructured(prompt, BatchedEmailTriageEnvelopeSchema, {
        maxTokens: this.resolveOutputTokenReserve(),
        temperature: 0,
        structuredOutput: {
          repairMalformedJson: true,
          maxRepairAttempts: 1,
        },
      }),
    );

    return response.data.results;
  }

  private async salvageMalformedBatch(
    task: Task,
    batch: TokenAwareBatch<TriageBatchPayload>,
    topics: WatchTopic[],
    guard: PerimeterGuard,
    llmProvider: ILLMProvider,
  ): Promise<BatchSummary> {
    console.warn(
      `[EmailTriageProcessor] Batch ${batch.batchIndex} exhausted provider JSON recovery. Rebuilding smaller sub-batches before single-thread fallback.`,
    );

    const smallerBatches = rebuildSmallerBatches(batch, {
      maxInputTokensPerBatch: this.resolveBatchInputTokenBudget(),
      concurrencyLimit: batch.concurrencyLimit,
    });

    if (smallerBatches.length <= 1) {
      return this.salvageBatchAsSingleThreadCalls(task, batch, topics, guard, llmProvider);
    }

    const settledSubBatches = await executeBatchesWithConcurrency(
      smallerBatches,
      batch.concurrencyLimit,
      async (subBatch) =>
        this.processBatch(task, subBatch, topics, guard, llmProvider, {
          allowBatchDegradation: false,
        }),
    );

    let processedCount = 0;
    const retryableThreadIds: string[] = [];
    const nonRetryableThreadIds: string[] = [];

    for (const settledSubBatch of settledSubBatches) {
      if (settledSubBatch.status === 'fulfilled') {
        processedCount += settledSubBatch.value.processedCount;
        retryableThreadIds.push(...settledSubBatch.value.retryableThreadIds);
        nonRetryableThreadIds.push(...settledSubBatch.value.nonRetryableThreadIds);
        continue;
      }

      const failedSubBatch = smallerBatches[settledSubBatch.index];
      const failureHint = this.classifyFailureHint(settledSubBatch.reason);

      if (!failedSubBatch) {
        continue;
      }

      if (failureHint === 'parse_exhausted_failure') {
        const singleThreadSummary = await this.salvageBatchAsSingleThreadCalls(
          task,
          failedSubBatch,
          topics,
          guard,
          llmProvider,
        );
        processedCount += singleThreadSummary.processedCount;
        retryableThreadIds.push(...singleThreadSummary.retryableThreadIds);
        nonRetryableThreadIds.push(...singleThreadSummary.nonRetryableThreadIds);
        continue;
      }

      retryableThreadIds.push(...failedSubBatch.items.map((item) => item.id));
    }

    return {
      processedCount,
      retryableThreadIds,
      nonRetryableThreadIds,
    };
  }

  private async salvageBatchAsSingleThreadCalls(
    task: Task,
    batch: TokenAwareBatch<TriageBatchPayload>,
    topics: WatchTopic[],
    guard: PerimeterGuard,
    llmProvider: ILLMProvider,
  ): Promise<BatchSummary> {
    let processedCount = 0;
    const retryableThreadIds: string[] = [];
    const nonRetryableThreadIds: string[] = [];

    for (const item of batch.items) {
      const singleThreadResult = await this.classifySingleThreadFromBatchItem(
        item,
        topics,
        llmProvider,
      );

      if (!singleThreadResult.classification) {
        if (singleThreadResult.failureHint === 'parse_exhausted_failure') {
          nonRetryableThreadIds.push(item.id);
        } else {
          retryableThreadIds.push(item.id);
        }
        continue;
      }

      const classificationWithRecoveredPii = this.recoverClassificationPII(
        singleThreadResult.classification,
        guard,
      );

      try {
        await this.persistClassification(item.id, classificationWithRecoveredPii);
        await this.queueSummarizationIfNeeded(
          task.organization_id,
          task.user_id ?? null,
          item.id,
          classificationWithRecoveredPii,
        );
        await this.logThreadTriage(
          task,
          item.id,
          item.payload.thread.subject,
          classificationWithRecoveredPii,
        );
        await this.alertForTopicMatches(task, item.payload.thread, classificationWithRecoveredPii);

        processedCount += 1;
      } catch (error) {
        console.error(
          `[EmailTriageProcessor] Failed to persist salvaged triage result for thread ${item.id}:`,
          error,
        );
        retryableThreadIds.push(item.id);
      }
    }

    return {
      processedCount,
      retryableThreadIds,
      nonRetryableThreadIds,
    };
  }

  private async queueTriageRetry(
    task: Task,
    unresolvedThreadIds: string[],
    currentRetryAttempt: number,
  ): Promise<RetryQueueResult> {
    if (unresolvedThreadIds.length === 0) {
      return {
        enqueued: false,
        nextRetryAttempt: null,
        reason: 'not_needed',
      };
    }

    if (currentRetryAttempt >= MAX_TRIAGE_RETRY_ATTEMPTS) {
      const retryLimitSample = unresolvedThreadIds
        .slice(0, MAX_LOGGED_THREAD_IDS)
        .join(', ');

      console.error(
        `[EmailTriageProcessor] Retry limit reached (${MAX_TRIAGE_RETRY_ATTEMPTS}). Skipping re-queue for ${unresolvedThreadIds.length} unresolved thread(s). Sample thread IDs: ${retryLimitSample}`,
      );
      await this.logRetryQueueIssue(
        task,
        'triage_retry_exhausted',
        `Retry limit reached after attempt ${currentRetryAttempt}.`,
        unresolvedThreadIds,
      );
      return {
        enqueued: false,
        nextRetryAttempt: null,
        reason: 'retry_limit_reached',
      };
    }

    const nextRetryAttempt = currentRetryAttempt + 1;

    const { error } = await supabase.from('tasks').insert({
      organization_id: task.organization_id,
      user_id: task.user_id ?? null,
      domain_action: 'email.triage',
      status: 'queued',
      payload: {
        thread_ids: unresolvedThreadIds,
        retry_reason: 'missing_batch_classification',
        retry_attempt: nextRetryAttempt,
      },
    });

    const sampleThreadIds = unresolvedThreadIds.slice(0, MAX_LOGGED_THREAD_IDS);
    const omittedCount = unresolvedThreadIds.length - sampleThreadIds.length;
    const sampledThreadIdText = sampleThreadIds.join(', ');
    const sampledSuffix = omittedCount > 0 ? ` (+${omittedCount} more)` : '';

    if (error) {
      console.error(
        `[EmailTriageProcessor] Failed to queue follow-up triage task for ${unresolvedThreadIds.length} unresolved thread(s) at retry ${nextRetryAttempt}: ${sampledThreadIdText}${sampledSuffix}`,
        error,
      );
      await this.logRetryQueueIssue(
        task,
        'triage_retry_queue_failed',
        `Failed to enqueue retry attempt ${nextRetryAttempt}: ${this.formatErrorForLog(error)}`,
        unresolvedThreadIds,
        error,
      );
      return {
        enqueued: false,
        nextRetryAttempt,
        reason: 'queue_failed',
      };
    }

    console.warn(
      `[EmailTriageProcessor] Queued follow-up email.triage for ${unresolvedThreadIds.length} unresolved thread(s) at retry ${nextRetryAttempt}. Sample thread IDs: ${sampledThreadIdText}${sampledSuffix}`,
    );

    return {
      enqueued: true,
      nextRetryAttempt,
      reason: 'queued',
    };
  }

  private async logRetryQueueIssue(
    task: Task,
    eventName: string,
    detail: string,
    threadIds: string[],
    error?: unknown,
  ): Promise<void> {
    const sampleThreadIds = threadIds.slice(0, MAX_LOGGED_THREAD_IDS);
    const omittedCount = threadIds.length - sampleThreadIds.length;
    const sampledThreadIdText = sampleThreadIds.join(', ');
    const sampledSuffix = omittedCount > 0 ? ` (+${omittedCount} more)` : '';

    try {
      await AuditLogger.flush(
        task.organization_id,
        task.id || null,
        task.user_id || 'agent-controller',
        eventName,
        [
          AuditLogger.createStep(
            'Email Triage Retry',
            detail,
            {
              input_summary: `Sample thread IDs: ${sampledThreadIdText}${sampledSuffix}`,
              output_summary: error ? this.formatErrorForLog(error) : detail,
            },
          ),
        ],
        sampleThreadIds.map((threadId) => ({
          source_type: 'email',
          source_id: threadId,
          description: 'Email triage retry issue',
        })),
      );
    } catch (auditError) {
      console.error('Failed to log triage retry issue:', auditError);
    }
  }

  private async persistClassification(
    threadId: string,
    classification: EmailTriageClassification,
  ): Promise<void> {
    const { error: updateError } = await supabase
      .from('ingested_threads')
      .update({
        classification,
        priority_score: classification.overall_priority_score,
        is_highlighted: classification.is_highlighted,
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId);

    if (updateError) {
      throw updateError;
    }
  }

  private async queueSummarizationIfNeeded(
    organizationId: string,
    userId: string | null,
    threadId: string,
    classification: EmailTriageClassification,
  ): Promise<void> {
    const hasMatches = classification.matches.length > 0;
    const isHighPriority = classification.overall_priority_score >= 50;

    if (!hasMatches && !isHighPriority) {
      return;
    }

    const { error: taskError } = await supabase.from('tasks').insert({
      organization_id: organizationId,
      user_id: userId,
      domain_action: 'email.summarize',
      status: 'queued',
      payload: { thread_id: threadId },
      topic: hasMatches ? classification.matches[0].topic : undefined,
    });

    if (taskError) {
      console.error(
        `Failed to create summarize task for thread ${threadId}:`,
        taskError,
      );
      return;
    }

    console.log(
      `[EmailTriageProcessor] Queued email.summarize for thread ${threadId} (priority=${classification.overall_priority_score}, matches=${classification.matches.length}).`,
    );
  }

  private async logThreadTriage(
    task: Task,
    threadId: string,
    subject: string | null,
    classification: EmailTriageClassification,
  ): Promise<void> {
    try {
      await AuditLogger.flush(
        task.organization_id,
        task.id || null,
        task.user_id || 'agent-controller',
        `Triaged thread: ${subject ?? 'Unknown Subject'}`,
        [
          AuditLogger.createStep(
            'Email Triage',
            `Classification complete: ${classification.overall_priority_score}% priority`,
            {
              input_summary: `Subject: ${subject ?? 'Unknown Subject'}`,
              output_summary: `Matches: ${classification.matches.length}, Highlighted: ${classification.is_highlighted}`,
            },
          ),
        ],
        [
          {
            source_type: 'email',
            source_id: threadId,
            description: `Triaged email: ${subject ?? 'Unknown Subject'}`,
          },
        ],
      );
    } catch (error) {
      console.error(
        `Failed to write audit log for triaged thread ${threadId}:`,
        error,
      );
    }
  }

  private async alertForTopicMatches(
    task: Task,
    thread: UnclassifiedThread,
    classification: EmailTriageClassification,
  ): Promise<void> {
    if (!classification.is_highlighted || classification.matches.length === 0) {
      return;
    }

    try {
      await topicWatchAlertService.alertForMatchedThread({
        organizationId: task.organization_id,
        userId: task.user_id ?? null,
        sourceTaskId: task.id ?? null,
        thread,
        classification,
      });
    } catch (error) {
      console.error(
        `[EmailTriageProcessor] Failed to emit topic-watch alert for thread ${thread.id}:`,
        error,
      );

      try {
        await AuditLogger.flush(
          task.organization_id,
          task.id || null,
          task.user_id || 'agent-controller',
          'topic_watch_alert_failed',
          [
            AuditLogger.createStep(
              'Topic Watch Alert',
              'Failed to emit matched-topic alert after successful triage; triage result was preserved.',
              {
                input_summary: `Thread: ${thread.id}`,
                output_summary: this.formatErrorForLog(error),
              },
            ),
          ],
          [
            {
              source_type: 'email',
              source_id: thread.id,
              description: 'Topic watch alert delivery failed',
            },
          ],
        );
      } catch (auditError) {
        console.error('Failed to log topic-watch alert failure:', auditError);
      }
    }
  }

  private async logSnippetExtractionSummary(
    task: Task,
    threadIds: string[],
  ): Promise<void> {
    const sampleThreadIds = threadIds.slice(0, MAX_LOGGED_THREAD_IDS);
    const omittedCount = threadIds.length - sampleThreadIds.length;
    const sampledThreadIdText = sampleThreadIds.join(', ');
    const sampledSuffix = omittedCount > 0 ? ` (+${omittedCount} more)` : '';

    console.warn(
      `[EmailTriageProcessor] Missing plaintext snippet for ${threadIds.length} thread(s). Using empty snippet fallback. Sample thread IDs: ${sampledThreadIdText}${sampledSuffix}`,
    );

    try {
      await AuditLogger.flush(
        task.organization_id,
        task.id || null,
        'agent-controller',
        'snippet_extraction_summary',
        [
          AuditLogger.createStep(
            'Snippet Extraction',
            `No snippet found in metadata.snippet, summary, or summary_json for ${threadIds.length} thread(s).`,
            {
              input_summary: `Sample thread IDs: ${sampledThreadIdText}${sampledSuffix}`,
              output_summary: 'Used empty snippet fallback for batched triage prompt generation.',
            },
          ),
        ],
        sampleThreadIds.map((threadId) => ({
          source_type: 'email',
          source_id: threadId,
          description: 'Missing plaintext snippet during batched triage',
        })),
      );
    } catch (error) {
      console.error('Failed to log snippet extraction failure:', error);
    }
  }

  private resolveRetryContext(payload: unknown): RetryContext {
    if (!payload || typeof payload !== 'object') {
      return { requestedThreadIds: [], retryAttempt: 0, isScopedRetry: false };
    }

    const record = payload as Record<string, unknown>;
    const isScopedRetry = Object.prototype.hasOwnProperty.call(record, 'thread_ids');
    const requestedThreadIds = Array.isArray(record.thread_ids)
      ? Array.from(
          new Set(
            record.thread_ids.flatMap((value) => {
              if (typeof value !== 'string') {
                return [];
              }

              const normalizedValue = value.trim();
              return normalizedValue.length > 0 ? [normalizedValue] : [];
            }),
          ),
        )
      : [];

    const retryAttemptCandidate = record.retry_attempt;
    const parsedRetryAttempt =
      typeof retryAttemptCandidate === 'number'
        ? retryAttemptCandidate
        : typeof retryAttemptCandidate === 'string'
          ? Number.parseInt(retryAttemptCandidate, 10)
          : 0;

    const retryAttempt = Number.isNaN(parsedRetryAttempt)
      || parsedRetryAttempt < 0
      || parsedRetryAttempt > MAX_TRIAGE_RETRY_ATTEMPTS
      ? 0
      : Math.floor(parsedRetryAttempt);

    return {
      requestedThreadIds,
      retryAttempt,
      isScopedRetry,
    };
  }

  private buildBatchPrompt(
    batch: TokenAwareBatch<TriageBatchPayload>,
    topics: WatchTopic[],
  ): string {
    const topicsBlock = topics
      .map((topic) => {
        const keywords = Array.isArray(topic.keywords_array)
          ? topic.keywords_array.filter((keyword) => typeof keyword === 'string' && keyword.trim().length > 0)
          : [];
        const keywordText = keywords.length > 0 ? `; Keywords: ${keywords.join(', ')}` : '';
        return `- ${topic.topic} (Priority: ${topic.priority}${keywordText})`;
      })
      .join('\n');

    const emailsBlock = batch.items
      .map((item, index) => {
        const snippet = item.payload.filteredSnippet || 'No snippet provided';
        const subject = item.payload.filteredSubject || 'No subject provided';

        return [
          `EMAIL ${index + 1}`,
          `THREAD_ID: ${item.id}`,
          `SUBJECT: ${subject}`,
          `SNIPPET: ${snippet}`,
        ].join('\n');
      })
      .join('\n\n');

    return `
You are classifying multiple emails against watch topics.

WATCH TOPICS:
${topicsBlock}

EMAILS TO TRIAGE:
${emailsBlock}

CRITICAL INSTRUCTIONS:
- Return one result for EVERY THREAD_ID listed above.
- If no watch topics match, still evaluate actionability and urgency.
- Automated notifications/newsletters/spam should generally get low scores.
- Direct requests, deadlines, and critical updates should get scores >= 50.

RETURN ONLY A JSON OBJECT. Do not wrap the response in markdown fences.
The JSON object must follow this exact structure:
{
  "results": [
    {
      "thread_id": "thread-id",
      "classification": {
        "matches": [
          {
            "topic": "Topic Name",
            "reason": "Reason",
            "priority_score": 0
          }
        ],
        "overall_priority_score": 0,
        "is_highlighted": false
      }
    }
  ]
}
`.trim();
  }

  private extractSnippet(thread: UnclassifiedThread): string {
    const metadataSnippetCandidate =
      thread.metadata && typeof thread.metadata === 'object'
        ? (thread.metadata as { snippet?: unknown }).snippet
        : undefined;

    if (
      typeof metadataSnippetCandidate === 'string'
      && metadataSnippetCandidate.trim().length > 0
    ) {
      return metadataSnippetCandidate.trim();
    }

    if (typeof thread.summary === 'string' && thread.summary.trim().length > 0) {
      return thread.summary.trim();
    }

    const summaryContextCandidate =
      thread.summary_json && typeof thread.summary_json === 'object'
        ? (thread.summary_json as { context?: unknown }).context
        : undefined;

    if (
      typeof summaryContextCandidate === 'string'
      && summaryContextCandidate.trim().length > 0
    ) {
      return summaryContextCandidate.trim();
    }

    const summarySnippetCandidate =
      thread.summary_json && typeof thread.summary_json === 'object'
        ? (thread.summary_json as { snippet?: unknown }).snippet
        : undefined;

    if (
      typeof summarySnippetCandidate === 'string'
      && summarySnippetCandidate.trim().length > 0
    ) {
      return summarySnippetCandidate.trim();
    }

    return '';
  }

  private recoverClassificationPII(
    classification: EmailTriageClassification,
    guard: PerimeterGuard,
  ): EmailTriageClassification {
    return {
      ...classification,
      matches: classification.matches.map((match) => ({
        ...match,
        reason: guard.recoverPII(match.reason),
      })),
    };
  }

  private async retryExternalOperation<T>(
    operation: () => Promise<T>,
    retries: number = 3,
    delayMs: number = 1_000,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retries > 0 && this.isRetryableExternalError(error)) {
        console.warn(
          `[EmailTriageProcessor] Retryable external failure. Retrying in ${delayMs}ms (${retries} retries left).`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.retryExternalOperation(operation, retries - 1, delayMs * 2);
      }

      throw error;
    }
  }

  private isRetryableExternalError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const maybeError = error as {
      code?: number | string;
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const normalizedCode =
      typeof maybeError.code === 'string'
        ? Number.parseInt(maybeError.code, 10)
        : maybeError.code;

    const httpStatus =
      maybeError.status
      ?? maybeError.statusCode
      ?? (typeof normalizedCode === 'number' ? normalizedCode : undefined);

    if (typeof httpStatus === 'number') {
      return httpStatus === 429 || httpStatus >= 500;
    }

    return typeof maybeError.message === 'string'
      ? /rate limit|429|5\d\d/i.test(maybeError.message)
      : false;
  }

  private classifyFailureHint(error: unknown): FailureHint {
    if (this.isRetryableExternalError(error)) {
      return 'retryable_external_failure';
    }

    if (isStructuredOutputError(error)) {
      if (
        error.metadata.exhausted
        && error.metadata.kind === 'json_parse_failure'
      ) {
        return 'parse_exhausted_failure';
      }

      return error.metadata.kind;
    }

    if (error instanceof Error) {
      if (/Structured output validation failed/i.test(error.message)) {
        return 'schema_validation_failure';
      }

      if (/JSON/i.test(error.message)) {
        return 'json_parse_failure';
      }
    }

    return 'non_retryable_failure';
  }

  private formatErrorForLog(error: unknown): string {
    if (!error || typeof error !== 'object') {
      return String(error);
    }

    const maybeError = error as Error & {
      message?: unknown;
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      response?: {
        status?: unknown;
        statusText?: unknown;
      };
    };

    const parts: string[] = [];

    if (typeof maybeError.message === 'string' && maybeError.message.length > 0) {
      parts.push(maybeError.message);
    }

    const status =
      maybeError.status
      ?? maybeError.statusCode
      ?? maybeError.response?.status;

    if (typeof status === 'number' || typeof status === 'string') {
      parts.push(`status=${status}`);
    }

    if (typeof maybeError.code === 'number' || typeof maybeError.code === 'string') {
      parts.push(`code=${maybeError.code}`);
    }

    if (typeof maybeError.response?.statusText === 'string' && maybeError.response.statusText.length > 0) {
      parts.push(`statusText=${maybeError.response.statusText}`);
    }

    if (parts.length > 0) {
      return parts.join(' | ');
    }

    return '[non-serializable error object]';
  }

  private resolveBatchInputTokenBudget(): number {
    const configured = Number.parseInt(
      process.env.TRIAGE_BATCH_INPUT_TOKENS || `${DEFAULT_BATCH_INPUT_TOKENS}`,
      10,
    );

    if (Number.isNaN(configured)) {
      return DEFAULT_BATCH_INPUT_TOKENS;
    }

    return Math.min(
      MAX_BATCH_INPUT_TOKENS,
      Math.max(MIN_BATCH_INPUT_TOKENS, configured),
    );
  }

  private resolveBatchConcurrencyLimit(): number {
    const configured = Number.parseInt(
      process.env.TRIAGE_BATCH_CONCURRENCY || `${DEFAULT_BATCH_CONCURRENCY}`,
      10,
    );

    if (Number.isNaN(configured)) {
      return DEFAULT_BATCH_CONCURRENCY;
    }

    return Math.min(
      MAX_BATCH_CONCURRENCY,
      Math.max(MIN_BATCH_CONCURRENCY, configured),
    );
  }

  private resolveOutputTokenReserve(): number {
    const configured = Number.parseInt(
      process.env.TRIAGE_BATCH_OUTPUT_TOKENS || `${DEFAULT_OUTPUT_TOKEN_RESERVE}`,
      10,
    );

    if (Number.isNaN(configured)) {
      return DEFAULT_OUTPUT_TOKEN_RESERVE;
    }

    return Math.max(500, configured);
  }
  private buildProcessResultMessage(
    processedCount: number,
    batchCount: number,
    unresolvedCount: number,
    nonRetryableCount: number,
    retryResult: RetryQueueResult,
  ): string {
    if (unresolvedCount === 0 && nonRetryableCount === 0) {
      return `Successfully triaged ${processedCount} threads across ${batchCount} batch(es)`;
    }

    const nonRetryableSuffix = nonRetryableCount > 0
      ? `; ${nonRetryableCount} thread(s) hit non-retryable parse exhaustion`
      : '';

    switch (retryResult.reason) {
      case 'queued':
        return `Triaged ${processedCount} threads across ${batchCount} batch(es); ${unresolvedCount} thread(s) were re-queued for retry ${retryResult.nextRetryAttempt}${nonRetryableSuffix}`;
      case 'retry_limit_reached':
        return `Triaged ${processedCount} threads across ${batchCount} batch(es); ${unresolvedCount} thread(s) reached the retry limit and remain unresolved${nonRetryableSuffix}`;
      case 'queue_failed':
        return `Triaged ${processedCount} threads across ${batchCount} batch(es); ${unresolvedCount} thread(s) could not be re-queued because follow-up task creation failed${nonRetryableSuffix}`;
      default:
        if (unresolvedCount > 0) {
          return `Triaged ${processedCount} threads across ${batchCount} batch(es); ${unresolvedCount} thread(s) remain unresolved${nonRetryableSuffix}`;
        }

        return `Triaged ${processedCount} threads across ${batchCount} batch(es)${nonRetryableSuffix}`;
    }
  }
}
