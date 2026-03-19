import { fileURLToPath } from 'node:url';
import {
  MemoryService,
  type MemoryTaskState,
} from './MemoryService.js';

export const DEFAULT_EOD_MEMORY_ROOT = fileURLToPath(
  new URL('../../data/memory', import.meta.url),
);
export const SHORT_TERM_MEMORY_FILENAME = 'short-term.md';
export const WEEKLY_MEMORY_FILENAME = 'weekly-memory.md';
export const DEFAULT_SHORT_TERM_MEMORY = '# Short-Term Memory\n';
export const DEFAULT_WEEKLY_MEMORY = '# Weekly Memory\n';

export type EODSummaryInput = {
  organizationId: string;
  userId: string;
  date: Date;
  shortTermMemory: string;
};

export type EODSummaryGenerator = (
  input: EODSummaryInput,
) => Promise<string>;

export type EODRotationStatus = 'rotated' | 'already_rotated' | 'skipped_empty';

export type EODRotationResult = {
  status: EODRotationStatus;
  organizationId: string;
  userId: string;
  date: string;
  summary: string | null;
};

export type EODMemoryAggregatorOptions = {
  memoryRoot?: string;
  memoryService?: MemoryService;
  summarizeDailyMemoryWithLLM: EODSummaryGenerator;
};

function extractSummaryDay(summary: string): string | null {
  const match = /^## (\d{4}-\d{2}-\d{2})\n/.exec(summary.trimStart());
  return match?.[1] ?? null;
}

function hasSummaryForDay(weeklyMemory: string, day: string): boolean {
  return new RegExp(`(^|\\n)## ${day}(?:\\n|$)`).test(weeklyMemory);
}

function trimMeaningfulShortTermContent(value: string): string {
  return value
    .split('\n')
    .filter((line) => !/^#\s*Short-Term Memory\s*$/i.test(line.trim()))
    .join('\n')
    .trim();
}

export class EODMemoryAggregator {
  private readonly memoryService: MemoryService;
  private readonly summarizeDailyMemoryWithLLM: EODSummaryGenerator;

  constructor(options: EODMemoryAggregatorOptions) {
    this.memoryService =
      options.memoryService ??
      new MemoryService({
        memoryRoot: options.memoryRoot ?? DEFAULT_EOD_MEMORY_ROOT,
      });
    this.summarizeDailyMemoryWithLLM = options.summarizeDailyMemoryWithLLM;
  }

  private async readTaskState(
    organizationId: string,
    userId: string,
  ): Promise<MemoryTaskState> {
    return (
      (await this.memoryService.readMemoryIfExists(
        organizationId,
        userId,
        'task_state',
      )) ?? {}
    );
  }

  private async persistTaskState(
    organizationId: string,
    userId: string,
    patch: MemoryTaskState,
  ): Promise<void> {
    const currentTaskState = await this.readTaskState(organizationId, userId);
    await this.memoryService.writeMemory(organizationId, userId, 'task_state', {
      ...currentTaskState,
      ...patch,
      updated_at: new Date().toISOString(),
    });
  }

  private formatSummarySection(date: Date, summaryBody: string): string {
    const day = date.toISOString().slice(0, 10);
    return `## ${day}\n${summaryBody.trim()}\n`;
  }

  async summarizeDailyMemory(
    organizationId: string,
    userId: string,
    date: Date,
  ): Promise<string | null> {
    const shortTermMemory = await this.memoryService.readMemoryIfExists(
      organizationId,
      userId,
      'short_term',
    );

    if (!shortTermMemory) {
      return null;
    }

    if (trimMeaningfulShortTermContent(shortTermMemory).length === 0) {
      return null;
    }

    const llmSummary = await this.summarizeDailyMemoryWithLLM({
      organizationId,
      userId,
      date,
      shortTermMemory,
    });

    const normalizedSummary =
      llmSummary.trim().length > 0
        ? llmSummary.trim()
        : 'No significant short-term updates were captured today.';

    return this.formatSummarySection(date, normalizedSummary);
  }

  async appendToWeeklyMemory(
    organizationId: string,
    userId: string,
    summary: string,
  ): Promise<boolean> {
    const currentWeeklyMemory =
      (await this.memoryService.readMemoryIfExists(
        organizationId,
        userId,
        'weekly_memory',
      )) ?? DEFAULT_WEEKLY_MEMORY;

    const summaryDay = extractSummaryDay(summary);
    if (summaryDay && hasSummaryForDay(currentWeeklyMemory, summaryDay)) {
      return false;
    }

    const separator = currentWeeklyMemory.endsWith('\n\n') ? '' : '\n';
    const nextWeeklyMemory = `${currentWeeklyMemory}${separator}${summary.trim()}\n`;

    await this.memoryService.writeMemory(
      organizationId,
      userId,
      'weekly_memory',
      nextWeeklyMemory,
    );

    return true;
  }

  async resetShortTermMemory(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    await this.memoryService.writeMemory(
      organizationId,
      userId,
      'short_term',
      DEFAULT_SHORT_TERM_MEMORY,
    );
  }

  async rotateDailyMemory(
    organizationId: string,
    userId: string,
    date: Date,
  ): Promise<EODRotationResult> {
    const day = date.toISOString().slice(0, 10);
    const currentTaskState = await this.readTaskState(organizationId, userId);

    if (currentTaskState.last_eod_rotation_date === day) {
      return {
        status: 'already_rotated',
        organizationId,
        userId,
        date: day,
        summary: null,
      };
    }

    const summary = await this.summarizeDailyMemory(organizationId, userId, date);

    if (!summary) {
      const currentWeeklyMemory =
        (await this.memoryService.readMemoryIfExists(
          organizationId,
          userId,
          'weekly_memory',
        )) ?? '';

      return {
        status: hasSummaryForDay(currentWeeklyMemory, day)
          ? 'already_rotated'
          : 'skipped_empty',
        organizationId,
        userId,
        date: day,
        summary: null,
      };
    }

    await this.appendToWeeklyMemory(organizationId, userId, summary);
    await this.resetShortTermMemory(organizationId, userId);
    await this.persistTaskState(organizationId, userId, {
      last_eod_rotation_date: day,
      last_eod_rotation_status: 'rotated',
      last_eod_summary_at: new Date().toISOString(),
    });

    return {
      status: 'rotated',
      organizationId,
      userId,
      date: day,
      summary,
    };
  }
}
