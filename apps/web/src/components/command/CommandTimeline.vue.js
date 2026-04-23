import { computed, nextTick, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
const props = withDefaults(defineProps(), {
    items: () => []
});
const stateLabel = {
    intent_preview: 'Intent Preview',
    queued: 'Queued',
    processing: 'Processing',
    done: 'Done',
    error: 'Error',
    escalation: 'Escalation',
    paused: 'Paused'
};
const stateBadgeClass = {
    intent_preview: 'bg-slate-100 text-slate-700',
    queued: 'bg-sky-100 text-sky-700',
    processing: 'bg-indigo-100 text-indigo-700',
    done: 'bg-emerald-100 text-emerald-700',
    error: 'bg-rose-100 text-rose-700',
    escalation: 'bg-amber-100 text-amber-700',
    paused: 'bg-slate-200 text-slate-700'
};
const executionStatusLabel = {
    planned: 'Plan Ready',
    processing: 'Worker Active',
    completed: 'Run Complete',
    failed: 'Run Failed',
    escalated: 'Needs Review',
    blocked: 'Blocked',
};
const executionStatusBadgeClass = {
    planned: 'bg-sky-100 text-sky-700',
    processing: 'bg-indigo-100 text-indigo-700',
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-rose-100 text-rose-700',
    escalated: 'bg-amber-100 text-amber-700',
    blocked: 'bg-amber-100 text-amber-700',
};
const sortedItems = computed(() => {
    return [...props.items].sort((a, b) => {
        const left = new Date(a.createdAt).getTime();
        const right = new Date(b.createdAt).getTime();
        return left - right;
    });
});
const scrollContainer = ref(null);
const isNearBottom = ref(true);
const showJumpToLatest = ref(false);
const NEAR_BOTTOM_THRESHOLD_PX = 120;
function distanceFromBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight;
}
function computeNearBottom(el) {
    return distanceFromBottom(el) <= NEAR_BOTTOM_THRESHOLD_PX;
}
function updateScrollState() {
    const el = scrollContainer.value;
    if (!el)
        return;
    isNearBottom.value = computeNearBottom(el);
    if (isNearBottom.value)
        showJumpToLatest.value = false;
}
function scrollToBottom() {
    const el = scrollContainer.value;
    if (!el)
        return;
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    showJumpToLatest.value = false;
}
const lastItemSignature = computed(() => {
    const last = sortedItems.value[sortedItems.value.length - 1];
    if (!last)
        return '';
    const run = last.executionRun;
    return [
        last.id,
        last.content,
        last.state ?? '',
        run?.status ?? '',
        run?.currentStepKey ?? '',
        run?.updatedAt ?? '',
        run?.completedSteps ?? '',
        run?.totalSteps ?? '',
    ].join('|');
});
watch(() => sortedItems.value.length, async (nextCount, prevCount) => {
    if (nextCount <= prevCount)
        return;
    await nextTick();
    if (isNearBottom.value) {
        scrollToBottom();
    }
    else {
        showJumpToLatest.value = true;
    }
});
watch(lastItemSignature, async (next, prev) => {
    if (!next || next === prev)
        return;
    await nextTick();
    if (isNearBottom.value) {
        scrollToBottom();
    }
    else {
        showJumpToLatest.value = true;
    }
});
onMounted(() => {
    void nextTick().then(() => {
        scrollToBottom();
        updateScrollState();
    });
});
function roleLabel(role) {
    if (role === 'user')
        return 'You';
    if (role === 'assistant')
        return 'Assistant';
    return 'System';
}
function formatWorkerType(workerType) {
    if (!workerType)
        return 'Planner';
    return workerType.charAt(0).toUpperCase() + workerType.slice(1);
}
function executionProgress(item) {
    const run = item.executionRun;
    if (!run)
        return null;
    if (typeof run.completedSteps !== 'number' || typeof run.totalSteps !== 'number')
        return null;
    return `${run.completedSteps}/${run.totalSteps} steps complete`;
}
function executionStatusText(status) {
    return executionStatusLabel[status] ?? status;
}
function executionStatusClass(status) {
    return executionStatusBadgeClass[status] ?? 'bg-slate-100 text-slate-700';
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    items: () => []
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['timeline-enter-active']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-leave-active']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-enter-from']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-leave-to']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "rounded-executive border border-slate-200 bg-white shadow-sm" },
    'aria-label': "Command timeline",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "border-b border-slate-100 px-4 py-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "text-sm font-semibold uppercase tracking-wide text-slate-500" },
});
if (__VLS_ctx.sortedItems.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "px-4 py-8 text-center text-sm text-slate-500" },
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onScroll: (__VLS_ctx.updateScrollState) },
        ref: "scrollContainer",
        ...{ class: "relative max-h-[70vh] min-h-[18rem] overflow-y-auto px-3 py-4" },
    });
    /** @type {typeof __VLS_ctx.scrollContainer} */ ;
    if (__VLS_ctx.showJumpToLatest) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "sticky bottom-4 z-10 flex justify-end" },
        });
        const __VLS_0 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
            ...{ 'onClick': {} },
            label: "Jump to Latest",
            icon: "pi pi-arrow-down",
            severity: "secondary",
            size: "small",
            ...{ class: "shadow-sm" },
        }));
        const __VLS_2 = __VLS_1({
            ...{ 'onClick': {} },
            label: "Jump to Latest",
            icon: "pi pi-arrow-down",
            severity: "secondary",
            size: "small",
            ...{ class: "shadow-sm" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        let __VLS_4;
        let __VLS_5;
        let __VLS_6;
        const __VLS_7 = {
            onClick: (__VLS_ctx.scrollToBottom)
        };
        var __VLS_3;
    }
    const __VLS_8 = {}.TransitionGroup;
    /** @type {[typeof __VLS_components.TransitionGroup, typeof __VLS_components.TransitionGroup, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        tag: "ul",
        name: "timeline",
        ...{ class: "space-y-3" },
    }));
    const __VLS_10 = __VLS_9({
        tag: "ul",
        name: "timeline",
        ...{ class: "space-y-3" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.sortedItems))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
            key: (item.id),
            ...{ class: "flex" },
            ...{ class: (item.role === 'user' ? 'justify-end' : 'justify-start') },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            ...{ class: "max-w-[92%] rounded-xl border px-4 py-3 md:max-w-[72%]" },
            ...{ class: (item.role === 'user' ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-white') },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mb-1 flex items-center gap-2 text-xs" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "font-semibold text-slate-700" },
        });
        (__VLS_ctx.roleLabel(item.role));
        if (item.state) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "rounded-full px-2 py-0.5 font-medium" },
                ...{ class: (__VLS_ctx.stateBadgeClass[item.state]) },
            });
            (__VLS_ctx.stateLabel[item.state]);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "whitespace-pre-wrap text-sm leading-relaxed text-slate-700" },
        });
        (item.content);
        if (item.executionRun) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mt-3 space-y-3 border-t border-slate-100 pt-3" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "flex flex-wrap items-center gap-2 text-xs text-slate-600" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "rounded-full px-2 py-0.5 font-medium" },
                ...{ class: (__VLS_ctx.executionStatusClass(item.executionRun.status)) },
            });
            (__VLS_ctx.executionStatusText(item.executionRun.status));
            if (__VLS_ctx.executionProgress(item)) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (__VLS_ctx.executionProgress(item));
            }
            if (item.executionRun.replanCount) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (item.executionRun.replanCount);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "grid gap-2 text-xs text-slate-600 md:grid-cols-2" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "font-semibold text-slate-700" },
            });
            (__VLS_ctx.formatWorkerType(item.executionRun.currentWorkerType));
            if (item.executionRun.currentStepKey) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "font-semibold text-slate-700" },
                });
                (item.executionRun.currentStepKey);
            }
            if (item.executionRun.summary) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "text-xs leading-relaxed text-slate-600" },
                });
                (item.executionRun.summary);
            }
            if (item.executionRun.lastError) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800" },
                });
                (item.executionRun.lastError);
            }
            if (item.executionRun.ledgerMarkdown) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.details, __VLS_intrinsicElements.details)({
                    ...{ class: "rounded-lg bg-slate-50 px-3 py-2" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.summary, __VLS_intrinsicElements.summary)({
                    ...{ class: "cursor-pointer text-xs font-semibold text-slate-700" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
                    ...{ class: "mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-600" },
                });
                (item.executionRun.ledgerMarkdown);
            }
        }
    }
    var __VLS_11;
}
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['border-b']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-100']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-8']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['max-h-[70vh]']} */ ;
/** @type {__VLS_StyleScopedClasses['min-h-[18rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-y-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-4']} */ ;
/** @type {__VLS_StyleScopedClasses['sticky']} */ ;
/** @type {__VLS_StyleScopedClasses['bottom-4']} */ ;
/** @type {__VLS_StyleScopedClasses['z-10']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-[92%]']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-3']} */ ;
/** @type {__VLS_StyleScopedClasses['md:max-w-[72%]']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['whitespace-pre-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-3']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-100']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-amber-50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber-800']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['cursor-pointer']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['whitespace-pre-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['break-words']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Button: Button,
            stateLabel: stateLabel,
            stateBadgeClass: stateBadgeClass,
            sortedItems: sortedItems,
            scrollContainer: scrollContainer,
            showJumpToLatest: showJumpToLatest,
            updateScrollState: updateScrollState,
            scrollToBottom: scrollToBottom,
            roleLabel: roleLabel,
            formatWorkerType: formatWorkerType,
            executionProgress: executionProgress,
            executionStatusText: executionStatusText,
            executionStatusClass: executionStatusClass,
        };
    },
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=CommandTimeline.vue.js.map