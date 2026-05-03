import { ref, onMounted, defineProps, defineEmits, watch } from 'vue';
import Checkbox from 'primevue/checkbox';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
const props = defineProps();
const emit = defineEmits(['update:preferences']);
const labels = ref([]);
const selectedLabels = ref([]);
const loading = ref(false);
const error = ref(null);
const fetchLabels = async () => {
    loading.value = true;
    error.value = null;
    try {
        const agentUrl = import.meta.env.VITE_AGENT_URL_PROJECT_GOOGLE_ASSITANT || 'http://localhost:3001';
        const response = await fetch(`${agentUrl}/api/gmail/labels?organizationId=${props.organizationId}`);
        if (!response.ok) {
            throw new Error('Failed to fetch labels');
        }
        const data = await response.json();
        labels.value = data.labels;
    }
    catch (err) {
        error.value = err.message;
    }
    finally {
        loading.value = false;
    }
};
onMounted(() => {
    // If initialPreferences is empty, we don't necessarily select all in UI,
    // but if it's meant to be "all", user sees none selected which implies all (or none).
    // The spec says: "default to empty array (no filtering = all labels)".
    // "If none selected, all emails will be ingested".
    selectedLabels.value = [...props.initialPreferences];
    fetchLabels();
});
watch(selectedLabels, (newVal) => {
    emit('update:preferences', newVal);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gmail-label-selector" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    ...{ class: "text-lg font-semibold mb-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-sm text-gray-500 mb-4" },
});
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex justify-center p-4" },
    });
    const __VLS_0 = {}.ProgressSpinner;
    /** @type {[typeof __VLS_components.ProgressSpinner, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ style: {} },
    }));
    const __VLS_2 = __VLS_1({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
}
if (__VLS_ctx.error) {
    const __VLS_4 = {}.Message;
    /** @type {[typeof __VLS_components.Message, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        severity: "error",
        text: (__VLS_ctx.error),
    }));
    const __VLS_6 = __VLS_5({
        severity: "error",
        text: (__VLS_ctx.error),
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
}
if (!__VLS_ctx.loading && !__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "labels-grid max-h-60 overflow-y-auto border border-gray-200 rounded p-4" },
    });
    for (const [label] of __VLS_getVForSourceType((__VLS_ctx.labels))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (label.id),
            ...{ class: "field-checkbox flex items-center mb-2" },
        });
        const __VLS_8 = {}.Checkbox;
        /** @type {[typeof __VLS_components.Checkbox, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            modelValue: (__VLS_ctx.selectedLabels),
            inputId: (label.id),
            name: "label",
            value: (label.id),
        }));
        const __VLS_10 = __VLS_9({
            modelValue: (__VLS_ctx.selectedLabels),
            inputId: (label.id),
            name: "label",
            value: (label.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            for: (label.id),
            ...{ class: "ml-2 text-sm cursor-pointer" },
        });
        (label.name);
    }
}
if (!__VLS_ctx.loading && !__VLS_ctx.error && __VLS_ctx.labels.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-gray-500 text-center py-4" },
    });
}
if (__VLS_ctx.selectedLabels.length === 0 && !__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mt-2 text-xs text-orange-500 flex items-center gap-1" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
        ...{ class: "pi pi-exclamation-triangle" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
/** @type {__VLS_StyleScopedClasses['gmail-label-selector']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-4']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['labels-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['max-h-60']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-y-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-gray-200']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['field-checkbox']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['cursor-pointer']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['py-4']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-orange-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-exclamation-triangle']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Checkbox: Checkbox,
            Message: Message,
            ProgressSpinner: ProgressSpinner,
            labels: labels,
            selectedLabels: selectedLabels,
            loading: loading,
            error: error,
        };
    },
    emits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    emits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=GmailLabelSelector.vue.js.map