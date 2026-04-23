import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
const route = useRoute();
const navItems = [
    { label: 'Command Center', icon: 'pi pi-comments', to: '/dashboard/command-center' },
    { label: 'Dashboard', icon: 'pi pi-home', to: '/dashboard' },
    { label: 'Messages', icon: 'pi pi-envelope', to: '/messages/topic' },
    { label: 'Protocol', icon: 'pi pi-bolt', to: '/dashboard/brain-setup' },
    { label: 'Audit Log', icon: 'pi pi-shield', to: '/dashboard/audit-log' },
    { label: 'Settings', icon: 'pi pi-cog', to: '/dashboard/settings' },
];
const isCollapsed = ref(false);
const collapseButtonLabel = computed(() => {
    return isCollapsed.value ? 'Expand sidebar' : 'Collapse sidebar';
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "bg-white border-r border-executive-background flex flex-col transition-[width] duration-300 ease-in-out" },
    ...{ class: ([__VLS_ctx.isCollapsed ? 'w-20' : 'w-64']) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex-1 py-6 px-3 space-y-2" },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.navItems))) {
    const __VLS_0 = {}.RouterLink;
    /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        key: (item.to),
        to: (item.to),
        'aria-label': (item.label),
        title: (item.label),
        ...{ class: "flex items-center gap-3 px-3 py-3 rounded-executive no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-executive-primary/30" },
        ...{ class: ([
                __VLS_ctx.route.path.startsWith(item.to) && (item.to !== '/dashboard' || __VLS_ctx.route.path === '/dashboard')
                    ? 'bg-slate-100 text-executive-primary font-semibold'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-executive-primary'
            ]) },
    }));
    const __VLS_2 = __VLS_1({
        key: (item.to),
        to: (item.to),
        'aria-label': (item.label),
        title: (item.label),
        ...{ class: "flex items-center gap-3 px-3 py-3 rounded-executive no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-executive-primary/30" },
        ...{ class: ([
                __VLS_ctx.route.path.startsWith(item.to) && (item.to !== '/dashboard' || __VLS_ctx.route.path === '/dashboard')
                    ? 'bg-slate-100 text-executive-primary font-semibold'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-executive-primary'
            ]) },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
        ...{ class: (item.icon) },
        ...{ class: "text-lg" },
        'aria-hidden': "true",
    });
    if (!__VLS_ctx.isCollapsed) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-sm" },
        });
        (item.label);
    }
    var __VLS_3;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "p-4 border-t border-executive-background" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.isCollapsed = !__VLS_ctx.isCollapsed;
        } },
    type: "button",
    ...{ class: "w-full flex items-center justify-center p-2 rounded-executive hover:bg-slate-50 text-slate-400 hover:text-executive-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-executive-primary/30" },
    'aria-label': (__VLS_ctx.collapseButtonLabel),
    'aria-expanded': (!__VLS_ctx.isCollapsed),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
    ...{ class: (__VLS_ctx.isCollapsed ? 'pi pi-angle-double-right' : 'pi pi-angle-double-left') },
    'aria-hidden': "true",
});
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['border-r']} */ ;
/** @type {__VLS_StyleScopedClasses['border-executive-background']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-[width]']} */ ;
/** @type {__VLS_StyleScopedClasses['duration-300']} */ ;
/** @type {__VLS_StyleScopedClasses['ease-in-out']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['py-6']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-3']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['no-underline']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['focus-visible:outline-none']} */ ;
/** @type {__VLS_StyleScopedClasses['focus-visible:ring-2']} */ ;
/** @type {__VLS_StyleScopedClasses['focus-visible:ring-executive-primary/30']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['border-executive-background']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['p-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['focus-visible:outline-none']} */ ;
/** @type {__VLS_StyleScopedClasses['focus-visible:ring-2']} */ ;
/** @type {__VLS_StyleScopedClasses['focus-visible:ring-executive-primary/30']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            route: route,
            navItems: navItems,
            isCollapsed: isCollapsed,
            collapseButtonLabel: collapseButtonLabel,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=AppSidebar.vue.js.map