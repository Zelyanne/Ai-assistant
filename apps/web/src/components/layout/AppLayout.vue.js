import { computed, ref } from 'vue';
import AppHeader from './AppHeader.vue';
import AppSidebar from './AppSidebar.vue';
import Drawer from 'primevue/drawer';
import { useRoute } from 'vue-router';
const mobileMenuVisible = ref(false);
const route = useRoute();
const isWideLayout = computed(() => route.meta.layoutWidth === 'wide');
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "min-h-screen bg-executive-background flex flex-col font-sans text-executive-primary" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
    href: "#app-main",
    ...{ class: "sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 rounded-xl bg-white px-4 py-2 text-sm font-semibold shadow-sm ring-2 ring-executive-primary/20" },
});
/** @type {[typeof AppHeader, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(AppHeader, new AppHeader({
    ...{ 'onToggleMenu': {} },
}));
const __VLS_1 = __VLS_0({
    ...{ 'onToggleMenu': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onToggleMenu: (...[$event]) => {
        __VLS_ctx.mobileMenuVisible = true;
    }
};
var __VLS_2;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex-1 flex overflow-hidden" },
});
/** @type {[typeof AppSidebar, ]} */ ;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent(AppSidebar, new AppSidebar({
    ...{ class: "hidden md:flex shrink-0" },
}));
const __VLS_8 = __VLS_7({
    ...{ class: "hidden md:flex shrink-0" },
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
const __VLS_10 = {}.Drawer;
/** @type {[typeof __VLS_components.Drawer, typeof __VLS_components.Drawer, ]} */ ;
// @ts-ignore
const __VLS_11 = __VLS_asFunctionalComponent(__VLS_10, new __VLS_10({
    id: "app-mobile-nav",
    visible: (__VLS_ctx.mobileMenuVisible),
    header: "Navigation",
    ...{ class: "!w-72" },
    role: "region",
}));
const __VLS_12 = __VLS_11({
    id: "app-mobile-nav",
    visible: (__VLS_ctx.mobileMenuVisible),
    header: "Navigation",
    ...{ class: "!w-72" },
    role: "region",
}, ...__VLS_functionalComponentArgsRest(__VLS_11));
__VLS_13.slots.default;
/** @type {[typeof AppSidebar, ]} */ ;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent(AppSidebar, new AppSidebar({
    ...{ class: "!border-none !w-full" },
}));
const __VLS_15 = __VLS_14({
    ...{ class: "!border-none !w-full" },
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
var __VLS_13;
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    id: "app-main",
    ...{ class: "flex-1 overflow-y-auto p-8 lg:p-12" },
    tabindex: "-1",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mx-auto min-h-0" },
    ...{ class: (__VLS_ctx.isWideLayout ? 'max-w-none' : 'max-w-6xl') },
});
const __VLS_17 = {}.RouterView;
/** @type {[typeof __VLS_components.RouterView, typeof __VLS_components.routerView, typeof __VLS_components.RouterView, typeof __VLS_components.routerView, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({}));
const __VLS_19 = __VLS_18({}, ...__VLS_functionalComponentArgsRest(__VLS_18));
{
    const { default: __VLS_thisSlot } = __VLS_20.slots;
    const [{ Component }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_21 = {}.transition;
    /** @type {[typeof __VLS_components.Transition, typeof __VLS_components.transition, typeof __VLS_components.Transition, typeof __VLS_components.transition, ]} */ ;
    // @ts-ignore
    const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
        name: "fade",
        mode: "out-in",
    }));
    const __VLS_23 = __VLS_22({
        name: "fade",
        mode: "out-in",
    }, ...__VLS_functionalComponentArgsRest(__VLS_22));
    __VLS_24.slots.default;
    const __VLS_25 = ((Component));
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({}));
    const __VLS_27 = __VLS_26({}, ...__VLS_functionalComponentArgsRest(__VLS_26));
    var __VLS_24;
    __VLS_20.slots['' /* empty slot name completion */];
}
var __VLS_20;
/** @type {__VLS_StyleScopedClasses['min-h-screen']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-executive-background']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['focus:not-sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['focus:fixed']} */ ;
/** @type {__VLS_StyleScopedClasses['focus:left-4']} */ ;
/** @type {__VLS_StyleScopedClasses['focus:top-4']} */ ;
/** @type {__VLS_StyleScopedClasses['focus:z-50']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['ring-2']} */ ;
/** @type {__VLS_StyleScopedClasses['ring-executive-primary/20']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['md:flex']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['!w-72']} */ ;
/** @type {__VLS_StyleScopedClasses['!border-none']} */ ;
/** @type {__VLS_StyleScopedClasses['!w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-y-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['p-8']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:p-12']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['min-h-0']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            AppHeader: AppHeader,
            AppSidebar: AppSidebar,
            Drawer: Drawer,
            mobileMenuVisible: mobileMenuVisible,
            isWideLayout: isWideLayout,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=AppLayout.vue.js.map