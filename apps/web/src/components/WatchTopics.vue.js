import { ref, onMounted } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import Card from 'primevue/card';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Dropdown from 'primevue/dropdown';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Message from 'primevue/message';
const userStore = useUserStore();
const topics = ref([]);
const newTopic = ref('');
const newPriority = ref('Medium');
const loading = ref(false);
const error = ref(null);
const priorityOptions = [
    { label: 'High', value: 'High' },
    { label: 'Medium', value: 'Medium' },
    { label: 'Low', value: 'Low' }
];
async function fetchTopics() {
    if (!userStore.profile?.organization_id)
        return;
    loading.value = true;
    try {
        const { data, error: err } = await supabase
            .from('watch_topics')
            .select('id, topic, priority')
            .eq('organization_id', userStore.profile.organization_id)
            .order('created_at', { ascending: false });
        if (err)
            throw err;
        topics.value = (data || []).map((row) => ({
            id: row.id,
            topic: row.topic,
            priority: row.priority || 'Medium'
        }));
    }
    catch (err) {
        error.value = err.message;
    }
    finally {
        loading.value = false;
    }
}
async function addTopic() {
    if (!newTopic.value.trim() || !userStore.profile?.organization_id)
        return;
    loading.value = true;
    try {
        const { data, error: err } = await supabase
            .from('watch_topics')
            .insert({
            organization_id: userStore.profile.organization_id,
            topic: newTopic.value.trim(),
            priority: newPriority.value,
            keywords_array: []
        })
            .select()
            .single();
        if (err)
            throw err;
        if (data) {
            const row = data;
            topics.value.unshift({
                id: row.id,
                topic: row.topic,
                priority: row.priority || 'Medium'
            });
        }
        newTopic.value = '';
        newPriority.value = 'Medium';
    }
    catch (err) {
        error.value = err.message;
    }
    finally {
        loading.value = false;
    }
}
async function deleteTopic(id) {
    loading.value = true;
    try {
        const { error: err } = await supabase
            .from('watch_topics')
            .delete()
            .eq('id', id);
        if (err)
            throw err;
        topics.value = topics.value.filter(t => t.id !== id);
    }
    catch (err) {
        error.value = err.message;
    }
    finally {
        loading.value = false;
    }
}
onMounted(fetchTopics);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
const __VLS_0 = {}.Card;
/** @type {[typeof __VLS_components.Card, typeof __VLS_components.Card, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "border-none shadow-sm overflow-hidden" },
}));
const __VLS_2 = __VLS_1({
    ...{ class: "border-none shadow-sm overflow-hidden" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
{
    const { title: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-lg font-semibold text-executive-primary uppercase tracking-wider px-2" },
    });
}
{
    const { content: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "space-y-6" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "text-sm text-slate-500 font-technical px-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex gap-4 p-2 bg-slate-50 rounded-executive border border-slate-200" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex-1" },
    });
    const __VLS_5 = {}.InputText;
    /** @type {[typeof __VLS_components.InputText, ]} */ ;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({
        ...{ 'onKeyup': {} },
        modelValue: (__VLS_ctx.newTopic),
        placeholder: "e.g. Investor, Urgent, Newsletter",
        ...{ class: "w-full font-technical" },
    }));
    const __VLS_7 = __VLS_6({
        ...{ 'onKeyup': {} },
        modelValue: (__VLS_ctx.newTopic),
        placeholder: "e.g. Investor, Urgent, Newsletter",
        ...{ class: "w-full font-technical" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    let __VLS_9;
    let __VLS_10;
    let __VLS_11;
    const __VLS_12 = {
        onKeyup: (__VLS_ctx.addTopic)
    };
    var __VLS_8;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "w-32" },
    });
    const __VLS_13 = {}.Dropdown;
    /** @type {[typeof __VLS_components.Dropdown, ]} */ ;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
        modelValue: (__VLS_ctx.newPriority),
        options: (__VLS_ctx.priorityOptions),
        optionLabel: "label",
        optionValue: "value",
        ...{ class: "w-full font-technical" },
    }));
    const __VLS_15 = __VLS_14({
        modelValue: (__VLS_ctx.newPriority),
        options: (__VLS_ctx.priorityOptions),
        optionLabel: "label",
        optionValue: "value",
        ...{ class: "w-full font-technical" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    const __VLS_17 = {}.Button;
    /** @type {[typeof __VLS_components.Button, ]} */ ;
    // @ts-ignore
    const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
        ...{ 'onClick': {} },
        icon: "pi pi-plus",
        loading: (__VLS_ctx.loading),
        ...{ class: "bg-executive-primary border-none" },
    }));
    const __VLS_19 = __VLS_18({
        ...{ 'onClick': {} },
        icon: "pi pi-plus",
        loading: (__VLS_ctx.loading),
        ...{ class: "bg-executive-primary border-none" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_18));
    let __VLS_21;
    let __VLS_22;
    let __VLS_23;
    const __VLS_24 = {
        onClick: (__VLS_ctx.addTopic)
    };
    var __VLS_20;
    if (__VLS_ctx.error) {
        const __VLS_25 = {}.Message;
        /** @type {[typeof __VLS_components.Message, typeof __VLS_components.Message, ]} */ ;
        // @ts-ignore
        const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
            severity: "error",
        }));
        const __VLS_27 = __VLS_26({
            severity: "error",
        }, ...__VLS_functionalComponentArgsRest(__VLS_26));
        __VLS_28.slots.default;
        (__VLS_ctx.error);
        var __VLS_28;
    }
    const __VLS_29 = {}.DataTable;
    /** @type {[typeof __VLS_components.DataTable, typeof __VLS_components.DataTable, ]} */ ;
    // @ts-ignore
    const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
        value: (__VLS_ctx.topics),
        ...{ class: "p-datatable-sm font-technical" },
        loading: (__VLS_ctx.loading),
    }));
    const __VLS_31 = __VLS_30({
        value: (__VLS_ctx.topics),
        ...{ class: "p-datatable-sm font-technical" },
        loading: (__VLS_ctx.loading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_30));
    __VLS_32.slots.default;
    const __VLS_33 = {}.Column;
    /** @type {[typeof __VLS_components.Column, ]} */ ;
    // @ts-ignore
    const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
        field: "topic",
        header: "Topic",
    }));
    const __VLS_35 = __VLS_34({
        field: "topic",
        header: "Topic",
    }, ...__VLS_functionalComponentArgsRest(__VLS_34));
    const __VLS_37 = {}.Column;
    /** @type {[typeof __VLS_components.Column, typeof __VLS_components.Column, ]} */ ;
    // @ts-ignore
    const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
        field: "priority",
        header: "Priority",
    }));
    const __VLS_39 = __VLS_38({
        field: "priority",
        header: "Priority",
    }, ...__VLS_functionalComponentArgsRest(__VLS_38));
    __VLS_40.slots.default;
    {
        const { body: __VLS_thisSlot } = __VLS_40.slots;
        const [slotProps] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: ({
                    'text-red-600 font-bold': slotProps.data.priority === 'High',
                    'text-orange-600': slotProps.data.priority === 'Medium',
                    'text-slate-600': slotProps.data.priority === 'Low'
                }) },
        });
        (slotProps.data.priority);
    }
    var __VLS_40;
    const __VLS_41 = {}.Column;
    /** @type {[typeof __VLS_components.Column, typeof __VLS_components.Column, ]} */ ;
    // @ts-ignore
    const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
        ...{ style: {} },
    }));
    const __VLS_43 = __VLS_42({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_42));
    __VLS_44.slots.default;
    {
        const { body: __VLS_thisSlot } = __VLS_44.slots;
        const [slotProps] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_45 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({
            ...{ 'onClick': {} },
            icon: "pi pi-trash",
            severity: "danger",
            text: true,
            rounded: true,
        }));
        const __VLS_47 = __VLS_46({
            ...{ 'onClick': {} },
            icon: "pi pi-trash",
            severity: "danger",
            text: true,
            rounded: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_46));
        let __VLS_49;
        let __VLS_50;
        let __VLS_51;
        const __VLS_52 = {
            onClick: (...[$event]) => {
                __VLS_ctx.deleteTopic(slotProps.data.id);
            }
        };
        var __VLS_48;
    }
    var __VLS_44;
    {
        const { empty: __VLS_thisSlot } = __VLS_32.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-center p-4 text-slate-400 italic" },
        });
    }
    var __VLS_32;
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['border-none']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wider']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-6']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['p-2']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['w-32']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['border-none']} */ ;
/** @type {__VLS_StyleScopedClasses['p-datatable-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['italic']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Card: Card,
            Button: Button,
            InputText: InputText,
            Dropdown: Dropdown,
            DataTable: DataTable,
            Column: Column,
            Message: Message,
            topics: topics,
            newTopic: newTopic,
            newPriority: newPriority,
            loading: loading,
            error: error,
            priorityOptions: priorityOptions,
            addTopic: addTopic,
            deleteTopic: deleteTopic,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=WatchTopics.vue.js.map