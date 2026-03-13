import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import TabMenu from 'primevue/tabmenu';
import { supabase } from '../../services/supabase';
import { useUserStore } from '../../stores/user';
import Button from 'primevue/button';
const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const items = ref([
    { label: 'Topics You Watch', icon: 'pi pi-search', to: '/messages/topic',
        tooltip: 'Emails matching your watch keywords' },
    { label: 'AI Categories', icon: 'pi pi-tags', to: '/messages/category',
        tooltip: 'Emails classified by importance by the AI' }
]);
const activeIndex = ref(0);
const lastSync = ref(null);
const loading = ref(false);
const updateActiveIndex = () => {
    const currentPath = route.path;
    if (currentPath.includes('/messages/topic'))
        activeIndex.value = 0;
    else if (currentPath.includes('/messages/category'))
        activeIndex.value = 1;
};
const fetchSyncStatus = async () => {
    if (!userStore.profile?.organization_id)
        return;
    const { data } = await supabase
        .from('workspace_integrations')
        .select('last_sync_at')
        .eq('organization_id', userStore.profile.organization_id)
        .eq('provider', 'google')
        .single();
    if (data) {
        lastSync.value = data.last_sync_at;
    }
};
const refreshSync = async () => {
    loading.value = true;
    // Trigger sync endpoint or task if available, for now just reload status
    // Ideally this would trigger an ingestion task
    await fetchSyncStatus();
    // Simulate delay
    setTimeout(() => { loading.value = false; }, 1000);
};
const onTabChange = (event) => {
    router.push(event.value.to);
};
onMounted(() => {
    updateActiveIndex();
    fetchSyncStatus();
});
// Watch for route changes to update tab
router.afterEach(() => {
    updateActiveIndex();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "messages-layout space-y-6" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "flex justify-between items-center px-6 pt-6" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "text-3xl font-bold text-executive-primary tracking-tight font-sans" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-slate-500 mt-2 font-technical" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-4" },
});
if (__VLS_ctx.lastSync) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-sm text-slate-500 italic" },
    });
    (new Date(__VLS_ctx.lastSync).toLocaleString());
}
const __VLS_0 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    icon: "pi pi-refresh",
    text: true,
    rounded: true,
    'aria-label': "Refresh",
    loading: (__VLS_ctx.loading),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    icon: "pi pi-refresh",
    text: true,
    rounded: true,
    'aria-label': "Refresh",
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.refreshSync)
};
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "px-6" },
});
const __VLS_8 = {}.TabMenu;
/** @type {[typeof __VLS_components.TabMenu, typeof __VLS_components.TabMenu, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ 'onTabChange': {} },
    model: (__VLS_ctx.items),
    activeIndex: (__VLS_ctx.activeIndex),
}));
const __VLS_10 = __VLS_9({
    ...{ 'onTabChange': {} },
    model: (__VLS_ctx.items),
    activeIndex: (__VLS_ctx.activeIndex),
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
let __VLS_12;
let __VLS_13;
let __VLS_14;
const __VLS_15 = {
    onTabChange: (__VLS_ctx.onTabChange)
};
__VLS_11.slots.default;
{
    const { item: __VLS_thisSlot } = __VLS_11.slots;
    const [{ item, props }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
        ...(props.action),
        ...{ class: "flex align-items-center gap-2" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vTooltip)(null, { ...__VLS_directiveBindingRestFields, modifiers: { top: true, }, value: (item.tooltip) }, null, null);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: (item.icon) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-bold" },
    });
    (item.label);
}
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "content px-6 pb-6" },
});
var __VLS_16 = {};
/** @type {__VLS_StyleScopedClasses['messages-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-6']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-6']} */ ;
/** @type {__VLS_StyleScopedClasses['text-3xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['italic']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['align-items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['content']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['pb-6']} */ ;
// @ts-ignore
var __VLS_17 = __VLS_16;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            TabMenu: TabMenu,
            Button: Button,
            items: items,
            activeIndex: activeIndex,
            lastSync: lastSync,
            loading: loading,
            refreshSync: refreshSync,
            onTabChange: onTabChange,
        };
    },
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=MessagesLayout.vue.js.map