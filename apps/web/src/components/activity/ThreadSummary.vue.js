import Card from 'primevue/card';
import Checkbox from 'primevue/checkbox';
import Timeline from 'primevue/timeline';
const props = defineProps();
// Define sections for the 3-bullet executive layout (AC 4)
const timelineItems = [
    { label: 'Context', value: props.summary.context, icon: 'pi pi-info-circle', color: '#3B82F6' },
    { label: 'Decisions', value: props.summary.decisions, icon: 'pi pi-check-circle', color: '#10B981' },
    { label: 'Action Items', value: props.summary.action_items, icon: 'pi pi-list', color: '#F59E0B' }
];
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['customized-timeline']} */ ;
/** @type {__VLS_StyleScopedClasses['customized-timeline']} */ ;
/** @type {__VLS_StyleScopedClasses['customized-timeline']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "thread-summary space-y-4 font-sans" },
});
const __VLS_0 = {}.Timeline;
/** @type {[typeof __VLS_components.Timeline, typeof __VLS_components.Timeline, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    value: (__VLS_ctx.timelineItems),
    ...{ class: "customized-timeline" },
}));
const __VLS_2 = __VLS_1({
    value: (__VLS_ctx.timelineItems),
    ...{ class: "customized-timeline" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
{
    const { marker: __VLS_thisSlot } = __VLS_3.slots;
    const [slotProps] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "flex w-6 h-6 items-center justify-center text-white rounded-full z-10 shadow-sm" },
        ...{ style: ({ backgroundColor: slotProps.item.color }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
        ...{ class: (slotProps.item.icon) },
        ...{ style: {} },
    });
}
{
    const { content: __VLS_thisSlot } = __VLS_3.slots;
    const [slotProps] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_4 = {}.Card;
    /** @type {[typeof __VLS_components.Card, typeof __VLS_components.Card, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        ...{ class: "mb-2 border-none shadow-none bg-transparent" },
    }));
    const __VLS_6 = __VLS_5({
        ...{ class: "mb-2 border-none shadow-none bg-transparent" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    {
        const { title: __VLS_thisSlot } = __VLS_7.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-[10px] font-bold uppercase tracking-widest text-slate-400" },
        });
        (slotProps.item.label);
    }
    {
        const { content: __VLS_thisSlot } = __VLS_7.slots;
        if (Array.isArray(slotProps.item.value)) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "space-y-2 mt-1" },
            });
            for (const [item, index] of __VLS_getVForSourceType((slotProps.item.value))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (index),
                    ...{ class: "flex items-start gap-3" },
                });
                if (slotProps.item.label === 'Action Items') {
                    const __VLS_8 = {}.Checkbox;
                    /** @type {[typeof __VLS_components.Checkbox, ]} */ ;
                    // @ts-ignore
                    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
                        binary: (true),
                        ...{ class: "mt-0.5" },
                    }));
                    const __VLS_10 = __VLS_9({
                        binary: (true),
                        ...{ class: "mt-0.5" },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "text-sm text-slate-700 leading-snug" },
                });
                (item);
            }
            if (slotProps.item.value.length === 0) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "text-sm text-slate-400 italic" },
                });
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "text-sm text-slate-700 leading-snug mt-1" },
            });
            (slotProps.item.value);
        }
    }
    var __VLS_7;
}
var __VLS_3;
if (__VLS_ctx.externalId) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex justify-end pt-2 border-t border-slate-100" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
        href: (`https://mail.google.com/mail/u/0/#all/${props.externalId}`),
        target: "_blank",
        ...{ class: "text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-1 font-mono uppercase tracking-tight" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
        ...{ class: "pi pi-external-link" },
        ...{ style: {} },
    });
    (props.externalId);
}
/** @type {__VLS_StyleScopedClasses['thread-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-4']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['customized-timeline']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['w-6']} */ ;
/** @type {__VLS_StyleScopedClasses['h-6']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-white']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['z-10']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
/** @type {__VLS_StyleScopedClasses['border-none']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-none']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-transparent']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-widest']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-start']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-snug']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['italic']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-snug']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-100']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-blue-500']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:text-blue-700']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-external-link']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Card: Card,
            Checkbox: Checkbox,
            Timeline: Timeline,
            timelineItems: timelineItems,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=ThreadSummary.vue.js.map