import { computed, onMounted, onUnmounted } from 'vue';
import { useUserStore } from '../../stores/user';
import Button from 'primevue/button';
import ToggleSwitch from 'primevue/toggleswitch';
import { useSafetyControls } from '../../composables/useSafetyControls';
const userStore = useUserStore();
const safetyControls = useSafetyControls();
const toggleDisabled = computed(() => {
    if (safetyControls.loading.value || safetyControls.saving.value)
        return true;
    // Anyone can enable; only CEO can disable.
    return safetyControls.emergencyBrakeEnabled.value && userStore.isCEO !== true;
});
const toggleTooltip = computed(() => {
    if (toggleDisabled.value && safetyControls.emergencyBrakeEnabled.value && userStore.isCEO !== true) {
        return 'Only the CEO can disable the Emergency Brake.';
    }
    return safetyControls.emergencyBrakeEnabled.value
        ? 'Brake engaged: proxy actions will be paused.'
        : 'Brake off: proxy actions can run normally.';
});
const brakeModel = computed({
    get() {
        return safetyControls.emergencyBrakeEnabled.value;
    },
    set(next) {
        void safetyControls.setEmergencyBrakeEnabled(next);
    },
});
onMounted(() => {
    void safetyControls.refresh();
    safetyControls.subscribe();
});
onUnmounted(() => {
    safetyControls.unsubscribe();
});
const __VLS_emit = defineEmits(['toggle-menu']);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "h-16 bg-white border-b border-executive-background flex items-center justify-between px-6 sticky top-0 z-50" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-4" },
});
const __VLS_0 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    icon: "pi pi-bars",
    ...{ class: "md:hidden !p-2" },
    severity: "secondary",
    text: true,
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    icon: "pi pi-bars",
    ...{ class: "md:hidden !p-2" },
    severity: "secondary",
    text: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (...[$event]) => {
        __VLS_ctx.$emit('toggle-menu');
    }
};
var __VLS_3;
const __VLS_8 = {}.RouterLink;
/** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    to: "/dashboard",
    ...{ class: "flex items-center gap-2 no-underline" },
}));
const __VLS_10 = __VLS_9({
    to: "/dashboard",
    ...{ class: "flex items-center gap-2 no-underline" },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-xl font-bold text-executive-primary tracking-tight" },
});
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-3 shrink-0" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "hidden sm:flex flex-col leading-tight" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400" },
});
if (__VLS_ctx.safetyControls.emergencyBrakeEnabled) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-2 text-rose-700 font-semibold" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "h-2 w-2 rounded-full bg-rose-600 animate-pulse" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-slate-500 text-sm" },
    });
}
const __VLS_12 = {}.ToggleSwitch;
/** @type {[typeof __VLS_components.ToggleSwitch, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    modelValue: (__VLS_ctx.brakeModel),
    disabled: (__VLS_ctx.toggleDisabled),
    'aria-label': ('Emergency Brake Toggle'),
    dataTestid: "emergency-brake-toggle",
}));
const __VLS_14 = __VLS_13({
    modelValue: (__VLS_ctx.brakeModel),
    disabled: (__VLS_ctx.toggleDisabled),
    'aria-label': ('Emergency Brake Toggle'),
    dataTestid: "emergency-brake-toggle",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_asFunctionalDirective(__VLS_directives.vTooltip)(null, { ...__VLS_directiveBindingRestFields, modifiers: { bottom: true, }, value: (__VLS_ctx.toggleTooltip) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "h-8 w-px bg-executive-background mx-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "text-right hidden sm:block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "text-sm font-semibold text-executive-primary leading-none" },
});
(__VLS_ctx.userStore.profile?.full_name || 'User');
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "text-xs text-slate-500 mt-1" },
});
(__VLS_ctx.userStore.profile?.role);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "h-10 w-10 rounded-full bg-executive-background flex items-center justify-center text-executive-primary font-bold" },
});
(__VLS_ctx.userStore.profile?.email?.[0].toUpperCase());
/** @type {__VLS_StyleScopedClasses['h-16']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['border-b']} */ ;
/** @type {__VLS_StyleScopedClasses['border-executive-background']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['sticky']} */ ;
/** @type {__VLS_StyleScopedClasses['top-0']} */ ;
/** @type {__VLS_StyleScopedClasses['z-50']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['md:hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['!p-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['no-underline']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['sm:flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.2em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-rose-700']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['h-2']} */ ;
/** @type {__VLS_StyleScopedClasses['w-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-rose-600']} */ ;
/** @type {__VLS_StyleScopedClasses['animate-pulse']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['h-8']} */ ;
/** @type {__VLS_StyleScopedClasses['w-px']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-executive-background']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-right']} */ ;
/** @type {__VLS_StyleScopedClasses['hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['sm:block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-none']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['h-10']} */ ;
/** @type {__VLS_StyleScopedClasses['w-10']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-executive-background']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Button: Button,
            ToggleSwitch: ToggleSwitch,
            userStore: userStore,
            safetyControls: safetyControls,
            toggleDisabled: toggleDisabled,
            toggleTooltip: toggleTooltip,
            brakeModel: brakeModel,
        };
    },
    emits: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    emits: {},
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=AppHeader.vue.js.map