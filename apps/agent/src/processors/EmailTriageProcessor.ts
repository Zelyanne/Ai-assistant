import {
  BatchedEmailTriageResultSchema,
  type EmailTriageClassification,
  type Task,
} from '@ai-assistant/shared';
import { BaseProcessor, type ProcessorResult } from './BaseProcessor.js';
import { supabase } from '../services/supabase.js';
import { PerimeterGuard } from '../guards/PerimeterGuard.js';
import { AuditLogger } from '../services/AuditLogger.js';
import { LLMProviderFactory } from '../services/llm/factory.js';
import { type ILLMProvider } from '../services/llm/types.js';
import {
  buildTokenAwareBatches,
  executeBatchesWithConcurrency,
  type TokenAwareBatch,
  type TokenAwareBatchInput,
} from '../services/emailBatching.js';

const DEFAULT_BATCH_INPUT_TOKENS = 13_000;
const MIN_BATCH_INPUT_TOKENS = 12_000;
const MAX_BATCH_INPUT_TOKENS = 14_000;
const DEFAULT_BATCH_CONCURRENCY = 3;
const MIN_BATCH_CONCURRENCY = 2;
const MAX_BATCH_CONCURRENCY = 4;
const DEFAULT_OUTPUT_TOKEN_RESERVE = 1_800;

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
}

interface TriageBatchPayload {
  thread: UnclassifiedThread;
  filteredSubject: string;
  filteredSnippet: string;
}

type TriageBatchItem = TokenAwareBatch<TriageBatchPayload>['items'][number];

interface BatchSummary {
  processedCount: number;
  unresolvedThreadIds: string[];
}

