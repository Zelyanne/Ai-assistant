import { computed } from 'vue';
import Card from 'primevue/card';
import Badge from 'primevue/badge';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import ProgressSpinner from 'primevue/progressspinner';
import ThreadSummaryComponent from './ThreadSummary.vue';
const props = withDefaults(defineProps(), {
    isMini: false,
    selected: false,
    selectable: false
});
const emit = defineEmits(['open-trace', 'click', 'update:selected']);
const isProcessing = computed(() => props.status === 'processing' || props.status === 'queued');
const isSelected = computed({
    get: () => props.selected,
    set: (val) => emit('update:selected', val)
});
const cardStyle = computed(() => {
    if (isProcessing.value) {
        return { borderLeft: '4px solid #94A3B8', background: 'rgba(148, 163, 184, 0.05)', opacity: 0.7 };
    }
    switch (props.status) {
        case 'done':
            return { borderLeft: '4px solid #059669', background: 'rgba(5, 150, 105, 0.02)' };
        case 'escalation':
            return { borderLeft: '4px solid #D97706', background: 'rgba(217, 119, 6, 0.02)' };
        case 'paused':
            return { borderLeft: '4px solid #E11D48', background: 'rgba(225, 29, 72, 0.02)' };
        case 'insight':
            return { borderLeft: '4px solid #2563EB', background: 'rgba(37, 99, 235, 0.02)' };
        case 'optimization':
            return { borderLeft: '4px solid #334155', background: 'rgba(51, 65, 85, 0.05)' };
        default:
            return { borderLeft: '4px solid #2563EB', background: 'rgba(37, 99, 235, 0.02)' };
    }
});
const statusLabel = computed(() => {
    switch (props.status) {
        case 'done': return 'Silent Win';
        case 'escalation': return 'Escalation';
        case 'paused': return 'Paused';
        case 'insight': return 'Insight';
        case 'optimization': return 'Optimization Suggestion';
        default: return props.status.charAt(0).toUpperCase() + props.status.slice(1);
    }
});
const statusSeverity = computed(() => {
    switch (props.status) {
        case 'done': return 'success';
        case 'escalation': return 'warn';
        case 'paused': return 'danger';
        case 'error': return 'danger';
        case 'insight': return 'info';
        case 'optimization': return 'secondary';
        default: return 'secondary';
    }
});
const tierSeverity = computed(() => {
    switch (props.agencyTier) {
        case 'Public': return 'info';
        case 'Controlled': return 'warn';
        case 'Restricted': return 'danger';
        default: return 'secondary';
    }
});
function toPercent(value) {
    return `${Math.round(value * 100)}%`;
}
const hasEscalationConfidence = computed(() => {
    return props.status === 'escalation'
        && (typeof props.escalationConfidenceScore === 'number'
            || typeof props.escalationConfidenceThreshold === 'number'
            || typeof props.escalationTrigger === 'string');
});
const escalationHint = computed(() => {
    if (!hasEscalationConfidence.value)
        return '';
    const segments = [];
    if (typeof props.escalationConfidenceScore === 'number') {
        segments.push(`score ${toPercent(props.escalationConfidenceScore)}`);
    }
    if (typeof props.escalationConfidenceThreshold === 'number') {
        segments.push(`threshold ${toPercent(props.escalationConfidenceThreshold)}`);
    }
    if (props.escalationTrigger) {
        const triggerLabel = props.escalationTrigger.replace(/_/g, ' ');
        segments.push(`trigger ${triggerLabel}`);
    }
    return segments.join(' • ');
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    isMini: false,
    selected: false,
    selectable: false
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['outcome-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.Card;
/** @type {[typeof __VLS_components.Card, typeof __VLS_components.Card, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    ...{ 'onKeydown': {} },
    ...{ class: "outcome-card shadow-sm border border-slate-200" },
    ...{ style: (__VLS_ctx.cardStyle) },
    ...{ class: ({
            'mini-card': __VLS_ctx.isMini,
            'cursor-pointer': !__VLS_ctx.isProcessing,
            'pointer-events-none': __VLS_ctx.isProcessing,
            'border-blue-500 shadow-md ring-1 ring-blue-500': __VLS_ctx.selected
        }) },
    tabindex: "0",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    ...{ 'onKeydown': {} },
    ...{ class: "outcome-card shadow-sm border border-slate-200" },
    ...{ style: (__VLS_ctx.cardStyle) },
    ...{ class: ({
            'mini-card': __VLS_ctx.isMini,
            'cursor-pointer': !__VLS_ctx.isProcessing,
            'pointer-events-none': __VLS_ctx.isProcessing,
            'border-blue-500 shadow-md ring-1 ring-blue-500': __VLS_ctx.selected
        }) },
    tabindex: "0",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (...[$event]) => {
        !__VLS_ctx.isProcessing && __VLS_ctx.emit('click');
    }
};
const __VLS_8 = {
    onKeydown: (...[$event]) => {
        !__VLS_ctx.isProcessing && __VLS_ctx.emit('click');
    }
};
var __VLS_9 = {};
__VLS_3.slots.default;
{
    const { title: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex justify-between items-start gap-3" },
        ...{ class: ({ 'mb-1': __VLS_ctx.isMini }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-start gap-3 flex-1" },
    });
    if (__VLS_ctx.selectable) {
        const __VLS_10 = {}.Checkbox;
        /** @type {[typeof __VLS_components.Checkbox, ]} */ ;
        // @ts-ignore
        const __VLS_11 = __VLS_asFunctionalComponent(__VLS_10, new __VLS_10({
            ...{ 'onClick': {} },
            modelValue: (__VLS_ctx.isSelected),
            binary: (true),
            ...{ class: "mt-1" },
        }));
        const __VLS_12 = __VLS_11({
            ...{ 'onClick': {} },
            modelValue: (__VLS_ctx.isSelected),
            binary: (true),
            ...{ class: "mt-1" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_11));
        let __VLS_14;
        let __VLS_15;
        let __VLS_16;
        const __VLS_17 = {
            onClick: () => { }
        };
        var __VLS_13;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "text-executive-primary leading-tight font-sans" },
        ...{ class: (__VLS_ctx.isMini ? 'text-base font-semibold line-clamp-2' : 'text-lg font-bold') },
    });
    (__VLS_ctx.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex flex-col items-end gap-1" },
    });
    const __VLS_18 = {}.Badge;
    /** @type {[typeof __VLS_components.Badge, ]} */ ;
    // @ts-ignore
    const __VLS_19 = __VLS_asFunctionalComponent(__VLS_18, new __VLS_18({
        value: (__VLS_ctx.statusLabel),
        severity: (__VLS_ctx.statusSeverity),
        ...{ class: "font-technical text-[9px] uppercase tracking-tighter" },
    }));
    const __VLS_20 = __VLS_19({
        value: (__VLS_ctx.statusLabel),
        severity: (__VLS_ctx.statusSeverity),
        ...{ class: "font-technical text-[9px] uppercase tracking-tighter" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_19));
    if (__VLS_ctx.isProcessing) {
        const __VLS_22 = {}.ProgressSpinner;
        /** @type {[typeof __VLS_components.ProgressSpinner, ]} */ ;
        // @ts-ignore
        const __VLS_23 = __VLS_asFunctionalComponent(__VLS_22, new __VLS_22({
            ...{ style: {} },
            strokeWidth: "8",
        }));
        const __VLS_24 = __VLS_23({
            ...{ style: {} },
            strokeWidth: "8",
        }, ...__VLS_functionalComponentArgsRest(__VLS_23));
    }
}
{
    const { subtitle: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-2 mt-1 flex-wrap" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-xs text-slate-400 font-technical" },
    });
    (__VLS_ctx.timestamp);
    if (__VLS_ctx.agencyTier) {
        const __VLS_26 = {}.Badge;
        /** @type {[typeof __VLS_components.Badge, ]} */ ;
        // @ts-ignore
        const __VLS_27 = __VLS_asFunctionalComponent(__VLS_26, new __VLS_26({
            value: (__VLS_ctx.agencyTier),
            severity: (__VLS_ctx.tierSeverity),
            size: "small",
            ...{ class: "opacity-70 scale-90 origin-left" },
        }));
        const __VLS_28 = __VLS_27({
            value: (__VLS_ctx.agencyTier),
            severity: (__VLS_ctx.tierSeverity),
            size: "small",
            ...{ class: "opacity-70 scale-90 origin-left" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_27));
    }
}
{
    const { content: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mt-2" },
    });
    if (__VLS_ctx.summaryJson && !__VLS_ctx.isMini) {
        /** @type {[typeof ThreadSummaryComponent, ]} */ ;
        // @ts-ignore
        const __VLS_30 = __VLS_asFunctionalComponent(ThreadSummaryComponent, new ThreadSummaryComponent({
            summary: (__VLS_ctx.summaryJson),
            externalId: (__VLS_ctx.externalId),
        }));
        const __VLS_31 = __VLS_30({
            summary: (__VLS_ctx.summaryJson),
            externalId: (__VLS_ctx.externalId),
        }, ...__VLS_functionalComponentArgsRest(__VLS_30));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "text-slate-600 leading-relaxed font-technical" },
            ...{ class: (__VLS_ctx.isMini ? 'text-xs line-clamp-3' : 'text-sm') },
        });
        (__VLS_ctx.summary);
    }
    if (__VLS_ctx.hasEscalationConfidence) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "mt-2 text-[11px] leading-relaxed font-technical text-amber-700" },
            ...{ class: ({ 'line-clamp-2': __VLS_ctx.isMini }) },
        });
        (__VLS_ctx.escalationHint);
    }
}
{
    const { footer: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex justify-end gap-2" },
        ...{ class: ({ 'mt-2': __VLS_ctx.isMini }) },
    });
    var __VLS_33 = {};
    if (__VLS_ctx.taskId) {
        const __VLS_35 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
            ...{ 'onClick': {} },
            icon: (__VLS_ctx.isMini ? 'pi pi-search' : 'pi pi-search'),
            label: (__VLS_ctx.isMini ? '' : 'View Trace'),
            text: true,
            size: (__VLS_ctx.isMini ? 'small' : 'small'),
            ...{ class: "p-button-technical" },
            ...{ class: ({ 'p-0 h-8 w-8': __VLS_ctx.isMini }) },
        }));
        const __VLS_37 = __VLS_36({
            ...{ 'onClick': {} },
            icon: (__VLS_ctx.isMini ? 'pi pi-search' : 'pi pi-search'),
            label: (__VLS_ctx.isMini ? '' : 'View Trace'),
            text: true,
            size: (__VLS_ctx.isMini ? 'small' : 'small'),
            ...{ class: "p-button-technical" },
            ...{ class: ({ 'p-0 h-8 w-8': __VLS_ctx.isMini }) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_36));
        let __VLS_39;
        let __VLS_40;
        let __VLS_41;
        const __VLS_42 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.taskId))
                    return;
                __VLS_ctx.emit('open-trace', __VLS_ctx.taskId);
            }
        };
        __VLS_asFunctionalDirective(__VLS_directives.vTooltip)(null, { ...__VLS_directiveBindingRestFields, modifiers: { top: true, }, value: (__VLS_ctx.isMini ? 'View Trace' : '') }, null, null);
        var __VLS_38;
    }
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['outcome-card']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['items-start']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-start']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-end']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[9px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tighter']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['opacity-70']} */ ;
/** @type {__VLS_StyleScopedClasses['scale-90']} */ ;
/** @type {__VLS_StyleScopedClasses['origin-left']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[11px]']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber-700']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['p-button-technical']} */ ;
// @ts-ignore
var __VLS_34 = __VLS_33;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Card: Card,
            Badge: Badge,
            Button: Button,
            Checkbox: Checkbox,
            ProgressSpinner: ProgressSpinner,
            ThreadSummaryComponent: ThreadSummaryComponent,
            emit: emit,
            isProcessing: isProcessing,
            isSelected: isSelected,
            cardStyle: cardStyle,
            statusLabel: statusLabel,
            statusSeverity: statusSeverity,
            tierSeverity: tierSeverity,
            hasEscalationConfidence: hasEscalationConfidence,
            escalationHint: escalationHint,
        };
    },
    emits: {},
    __typeProps: {},
    props: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    emits: {},
    __typeProps: {},
    props: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=OutcomeCard.vue.js.map