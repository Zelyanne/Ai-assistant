import { config } from '../config/index.js';
import { AuditLogger } from './AuditLogger.js';
import { supabase } from './supabase.js';

const DEFAULT_CHECK_INTERVAL_MS = 60 * 1000;
const DEFAULT_MAX_FAILURES = 3;
const MAX_CATCH_UP_RUNS_PER_CYCLE = 100;

type CronField = {
  type: 'any' | 'step' | 'exact';
  value?: number;
};

type ZonedDateParts = {
  minute: number;
  hour: number;
  day: number;
  month: number;
  weekday: number;
};

type UserScheduleRow = {
  id: string;
  organization_id: string;
  user_id: string;
  task_type: string;
  task_payload: Record<string, unknown>;
  cron_expression: string;
  timezone: string;
  is_active: boolean;
  next_run: string;
  last_run: string | null;
  failure_count: number;
  last_error: string | null;
};

type CronSchedulerServiceDeps = {
  now?: () => Date;
  checkIntervalMs?: number;
  maxFailures?: number;
  supabaseClient?: {
    from: (table: string) => any;
  };
  auditLogger?: {
    flush: (...args: any[]) => Promise<void>;
  };
};

function parseCronField(rawField: string): CronField {
  const field = rawField.trim();
  if (field === '*') {
    return { type: 'any' };
  }

  if (field.startsWith('*/')) {
    const step = Number(field.slice(2));
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`Invalid step cron field: ${rawField}`);
    }

    return {
      type: 'step',
      value: step,
    };
  }

  const exact = Number(field);
  if (!Number.isInteger(exact) || exact < 0) {
    throw new Error(`Invalid exact cron field: ${rawField}`);
  }

  return {
    type: 'exact',
    value: exact,
  };
}

function matchesField(field: CronField, value: number): boolean {
  if (field.type === 'any') {
    return true;
  }

  if (field.type === 'step') {
    return value % (field.value as number) === 0;
  }

  return value === field.value;
}

function parseWeekday(value: string): number {
  const normalized = value.toLowerCase();
  if (normalized.startsWith('sun')) return 0;
  if (normalized.startsWith('mon')) return 1;
  if (normalized.startsWith('tue')) return 2;
  if (normalized.startsWith('wed')) return 3;
  if (normalized.startsWith('thu')) return 4;
  if (normalized.startsWith('fri')) return 5;
  return 6;
}

function getZonedDateParts(date: Date, timezone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);

  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '1');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '1');
  const weekday = parseWeekday(parts.find((part) => part.type === 'weekday')?.value ?? 'sun');

  return {
    minute,
    hour,
    day,
    month,
    weekday,
  };
}

function parseCronExpression(cronExpression: string): [CronField, CronField, CronField, CronField, CronField] {
  const fields = cronExpression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }

  return [
    parseCronField(fields[0]),
    parseCronField(fields[1]),
    parseCronField(fields[2]),
    parseCronField(fields[3]),
    parseCronField(fields[4]),
  ];
}

