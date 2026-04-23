import type { ComputedRef } from 'vue';
import type { CommandRole, CommandState, CommandTimelineEntry } from '../components/command/types';
interface SubmitCommandOptions {
    force?: boolean;
}
interface SubmitCommandResult {
    requiresConfirmation: boolean;
    queued: boolean;
    highRisk: boolean;
}
declare const timeline: import("vue").Ref<{
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
declare const isSubmitting: import("vue").Ref<boolean, boolean>;
declare const activeConversationId: import("vue").Ref<string | null, string | null>;
declare const conversations: import("vue").Ref<{
    id: string;
    title: string | null;
    updatedAt: string | null;
    createdAt: string;
}[], ConversationListItem[] | {
    id: string;
    title: string | null;
    updatedAt: string | null;
    createdAt: string;
}[]>;
export type ConversationListItem = {
    id: string;
    title: string | null;
    updatedAt: string | null;
    createdAt: string;
};
export type UseCommandCenterApi = {
    activeExecutionRun: ComputedRef<CommandTimelineEntry | null>;
    timeline: typeof timeline;
    isSubmitting: typeof isSubmitting;
    conversations: typeof conversations;
    activeConversationId: typeof activeConversationId;
    loadConversations: () => Promise<void>;
    switchConversation: (conversationId: string) => Promise<void>;
    startRealtimeSync: () => void;
    startNewDiscussion: () => Promise<void>;
    stopRealtimeSync: () => void;
    submitCommand: (message: string, _options?: SubmitCommandOptions) => Promise<SubmitCommandResult>;
};
export declare function useCommandCenter(): UseCommandCenterApi;
export {};
