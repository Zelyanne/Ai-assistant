import { computed, ref } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';

type UserScheduleInput = {
  task_type: string;
  task_payload?: Record<string, unknown>;
  cron_expression: string;
  timezone?: string;
  is_active?: boolean;
};

export type UserScheduleRecord = Omit<UserScheduleInput, 'timezone' | 'is_active'> & {
  id: string;
  timezone: string;
  is_active: boolean;
  next_run: string;
  last_run?: string | null;
  failure_count?: number;
  last_error?: string | null;
};

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

function withComputedNextRun(input: UserScheduleInput, fromDate: Date): UserScheduleInput & { next_run: string } {
  const timezone = input.timezone?.trim() || 'UTC';

  return {
    ...input,
    timezone,
    next_run: computeNextRunFromCron(input.cron_expression, timezone, fromDate).toISOString(),
  };
}

export function useSchedules() {
  const userStore = useUserStore();
  const db = supabase as any;
  const loading = ref(false);
  const error = ref<string | null>(null);

  const organizationId = computed(() => userStore.profile?.organization_id ?? null);
  const userId = computed(() => userStore.profile?.id ?? null);

  function requireScope(): { organization_id: string; user_id: string } | null {
    if (!organizationId.value || !userId.value) {
      error.value = 'Missing organization or user context';
      return null;
    }

    return {
      organization_id: organizationId.value,
      user_id: userId.value,
    };
  }

  async function listSchedules(): Promise<UserScheduleRecord[]> {
    const scope = requireScope();
    if (!scope) return [];

    loading.value = true;
    error.value = null;
    try {
      const { data, error: queryError } = await db
        .from('user_schedules')
        .select('*')
        .eq('organization_id', scope.organization_id)
        .eq('user_id', scope.user_id)
        .order('next_run', { ascending: true });

      if (queryError) {
        throw queryError;
      }

      return (data ?? []) as UserScheduleRecord[];
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      return [];
    } finally {
      loading.value = false;
    }
  }

  async function createSchedule(input: UserScheduleInput): Promise<UserScheduleRecord | null> {
    const scope = requireScope();
    if (!scope) return null;

    loading.value = true;
    error.value = null;
    try {
      const payload = withComputedNextRun(input, new Date());
      const { data, error: insertError } = await db
        .from('user_schedules')
        .insert({
          organization_id: scope.organization_id,
          user_id: scope.user_id,
          task_type: payload.task_type,
          task_payload: payload.task_payload ?? {},
          cron_expression: payload.cron_expression,
          timezone: payload.timezone,
          is_active: payload.is_active ?? true,
          next_run: payload.next_run,
        })
        .select('*')
        .single();

      if (insertError) {
        throw insertError;
      }

      return data as UserScheduleRecord;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function updateSchedule(scheduleId: string, input: UserScheduleInput): Promise<boolean> {
    const scope = requireScope();
    if (!scope) return false;

    loading.value = true;
    error.value = null;
    try {
      const payload = withComputedNextRun(input, new Date());
      const { error: updateError } = await db
        .from('user_schedules')
        .update({
          task_type: payload.task_type,
          task_payload: payload.task_payload ?? {},
          cron_expression: payload.cron_expression,
          timezone: payload.timezone,
          is_active: payload.is_active ?? true,
          next_run: payload.next_run,
          updated_at: new Date().toISOString(),
        })
        .eq('id', scheduleId)
        .eq('organization_id', scope.organization_id)
        .eq('user_id', scope.user_id);

      if (updateError) {
        throw updateError;
      }

      return true;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function pauseSchedule(scheduleId: string): Promise<boolean> {
    return await updateScheduleState(scheduleId, false);
  }

  async function resumeSchedule(schedule: Pick<UserScheduleRecord, 'id' | 'cron_expression' | 'timezone'>): Promise<boolean> {
    return await updateScheduleState(schedule.id, true, schedule.cron_expression, schedule.timezone);
  }

  async function deleteSchedule(scheduleId: string): Promise<boolean> {
    const scope = requireScope();
    if (!scope) return false;

    loading.value = true;
    error.value = null;
    try {
      const { error: deleteError } = await db
        .from('user_schedules')
        .delete()
        .eq('id', scheduleId)
        .eq('organization_id', scope.organization_id)
        .eq('user_id', scope.user_id);

      if (deleteError) {
        throw deleteError;
      }

      return true;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function updateScheduleState(
    scheduleId: string,
    isActive: boolean,
    cronExpression?: string,
    timezone?: string,
  ): Promise<boolean> {
    const scope = requireScope();
    if (!scope) return false;

    loading.value = true;
    error.value = null;
    try {
      const patch: Record<string, unknown> = {
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };

      if (isActive && cronExpression) {
        patch.next_run = computeNextRunFromCron(cronExpression, timezone?.trim() || 'UTC', new Date()).toISOString();
      }

      const { error: updateError } = await db
        .from('user_schedules')
        .update(patch)
        .eq('id', scheduleId)
        .eq('organization_id', scope.organization_id)
        .eq('user_id', scope.user_id);

      if (updateError) {
        throw updateError;
      }

      return true;
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    listSchedules,
    createSchedule,
    updateSchedule,
    pauseSchedule,
    resumeSchedule,
    deleteSchedule,
  };
}
