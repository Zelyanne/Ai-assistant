<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Toast from 'primevue/toast';
import WorkspaceIntegration from '../components/WorkspaceIntegration.vue';
import SecurityPerimeterSettings from '../components/SecurityPerimeterSettings.vue';
import GmailLabelSelector from '../components/GmailLabelSelector.vue';

interface WorkspaceIntegrationRow {
  id: string;
  organization_id: string;
  provider: string;
  sync_status: string;
  last_sync_at: string | null;
  label_preferences: unknown;
}
const SOCIAL_PROVIDERS = ['telegram', 'whatsapp'] as const;

const userStore = useUserStore();
const toast = useToast();
const integration = ref<WorkspaceIntegrationRow | null>(null);
const telegramIntegration = ref<WorkspaceIntegrationRow | null>(null);
const whatsappIntegration = ref<WorkspaceIntegrationRow | null>(null);
const settingsError = ref<string | null>(null);
const currentPreferences = ref<string[]>([]);
const hasChanges = ref(false);
const saving = ref(false);

function socialStatusLabel(item: WorkspaceIntegrationRow | null): string {
  if (!item) return 'Not configured';
  return item.sync_status === 'error' ? 'Needs attention' : 'Connected';
}

function socialStatusClass(item: WorkspaceIntegrationRow | null): string {
  if (!item) return 'bg-slate-100 text-slate-600';
  return item.sync_status === 'error'
    ? 'bg-rose-100 text-rose-700'
    : 'bg-emerald-100 text-emerald-700';
}

const telegramStatusLabel = computed(() => socialStatusLabel(telegramIntegration.value));
const telegramStatusClass = computed(() => socialStatusClass(telegramIntegration.value));
const whatsappStatusLabel = computed(() => socialStatusLabel(whatsappIntegration.value));
const whatsappStatusClass = computed(() => socialStatusClass(whatsappIntegration.value));

async function fetchIntegration(): Promise<void> {
  settingsError.value = null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !userStore.profile?.organization_id) return;

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
    ? googleIntegration.label_preferences.filter((value): value is string => typeof value === 'string')
    : [];
}

function handlePreferenceUpdate(prefs: string[]): void {
  currentPreferences.value = prefs;
  hasChanges.value = true;
}

async function savePreferences(): Promise<void> {
  if (!integration.value) return;

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
  } else {
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Ingestion preferences updated.' });
    hasChanges.value = false;
  }
  saving.value = false;
}

onMounted(fetchIntegration);
</script>

