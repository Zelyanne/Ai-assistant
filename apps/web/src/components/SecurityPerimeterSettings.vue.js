import { ref, onMounted } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import { useToast } from 'primevue/usetoast';
import AgencyPerimeterBoard from './security/AgencyPerimeterBoard.vue';
const userStore = useUserStore();
const toast = useToast();
const loading = ref(true);
const saving = ref(false);
const briefingTime = ref('08:00');
const fetchSettings = async () => {
    if (!userStore.profile?.organization_id)
        return;
    loading.value = true;
    try {
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userStore.profile.id)
            .single();
        const preferredBriefingTime = profile?.preferred_briefing_time;
        if (preferredBriefingTime) {
            briefingTime.value = preferredBriefingTime.slice(0, 5);
        }
    }
    catch (err) {
        console.error('Error fetching settings:', err);
    }
    finally {
        loading.value = false;
    }
};
const saveSettings = async () => {
    if (!userStore.profile?.organization_id)
        return;
    saving.value = true;
    try {
        const profilesTable = supabase.from('profiles');
        const { error } = await profilesTable
            .update({
            preferred_briefing_time: `${briefingTime.value}:00`,
        })
            .eq('id', userStore.profile.id);
        if (error) {
            throw error;
        }
        toast.add({
            severity: 'success',
            summary: 'Settings Updated',
            detail: 'Your settings have been saved.',
            life: 3000,
        });
    }
    catch (err) {
        console.error('Error saving settings:', err);
        toast.add({
            severity: 'error',
            summary: 'Error',
            detail: err.message || 'Failed to update settings',
            life: 5000,
        });
    }
    finally {
        saving.value = false;
    }
};
onMounted(fetchSettings);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "space-y-6" },
});
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex justify-center py-12" },
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
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "space-y-6" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex flex-col gap-4" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "text-lg font-bold text-executive-primary font-sans" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "text-sm text-slate-500 font-technical" },
    });
    if (__VLS_ctx.userStore.profile?.organization_id) {
        /** @type {[typeof AgencyPerimeterBoard, ]} */ ;
        // @ts-ignore
        const __VLS_4 = __VLS_asFunctionalComponent(AgencyPerimeterBoard, new AgencyPerimeterBoard({
            organizationId: (__VLS_ctx.userStore.profile.organization_id),
            canWrite: (__VLS_ctx.userStore.isCEO),
        }));
        const __VLS_5 = __VLS_4({
            organizationId: (__VLS_ctx.userStore.profile.organization_id),
            canWrite: (__VLS_ctx.userStore.isCEO),
        }, ...__VLS_functionalComponentArgsRest(__VLS_4));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "pt-6 border-t border-slate-100 flex flex-col gap-4" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "text-lg font-bold text-executive-primary font-sans" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "text-sm text-slate-500 font-technical" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-4 max-w-xs" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex-1 flex flex-col gap-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        for: "briefingTime",
        ...{ class: "text-xs font-bold uppercase tracking-wider text-slate-400 font-technical" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
        ...{ class: "pi pi-clock text-slate-400" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
        id: "briefingTime",
        type: "time",
        ...{ class: "p-inputtext p-component font-technical w-full" },
    });
    (__VLS_ctx.briefingTime);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "pt-4 border-t border-slate-100 flex justify-end" },
    });
    const __VLS_7 = {}.Button;
    /** @type {[typeof __VLS_components.Button, ]} */ ;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent(__VLS_7, new __VLS_7({
        ...{ 'onClick': {} },
        label: "Save Changes",
        icon: "pi pi-check",
        severity: "contrast",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_9 = __VLS_8({
        ...{ 'onClick': {} },
        label: "Save Changes",
        icon: "pi pi-check",
        severity: "contrast",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    let __VLS_11;
    let __VLS_12;
    let __VLS_13;
    const __VLS_14 = {
        onClick: (__VLS_ctx.saveSettings)
    };
    var __VLS_10;
}
/** @type {__VLS_StyleScopedClasses['space-y-6']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['py-12']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-6']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-6']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-100']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wider']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-clock']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['p-inputtext']} */ ;
/** @type {__VLS_StyleScopedClasses['p-component']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-100']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Button: Button,
            ProgressSpinner: ProgressSpinner,
            AgencyPerimeterBoard: AgencyPerimeterBoard,
            userStore: userStore,
            loading: loading,
            saving: saving,
            briefingTime: briefingTime,
            saveSettings: saveSettings,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=SecurityPerimeterSettings.vue.js.map