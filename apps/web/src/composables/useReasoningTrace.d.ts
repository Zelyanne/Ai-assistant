export declare function useReasoningTrace(): {
    loading: import("vue").Ref<boolean, boolean>;
    error: import("vue").Ref<string | null, string | null>;
    traceLog: import("vue").Ref<{
        organization_id: string;
        agent_id: string;
        action_taken: string;
        reasoning_trace: {
            message: string;
            timestamp: string;
            step_name: string;
            confidence_score?: number | undefined | undefined;
            ambiguity_detected?: boolean | undefined | undefined;
            input_summary?: string | undefined | undefined;
            output_summary?: string | undefined | undefined;
        }[];
        citations: {
            source_type: string;
            source_id: string;
            description: string;
            link?: string | undefined | undefined;
        }[];
        id?: string | undefined | undefined;
        task_id?: string | null | undefined | undefined;
        created_at?: string | undefined | undefined;
    } | null, {
        organization_id: string;
        agent_id: string;
        action_taken: string;
        reasoning_trace: {
            message: string;
            timestamp: string;
            step_name: string;
            confidence_score?: number | undefined;
            ambiguity_detected?: boolean | undefined;
            input_summary?: string | undefined;
            output_summary?: string | undefined;
        }[];
        citations: {
            source_type: string;
            source_id: string;
            description: string;
            link?: string | undefined;
        }[];
        id?: string | undefined;
        task_id?: string | null | undefined;
        created_at?: string | undefined;
    } | {
        organization_id: string;
        agent_id: string;
        action_taken: string;
        reasoning_trace: {
            message: string;
            timestamp: string;
            step_name: string;
            confidence_score?: number | undefined | undefined;
            ambiguity_detected?: boolean | undefined | undefined;
            input_summary?: string | undefined | undefined;
            output_summary?: string | undefined | undefined;
        }[];
        citations: {
            source_type: string;
            source_id: string;
            description: string;
            link?: string | undefined | undefined;
        }[];
        id?: string | undefined | undefined;
        task_id?: string | null | undefined | undefined;
        created_at?: string | undefined | undefined;
    } | null>;
    fetchTrace: (taskId: string) => Promise<void>;
};
