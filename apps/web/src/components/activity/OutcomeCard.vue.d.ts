import { type ThreadSummary } from '@ai-assistant/shared';
interface Props {
    title: string;
    summary: string;
    summaryJson?: ThreadSummary;
    externalId?: string;
    taskId?: string;
    status: 'done' | 'escalation' | 'processing' | 'queued' | 'error' | 'insight';
    agencyTier?: 'Public' | 'Controlled' | 'Restricted';
    timestamp: string;
}
declare var __VLS_17: {};
type __VLS_Slots = {} & {
    actions?: (props: typeof __VLS_17) => any;
};
declare const __VLS_component: import("vue").DefineComponent<Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "open-trace": (...args: any[]) => void;
}, string, import("vue").PublicProps, Readonly<Props> & Readonly<{
    "onOpen-trace"?: ((...args: any[]) => any) | undefined;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: __VLS_WithSlots<typeof __VLS_component, __VLS_Slots>;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
