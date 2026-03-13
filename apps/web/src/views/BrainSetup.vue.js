import { ref, onMounted, onUnmounted, computed } from 'vue';
import WatchTopics from '../components/WatchTopics.vue';
import OutcomeCard from '../components/activity/OutcomeCard.vue';
import { useAgent } from '../composables/useAgent';
import { useProtocolOptimization } from '../composables/useProtocolOptimization';
import { useUserStore } from '../stores/user';
import { supabase } from '../services/supabase';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Badge from 'primevue/badge';
import Textarea from 'primevue/textarea';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
const userStore = useUserStore();
const { loading: agentLoading, error: agentError, submitTask, monitorTask } = useAgent();
const { suggestions, loading: optLoading, fetchSuggestions, approveOptimization, declineOptimization } = useProtocolOptimization();
const philosophy = ref('');
const generatedProtocol = ref(null);
const generatedMetadata = ref(null);
const currentTaskId = ref(null);
const isSaving = ref(false);
const saveSuccess = ref(false);
const loading = computed(() => agentLoading.value || optLoading.value);
let unsubscribe = null;
onMounted(() => {
    fetchSuggestions();
});
function getOptimizationSuggestion(task) {
    const result = task.result;
    return result?.suggestion ?? null;
}
async function handleGenerate() {
    if (!philosophy.value.trim())
        return;
    generatedProtocol.value = null;
    generatedMetadata.value = null;
    saveSuccess.value = false;
    const task = await submitTask('protocol.generate', { philosophy: philosophy.value });
    if (task && task.id) {
        currentTaskId.value = task.id;
        unsubscribe = monitorTask(task.id, (updatedTask) => {
            if (updatedTask.status === 'done' && updatedTask.result) {
                generatedProtocol.value = typeof updatedTask.result.protocol_markdown === 'string'
                    ? updatedTask.result.protocol_markdown
                    : null;
                generatedMetadata.value = updatedTask.result.metadata ?? null;
                currentTaskId.value = null;
                if (unsubscribe)
                    unsubscribe();
            }
            else if (updatedTask.status === 'error') {
                currentTaskId.value = null;
                if (unsubscribe)
                    unsubscribe();
            }
        });
    }
}
async function handleApprove() {
    if (!generatedProtocol.value || !userStore.profile?.organization_id)
        return;
    isSaving.value = true;
    try {
        const { error } = await supabase
            .from('user_protocols')
            .upsert({
            organization_id: userStore.profile.organization_id,
            user_id: userStore.profile.id,
            title: 'Primary Leadership Protocol',
            content_markdown: generatedProtocol.value,
            metadata: generatedMetadata.value || {},
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'organization_id'
        });
        if (error)
            throw error;
        saveSuccess.value = true;
    }
    catch (err) {
        console.error('Failed to save protocol:', err);
    }
    finally {
        isSaving.value = false;
    }
}
onUnmounted(() => {
    if (unsubscribe)
        unsubscribe();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "max-w-4xl mx-auto space-y-8 py-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "text-3xl font-bold text-executive-primary tracking-tight font-sans" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-slate-500 mt-2 font-technical" },
});
const __VLS_0 = {}.Card;
/** @type {[typeof __VLS_components.Card, typeof __VLS_components.Card, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "border-none shadow-sm overflow-hidden" },
}));
const __VLS_2 = __VLS_1({
    ...{ class: "border-none shadow-sm overflow-hidden" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
{
    const { content: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "space-y-4" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        for: "philosophy",
        ...{ class: "block text-sm font-medium text-slate-700 uppercase tracking-wider" },
    });
    const __VLS_4 = {}.Textarea;
    /** @type {[typeof __VLS_components.Textarea, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        id: "philosophy",
        modelValue: (__VLS_ctx.philosophy),
        rows: "8",
        ...{ class: "w-full font-technical text-executive-primary border-slate-200 focus:border-executive-info" },
        placeholder: "Example: I prefer a direct but supportive communication style. Nudge me if a task is overdue by more than 24 hours. For critical escalations, use a more urgent tone...",
        disabled: (__VLS_ctx.loading || !!__VLS_ctx.currentTaskId),
    }));
    const __VLS_6 = __VLS_5({
        id: "philosophy",
        modelValue: (__VLS_ctx.philosophy),
        rows: "8",
        ...{ class: "w-full font-technical text-executive-primary border-slate-200 focus:border-executive-info" },
        placeholder: "Example: I prefer a direct but supportive communication style. Nudge me if a task is overdue by more than 24 hours. For critical escalations, use a more urgent tone...",
        disabled: (__VLS_ctx.loading || !!__VLS_ctx.currentTaskId),
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex justify-end" },
    });
    const __VLS_8 = {}.Button;
    /** @type {[typeof __VLS_components.Button, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ 'onClick': {} },
        label: "Generate Protocol",
        icon: "pi pi-bolt",
        loading: (__VLS_ctx.loading || !!__VLS_ctx.currentTaskId),
        ...{ class: "bg-executive-primary text-white border-none px-6" },
    }));
    const __VLS_10 = __VLS_9({
        ...{ 'onClick': {} },
        label: "Generate Protocol",
        icon: "pi pi-bolt",
        loading: (__VLS_ctx.loading || !!__VLS_ctx.currentTaskId),
        ...{ class: "bg-executive-primary text-white border-none px-6" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    let __VLS_12;
    let __VLS_13;
    let __VLS_14;
    const __VLS_15 = {
        onClick: (__VLS_ctx.handleGenerate)
    };
    var __VLS_11;
}
var __VLS_3;
if (__VLS_ctx.currentTaskId) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex flex-col items-center justify-center p-12 space-y-4" },
    });
    const __VLS_16 = {}.ProgressSpinner;
    /** @type {[typeof __VLS_components.ProgressSpinner, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        ...{ style: {} },
        strokeWidth: "4",
    }));
    const __VLS_18 = __VLS_17({
        ...{ style: {} },
        strokeWidth: "4",
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "text-executive-info font-technical animate-pulse" },
    });
}
if (__VLS_ctx.agentError) {
    const __VLS_20 = {}.Message;
    /** @type {[typeof __VLS_components.Message, typeof __VLS_components.Message, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        severity: "error",
        ...{ class: "font-technical" },
    }));
    const __VLS_22 = __VLS_21({
        severity: "error",
        ...{ class: "font-technical" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    __VLS_23.slots.default;
    (__VLS_ctx.agentError);
    var __VLS_23;
}
if (__VLS_ctx.generatedProtocol) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "space-y-6" },
    });
    const __VLS_24 = {}.Card;
    /** @type {[typeof __VLS_components.Card, typeof __VLS_components.Card, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        ...{ class: "border-none shadow-sm overflow-hidden bg-slate-50" },
    }));
    const __VLS_26 = __VLS_25({
        ...{ class: "border-none shadow-sm overflow-hidden bg-slate-50" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    __VLS_27.slots.default;
    {
        const { title: __VLS_thisSlot } = __VLS_27.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex items-center justify-between px-2" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-lg font-semibold text-executive-primary" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "space-x-2" },
        });
        const __VLS_28 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
            ...{ 'onClick': {} },
            label: "Regenerate",
            icon: "pi pi-refresh",
            severity: "secondary",
            text: true,
            ...{ class: "font-technical" },
        }));
        const __VLS_30 = __VLS_29({
            ...{ 'onClick': {} },
            label: "Regenerate",
            icon: "pi pi-refresh",
            severity: "secondary",
            text: true,
            ...{ class: "font-technical" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        let __VLS_32;
        let __VLS_33;
        let __VLS_34;
        const __VLS_35 = {
            onClick: (__VLS_ctx.handleGenerate)
        };
        var __VLS_31;
        const __VLS_36 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
            ...{ 'onClick': {} },
            label: "Approve & Save",
            icon: "pi pi-check",
            loading: (__VLS_ctx.isSaving),
            ...{ class: "bg-executive-success text-white border-none px-6" },
        }));
        const __VLS_38 = __VLS_37({
            ...{ 'onClick': {} },
            label: "Approve & Save",
            icon: "pi pi-check",
            loading: (__VLS_ctx.isSaving),
            ...{ class: "bg-executive-success text-white border-none px-6" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
        let __VLS_40;
        let __VLS_41;
        let __VLS_42;
        const __VLS_43 = {
            onClick: (__VLS_ctx.handleApprove)
        };
        var __VLS_39;
    }
    {
        const { content: __VLS_thisSlot } = __VLS_27.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "prose prose-slate max-w-none bg-white p-8 rounded-executive border border-slate-200 shadow-inner" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "whitespace-pre-wrap font-technical text-executive-primary" },
        });
        (__VLS_ctx.generatedProtocol);
    }
    var __VLS_27;
    if (__VLS_ctx.saveSuccess) {
        const __VLS_44 = {}.Message;
        /** @type {[typeof __VLS_components.Message, typeof __VLS_components.Message, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
            severity: "success",
            ...{ class: "font-technical" },
        }));
        const __VLS_46 = __VLS_45({
            severity: "success",
            ...{ class: "font-technical" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        __VLS_47.slots.default;
        var __VLS_47;
    }
}
if (__VLS_ctx.suggestions.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "space-y-6" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "flex items-center justify-between" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        ...{ class: "text-xl font-bold text-executive-primary tracking-tight font-sans" },
    });
    const __VLS_48 = {}.Badge;
    /** @type {[typeof __VLS_components.Badge, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        value: (__VLS_ctx.suggestions.length),
        severity: "info",
    }));
    const __VLS_50 = __VLS_49({
        value: (__VLS_ctx.suggestions.length),
        severity: "info",
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "grid grid-cols-1 md:grid-cols-2 gap-4" },
    });
    for (const [task] of __VLS_getVForSourceType((__VLS_ctx.suggestions))) {
        /** @type {[typeof OutcomeCard, typeof OutcomeCard, ]} */ ;
        // @ts-ignore
        const __VLS_52 = __VLS_asFunctionalComponent(OutcomeCard, new OutcomeCard({
            key: (task.id),
            title: (__VLS_ctx.getOptimizationSuggestion(task)?.nl_diff_summary || 'Suggested protocol optimization'),
            summary: (__VLS_ctx.getOptimizationSuggestion(task)?.rationale || 'Review this protocol improvement suggestion.'),
            status: "optimization",
            timestamp: (new Date(task.created_at || '').toLocaleString()),
            taskId: (task.id),
        }));
        const __VLS_53 = __VLS_52({
            key: (task.id),
            title: (__VLS_ctx.getOptimizationSuggestion(task)?.nl_diff_summary || 'Suggested protocol optimization'),
            summary: (__VLS_ctx.getOptimizationSuggestion(task)?.rationale || 'Review this protocol improvement suggestion.'),
            status: "optimization",
            timestamp: (new Date(task.created_at || '').toLocaleString()),
            taskId: (task.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_52));
        __VLS_54.slots.default;
        {
            const { actions: __VLS_thisSlot } = __VLS_54.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "flex gap-2" },
            });
            const __VLS_55 = {}.Button;
            /** @type {[typeof __VLS_components.Button, ]} */ ;
            // @ts-ignore
            const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
                ...{ 'onClick': {} },
                label: "Decline",
                severity: "secondary",
                size: "small",
                text: true,
                ...{ class: "font-technical" },
            }));
            const __VLS_57 = __VLS_56({
                ...{ 'onClick': {} },
                label: "Decline",
                severity: "secondary",
                size: "small",
                text: true,
                ...{ class: "font-technical" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_56));
            let __VLS_59;
            let __VLS_60;
            let __VLS_61;
            const __VLS_62 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.suggestions.length > 0))
                        return;
                    __VLS_ctx.declineOptimization(task);
                }
            };
            var __VLS_58;
            const __VLS_63 = {}.Button;
            /** @type {[typeof __VLS_components.Button, ]} */ ;
            // @ts-ignore
            const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({
                ...{ 'onClick': {} },
                label: "Approve & Apply",
                icon: "pi pi-check",
                severity: "success",
                size: "small",
                ...{ class: "font-technical" },
            }));
            const __VLS_65 = __VLS_64({
                ...{ 'onClick': {} },
                label: "Approve & Apply",
                icon: "pi pi-check",
                severity: "success",
                size: "small",
                ...{ class: "font-technical" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_64));
            let __VLS_67;
            let __VLS_68;
            let __VLS_69;
            const __VLS_70 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.suggestions.length > 0))
                        return;
                    __VLS_ctx.approveOptimization(task);
                }
            };
            var __VLS_66;
        }
        var __VLS_54;
    }
}
/** @type {[typeof WatchTopics, ]} */ ;
// @ts-ignore
const __VLS_71 = __VLS_asFunctionalComponent(WatchTopics, new WatchTopics({}));
const __VLS_72 = __VLS_71({}, ...__VLS_functionalComponentArgsRest(__VLS_71));
/** @type {__VLS_StyleScopedClasses['max-w-4xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-8']} */ ;
/** @type {__VLS_StyleScopedClasses['py-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-3xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['border-none']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-4']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wider']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['focus:border-executive-info']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['text-white']} */ ;
/** @type {__VLS_StyleScopedClasses['border-none']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['p-12']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-info']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['animate-pulse']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-6']} */ ;
/** @type {__VLS_StyleScopedClasses['border-none']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['space-x-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-executive-success']} */ ;
/** @type {__VLS_StyleScopedClasses['text-white']} */ ;
/** @type {__VLS_StyleScopedClasses['border-none']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['prose']} */ ;
/** @type {__VLS_StyleScopedClasses['prose-slate']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-none']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['p-8']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-inner']} */ ;
/** @type {__VLS_StyleScopedClasses['whitespace-pre-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-6']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            WatchTopics: WatchTopics,
            OutcomeCard: OutcomeCard,
            Card: Card,
            Button: Button,
            Badge: Badge,
            Textarea: Textarea,
            Message: Message,
            ProgressSpinner: ProgressSpinner,
            agentError: agentError,
            suggestions: suggestions,
            approveOptimization: approveOptimization,
            declineOptimization: declineOptimization,
            philosophy: philosophy,
            generatedProtocol: generatedProtocol,
            currentTaskId: currentTaskId,
            isSaving: isSaving,
            saveSuccess: saveSuccess,
            loading: loading,
            getOptimizationSuggestion: getOptimizationSuggestion,
            handleGenerate: handleGenerate,
            handleApprove: handleApprove,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=BrainSetup.vue.js.map