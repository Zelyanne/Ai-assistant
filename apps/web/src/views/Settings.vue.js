import { computed, ref, onMounted, onUnmounted } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Toast from 'primevue/toast';
import WorkspaceIntegration from '../components/WorkspaceIntegration.vue';
import SecurityPerimeterSettings from '../components/SecurityPerimeterSettings.vue';
import GmailLabelSelector from '../components/GmailLabelSelector.vue';
import ScheduleManager from '../components/schedules/ScheduleManager.vue';
const SOCIAL_PROVIDERS = ['telegram', 'whatsapp'];
const userStore = useUserStore();
const toast = useToast();
const integration = ref(null);
const telegramIntegration = ref(null);
const whatsappIntegration = ref(null);
const telegramLink = ref(null);
const settingsError = ref(null);
const telegramLinkError = ref(null);
const currentPreferences = ref([]);
const hasChanges = ref(false);
const saving = ref(false);
const connectingTelegram = ref(false);
function socialStatusLabel(item) {
    if (!item)
        return 'Not configured';
    return item.sync_status === 'error' ? 'Needs attention' : 'Connected';
}
function socialStatusClass(item) {
    if (!item)
        return 'bg-slate-100 text-slate-600';
    return item.sync_status === 'error'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-emerald-100 text-emerald-700';
}
const telegramStatusLabel = computed(() => socialStatusLabel(telegramIntegration.value));
const telegramStatusClass = computed(() => telegramLink.value?.status === 'active' ? 'bg-emerald-100 text-emerald-700' : socialStatusClass(telegramIntegration.value));
const whatsappStatusLabel = computed(() => socialStatusLabel(whatsappIntegration.value));
const whatsappStatusClass = computed(() => socialStatusClass(whatsappIntegration.value));
const telegramConnectionLabel = computed(() => {
    if (telegramLink.value?.status === 'active') {
        return telegramLink.value.display_name || telegramLink.value.username || 'Telegram connected';
    }
    return telegramStatusLabel.value;
});
async function fetchIntegration() {
    settingsError.value = null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !userStore.profile?.organization_id)
        return;
    const { data, error } = await supabase
        .from('workspace_integrations')
        .select('*')
        .eq('organization_id', userStore.profile.organization_id)
        .in('provider', ['google', ...SOCIAL_PROVIDERS]);
    if (error) {
        settingsError.value = 'Unable to refresh integration status right now. Last known settings remain visible when available.';
        return;
    }
    const rows = data ?? [];
    const googleIntegration = rows.find((item) => item.provider === 'google') ?? null;
    integration.value = googleIntegration;
    telegramIntegration.value = rows.find((item) => item.provider === 'telegram') ?? null;
    whatsappIntegration.value = rows.find((item) => item.provider === 'whatsapp') ?? null;
    currentPreferences.value = Array.isArray(googleIntegration?.label_preferences)
        ? googleIntegration.label_preferences.filter((value) => typeof value === 'string')
        : [];
    const { data: linkRows, error: linkError } = await supabase
        .from('messaging_channel_links')
        .select('id, channel, status, username, display_name, linked_at, last_seen_at')
        .eq('organization_id', userStore.profile.organization_id)
        .eq('user_id', userStore.profile.id)
        .eq('channel', 'telegram')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1);
    if (linkError) {
        telegramLink.value = null;
        telegramLinkError.value = 'Unable to load Telegram connection status.';
    }
    else {
        telegramLink.value = linkRows?.[0] ?? null;
        telegramLinkError.value = null;
    }
}
async function connectTelegram() {
    telegramLinkError.value = null;
    connectingTelegram.value = true;
    const telegramWindow = window.open('', '_blank');
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
            throw new Error('Sign in again before connecting Telegram.');
        }
        const agentUrl = import.meta.env.VITE_AGENT_URL_PROJECT_GOOGLE_ASSITANT || 'http://localhost:3001';
        const response = await fetch(`${agentUrl}/api/integrations/telegram/link-token`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        const payload = await response.json();
        if (!response.ok || !payload.deepLink) {
            throw new Error(payload.error ?? 'Unable to create Telegram link.');
        }
        if (telegramWindow) {
            telegramWindow.opener = null;
            telegramWindow.location.href = payload.deepLink;
        }
        else {
            window.location.assign(payload.deepLink);
        }
        toast.add({
            severity: 'info',
            summary: 'Telegram Link Created',
            detail: 'Telegram opened in a new tab. Press Start in the bot to finish connecting.',
            life: 5000,
        });
    }
    catch (error) {
        telegramWindow?.close();
        telegramLinkError.value = error instanceof Error ? error.message : 'Failed to connect Telegram.';
    }
    finally {
        connectingTelegram.value = false;
    }
}
function refreshTelegramStatus() {
    void fetchIntegration();
}
function handlePreferenceUpdate(prefs) {
    currentPreferences.value = prefs;
    hasChanges.value = true;
}
async function savePreferences() {
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
}
onMounted(() => {
    void fetchIntegration();
    window.addEventListener('focus', refreshTelegramStatus);
});
onUnmounted(() => {
    window.removeEventListener('focus', refreshTelegramStatus);
});
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "bg-white p-8 rounded-executive border border-slate-200 shadow-sm" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-3 mb-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
    ...{ class: "pi pi-comments text-xl text-executive-primary" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "text-xl font-bold text-executive-primary font-sans" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-sm text-slate-500 leading-relaxed" },
});
if (__VLS_ctx.settingsError) {
    const __VLS_10 = {}.Message;
    /** @type {[typeof __VLS_components.Message, typeof __VLS_components.Message, ]} */ ;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent(__VLS_10, new __VLS_10({
        severity: "error",
        ...{ class: "mt-4" },
        closable: (false),
    }));
    const __VLS_12 = __VLS_11({
        severity: "error",
        ...{ class: "mt-4" },
        closable: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
    __VLS_13.slots.default;
    (__VLS_ctx.settingsError);
    var __VLS_13;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mt-6 grid gap-4 lg:grid-cols-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "rounded-2xl border border-slate-200 bg-slate-50 p-5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-start justify-between gap-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    ...{ class: "text-lg font-semibold text-executive-primary" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "mt-1 text-sm text-slate-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide" },
    ...{ class: (__VLS_ctx.telegramStatusClass) },
});
(__VLS_ctx.telegramConnectionLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
    ...{ class: "mt-4 space-y-2 text-sm text-slate-600" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
if (__VLS_ctx.telegramLinkError) {
    const __VLS_14 = {}.Message;
    /** @type {[typeof __VLS_components.Message, typeof __VLS_components.Message, ]} */ ;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent(__VLS_14, new __VLS_14({
        severity: "warn",
        ...{ class: "mt-4" },
        closable: (false),
    }));
    const __VLS_16 = __VLS_15({
        severity: "warn",
        ...{ class: "mt-4" },
        closable: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
    __VLS_17.slots.default;
    (__VLS_ctx.telegramLinkError);
    var __VLS_17;
}
const __VLS_18 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_19 = __VLS_asFunctionalComponent(__VLS_18, new __VLS_18({
    ...{ 'onClick': {} },
    ...{ class: "mt-5" },
    label: (__VLS_ctx.telegramLink?.status === 'active' ? 'Reconnect Telegram' : 'Connect Telegram'),
    icon: "pi pi-send",
    loading: (__VLS_ctx.connectingTelegram),
}));
const __VLS_20 = __VLS_19({
    ...{ 'onClick': {} },
    ...{ class: "mt-5" },
    label: (__VLS_ctx.telegramLink?.status === 'active' ? 'Reconnect Telegram' : 'Connect Telegram'),
    icon: "pi pi-send",
    loading: (__VLS_ctx.connectingTelegram),
}, ...__VLS_functionalComponentArgsRest(__VLS_19));
let __VLS_22;
let __VLS_23;
let __VLS_24;
const __VLS_25 = {
    onClick: (__VLS_ctx.connectTelegram)
};
var __VLS_21;
if (__VLS_ctx.telegramLink?.last_seen_at || __VLS_ctx.telegramLink?.linked_at || __VLS_ctx.telegramIntegration?.last_sync_at) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "mt-4 text-xs italic text-slate-400" },
    });
    (new Date(__VLS_ctx.telegramLink?.last_seen_at || __VLS_ctx.telegramLink?.linked_at || __VLS_ctx.telegramIntegration?.last_sync_at || '').toLocaleString());
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "rounded-2xl border border-slate-200 bg-slate-50 p-5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-start justify-between gap-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    ...{ class: "text-lg font-semibold text-executive-primary" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "mt-1 text-sm text-slate-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide" },
    ...{ class: (__VLS_ctx.whatsappStatusClass) },
});
(__VLS_ctx.whatsappStatusLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mt-4 grid gap-3 md:grid-cols-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rounded-xl border border-slate-200 bg-white p-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
    ...{ class: "text-sm font-semibold text-slate-800" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
    ...{ class: "mt-2 space-y-2 text-sm text-slate-600" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rounded-xl border border-slate-200 bg-white p-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
    ...{ class: "text-sm font-semibold text-slate-800" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
    ...{ class: "mt-2 space-y-2 text-sm text-slate-600" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
if (__VLS_ctx.whatsappIntegration?.last_sync_at) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "mt-4 text-xs italic text-slate-400" },
    });
    (new Date(__VLS_ctx.whatsappIntegration.last_sync_at).toLocaleString());
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "bg-white p-8 rounded-executive border border-slate-200 shadow-sm" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-3 mb-6" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
    ...{ class: "pi pi-clock text-xl text-executive-primary" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "text-xl font-bold text-executive-primary font-sans" },
});
/** @type {[typeof ScheduleManager, ]} */ ;
// @ts-ignore
const __VLS_26 = __VLS_asFunctionalComponent(ScheduleManager, new ScheduleManager({}));
const __VLS_27 = __VLS_26({}, ...__VLS_functionalComponentArgsRest(__VLS_26));
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
        const __VLS_29 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
            ...{ 'onClick': {} },
            label: "Save Changes",
            icon: "pi pi-check",
            loading: (__VLS_ctx.saving),
            severity: "success",
            size: "small",
        }));
        const __VLS_31 = __VLS_30({
            ...{ 'onClick': {} },
            label: "Save Changes",
            icon: "pi pi-check",
            loading: (__VLS_ctx.saving),
            severity: "success",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_30));
        let __VLS_33;
        let __VLS_34;
        let __VLS_35;
        const __VLS_36 = {
            onClick: (__VLS_ctx.savePreferences)
        };
        var __VLS_32;
    }
    /** @type {[typeof GmailLabelSelector, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(GmailLabelSelector, new GmailLabelSelector({
        ...{ 'onUpdate:preferences': {} },
        organizationId: (__VLS_ctx.integration.organization_id),
        initialPreferences: (__VLS_ctx.currentPreferences),
    }));
    const __VLS_38 = __VLS_37({
        ...{ 'onUpdate:preferences': {} },
        organizationId: (__VLS_ctx.integration.organization_id),
        initialPreferences: (__VLS_ctx.currentPreferences),
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    let __VLS_40;
    let __VLS_41;
    let __VLS_42;
    const __VLS_43 = {
        'onUpdate:preferences': (__VLS_ctx.handlePreferenceUpdate)
    };
    var __VLS_39;
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
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-4']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-comments']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-6']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['p-5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-start']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-5']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['italic']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['p-5']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-start']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-800']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-800']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['italic']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
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
/** @type {__VLS_StyleScopedClasses['pi-clock']} */ ;
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
            Message: Message,
            Toast: Toast,
            WorkspaceIntegration: WorkspaceIntegration,
            SecurityPerimeterSettings: SecurityPerimeterSettings,
            GmailLabelSelector: GmailLabelSelector,
            ScheduleManager: ScheduleManager,
            integration: integration,
            telegramIntegration: telegramIntegration,
            whatsappIntegration: whatsappIntegration,
            telegramLink: telegramLink,
            settingsError: settingsError,
            telegramLinkError: telegramLinkError,
            currentPreferences: currentPreferences,
            hasChanges: hasChanges,
            saving: saving,
            connectingTelegram: connectingTelegram,
            telegramStatusClass: telegramStatusClass,
            whatsappStatusLabel: whatsappStatusLabel,
            whatsappStatusClass: whatsappStatusClass,
            telegramConnectionLabel: telegramConnectionLabel,
            connectTelegram: connectTelegram,
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