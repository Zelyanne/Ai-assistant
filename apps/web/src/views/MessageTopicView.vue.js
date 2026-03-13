import { ref, onMounted } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import MessagesLayout from '../components/messages/MessagesLayout.vue';
import EmailListItem from '../components/messages/EmailListItem.vue';
import VirtualScroller from 'primevue/virtualscroller';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';
const userStore = useUserStore();
const emails = ref([]);
const loading = ref(true);
const error = ref(null);
const fetchEmails = async () => {
    if (!userStore.profile?.organization_id)
        return;
    loading.value = true;
    try {
        // Fetch emails associated with watch topics
        // This is a bit complex in Supabase without a view, so we might need a join or two queries.
        // For MVP, let's fetch emails that HAVE a priority score (implies relevance) 
        // OR we can rely on `metadata->>'topic'` if we store it.
        // But `ingested_threads` doesn't explicitly link to `watch_topics`.
        // The `MorningBriefProcessor` does this matching.
        // For this view, we'll just show all ingested threads sorted by date for now, 
        // as "Topics" view usually implies "Relevant stuff".
        // IMPROVEMENT: Add a `topic` column to `ingested_threads` or a junction table.
        // For now, let's filter by `priority_score > 0` as a proxy for "Matched a topic/relevant".
        const { data, error: err } = await supabase
            .from('ingested_threads')
            .select('*')
            .eq('organization_id', userStore.profile.organization_id)
            .order('created_at', { ascending: false })
            .limit(100); // Pagination needed for real scale
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
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex justify-center p-10" },
    });
    const __VLS_4 = {}.ProgressSpinner;
    /** @type {[typeof __VLS_components.ProgressSpinner, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
    const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
}
if (__VLS_ctx.error) {
    const __VLS_8 = {}.Message;
    /** @type {[typeof __VLS_components.Message, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        severity: "error",
        text: (__VLS_ctx.error),
    }));
    const __VLS_10 = __VLS_9({
        severity: "error",
        text: (__VLS_ctx.error),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
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
            ...{ class: "h-[calc(100vh-250px)] min-h-[500px]" },
        });
        const __VLS_12 = {}.VirtualScroller;
        /** @type {[typeof __VLS_components.VirtualScroller, typeof __VLS_components.VirtualScroller, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            items: (__VLS_ctx.emails),
            itemSize: (120),
            ...{ class: "h-full" },
        }));
        const __VLS_14 = __VLS_13({
            items: (__VLS_ctx.emails),
            itemSize: (120),
            ...{ class: "h-full" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        __VLS_15.slots.default;
        {
            const { item: __VLS_thisSlot } = __VLS_15.slots;
            const [{ item }] = __VLS_getSlotParams(__VLS_thisSlot);
            /** @type {[typeof EmailListItem, ]} */ ;
            // @ts-ignore
            const __VLS_16 = __VLS_asFunctionalComponent(EmailListItem, new EmailListItem({
                email: (item),
            }));
            const __VLS_17 = __VLS_16({
                email: (item),
            }, ...__VLS_functionalComponentArgsRest(__VLS_16));
        }
        var __VLS_15;
    }
}
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['p-10']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-500']} */ ;
/** @type {__VLS_StyleScopedClasses['py-10']} */ ;
/** @type {__VLS_StyleScopedClasses['h-[calc(100vh-250px)]']} */ ;
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
            emails: emails,
            loading: loading,
            error: error,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=MessageTopicView.vue.js.map