export function computeNextRunFromCron(
  cronExpression: string,
  timezone: string,
  fromDate: Date,
): Date {
  const [minuteField, hourField, dayField, monthField, weekdayField] = parseCronExpression(cronExpression);

  const cursor = new Date(fromDate.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  const maxLookAheadMinutes = 366 * 24 * 60;

  for (let i = 0; i < maxLookAheadMinutes; i += 1) {
    const zoned = getZonedDateParts(cursor, timezone);

    if (
      matchesField(minuteField, zoned.minute)
      && matchesField(hourField, zoned.hour)
      && matchesField(dayField, zoned.day)
      && matchesField(monthField, zoned.month)
      && matchesField(weekdayField, zoned.weekday)
    ) {
      return new Date(cursor.getTime());
    }

    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }

  throw new Error(`Could not compute next cron run for ${cronExpression} (${timezone})`);
}

export class CronSchedulerService {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly now: () => Date;
  private readonly checkIntervalMs: number;
  private readonly maxFailures: number;
  private readonly supabaseClient: {
    from: (table: string) => any;
  };
  private readonly auditLogger: {
    flush: (...args: any[]) => Promise<void>;
  };

  constructor(deps: CronSchedulerServiceDeps = {}) {
    this.now = deps.now ?? (() => new Date());
    this.checkIntervalMs = deps.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.maxFailures = deps.maxFailures ?? Number(process.env.MAX_SCHEDULE_FAILURES ?? DEFAULT_MAX_FAILURES);
    this.supabaseClient = deps.supabaseClient ?? supabase;
    this.auditLogger = deps.auditLogger ?? AuditLogger;
  }

  start(): void {
    console.log('[CronSchedulerService] Starting cron scheduler monitor...');
    this.intervalId = setInterval(() => {
      void this.runCycle();
    }, this.checkIntervalMs);
    void this.runCycle();
  }

  stop(): void {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  async runCycle(): Promise<void> {
    const now = this.now();

    const { data, error } = await this.supabaseClient
      .from('user_schedules')
      .select('*')
      .eq('is_active', true)
      .lte('next_run', now.toISOString());

    if (error) {
      console.error('[CronSchedulerService] Failed to load due schedules:', error.message);
      return;
    }

    const schedules = (data ?? []) as UserScheduleRow[];

    for (const schedule of schedules) {
      await this.processDueSchedule(schedule, now);
    }
  }

  private async processDueSchedule(schedule: UserScheduleRow, now: Date): Promise<void> {
    let dispatchCursor = new Date(schedule.next_run);
    let dispatchedRuns = 0;

    while (dispatchCursor.getTime() <= now.getTime() && dispatchedRuns < MAX_CATCH_UP_RUNS_PER_CYCLE) {
      const dispatchWindowStart = dispatchCursor.toISOString();
      const nextScheduledRun = computeNextRunFromCron(
        schedule.cron_expression,
        schedule.timezone || 'UTC',
        dispatchCursor,
      );
      const dispatchWindowEnd = nextScheduledRun.toISOString();

      const dispatchClaim = await this.claimDispatchWindow(
        schedule,
        dispatchWindowStart,
        dispatchWindowEnd,
      );

      if (dispatchClaim) {
        const payload: Record<string, unknown> = {
          ...schedule.task_payload,
          schedule_id: schedule.id,
          schedule_dispatch_id: dispatchClaim,
          cron_expression: schedule.cron_expression,
          timezone: schedule.timezone,
          scheduled: true,
          trigger_time: dispatchWindowStart,
        };

        const { data: taskRow, error: taskError } = await this.supabaseClient
          .from('tasks')
          .insert({
            organization_id: schedule.organization_id,
            user_id: schedule.user_id,
            domain_action: schedule.task_type,
            topic: 'Schedule',
            status: 'queued',
            payload,
          })
          .select('id')
          .single();

        if (taskError || !taskRow?.id) {
          await this.releaseDispatchClaim(dispatchClaim);
          await this.recordFailure(schedule, taskError?.message ?? 'Failed to queue scheduled task');
          return;
        }

        await this.attachTaskToDispatch(dispatchClaim, taskRow.id);

        const nowIso = now.toISOString();
        await this.auditLogger.flush(
          schedule.organization_id,
          taskRow.id,
          'agent-controller',
          'schedule_execution_dispatched',
          [
            {
              timestamp: nowIso,
              step_name: 'Schedule Dispatch',
              message: `Queued ${schedule.task_type} from schedule ${schedule.id}`,
              input_summary: `cron=${schedule.cron_expression}; timezone=${schedule.timezone}; trigger_time=${dispatchWindowStart}`,
              output_summary: `task_id=${taskRow.id}; dispatch_window_end=${dispatchWindowEnd}`,
            },
          ],
          [],
        );
      }

      dispatchCursor = nextScheduledRun;
      dispatchedRuns += 1;
    }

    if (dispatchCursor.getTime() <= now.getTime()) {
      console.warn(`[CronSchedulerService] Catch-up capped at ${MAX_CATCH_UP_RUNS_PER_CYCLE} runs for schedule ${schedule.id}`);
    }
  }

  private async claimDispatchWindow(
    schedule: UserScheduleRow,
    dispatchWindowStart: string,
    dispatchWindowEnd: string,
  ): Promise<string | null> {
    const { data: existing, error: existingError } = await this.supabaseClient
      .from('user_schedule_dispatches')
      .select('id')
      .eq('schedule_id', schedule.id)
      .eq('dispatch_window_start', dispatchWindowStart)
      .maybeSingle();

    if (existingError) {
      console.error('[CronSchedulerService] Failed schedule dispatch idempotency check:', existingError.message);
      return null;
    }

    if (existing?.id) {
      return null;
    }

    const { data: inserted, error: insertError } = await this.supabaseClient
      .from('user_schedule_dispatches')
      .insert({
        organization_id: schedule.organization_id,
        schedule_id: schedule.id,
        dispatch_window_start: dispatchWindowStart,
        dispatch_window_end: dispatchWindowEnd,
      })
      .select('id')
      .single();

    if (insertError || !inserted?.id) {
      if (insertError?.code === '23505') {
        return null;
      }

      console.error('[CronSchedulerService] Failed to claim schedule dispatch window:', insertError?.message);
      return null;
    }

    return inserted.id;
  }

  private async attachTaskToDispatch(dispatchId: string, taskId: string): Promise<void> {
    const { error } = await this.supabaseClient
      .from('user_schedule_dispatches')
      .update({ task_id: taskId })
      .eq('id', dispatchId);

    if (error) {
      console.error(`[CronSchedulerService] Failed to link task ${taskId} to dispatch ${dispatchId}: ${error.message}`);
    }
  }

  private async releaseDispatchClaim(dispatchId: string): Promise<void> {
    const { error } = await this.supabaseClient
      .from('user_schedule_dispatches')
      .delete()
      .eq('id', dispatchId);

    if (error) {
      console.error(`[CronSchedulerService] Failed to release dispatch ${dispatchId}: ${error.message}`);
    }
  }

  private async recordFailure(schedule: UserScheduleRow, message: string): Promise<void> {
    const nextFailureCount = (schedule.failure_count ?? 0) + 1;
    const disableSchedule = nextFailureCount >= this.maxFailures;
    const nowIso = this.now().toISOString();

    const { error } = await this.supabaseClient
      .from('user_schedules')
      .update({
        failure_count: nextFailureCount,
        last_error: message,
        is_active: disableSchedule ? false : schedule.is_active,
        updated_at: nowIso,
      })
      .eq('id', schedule.id);

    if (error) {
      console.error(`[CronSchedulerService] Failed to persist failure for schedule ${schedule.id}: ${error.message}`);
    }

    const actionTaken = disableSchedule
      ? 'schedule_execution_disabled_after_failures'
      : 'schedule_execution_failed';

    await this.auditLogger.flush(
      schedule.organization_id,
      null,
      'agent-controller',
      actionTaken,
      [
        {
          timestamp: nowIso,
          step_name: 'Schedule Failure',
          message: `Failed schedule ${schedule.id}: ${message}`,
          input_summary: `failure_count=${nextFailureCount}; max_failures=${this.maxFailures}`,
          output_summary: disableSchedule ? 'schedule disabled' : 'schedule remains active',
        },
      ],
      [],
    );
  }
}

export const cronSchedulerService = new CronSchedulerService({
  checkIntervalMs: config.CRON_POLL_INTERVAL_MS,
  maxFailures: config.MAX_SCHEDULE_FAILURES,
});
