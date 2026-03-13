import { onMounted, onUnmounted } from 'vue';
import ConfirmDialog from 'primevue/confirmdialog';
import { useConfirm } from 'primevue/useconfirm';
import CommandComposer from '../components/command/CommandComposer.vue';
import CommandTimeline from '../components/command/CommandTimeline.vue';
import { useCommandCenter } from '../composables/useCommandCenter';
const confirm = useConfirm();
const { activeExecutionRun, timeline, isSubmitting, submitCommand, startRealtimeSync, stopRealtimeSync } = useCommandCenter();
onMounted(() => {
    startRealtimeSync();
});
onUnmounted(() => {
    stopRealtimeSync();
});
async function onSubmitCommand(message) {
    const initialResult = await submitCommand(message);
    if (!initialResult.requiresConfirmation)
        return;
    confirm.require({
        message: 'This command appears high-risk. Confirm before queuing execution?',
        header: 'Confirm High-Risk Action',
        icon: 'pi pi-exclamation-triangle',
        acceptClass: 'p-button-danger',
        accept: () => {
            void submitCommand(message, { force: true });
        },
    });
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mx-auto flex w-full max-w-5xl flex-col gap-4 px-2 py-2 md:gap-6 md:px-0" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "space-y-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "text-2xl font-bold text-executive-primary md:text-3xl" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-sm text-slate-500 md:text-base" },
});
if (__VLS_ctx.activeExecutionRun?.executionRun) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "rounded-executive border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 px-4 py-4 text-slate-50 shadow-sm" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex flex-col gap-3 md:flex-row md:items-start md:justify-between" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "space-y-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "text-xs font-semibold uppercase tracking-[0.18em] text-slate-300" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        ...{ class: "text-lg font-semibold md:text-xl" },
    });
    (__VLS_ctx.activeExecutionRun.executionRun.summary || 'Planner-led workspace run');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "text-sm text-slate-200" },
    });
    (__VLS_ctx.activeExecutionRun.content);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "grid gap-2 text-sm text-slate-200 md:min-w-[220px]" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-slate-400" },
    });
    (__VLS_ctx.activeExecutionRun.executionRun.status);
    if (__VLS_ctx.activeExecutionRun.executionRun.currentWorkerType) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-slate-400" },
        });
        (__VLS_ctx.activeExecutionRun.executionRun.currentWorkerType);
    }
    if (__VLS_ctx.activeExecutionRun.executionRun.currentStepKey) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-slate-400" },
        });
        (__VLS_ctx.activeExecutionRun.executionRun.currentStepKey);
    }
}
/** @type {[typeof CommandTimeline, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(CommandTimeline, new CommandTimeline({
    items: (__VLS_ctx.timeline),
}));
const __VLS_1 = __VLS_0({
    items: (__VLS_ctx.timeline),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
/** @type {[typeof CommandComposer, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(CommandComposer, new CommandComposer({
    ...{ 'onSubmit': {} },
    disabled: (__VLS_ctx.isSubmitting),
}));
const __VLS_4 = __VLS_3({
    ...{ 'onSubmit': {} },
    disabled: (__VLS_ctx.isSubmitting),
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
let __VLS_6;
let __VLS_7;
let __VLS_8;
const __VLS_9 = {
    onSubmit: (__VLS_ctx.onSubmitCommand)
};
var __VLS_5;
const __VLS_10 = {}.ConfirmDialog;
/** @type {[typeof __VLS_components.ConfirmDialog, ]} */ ;
// @ts-ignore
const __VLS_11 = __VLS_asFunctionalComponent(__VLS_10, new __VLS_10({}));
const __VLS_12 = __VLS_11({}, ...__VLS_functionalComponentArgsRest(__VLS_11));
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-5xl']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['md:gap-6']} */ ;
/** @type {__VLS_StyleScopedClasses['md:px-0']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['md:text-3xl']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['md:text-base']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-gradient-to-br']} */ ;
/** @type {__VLS_StyleScopedClasses['from-slate-900']} */ ;
/** @type {__VLS_StyleScopedClasses['via-slate-800']} */ ;
/** @type {__VLS_StyleScopedClasses['to-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['md:flex-row']} */ ;
/** @type {__VLS_StyleScopedClasses['md:items-start']} */ ;
/** @type {__VLS_StyleScopedClasses['md:justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.18em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-300']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['md:text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['md:min-w-[220px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ConfirmDialog: ConfirmDialog,
            CommandComposer: CommandComposer,
            CommandTimeline: CommandTimeline,
            activeExecutionRun: activeExecutionRun,
            timeline: timeline,
            isSubmitting: isSubmitting,
            onSubmitCommand: onSubmitCommand,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=CommandCenter.vue.js.map