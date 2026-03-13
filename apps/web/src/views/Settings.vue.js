import { ref, onMounted } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Toast from 'primevue/toast';
import WorkspaceIntegration from '../components/WorkspaceIntegration.vue';
import SecurityPerimeterSettings from '../components/SecurityPerimeterSettings.vue';
import GmailLabelSelector from '../components/GmailLabelSelector.vue';
const userStore = useUserStore();
const toast = useToast();
const integration = ref(null);
const currentPreferences = ref([]);
const hasChanges = ref(false);
const saving = ref(false);
const fetchIntegration = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !userStore.profile?.organization_id)
        return;
    const { data } = await supabase
        .from('workspace_integrations')
        .select('*')
        .eq('organization_id', userStore.profile.organization_id)
        .eq('provider', 'google')
        .single();
    if (data) {
        integration.value = data;
        currentPreferences.value = Array.isArray(data.label_preferences)
            ? data.label_preferences.filter((value) => typeof value === 'string')
            : [];
    }
};
const handlePreferenceUpdate = (prefs) => {
    currentPreferences.value = prefs;
    hasChanges.value = true;
};
const savePreferences = async () => {
    if (!integration.value)
        return;
    if (currentPreferences.value.length === 0) {
        toast.add({ severity: 'error', summary: 'Validation Error', detail: 'You must select at least one label.' });
        return;
    }
    saving.value = true;
    const { error } = await supabase
        .from('workspace_integrations')
        .update({ label_preferences: currentPreferences.value })
        .eq('id', integration.value.id);
    if (error) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save preferences.' });
    }
    else {
        toast.add({ severity: 'success', summary: 'Saved', detail: 'Ingestion preferences updated.' });
        hasChanges.value = false;
    }
    saving.value = false;
};
onMounted(fetchIntegration);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
const __VLS_0 = {}.Toast;
/** @type {[typeof __VLS_components.Toast, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "space-y-8 p-6 lg:p-10 max-w-5xl mx-auto" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "text-3xl font-bold text-executive-primary tracking-tight font-sans" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-slate-500 mt-2 font-technical" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "grid grid-cols-1 gap-8" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "bg-white p-8 rounded-executive border border-slate-200 shadow-sm" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-3 mb-6" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
    ...{ class: "pi pi-shield text-xl text-executive-primary" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "text-xl font-bold text-executive-primary font-sans" },
});
/** @type {[typeof SecurityPerimeterSettings, ]} */ ;
// @ts-ignore
const __VLS_4 = __VLS_asFunctionalComponent(SecurityPerimeterSettings, new SecurityPerimeterSettings({}));
const __VLS_5 = __VLS_4({}, ...__VLS_functionalComponentArgsRest(__VLS_4));
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "bg-white p-8 rounded-executive border border-slate-200 shadow-sm" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-3 mb-6" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
    ...{ class: "pi pi-link text-xl text-executive-primary" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "text-xl font-bold text-executive-primary font-sans" },
});
/** @type {[typeof WorkspaceIntegration, ]} */ ;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent(WorkspaceIntegration, new WorkspaceIntegration({}));
const __VLS_8 = __VLS_7({}, ...__VLS_functionalComponentArgsRest(__VLS_7));
if (__VLS_ctx.integration) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "bg-white p-8 rounded-executive border border-slate-200 shadow-sm" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center justify-between mb-6" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-3" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
        ...{ class: "pi pi-filter text-xl text-executive-primary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        ...{ class: "text-xl font-bold text-executive-primary font-sans" },
    });
    if (__VLS_ctx.hasChanges) {
        const __VLS_10 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_11 = __VLS_asFunctionalComponent(__VLS_10, new __VLS_10({
            ...{ 'onClick': {} },
            label: "Save Changes",
            icon: "pi pi-check",
            loading: (__VLS_ctx.saving),
            severity: "success",
            size: "small",
        }));
        const __VLS_12 = __VLS_11({
            ...{ 'onClick': {} },
            label: "Save Changes",
            icon: "pi pi-check",
            loading: (__VLS_ctx.saving),
            severity: "success",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_11));
        let __VLS_14;
        let __VLS_15;
        let __VLS_16;
        const __VLS_17 = {
            onClick: (__VLS_ctx.savePreferences)
        };
        var __VLS_13;
    }
    /** @type {[typeof GmailLabelSelector, ]} */ ;
    // @ts-ignore
    const __VLS_18 = __VLS_asFunctionalComponent(GmailLabelSelector, new GmailLabelSelector({
        ...{ 'onUpdate:preferences': {} },
        organizationId: (__VLS_ctx.integration.organization_id),
        initialPreferences: (__VLS_ctx.integration.label_preferences || []),
    }));
    const __VLS_19 = __VLS_18({
        ...{ 'onUpdate:preferences': {} },
        organizationId: (__VLS_ctx.integration.organization_id),
        initialPreferences: (__VLS_ctx.integration.label_preferences || []),
    }, ...__VLS_functionalComponentArgsRest(__VLS_18));
    let __VLS_21;
    let __VLS_22;
    let __VLS_23;
    const __VLS_24 = {
        'onUpdate:preferences': (__VLS_ctx.handlePreferenceUpdate)
    };
    var __VLS_20;
}
/** @type {__VLS_StyleScopedClasses['space-y-8']} */ ;
/** @type {__VLS_StyleScopedClasses['p-6']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:p-10']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-5xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['text-3xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-8']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['p-8']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-6']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-shield']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['p-8']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-6']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-link']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['p-8']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-6']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Button: Button,
            Toast: Toast,
            WorkspaceIntegration: WorkspaceIntegration,
            SecurityPerimeterSettings: SecurityPerimeterSettings,
            GmailLabelSelector: GmailLabelSelector,
            integration: integration,
            hasChanges: hasChanges,
            saving: saving,
            handlePreferenceUpdate: handlePreferenceUpdate,
            savePreferences: savePreferences,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=Settings.vue.js.map