import { ref } from 'vue';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
const props = withDefaults(defineProps(), {
    disabled: false,
    placeholder: 'Type a command…',
    variant: 'default',
});
const emit = defineEmits();
const draft = ref('');
const composerInputId = 'command-composer-input';
function submitDraft() {
    if (props.disabled)
        return;
    const trimmed = draft.value.trim();
    if (!trimmed)
        return;
    emit('submit', trimmed);
    draft.value = '';
}
function onComposerKeydown(event) {
    if (event.key !== 'Enter' || event.shiftKey)
        return;
    event.preventDefault();
    submitDraft();
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    disabled: false,
    placeholder: 'Type a command…',
    variant: 'default',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "border border-slate-200 bg-white shadow-sm" },
    ...{ class: (props.variant === 'chat'
            ? 'rounded-[1.25rem] p-3 md:p-4'
            : 'rounded-executive p-4') },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    for: (__VLS_ctx.composerInputId),
    ...{ class: "mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-3 md:flex-row md:items-end" },
});
const __VLS_0 = {}.Textarea;
/** @type {[typeof __VLS_components.Textarea, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onKeydown': {} },
    id: (__VLS_ctx.composerInputId),
    modelValue: (__VLS_ctx.draft),
    disabled: (__VLS_ctx.disabled),
    placeholder: (__VLS_ctx.placeholder),
    name: "command",
    autocomplete: "off",
    rows: "3",
    autoResize: true,
    ...{ class: "w-full" },
}));
const __VLS_2 = __VLS_1({
    ...{ 'onKeydown': {} },
    id: (__VLS_ctx.composerInputId),
    modelValue: (__VLS_ctx.draft),
    disabled: (__VLS_ctx.disabled),
    placeholder: (__VLS_ctx.placeholder),
    name: "command",
    autocomplete: "off",
    rows: "3",
    autoResize: true,
    ...{ class: "w-full" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onKeydown: (__VLS_ctx.onComposerKeydown)
};
var __VLS_3;
const __VLS_8 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ 'onClick': {} },
    label: "Send",
    icon: "pi pi-send",
    disabled: (__VLS_ctx.disabled || __VLS_ctx.draft.trim().length === 0),
    ...{ class: "md:w-auto" },
}));
const __VLS_10 = __VLS_9({
    ...{ 'onClick': {} },
    label: "Send",
    icon: "pi pi-send",
    disabled: (__VLS_ctx.disabled || __VLS_ctx.draft.trim().length === 0),
    ...{ class: "md:w-auto" },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
let __VLS_12;
let __VLS_13;
let __VLS_14;
const __VLS_15 = {
    onClick: (__VLS_ctx.submitDraft)
};
var __VLS_11;
if (props.variant !== 'chat') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "mt-2 text-xs text-slate-500" },
    });
}
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['md:flex-row']} */ ;
/** @type {__VLS_StyleScopedClasses['md:items-end']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['md:w-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Button: Button,
            Textarea: Textarea,
            draft: draft,
            composerInputId: composerInputId,
            submitDraft: submitDraft,
            onComposerKeydown: onComposerKeydown,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=CommandComposer.vue.js.map