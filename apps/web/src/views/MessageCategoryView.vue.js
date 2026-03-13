import { ref, onMounted } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import MessagesLayout from '../components/messages/MessagesLayout.vue';
import EmailListItem from '../components/messages/EmailListItem.vue';
import VirtualScroller from 'primevue/virtualscroller';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';
import Dropdown from 'primevue/dropdown';
const userStore = useUserStore();
const emails = ref([]);
const loading = ref(true);
const error = ref(null);
const categories = ['All', 'Critical', 'High Priority', 'Action Required', 'FYI', 'Low Priority'];
const selectedCategory = ref('All');
const fetchEmails = async () => {
    if (!userStore.profile?.organization_id)
        return;
    loading.value = true;
    try {
        let query = supabase
            .from('ingested_threads')
            .select('*')
            .eq('organization_id', userStore.profile.organization_id)
            .order('created_at', { ascending: false })
            .limit(100);
        if (selectedCategory.value !== 'All') {
            query = query.ilike('category', selectedCategory.value);
        }
        const { data, error: err } = await query;
        if (err)
            throw err;
        emails.value = data || [];
    }
    catch (err) {
        error.value = err.message;
    }
    finally {
        loading.value = false;
    }
};
const onCategoryChange = () => {
    fetchEmails();
};
onMounted(fetchEmails);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {[typeof MessagesLayout, typeof MessagesLayout, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(MessagesLayout, new MessagesLayout({}));
const __VLS_1 = __VLS_0({}, ...__VLS_functionalComponentArgsRest(__VLS_0));
var __VLS_3 = {};
__VLS_2.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mb-4 flex items-center gap-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "font-bold text-gray-700" },
});
const __VLS_4 = {}.Dropdown;
/** @type {[typeof __VLS_components.Dropdown, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.selectedCategory),
    options: (__VLS_ctx.categories),
    ...{ class: "w-56" },
}));
const __VLS_6 = __VLS_5({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.selectedCategory),
    options: (__VLS_ctx.categories),
    ...{ class: "w-56" },
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
let __VLS_8;
let __VLS_9;
let __VLS_10;
const __VLS_11 = {
    onChange: (__VLS_ctx.onCategoryChange)
};
var __VLS_7;
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex justify-center p-10" },
    });
    const __VLS_12 = {}.ProgressSpinner;
    /** @type {[typeof __VLS_components.ProgressSpinner, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
    const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
}
if (__VLS_ctx.error) {
    const __VLS_16 = {}.Message;
    /** @type {[typeof __VLS_components.Message, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        severity: "error",
        text: (__VLS_ctx.error),
    }));
    const __VLS_18 = __VLS_17({
        severity: "error",
        text: (__VLS_ctx.error),
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
}
if (!__VLS_ctx.loading && !__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    if (__VLS_ctx.emails.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-center text-gray-500 py-10" },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "h-[calc(100vh-300px)] min-h-[500px]" },
        });
        const __VLS_20 = {}.VirtualScroller;
        /** @type {[typeof __VLS_components.VirtualScroller, typeof __VLS_components.VirtualScroller, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
            items: (__VLS_ctx.emails),
            itemSize: (120),
            ...{ class: "h-full" },
        }));
        const __VLS_22 = __VLS_21({
            items: (__VLS_ctx.emails),
            itemSize: (120),
            ...{ class: "h-full" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        __VLS_23.slots.default;
        {
            const { item: __VLS_thisSlot } = __VLS_23.slots;
            const [{ item }] = __VLS_getSlotParams(__VLS_thisSlot);
            /** @type {[typeof EmailListItem, ]} */ ;
            // @ts-ignore
            const __VLS_24 = __VLS_asFunctionalComponent(EmailListItem, new EmailListItem({
                email: (item),
            }));
            const __VLS_25 = __VLS_24({
                email: (item),
            }, ...__VLS_functionalComponentArgsRest(__VLS_24));
        }
        var __VLS_23;
    }
}
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['mb-4']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-700']} */ ;
/** @type {__VLS_StyleScopedClasses['w-56']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['p-10']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
/** @type {__VLS_StyleScopedClasses['py-10']} */ ;
/** @type {__VLS_StyleScopedClasses['h-[calc(100vh-300px)]']} */ ;
/** @type {__VLS_StyleScopedClasses['min-h-[500px]']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            MessagesLayout: MessagesLayout,
            EmailListItem: EmailListItem,
            VirtualScroller: VirtualScroller,
            ProgressSpinner: ProgressSpinner,
            Message: Message,
            Dropdown: Dropdown,
            emails: emails,
            loading: loading,
            error: error,
            categories: categories,
            selectedCategory: selectedCategory,
            onCategoryChange: onCategoryChange,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=MessageCategoryView.vue.js.map