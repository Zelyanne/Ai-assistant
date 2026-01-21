import { computed } from 'vue';
import Card from 'primevue/card';
import Badge from 'primevue/badge';
import Button from 'primevue/button';
const props = defineProps();
const cardStyle = computed(() => {
    switch (props.status) {
        case 'done':
            return { borderLeft: '4px solid #059669', background: 'rgba(5, 150, 105, 0.02)' };
        case 'escalation':
            return { borderLeft: '4px solid #D97706', background: 'rgba(217, 119, 6, 0.02)' };
        case 'insight':
        default:
            return { borderLeft: '4px solid #2563EB', background: 'rgba(37, 99, 235, 0.02)' };
    }
});
const statusLabel = computed(() => {
    switch (props.status) {
        case 'done': return 'Silent Win';
        case 'escalation': return 'Escalation';
        case 'insight': return 'Insight';
        default: return props.status.charAt(0).toUpperCase() + props.status.slice(1);
    }
});
const statusSeverity = computed(() => {
    switch (props.status) {
        case 'done': return 'success';
        case 'escalation': return 'warn';
        case 'error': return 'danger';
        case 'insight': return 'info';
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
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['outcome-card']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.Card;
/** @type {[typeof __VLS_components.Card, typeof __VLS_components.Card, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "outcome-card shadow-sm border border-slate-200" },
    ...{ style: (__VLS_ctx.cardStyle) },
}));
const __VLS_2 = __VLS_1({
    ...{ class: "outcome-card shadow-sm border border-slate-200" },
    ...{ style: (__VLS_ctx.cardStyle) },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
{
    const { title: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex justify-between items-start gap-4" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "text-lg font-bold text-executive-primary leading-tight font-sans" },
    });
    (__VLS_ctx.title);
    const __VLS_5 = {}.Badge;
    /** @type {[typeof __VLS_components.Badge, ]} */ ;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({
        value: (__VLS_ctx.statusLabel),
        severity: (__VLS_ctx.statusSeverity),
        ...{ class: "font-technical text-xs" },
    }));
    const __VLS_7 = __VLS_6({
        value: (__VLS_ctx.statusLabel),
        severity: (__VLS_ctx.statusSeverity),
        ...{ class: "font-technical text-xs" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
}
{
    const { subtitle: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-2 mt-1" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-xs text-slate-400 font-technical" },
    });
    (__VLS_ctx.timestamp);
    if (__VLS_ctx.agencyTier) {
        const __VLS_9 = {}.Badge;
        /** @type {[typeof __VLS_components.Badge, ]} */ ;
        // @ts-ignore
        const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
            value: (__VLS_ctx.agencyTier),
            severity: (__VLS_ctx.tierSeverity),
            size: "small",
            ...{ class: "opacity-80" },
        }));
        const __VLS_11 = __VLS_10({
            value: (__VLS_ctx.agencyTier),
            severity: (__VLS_ctx.tierSeverity),
            size: "small",
            ...{ class: "opacity-80" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_10));
    }
}
{
    const { content: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "text-slate-600 text-sm leading-relaxed font-technical" },
    });
    (__VLS_ctx.summary);
}
{
    const { footer: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex justify-end gap-2" },
    });
    var __VLS_13 = {};
    const __VLS_15 = {}.Button;
    /** @type {[typeof __VLS_components.Button, ]} */ ;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({
        label: "View Trace",
        icon: "pi pi-search",
        text: true,
        size: "small",
        ...{ class: "p-button-technical" },
    }));
    const __VLS_17 = __VLS_16({
        label: "View Trace",
        icon: "pi pi-search",
        text: true,
        size: "small",
        ...{ class: "p-button-technical" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_16));
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['outcome-card']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['items-start']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['opacity-80']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['p-button-technical']} */ ;
// @ts-ignore
var __VLS_14 = __VLS_13;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Card: Card,
            Badge: Badge,
            Button: Button,
            cardStyle: cardStyle,
            statusLabel: statusLabel,
            statusSeverity: statusSeverity,
            tierSeverity: tierSeverity,
        };
    },
    __typeProps: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=OutcomeCard.vue.js.map