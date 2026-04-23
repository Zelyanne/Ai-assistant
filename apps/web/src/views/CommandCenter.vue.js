import { onMounted, onUnmounted, ref } from 'vue';
import Button from 'primevue/button';
import Drawer from 'primevue/drawer';
import CommandComposer from '../components/command/CommandComposer.vue';
import CommandTimeline from '../components/command/CommandTimeline.vue';
import ConversationList from '../components/command/ConversationList.vue';
import { useCommandCenter } from '../composables/useCommandCenter';
const mobileChatsVisible = ref(false);
const { activeExecutionRun, timeline, conversations, activeConversationId, loadConversations, switchConversation, isSubmitting, startNewDiscussion, submitCommand, startRealtimeSync, stopRealtimeSync, } = useCommandCenter();
onMounted(() => {
    void loadConversations();
    startRealtimeSync();
});
onUnmounted(() => {
    stopRealtimeSync();
});
async function onSubmitCommand(message) {
    await submitCommand(message);
}
async function onStartNewDiscussion() {
    await startNewDiscussion();
    mobileChatsVisible.value = false;
}
async function onSelectConversation(conversationId) {
    await switchConversation(conversationId);
    mobileChatsVisible.value = false;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mx-auto flex w-full flex-col gap-4 px-1 py-2 md:gap-6 md:px-0" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "flex items-start justify-between gap-4 px-1" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "space-y-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "text-2xl font-bold tracking-tight text-executive-primary md:text-3xl" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-sm text-slate-500 md:text-base" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-2 md:hidden" },
});
const __VLS_0 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    icon: "pi pi-comments",
    severity: "secondary",
    text: true,
    'aria-label': "Open chat list",
    'aria-controls': (__VLS_ctx.mobileChatsVisible ? 'command-center-chats' : undefined),
    'aria-expanded': (__VLS_ctx.mobileChatsVisible),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    icon: "pi pi-comments",
    severity: "secondary",
    text: true,
    'aria-label': "Open chat list",
    'aria-controls': (__VLS_ctx.mobileChatsVisible ? 'command-center-chats' : undefined),
    'aria-expanded': (__VLS_ctx.mobileChatsVisible),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (...[$event]) => {
        __VLS_ctx.mobileChatsVisible = true;
    }
};
var __VLS_3;
const __VLS_8 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ 'onClick': {} },
    icon: "pi pi-plus",
    severity: "contrast",
    'aria-label': "New chat",
    disabled: (__VLS_ctx.isSubmitting),
}));
const __VLS_10 = __VLS_9({
    ...{ 'onClick': {} },
    icon: "pi pi-plus",
    severity: "contrast",
    'aria-label': "New chat",
    disabled: (__VLS_ctx.isSubmitting),
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
let __VLS_12;
let __VLS_13;
let __VLS_14;
const __VLS_15 = {
    onClick: (__VLS_ctx.onStartNewDiscussion)
};
var __VLS_11;
const __VLS_16 = {}.Drawer;
/** @type {[typeof __VLS_components.Drawer, typeof __VLS_components.Drawer, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    id: "command-center-chats",
    visible: (__VLS_ctx.mobileChatsVisible),
    header: "Chats",
    ...{ class: "!w-full sm:!w-96" },
    role: "region",
}));
const __VLS_18 = __VLS_17({
    id: "command-center-chats",
    visible: (__VLS_ctx.mobileChatsVisible),
    header: "Chats",
    ...{ class: "!w-full sm:!w-96" },
    role: "region",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
/** @type {[typeof ConversationList, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(ConversationList, new ConversationList({
    ...{ 'onNewChat': {} },
    ...{ 'onSelectConversation': {} },
    conversations: (__VLS_ctx.conversations),
    activeConversationId: (__VLS_ctx.activeConversationId),
    disabled: (__VLS_ctx.isSubmitting),
}));
const __VLS_21 = __VLS_20({
    ...{ 'onNewChat': {} },
    ...{ 'onSelectConversation': {} },
    conversations: (__VLS_ctx.conversations),
    activeConversationId: (__VLS_ctx.activeConversationId),
    disabled: (__VLS_ctx.isSubmitting),
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
let __VLS_23;
let __VLS_24;
let __VLS_25;
const __VLS_26 = {
    onNewChat: (__VLS_ctx.onStartNewDiscussion)
};
const __VLS_27 = {
    onSelectConversation: (__VLS_ctx.onSelectConversation)
};
var __VLS_22;
var __VLS_19;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "grid min-h-0 grid-cols-1 gap-4 md:grid-cols-[280px_minmax(0,1fr)]" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "hidden min-h-0 md:block" },
});
/** @type {[typeof ConversationList, ]} */ ;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent(ConversationList, new ConversationList({
    ...{ 'onNewChat': {} },
    ...{ 'onSelectConversation': {} },
    conversations: (__VLS_ctx.conversations),
    activeConversationId: (__VLS_ctx.activeConversationId),
    disabled: (__VLS_ctx.isSubmitting),
}));
const __VLS_29 = __VLS_28({
    ...{ 'onNewChat': {} },
    ...{ 'onSelectConversation': {} },
    conversations: (__VLS_ctx.conversations),
    activeConversationId: (__VLS_ctx.activeConversationId),
    disabled: (__VLS_ctx.isSubmitting),
}, ...__VLS_functionalComponentArgsRest(__VLS_28));
let __VLS_31;
let __VLS_32;
let __VLS_33;
const __VLS_34 = {
    onNewChat: (__VLS_ctx.onStartNewDiscussion)
};
const __VLS_35 = {
    onSelectConversation: (__VLS_ctx.onSelectConversation)
};
var __VLS_30;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "min-h-0" },
});
if (__VLS_ctx.activeExecutionRun?.executionRun) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "mb-4 rounded-executive border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 px-4 py-4 text-slate-50 shadow-sm" },
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex min-h-0 flex-col gap-3" },
});
/** @type {[typeof CommandTimeline, ]} */ ;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent(CommandTimeline, new CommandTimeline({
    items: (__VLS_ctx.timeline),
}));
const __VLS_37 = __VLS_36({
    items: (__VLS_ctx.timeline),
}, ...__VLS_functionalComponentArgsRest(__VLS_36));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "sticky bottom-0 z-10" },
});
/** @type {[typeof CommandComposer, ]} */ ;
// @ts-ignore
const __VLS_39 = __VLS_asFunctionalComponent(CommandComposer, new CommandComposer({
    ...{ 'onSubmit': {} },
    variant: "chat",
    disabled: (__VLS_ctx.isSubmitting),
}));
const __VLS_40 = __VLS_39({
    ...{ 'onSubmit': {} },
    variant: "chat",
    disabled: (__VLS_ctx.isSubmitting),
}, ...__VLS_functionalComponentArgsRest(__VLS_39));
let __VLS_42;
let __VLS_43;
let __VLS_44;
const __VLS_45 = {
    onSubmit: (__VLS_ctx.onSubmitCommand)
};
var __VLS_41;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['px-1']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['md:gap-6']} */ ;
/** @type {__VLS_StyleScopedClasses['md:px-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-start']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['px-1']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['md:text-3xl']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['md:text-base']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['md:hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['!w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['sm:!w-96']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['min-h-0']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-[280px_minmax(0,1fr)]']} */ ;
/** @type {__VLS_StyleScopedClasses['hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['min-h-0']} */ ;
/** @type {__VLS_StyleScopedClasses['md:block']} */ ;
/** @type {__VLS_StyleScopedClasses['min-h-0']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-4']} */ ;
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
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['min-h-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['sticky']} */ ;
/** @type {__VLS_StyleScopedClasses['bottom-0']} */ ;
/** @type {__VLS_StyleScopedClasses['z-10']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Button: Button,
            Drawer: Drawer,
            CommandComposer: CommandComposer,
            CommandTimeline: CommandTimeline,
            ConversationList: ConversationList,
            mobileChatsVisible: mobileChatsVisible,
            activeExecutionRun: activeExecutionRun,
            timeline: timeline,
            conversations: conversations,
            activeConversationId: activeConversationId,
            isSubmitting: isSubmitting,
            onSubmitCommand: onSubmitCommand,
            onStartNewDiscussion: onStartNewDiscussion,
            onSelectConversation: onSelectConversation,
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