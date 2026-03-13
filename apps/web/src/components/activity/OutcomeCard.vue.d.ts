import { type ThreadSummary } from '@ai-assistant/shared';
interface Props {
    title: string;
    summary: string;
    summaryJson?: ThreadSummary;
    externalId?: string;
    taskId?: string;
    status: 'done' | 'escalation' | 'paused' | 'processing' | 'queued' | 'error' | 'insight' | 'optimization';
    agencyTier?: 'Public' | 'Controlled' | 'Restricted';
    timestamp: string;
    topics?: string[];
    escalationConfidenceScore?: number;
    escalationConfidenceThreshold?: number;
    escalationTrigger?: 'low_confidence' | 'ambiguity_detected' | 'restricted_topic' | 'approval_guardrail';
    isMini?: boolean;
    selected?: boolean;
    selectable?: boolean;
}
declare var __VLS_34: {};
type __VLS_Slots = {} & {
    actions?: (props: typeof __VLS_34) => any;
};
declare const __VLS_component: import("vue").DefineComponent<Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    click: (...args: any[]) => void;
    "open-trace": (...args: any[]) => void;
    "update:selected": (...args: any[]) => void;
}, string, import("vue").PublicProps, Readonly<Props> & Readonly<{
    onClick?: ((...args: any[]) => any) | undefined;
    "onOpen-trace"?: ((...args: any[]) => any) | undefined;
    "onUpdate:selected"?: ((...args: any[]) => any) | undefined;
}>, {
    isMini: boolean;
    selected: boolean;
    selectable: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: __VLS_WithSlots<typeof __VLS_component, __VLS_Slots>;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
