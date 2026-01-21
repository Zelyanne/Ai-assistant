interface Props {
    title: string;
    summary: string;
    status: 'done' | 'escalation' | 'processing' | 'queued' | 'error' | 'insight';
    agencyTier?: 'Public' | 'Controlled' | 'Restricted';
    timestamp: string;
}
declare var __VLS_14: {};
type __VLS_Slots = {} & {
    actions?: (props: typeof __VLS_14) => any;
};
declare const __VLS_component: import("vue").DefineComponent<Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<Props> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: __VLS_WithSlots<typeof __VLS_component, __VLS_Slots>;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
