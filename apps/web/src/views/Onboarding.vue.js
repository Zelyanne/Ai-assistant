import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Card from 'primevue/card';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
const router = useRouter();
const userStore = useUserStore();
const orgName = ref('');
const loading = ref(false);
const showCreateTeam = ref(false);
const errorMessage = ref('');
const retryCount = ref(0);
const maxRetries = 5;
const isLoadingProfile = ref(true);
const loadError = ref('');
const userName = computed(() => userStore.profile?.full_name || 'My');
const fetchProfileWithRetry = async () => {
    isLoadingProfile.value = true;
    loadError.value = '';
    retryCount.value = 0;
    while (retryCount.value < maxRetries) {
        try {
            await userStore.fetchProfile();
            if (userStore.profile?.id) {
                isLoadingProfile.value = false;
                return;
            }
        }
        catch (err) {
            console.error('Retry', retryCount.value, 'failed:', err);
        }
        retryCount.value++;
        if (retryCount.value < maxRetries) {
            // Exponential backoff: 1s, 2s, 3s, 5s, 8s
            const backoff = [1000, 2000, 3000, 5000, 8000][retryCount.value - 1] || 1000;
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    // All retries exhausted
    isLoadingProfile.value = false;
    loadError.value = "We're having trouble setting up your account. Please try refreshing the page or contact support.";
};
onMounted(async () => {
    await fetchProfileWithRetry();
    // If user already has an organization, redirect to dashboard
    if (userStore.profile?.organization_id) {
        router.push('/dashboard');
    }
});
const handleCreateOrganization = async (role) => {
    loading.value = true;
    errorMessage.value = '';
    try {
        const finalOrgName = role === 'Simple User' ? `${userName.value}'s Workspace` : orgName.value;
        if (!finalOrgName) {
            throw new Error('Organization name is required');
        }
        // Ensure profile is loaded (handle potential race condition from registration)
        if (!userStore.profile?.id) {
            await userStore.fetchProfile();
            if (!userStore.profile?.id) {
                throw new Error('User profile not found. Please try refreshing the page.');
            }
        }
        // 1. Create the organization
        const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .insert({ name: finalOrgName })
            .select()
            .single();
        if (orgError)
            throw orgError;
        // 2. Update the user's profile
        const { error: profileError } = await supabase
            .from('profiles')
            .update({
            organization_id: orgData.id,
            role: role
        })
            .eq('id', userStore.profile?.id);
        if (profileError)
            throw profileError;
        // 3. Refresh profile in store and redirect
        await userStore.fetchProfile();
        router.push('/dashboard');
    }
    catch (error) {
        errorMessage.value = error.message || 'Failed to initialize workspace';
        console.error('Onboarding error:', error);
    }
    finally {
        loading.value = false;
    }
};
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "min-h-screen bg-executive-background flex items-center justify-center p-6 font-sans" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "w-full max-w-2xl" },
});
if (__VLS_ctx.isLoadingProfile) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-center py-12" },
    });
    const __VLS_0 = {}.ProgressSpinner;
    /** @type {[typeof __VLS_components.ProgressSpinner, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        'aria-label': "Loading profile",
    }));
    const __VLS_2 = __VLS_1({
        'aria-label': "Loading profile",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "text-slate-500 mt-4" },
    });
}
else if (__VLS_ctx.loadError) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-center py-12" },
    });
    const __VLS_4 = {}.Message;
    /** @type {[typeof __VLS_components.Message, typeof __VLS_components.Message, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        severity: "error",
        ...{ class: "mb-6" },
    }));
    const __VLS_6 = __VLS_5({
        severity: "error",
        ...{ class: "mb-6" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    (__VLS_ctx.loadError);
    var __VLS_7;
    const __VLS_8 = {}.Button;
    /** @type {[typeof __VLS_components.Button, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ 'onClick': {} },
        label: "Try Again",
        icon: "pi pi-refresh",
    }));
    const __VLS_10 = __VLS_9({
        ...{ 'onClick': {} },
        label: "Try Again",
        icon: "pi pi-refresh",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    let __VLS_12;
    let __VLS_13;
    let __VLS_14;
    const __VLS_15 = {
        onClick: (__VLS_ctx.fetchProfileWithRetry)
    };
    var __VLS_11;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-center mb-10" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
        ...{ class: "text-3xl font-bold text-executive-primary tracking-tight" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "text-slate-500 mt-2" },
    });
    if (__VLS_ctx.errorMessage) {
        const __VLS_16 = {}.Message;
        /** @type {[typeof __VLS_components.Message, typeof __VLS_components.Message, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            severity: "error",
            ...{ class: "mb-6" },
        }));
        const __VLS_18 = __VLS_17({
            severity: "error",
            ...{ class: "mb-6" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        __VLS_19.slots.default;
        (__VLS_ctx.errorMessage);
        var __VLS_19;
    }
    if (!__VLS_ctx.showCreateTeam) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "grid grid-cols-1 md:grid-cols-2 gap-6" },
        });
        const __VLS_20 = {}.Card;
        /** @type {[typeof __VLS_components.Card, typeof __VLS_components.Card, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
            ...{ 'onClick': {} },
            ...{ class: "border-2 border-transparent hover:border-executive-primary transition-all cursor-pointer overflow-hidden shadow-sm" },
        }));
        const __VLS_22 = __VLS_21({
            ...{ 'onClick': {} },
            ...{ class: "border-2 border-transparent hover:border-executive-primary transition-all cursor-pointer overflow-hidden shadow-sm" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        let __VLS_24;
        let __VLS_25;
        let __VLS_26;
        const __VLS_27 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.isLoadingProfile))
                    return;
                if (!!(__VLS_ctx.loadError))
                    return;
                if (!(!__VLS_ctx.showCreateTeam))
                    return;
                __VLS_ctx.handleCreateOrganization('Simple User');
            }
        };
        __VLS_23.slots.default;
        {
            const { title: __VLS_thisSlot } = __VLS_23.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "flex items-center gap-3" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
                ...{ class: "pi pi-user text-2xl text-executive-primary" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        }
        {
            const { content: __VLS_thisSlot } = __VLS_23.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "text-slate-600 mb-6" },
            });
            const __VLS_28 = {}.Button;
            /** @type {[typeof __VLS_components.Button, ]} */ ;
            // @ts-ignore
            const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
                ...{ 'onClick': {} },
                label: "I'm Working Solo",
                ...{ class: "w-full" },
                severity: "contrast",
                loading: (__VLS_ctx.loading),
            }));
            const __VLS_30 = __VLS_29({
                ...{ 'onClick': {} },
                label: "I'm Working Solo",
                ...{ class: "w-full" },
                severity: "contrast",
                loading: (__VLS_ctx.loading),
            }, ...__VLS_functionalComponentArgsRest(__VLS_29));
            let __VLS_32;
            let __VLS_33;
            let __VLS_34;
            const __VLS_35 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.isLoadingProfile))
                        return;
                    if (!!(__VLS_ctx.loadError))
                        return;
                    if (!(!__VLS_ctx.showCreateTeam))
                        return;
                    __VLS_ctx.handleCreateOrganization('Simple User');
                }
            };
            var __VLS_31;
        }
        var __VLS_23;
        const __VLS_36 = {}.Card;
        /** @type {[typeof __VLS_components.Card, typeof __VLS_components.Card, ]} */ ;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
            ...{ 'onClick': {} },
            ...{ class: "border-2 border-transparent hover:border-executive-primary transition-all cursor-pointer overflow-hidden shadow-sm" },
        }));
        const __VLS_38 = __VLS_37({
            ...{ 'onClick': {} },
            ...{ class: "border-2 border-transparent hover:border-executive-primary transition-all cursor-pointer overflow-hidden shadow-sm" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
        let __VLS_40;
        let __VLS_41;
        let __VLS_42;
        const __VLS_43 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.isLoadingProfile))
                    return;
                if (!!(__VLS_ctx.loadError))
                    return;
                if (!(!__VLS_ctx.showCreateTeam))
                    return;
                __VLS_ctx.showCreateTeam = true;
            }
        };
        __VLS_39.slots.default;
        {
            const { title: __VLS_thisSlot } = __VLS_39.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "flex items-center gap-3" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
                ...{ class: "pi pi-users text-2xl text-executive-primary" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        }
        {
            const { content: __VLS_thisSlot } = __VLS_39.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "text-slate-600 mb-6" },
            });
            const __VLS_44 = {}.Button;
            /** @type {[typeof __VLS_components.Button, ]} */ ;
            // @ts-ignore
            const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
                ...{ 'onClick': {} },
                label: "Setup Organization",
                ...{ class: "w-full" },
                outlined: true,
            }));
            const __VLS_46 = __VLS_45({
                ...{ 'onClick': {} },
                label: "Setup Organization",
                ...{ class: "w-full" },
                outlined: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_45));
            let __VLS_48;
            let __VLS_49;
            let __VLS_50;
            const __VLS_51 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.isLoadingProfile))
                        return;
                    if (!!(__VLS_ctx.loadError))
                        return;
                    if (!(!__VLS_ctx.showCreateTeam))
                        return;
                    __VLS_ctx.showCreateTeam = true;
                }
            };
            var __VLS_47;
        }
        var __VLS_39;
    }
    else {
        const __VLS_52 = {}.Card;
        /** @type {[typeof __VLS_components.Card, typeof __VLS_components.Card, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
            ...{ class: "shadow-sm border border-slate-200" },
        }));
        const __VLS_54 = __VLS_53({
            ...{ class: "shadow-sm border border-slate-200" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        __VLS_55.slots.default;
        {
            const { title: __VLS_thisSlot } = __VLS_55.slots;
        }
        {
            const { content: __VLS_thisSlot } = __VLS_55.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "flex flex-col gap-4 mt-2" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "flex flex-col gap-2" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                for: "orgName",
                ...{ class: "text-xs font-semibold uppercase tracking-wider text-slate-500 font-technical" },
            });
            const __VLS_56 = {}.InputText;
            /** @type {[typeof __VLS_components.InputText, ]} */ ;
            // @ts-ignore
            const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
                id: "orgName",
                modelValue: (__VLS_ctx.orgName),
                placeholder: "Acme Corp",
                ...{ class: "w-full font-technical" },
                disabled: (__VLS_ctx.loading),
                autofocus: true,
            }));
            const __VLS_58 = __VLS_57({
                id: "orgName",
                modelValue: (__VLS_ctx.orgName),
                placeholder: "Acme Corp",
                ...{ class: "w-full font-technical" },
                disabled: (__VLS_ctx.loading),
                autofocus: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_57));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "flex gap-3 mt-4" },
            });
            const __VLS_60 = {}.Button;
            /** @type {[typeof __VLS_components.Button, ]} */ ;
            // @ts-ignore
            const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
                ...{ 'onClick': {} },
                label: "Back",
                severity: "secondary",
                outlined: true,
                ...{ class: "flex-1" },
                disabled: (__VLS_ctx.loading),
            }));
            const __VLS_62 = __VLS_61({
                ...{ 'onClick': {} },
                label: "Back",
                severity: "secondary",
                outlined: true,
                ...{ class: "flex-1" },
                disabled: (__VLS_ctx.loading),
            }, ...__VLS_functionalComponentArgsRest(__VLS_61));
            let __VLS_64;
            let __VLS_65;
            let __VLS_66;
            const __VLS_67 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.isLoadingProfile))
                        return;
                    if (!!(__VLS_ctx.loadError))
                        return;
                    if (!!(!__VLS_ctx.showCreateTeam))
                        return;
                    __VLS_ctx.showCreateTeam = false;
                }
            };
            var __VLS_63;
            const __VLS_68 = {}.Button;
            /** @type {[typeof __VLS_components.Button, ]} */ ;
            // @ts-ignore
            const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
                ...{ 'onClick': {} },
                label: "Create & Continue",
                severity: "contrast",
                ...{ class: "flex-1" },
                loading: (__VLS_ctx.loading),
                disabled: (!__VLS_ctx.orgName),
            }));
            const __VLS_70 = __VLS_69({
                ...{ 'onClick': {} },
                label: "Create & Continue",
                severity: "contrast",
                ...{ class: "flex-1" },
                loading: (__VLS_ctx.loading),
                disabled: (!__VLS_ctx.orgName),
            }, ...__VLS_functionalComponentArgsRest(__VLS_69));
            let __VLS_72;
            let __VLS_73;
            let __VLS_74;
            const __VLS_75 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.isLoadingProfile))
                        return;
                    if (!!(__VLS_ctx.loadError))
                        return;
                    if (!!(!__VLS_ctx.showCreateTeam))
                        return;
                    __VLS_ctx.handleCreateOrganization('CEO');
                }
            };
            var __VLS_71;
        }
        var __VLS_55;
    }
}
/** @type {__VLS_StyleScopedClasses['min-h-screen']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-executive-background']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['p-6']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['py-12']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['py-12']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-6']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-10']} */ ;
/** @type {__VLS_StyleScopedClasses['text-3xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-6']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-6']} */ ;
/** @type {__VLS_StyleScopedClasses['border-2']} */ ;
/** @type {__VLS_StyleScopedClasses['border-transparent']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:border-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-all']} */ ;
/** @type {__VLS_StyleScopedClasses['cursor-pointer']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-user']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-6']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['border-2']} */ ;
/** @type {__VLS_StyleScopedClasses['border-transparent']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:border-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-all']} */ ;
/** @type {__VLS_StyleScopedClasses['cursor-pointer']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-users']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-6']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wider']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Button: Button,
            InputText: InputText,
            Card: Card,
            Message: Message,
            ProgressSpinner: ProgressSpinner,
            orgName: orgName,
            loading: loading,
            showCreateTeam: showCreateTeam,
            errorMessage: errorMessage,
            isLoadingProfile: isLoadingProfile,
            loadError: loadError,
            fetchProfileWithRetry: fetchProfileWithRetry,
            handleCreateOrganization: handleCreateOrganization,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=Onboarding.vue.js.map