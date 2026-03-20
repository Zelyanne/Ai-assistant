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
export declare function computeNextRunFromCron(cronExpression: string, timezone: string, fromDate: Date): Date;
export declare function useSchedules(): {
    loading: import("vue").Ref<boolean, boolean>;
    error: import("vue").Ref<string | null, string | null>;
    listSchedules: () => Promise<UserScheduleRecord[]>;
    createSchedule: (input: UserScheduleInput) => Promise<UserScheduleRecord | null>;
    updateSchedule: (scheduleId: string, input: UserScheduleInput) => Promise<boolean>;
    pauseSchedule: (scheduleId: string) => Promise<boolean>;
    resumeSchedule: (schedule: Pick<UserScheduleRecord, "id" | "cron_expression" | "timezone">) => Promise<boolean>;
    deleteSchedule: (scheduleId: string) => Promise<boolean>;
};
export {};