<template>
  <Toast />
  <div class="space-y-8 p-6 lg:p-10 max-w-5xl mx-auto">
    <header>
      <h1 class="text-3xl font-bold text-executive-primary tracking-tight font-sans">
        Settings
      </h1>
      <p class="text-slate-500 mt-2 font-technical">
        Manage your account, platform integrations, and agent behavior.
      </p>
    </header>

    <div class="grid grid-cols-1 gap-8">
      <section class="bg-white p-8 rounded-executive border border-slate-200 shadow-sm">
        <div class="flex items-center gap-3 mb-6">
          <i class="pi pi-shield text-xl text-executive-primary" />
          <h2 class="text-xl font-bold text-executive-primary font-sans">
            Security & Autonomy
          </h2>
        </div>
        <SecurityPerimeterSettings />
      </section>

      <section class="bg-white p-8 rounded-executive border border-slate-200 shadow-sm">
        <div class="flex items-center gap-3 mb-6">
          <i class="pi pi-link text-xl text-executive-primary" />
          <h2 class="text-xl font-bold text-executive-primary font-sans">
            Connected Workspaces
          </h2>
        </div>
        <WorkspaceIntegration />
      </section>

      <section class="bg-white p-8 rounded-executive border border-slate-200 shadow-sm">
        <div class="flex items-center gap-3 mb-4">
          <i class="pi pi-comments text-xl text-executive-primary" />
          <h2 class="text-xl font-bold text-executive-primary font-sans">
            Social Integrations
          </h2>
        </div>

        <p class="text-sm text-slate-500 leading-relaxed">
          Configure Telegram and WhatsApp so direct user messages can reach the assistant without extra setup steps in daily use.
        </p>

        <Message
          v-if="settingsError"
          severity="error"
          class="mt-4"
          :closable="false"
        >
          {{ settingsError }}
        </Message>

        <div class="mt-6 grid gap-4 lg:grid-cols-2">
          <article class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="text-lg font-semibold text-executive-primary">
                  Telegram
                </h3>
                <p class="mt-1 text-sm text-slate-500">
                  Best for one-to-one command messages and lightweight operational follow-up.
                </p>
              </div>

              <span
                class="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                :class="telegramStatusClass"
              >
                {{ telegramStatusLabel }}
              </span>
            </div>

            <ul class="mt-4 space-y-2 text-sm text-slate-600">
              <li>Bot token and webhook secret token must be configured on the agent.</li>
              <li>Point Telegram webhooks at the Telegram webhook route with `organization_id` on the request.</li>
              <li>Use the same bot identity for inbound validation and outbound replies.</li>
            </ul>

            <p
              v-if="telegramIntegration?.last_sync_at"
              class="mt-4 text-xs italic text-slate-400"
            >
              Last activity: {{ new Date(telegramIntegration.last_sync_at).toLocaleString() }}
            </p>
          </article>

          <article class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="text-lg font-semibold text-executive-primary">
                  WhatsApp
                </h3>
                <p class="mt-1 text-sm text-slate-500">
                  Supports both Meta Cloud API and Twilio, depending on your current messaging stack.
                </p>
              </div>

              <span
                class="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                :class="whatsappStatusClass"
              >
                {{ whatsappStatusLabel }}
              </span>
            </div>

            <div class="mt-4 grid gap-3 md:grid-cols-2">
              <div class="rounded-xl border border-slate-200 bg-white p-4">
                <h4 class="text-sm font-semibold text-slate-800">
                  Meta Cloud API
                </h4>
                <ul class="mt-2 space-y-2 text-sm text-slate-600">
                  <li>`WHATSAPP_API_KEY` and `WHATSAPP_PHONE_NUMBER_ID` are required for outbound sends.</li>
                  <li>`WHATSAPP_WEBHOOK_SECRET` secures inbound webhook validation and verification.</li>
                  <li>Configure the WhatsApp webhook route for both incoming messages and delivery callbacks.</li>
                </ul>
              </div>

              <div class="rounded-xl border border-slate-200 bg-white p-4">
                <h4 class="text-sm font-semibold text-slate-800">
                  Twilio
                </h4>
                <ul class="mt-2 space-y-2 text-sm text-slate-600">
                  <li>`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_WHATSAPP_PHONE_NUMBER` are required.</li>
                  <li>`WHATSAPP_WEBHOOK_SECRET` is also used to validate Twilio webhook signatures.</li>
                  <li>Set the inbound webhook URL to the WhatsApp route and keep the phone number in WhatsApp format.</li>
                </ul>
              </div>
            </div>

            <p
              v-if="whatsappIntegration?.last_sync_at"
              class="mt-4 text-xs italic text-slate-400"
            >
              Last activity: {{ new Date(whatsappIntegration.last_sync_at).toLocaleString() }}
            </p>
          </article>
        </div>
      </section>

      <section
        v-if="integration"
        class="bg-white p-8 rounded-executive border border-slate-200 shadow-sm"
      >
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <i class="pi pi-filter text-xl text-executive-primary" />
            <h2 class="text-xl font-bold text-executive-primary font-sans">
              Email Ingestion
            </h2>
          </div>
          <Button
            v-if="hasChanges"
            label="Save Changes"
            icon="pi pi-check"
            :loading="saving"
            severity="success"
            size="small"
            @click="savePreferences"
          />
        </div>

        <GmailLabelSelector
          :organization-id="integration.organization_id"
          :initial-preferences="currentPreferences"
          @update:preferences="handlePreferenceUpdate"
        />
      </section>
    </div>
  </div>
</template>
