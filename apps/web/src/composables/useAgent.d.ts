import { Task } from '@ai-assistant/shared';
export declare function useAgent(): {
    loading: import("vue").Ref<boolean, boolean>;
    error: import("vue").Ref<string | null, string | null>;
    submitTask: (domainAction: string, payload: Record<string, any>, topic?: string) => Promise<Task | null>;
    monitorTask: (taskId: string, onUpdate: (task: Task) => void) => () => void;
    subscribeToTable: (table: string, onUpdate: (payload: any) => void) => (() => void) | null;
};
