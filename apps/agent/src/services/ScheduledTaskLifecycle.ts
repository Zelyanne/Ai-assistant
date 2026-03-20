import type { Task } from '@ai-assistant/shared';
import { config } from '../config/index.js';
import { computeNextRunFromCron } from './CronSchedulerService.js';
import { supabase } from './supabase.js';

type ScheduledTaskContext = {
  scheduleId: string;
  cronExpression: string;
  timezone: string;
  triggerTime: string;
};

type UserScheduleStateRow = {
  id: string;
  failure_count: number;
  is_active: boolean;
  last_run: string | null;
  next_run: string;
};

type ScheduledTaskLifecycleDeps = {
  maxFailures?: number;
  now?: () => Date;
  supabaseClient?: {
    from: (table: string) => any;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function laterIso(left: string | null, right: string): string {
  if (!left) {
    return right;
  }

  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

export function getScheduledTaskContext(task: Task): ScheduledTaskContext | null {
  const payload = asRecord(task.payload);
  if (payload.scheduled !== true) {
    return null;
  }

  const scheduleId = asString(payload.schedule_id);
  const cronExpression = asString(payload.cron_expression);
  const timezone = asString(payload.timezone) ?? 'UTC';
  const triggerTime = asString(payload.trigger_time);

  if (!scheduleId || !cronExpression || !triggerTime) {
    return null;
  }

  return {
    scheduleId,
    cronExpression,
    timezone,
    triggerTime,
  };
}

export async function syncScheduledTaskCompletion(
  task: Task,
  status: string,
  errorMessage?: string | null,
  deps: ScheduledTaskLifecycleDeps = {},
): Promise<void> {
  const context = getScheduledTaskContext(task);
  if (!context) {
    return;
  }

  const supabaseClient = deps.supabaseClient ?? supabase;
  const now = deps.now ?? (() => new Date());
  const maxFailures = deps.maxFailures ?? config.MAX_SCHEDULE_FAILURES;

  const { data, error } = await supabaseClient
    .from('user_schedules')
    .select('id, last_run, next_run, failure_count, is_active')
    .eq('id', context.scheduleId)
    .eq('organization_id', task.organization_id)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? `Scheduled task row not found: ${context.scheduleId}`);
  }

  const schedule = data as UserScheduleStateRow;
  const computedNextRunIso = computeNextRunFromCron(
    context.cronExpression,
    context.timezone,
    new Date(context.triggerTime),
  ).toISOString();
  const nextRun = laterIso(schedule.next_run, computedNextRunIso);
  const updateBase = {
    next_run: nextRun,
    updated_at: now().toISOString(),
  };

  if (status === 'done') {
    const { error: updateError } = await supabaseClient
      .from('user_schedules')
      .update({
        ...updateBase,
        last_run: laterIso(schedule.last_run, context.triggerTime),
        failure_count: 0,
        last_error: null,
      })
      .eq('id', context.scheduleId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return;
  }

  const nextFailureCount = (schedule.failure_count ?? 0) + 1;
  const disableSchedule = nextFailureCount >= maxFailures;
  const message = errorMessage?.trim() || `Scheduled task ended with status ${status}`;

  const { error: updateError } = await supabaseClient
    .from('user_schedules')
    .update({
      ...updateBase,
      failure_count: nextFailureCount,
      last_error: message,
      is_active: disableSchedule ? false : schedule.is_active,
    })
    .eq('id', context.scheduleId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}