export class EmailTriageProcessor extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    console.log(
      `[EmailTriageProcessor][${task.id}] Processing email.triage with token-aware batching...`,
    );

    const { organization_id, user_id } = task;

    const { data: threads, error: threadError } = await supabase
      .from('ingested_threads')
      .select('id, subject, metadata, summary, summary_json')
      .eq('organization_id', organization_id)
      .eq('classification', '{}') as {
      data: UnclassifiedThread[] | null;
      error: unknown;
    };

    if (threadError) {
      throw threadError;
    }

    if (!threads || threads.length === 0) {
      return { message: 'No unclassified threads found', processed_count: 0 };
    }

    let topicQuery = supabase
      .from('watch_topics')
      .select('topic, priority')
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

    for (const thread of threads) {
      const snippet = this.extractSnippet(thread);

      if (!snippet) {
        await this.logSnippetExtractionFailure(task, thread);
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
    const unresolvedThreadIds = new Set<string>();

    for (const settledBatch of settledBatches) {
      if (settledBatch.status === 'fulfilled') {
        processedCount += settledBatch.value.processedCount;
        for (const threadId of settledBatch.value.unresolvedThreadIds) {
          unresolvedThreadIds.add(threadId);
        }
        continue;
      }

      const failedBatch = batches[settledBatch.index];
      console.error(
        `[EmailTriageProcessor] Batch ${failedBatch?.batchIndex ?? settledBatch.index + 1} failed (${this.classifyFailureHint(settledBatch.reason)}):`,
        settledBatch.reason,
      );

      if (failedBatch) {
        for (const batchItem of failedBatch.items) {
          unresolvedThreadIds.add(batchItem.id);
        }
      }
    }

    const unresolvedThreadIdList = [...unresolvedThreadIds];
    if (unresolvedThreadIdList.length > 0) {
      await this.queueTriageRetry(
        task.organization_id,
        task.user_id ?? null,
        unresolvedThreadIdList,
      );
    }

    return {
      message: unresolvedThreadIdList.length > 0
        ? `Triaged ${processedCount} threads across ${batches.length} batch(es); ${unresolvedThreadIdList.length} thread(s) were re-queued for retry`
        : `Successfully triaged ${processedCount} threads across ${batches.length} batch(es)`,
      processed_count: processedCount,
      task_id: task.id,
      skipped_thread_ids: unresolvedThreadIdList,
    };
  }

  private async processBatch(
    task: Task,
    batch: TokenAwareBatch<TriageBatchPayload>,
    topics: WatchTopic[],
    guard: PerimeterGuard,
    llmProvider: ILLMProvider,
  ): Promise<BatchSummary> {
    console.log(
      `[EmailTriageProcessor] Processing batch ${batch.batchIndex} (size=${batch.batchSize}, estimated_tokens=${batch.estimatedTokens}, concurrency_limit=${batch.concurrencyLimit})`,
    );

    const prompt = this.buildBatchPrompt(batch, topics);
    const llmResponse = await this.retryExternalOperation(async () =>
      llmProvider.generateStructured(prompt, BatchedEmailTriageResultSchema, {
        maxTokens: this.resolveOutputTokenReserve(),
      }),
    );

    const resultsByThreadId = new Map(
      llmResponse.data.map((item) => [item.thread_id, item.classification]),
    );

    let processedCount = 0;
    const unresolvedThreadIds: string[] = [];

    for (const item of batch.items) {
      const threadId = item.id;
      let classification: EmailTriageClassification | null | undefined =
        resultsByThreadId.get(threadId);

      if (!classification) {
        console.warn(
          `[EmailTriageProcessor] Batch ${batch.batchIndex} missing classification for thread ${threadId}; retrying as single-thread call.`,
        );

        classification = await this.classifySingleThreadFromBatchItem(
          item,
          topics,
          llmProvider,
        );

        if (!classification) {
          unresolvedThreadIds.push(threadId);
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
      unresolvedThreadIds,
    };
  }

  private async classifySingleThreadFromBatchItem(
    item: TriageBatchItem,
    topics: WatchTopic[],
    llmProvider: ILLMProvider,
  ): Promise<EmailTriageClassification | null> {
    const singleItemBatch: TokenAwareBatch<TriageBatchPayload> = {
      batchIndex: 1,
      batchSize: 1,
      estimatedTokens: item.estimatedTokens,
      concurrencyLimit: 1,
      items: [item],
    };

    try {
      const prompt = this.buildBatchPrompt(singleItemBatch, topics);
      const response = await this.retryExternalOperation(async () =>
        llmProvider.generateStructured(prompt, BatchedEmailTriageResultSchema, {
          maxTokens: this.resolveOutputTokenReserve(),
        }),
      );

      const result = response.data.find((entry) => entry.thread_id === item.id);
      if (!result) {
        console.warn(
          `[EmailTriageProcessor] Single-thread retry still missing classification for thread ${item.id}.`,
        );
        return null;
      }

      return result.classification;
    } catch (error) {
      console.error(
        `[EmailTriageProcessor] Single-thread retry failed for thread ${item.id}:`,
        error,
      );
      return null;
    }
  }

  private async queueTriageRetry(
    organizationId: string,
    userId: string | null,
    unresolvedThreadIds: string[],
  ): Promise<void> {
    if (unresolvedThreadIds.length === 0) {
      return;
    }

    const { error } = await supabase.from('tasks').insert({
      organization_id: organizationId,
      user_id: userId,
      domain_action: 'email.triage',
      status: 'queued',
      payload: {
        thread_ids: unresolvedThreadIds,
        retry_reason: 'missing_batch_classification',
      },
    });

    if (error) {
      console.error(
        `[EmailTriageProcessor] Failed to queue follow-up triage task for unresolved threads (${unresolvedThreadIds.join(', ')}):`,
        error,
      );
      return;
    }

    console.warn(
      `[EmailTriageProcessor] Queued follow-up email.triage for unresolved threads: ${unresolvedThreadIds.join(', ')}`,
    );
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

  private async logSnippetExtractionFailure(
    task: Task,
    thread: UnclassifiedThread,
  ): Promise<void> {
    console.warn(
      `[EmailTriageProcessor] No snippet found for thread ${thread.id}. Falling back to empty snippet.`,
    );

    try {
      await AuditLogger.flush(
        task.organization_id,
        task.id || null,
        'agent-controller',
        'snippet_extraction_failed',
        [
          AuditLogger.createStep(
            'Snippet Extraction',
            'Failed to find content in metadata.snippet or summary field',
          ),
        ],
        [
          {
            source_type: 'email',
            source_id: thread.id,
            description: `Thread: ${thread.subject ?? 'Unknown Subject'}`,
          },
        ],
      );
    } catch (error) {
      console.error('Failed to log snippet extraction failure:', error);
    }
  }

  private buildBatchPrompt(
    batch: TokenAwareBatch<TriageBatchPayload>,
    topics: WatchTopic[],
  ): string {
    const topicsBlock = topics
      .map((topic) => `- ${topic.topic} (Priority: ${topic.priority})`)
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

RETURN ONLY A JSON ARRAY. Every item must follow this exact structure:
[
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

  private classifyFailureHint(error: unknown): string {
    if (this.isRetryableExternalError(error)) {
      return 'retryable_external_failure';
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
}
