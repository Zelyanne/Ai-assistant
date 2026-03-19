import { z } from 'zod';
import { type Task } from '@ai-assistant/shared';
import { BaseProcessor, type ProcessorResult } from './BaseProcessor.js';
import {
  EODMemoryAggregator,
  type EODMemoryAggregatorOptions,
  type EODRotationResult,
  type EODSummaryInput,
} from '../services/EODMemoryAggregator.js';
import { LLMProviderFactory } from '../services/llm/factory.js';
import { AuditLogger } from '../services/AuditLogger.js';
import { PerimeterGuard } from '../guards/PerimeterGuard.js';
import { supabase } from '../services/supabase.js';

const EODPayloadSchema = z
  .object({
    eod_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    scheduled: z.boolean().optional(),
    target_user_id: z.string().min(1).optional(),
    trigger_time_utc: z.string().optional(),
  })
  .passthrough();

const EOD_SUMMARY_PROMPT = [
  'You are generating an end-of-day memory summary for an autonomous assistant.',
  'Summarize the short-term memory into concise, decision-focused bullets.',
  'Output requirements:',
  '- Keep between 3 and 8 bullet points.',
  '- Focus on outcomes, blockers, commitments, and notable decisions.',
  '- No markdown heading, only bullet lines.',
  '- Do not invent facts.',
].join('\n');

type EODMemoryProcessorOptions = {
  aggregator?: EODMemoryAggregator;
  aggregatorOptions?: Omit<EODMemoryAggregatorOptions, 'summarizeDailyMemoryWithLLM'>;
};

type EODPayload = z.infer<typeof EODPayloadSchema>;

function cleanTextOutput(value: string): string {
  return value
    .replace(/^```(?:markdown|md|text)?\n?/i, '')
    .replace(/\n?```$/, '')
    .trim();
}

function resolveEodDate(payload: EODPayload): Date {
  if (!payload.eod_date) {
    return new Date();
  }

  return new Date(`${payload.eod_date}T00:00:00.000Z`);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

export class EODMemoryProcessor extends BaseProcessor {
  private readonly guard = new PerimeterGuard();
  private readonly aggregator: EODMemoryAggregator;

  constructor(options: EODMemoryProcessorOptions = {}) {
    super();

    this.aggregator =
      options.aggregator ??
      new EODMemoryAggregator({
        ...options.aggregatorOptions,
        summarizeDailyMemoryWithLLM: (input) => this.generateLLMSummary(input),
      });
  }

  private async generateLLMSummary(input: EODSummaryInput): Promise<string> {
    const llm = LLMProviderFactory.getProvider();
    const redactedMemory = this.guard.redactPII(input.shortTermMemory);
    const prompt = [
      EOD_SUMMARY_PROMPT,
      '',
      `Organization ID: ${input.organizationId}`,
      `User ID: ${input.userId}`,
      `Date: ${input.date.toISOString().slice(0, 10)}`,
      '',
      'Short-term memory content:',
      redactedMemory,
    ].join('\n');

    const llmResult = await llm.generateText(prompt, {
      temperature: 0.2,
      maxTokens: 500,
    });

    const cleaned = cleanTextOutput(llmResult.data);
    return this.guard.recoverPII(cleaned);
  }

  private async resolveTargetUserIds(
    task: Task,
    payload: EODPayload,
  ): Promise<string[]> {
    if (task.user_id) {
      return [task.user_id];
    }

    if (payload.target_user_id) {
      return [payload.target_user_id];
    }

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('organization_id', task.organization_id);

    if (error) {
      throw new Error(`Failed to load organization profiles: ${error.message}`);
    }

    return unique(((profiles ?? []) as Array<{ id: string }>).map((profile) => profile.id));
  }

  async process(task: Task): Promise<ProcessorResult> {
    this.clearTrace();

    if (task.domain_action !== 'eod.memory.rotate') {
      throw new Error(`EODMemoryProcessor cannot handle domain_action=${task.domain_action}`);
    }

    const payload = EODPayloadSchema.parse(task.payload ?? {});
    const eodDate = resolveEodDate(payload);
    const eodDay = eodDate.toISOString().slice(0, 10);

    this.addTraceStep(
      'eod_rotation_started',
      `Starting EOD rotation for org ${task.organization_id} on ${eodDay}`,
      1,
    );

    const targetUserIds = await this.resolveTargetUserIds(task, payload);
    this.addTraceStep(
      'eod_rotation_scope_resolved',
      targetUserIds.length > 0
        ? `Resolved ${targetUserIds.length} user memory scope(s) for EOD rotation`
        : 'No user-scoped memories found for EOD rotation',
      1,
    );

    const rotations: EODRotationResult[] = [];

    for (const userId of targetUserIds) {
      const rotation = await this.aggregator.rotateDailyMemory(
        task.organization_id,
        userId,
        eodDate,
      );
      rotations.push(rotation);

      if (rotation.status === 'rotated') {
        this.addTraceStep(
          'eod_rotation_user_completed',
          `Rotated memory for user ${userId}`,
          1,
        );
        continue;
      }

      if (rotation.status === 'already_rotated') {
        this.addTraceStep(
          'eod_rotation_user_skipped',
          `Skipped user ${userId}; EOD rotation already completed for ${eodDay}`,
          1,
        );
        continue;
      }

      this.addTraceStep(
        'eod_rotation_user_skipped',
        `Skipped user ${userId}; no meaningful short-term memory found`,
        1,
      );
    }

    const rotatedCount = rotations.filter((rotation) => rotation.status === 'rotated').length;
    const alreadyRotatedCount = rotations.filter(
      (rotation) => rotation.status === 'already_rotated',
    ).length;
    const skippedCount = rotations.filter(
      (rotation) => rotation.status === 'skipped_empty',
    ).length;

    this.addTraceStep(
      'eod_rotation_completed',
      `EOD rotation completed: rotated=${rotatedCount}, already_rotated=${alreadyRotatedCount}, skipped_empty=${skippedCount}`,
      1,
    );

    await AuditLogger.flush(
      task.organization_id,
      task.id ?? null,
      task.user_id ?? 'eod-memory-processor',
      'eod_memory_rotation_completed',
      this.getTrace(),
      rotations
        .filter((rotation) => rotation.status === 'rotated')
        .map((rotation) =>
          AuditLogger.createCitation(
            'memory',
            `${rotation.organizationId}:${rotation.userId}`,
            `EOD rotation applied to user-scoped memory for ${rotation.userId}`,
          ),
        ),
    );

    return {
      outcome: rotatedCount > 0 ? 'rotated' : 'no_changes',
      organization_id: task.organization_id,
      eod_date: eodDay,
      rotated_count: rotatedCount,
      already_rotated_count: alreadyRotatedCount,
      skipped_count: skippedCount,
      rotations,
      trace: this.getTrace(),
    };
  }
}
