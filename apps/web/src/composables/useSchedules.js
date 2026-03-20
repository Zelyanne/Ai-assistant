import { computed, ref } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
function parseCronField(rawField) {
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
function matchesField(field, value) {
    if (field.type === 'any') {
        return true;
    }
    if (field.type === 'step') {
        return value % field.value === 0;
    }
    return value === field.value;
}
function parseWeekday(value) {
    const normalized = value.toLowerCase();
    if (normalized.startsWith('sun'))
        return 0;
    if (normalized.startsWith('mon'))
        return 1;
    if (normalized.startsWith('tue'))
        return 2;
    if (normalized.startsWith('wed'))
        return 3;
    if (normalized.startsWith('thu'))
        return 4;
    if (normalized.startsWith('fri'))
        return 5;
    return 6;
}
function getZonedDateParts(date, timezone) {
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
function parseCronExpression(cronExpression) {
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
export function computeNextRunFromCron(cronExpression, timezone, fromDate) {
    const [minuteField, hourField, dayField, monthField, weekdayField] = parseCronExpression(cronExpression);
    const cursor = new Date(fromDate.getTime());
    cursor.setUTCSeconds(0, 0);
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
    const maxLookAheadMinutes = 366 * 24 * 60;
    for (let i = 0; i < maxLookAheadMinutes; i += 1) {
        const zoned = getZonedDateParts(cursor, timezone);
        if (matchesField(minuteField, zoned.minute)
            && matchesField(hourField, zoned.hour)
            && matchesField(dayField, zoned.day)
            && matchesField(monthField, zoned.month)
            && matchesField(weekdayField, zoned.weekday)) {
            return new Date(cursor.getTime());
        }
        cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
    }
    throw new Error(`Could not compute next cron run for ${cronExpression} (${timezone})`);
}
function withComputedNextRun(input, fromDate) {
    const timezone = input.timezone?.trim() || 'UTC';
    return {
        ...input,
        timezone,
        next_run: computeNextRunFromCron(input.cron_expression, timezone, fromDate).toISOString(),
    };
}
export function useSchedules() {
    const userStore = useUserStore();
    const db = supabase;
    const loading = ref(false);
    const error = ref(null);
    const organizationId = computed(() => userStore.profile?.organization_id ?? null);
    const userId = computed(() => userStore.profile?.id ?? null);
    function requireScope() {
        if (!organizationId.value || !userId.value) {
            error.value = 'Missing organization or user context';
            return null;
        }
        return {
            organization_id: organizationId.value,
            user_id: userId.value,
        };
    }
    async function listSchedules() {
        const scope = requireScope();
        if (!scope)
            return [];
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
            return (data ?? []);
        }
        catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            return [];
        }
        finally {
            loading.value = false;
        }
    }
    async function createSchedule(input) {
        const scope = requireScope();
        if (!scope)
            return null;
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
            return data;
        }
        catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            return null;
        }
        finally {
            loading.value = false;
        }
    }
    async function updateSchedule(scheduleId, input) {
        const scope = requireScope();
        if (!scope)
            return false;
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
        }
        catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            return false;
        }
        finally {
            loading.value = false;
        }
    }
    async function pauseSchedule(scheduleId) {
        return await updateScheduleState(scheduleId, false);
    }
    async function resumeSchedule(schedule) {
        return await updateScheduleState(schedule.id, true, schedule.cron_expression, schedule.timezone);
    }
    async function deleteSchedule(scheduleId) {
        const scope = requireScope();
        if (!scope)
            return false;
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
        }
        catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            return false;
        }
        finally {
            loading.value = false;
        }
    }
    async function updateScheduleState(scheduleId, isActive, cronExpression, timezone) {
        const scope = requireScope();
        if (!scope)
            return false;
        loading.value = true;
        error.value = null;
        try {
            const patch = {
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
        }
        catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
            return false;
        }
        finally {
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
//# sourceMappingURL=useSchedules.js.map