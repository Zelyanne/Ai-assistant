import type { CommandRole, CommandState, CommandTimelineEntry } from '../components/command/types';
interface SubmitCommandOptions {
    force?: boolean;
}
interface SubmitCommandResult {
    requiresConfirmation: boolean;
    queued: boolean;
    highRisk: boolean;
}
export declare function useCommandCenter(): {
    activeExecutionRun: import("vue").ComputedRef<{
        id: string;
        role: CommandRole;
        content: string;
        createdAt: string;
        state?: CommandState | undefined;
        taskId?: string | undefined;
        correlationId?: string | undefined;
        executionRun?: {
            id: string;
            status: string;
            currentStepKey?: string | null | undefined;
            currentWorkerType?: string | null | undefined;
            summary?: string | null | undefined;
            replanCount?: number | undefined;
            completedSteps?: number | undefined;
            totalSteps?: number | undefined;
            ledgerMarkdown?: string | null | undefined;
            lastError?: string | null | undefined;
            updatedAt?: string | undefined;
        } | undefined;
    }>;
    timeline: import("vue").Ref<{
        id: string;
        role: CommandRole;
        content: string;
        createdAt: string;
        state?: CommandState | undefined;
        taskId?: string | undefined;
        correlationId?: string | undefined;
        executionRun?: {
            id: string;
            status: string;
            currentStepKey?: string | null | undefined;
            currentWorkerType?: string | null | undefined;
            summary?: string | null | undefined;
            replanCount?: number | undefined;
            completedSteps?: number | undefined;
            totalSteps?: number | undefined;
            ledgerMarkdown?: string | null | undefined;
            lastError?: string | null | undefined;
            updatedAt?: string | undefined;
        } | undefined;
    }[], CommandTimelineEntry[] | {
        id: string;
        role: CommandRole;
        content: string;
        createdAt: string;
        state?: CommandState | undefined;
        taskId?: string | undefined;
        correlationId?: string | undefined;
        executionRun?: {
            id: string;
            status: string;
            currentStepKey?: string | null | undefined;
            currentWorkerType?: string | null | undefined;
            summary?: string | null | undefined;
            replanCount?: number | undefined;
            completedSteps?: number | undefined;
            totalSteps?: number | undefined;
            ledgerMarkdown?: string | null | undefined;
            lastError?: string | null | undefined;
            updatedAt?: string | undefined;
        } | undefined;
    }[]>;
    isSubmitting: import("vue").Ref<boolean, boolean>;
    startRealtimeSync: () => void;
    startNewDiscussion: () => Promise<void>;
    stopRealtimeSync: () => void;
    submitCommand: (message: string, _options?: SubmitCommandOptions) => Promise<SubmitCommandResult>;
};
export {};
