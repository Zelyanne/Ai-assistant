import type { Task } from '@ai-assistant/shared';
export declare function useProtocolOptimization(): {
    suggestions: import("vue").Ref<{
        organization_id: string;
        status: "queued" | "processing" | "done" | "error" | "escalation" | "paused";
        domain_action: string;
        payload: Record<string, unknown>;
        id?: string | undefined | undefined;
        user_id?: string | null | undefined | undefined;
        created_at?: string | undefined | undefined;
        updated_at?: string | undefined | undefined;
        topic?: string | undefined | undefined;
        result?: Record<string, unknown> | undefined;
    }[], {
        organization_id: string;
        status: "queued" | "processing" | "done" | "error" | "escalation" | "paused";
        domain_action: string;
        payload: Record<string, unknown>;
        id?: string | undefined;
        user_id?: string | null | undefined;
        created_at?: string | undefined;
        updated_at?: string | undefined;
        topic?: string | undefined;
        result?: Record<string, unknown> | undefined;
    }[] | {
        organization_id: string;
        status: "queued" | "processing" | "done" | "error" | "escalation" | "paused";
        domain_action: string;
        payload: Record<string, unknown>;
        id?: string | undefined | undefined;
        user_id?: string | null | undefined | undefined;
        created_at?: string | undefined | undefined;
        updated_at?: string | undefined | undefined;
        topic?: string | undefined | undefined;
        result?: Record<string, unknown> | undefined;
    }[]>;
    loading: import("vue").Ref<boolean, boolean>;
    fetchSuggestions: () => Promise<void>;
    approveOptimization: (task: Task) => Promise<void>;
    declineOptimization: (task: Task) => Promise<void>;
};
