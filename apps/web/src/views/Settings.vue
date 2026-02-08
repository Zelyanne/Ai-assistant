<script setup lang="ts">
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
const integration = ref<any>(null);
const currentPreferences = ref<string[]>([]);
const hasChanges = ref(false);
const saving = ref(false);

const fetchIntegration = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !userStore.profile?.organization_id) return;

  const { data, error } = await supabase
    .from('workspace_integrations')
    .select('*')
    .eq('organization_id', userStore.profile.organization_id)
    .eq('provider', 'google')
    .single();

  if (data) {
    integration.value = data;
    currentPreferences.value = data.label_preferences || [];
  }
};

const handlePreferenceUpdate = (prefs: string[]) => {
    currentPreferences.value = prefs;
    hasChanges.value = true;
};

const savePreferences = async () => {
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
};

onMounted(fetchIntegration);
</script>

<template>
  <Toast />
  <div class="space-y-8 p-6 lg:p-10 max-w-5xl mx-auto">
    <header>
      <h1 class="text-3xl font-bold text-executive-primary tracking-tight font-sans">Settings</h1>
      <p class="text-slate-500 mt-2 font-technical">Manage your account, platform integrations, and agent behavior.</p>
    </header>

    <div class="grid grid-cols-1 gap-8">
      <!-- Agent Security -->
      <section class="bg-white p-8 rounded-executive border border-slate-200 shadow-sm">
        <div class="flex items-center gap-3 mb-6">
          <i class="pi pi-shield text-xl text-executive-primary"></i>
          <h2 class="text-xl font-bold text-executive-primary font-sans">Security & Autonomy</h2>
        </div>
        <SecurityPerimeterSettings />
      </section>

      <!-- Integrations -->
      <section class="bg-white p-8 rounded-executive border border-slate-200 shadow-sm">
        <div class="flex items-center gap-3 mb-6">
          <i class="pi pi-link text-xl text-executive-primary"></i>
          <h2 class="text-xl font-bold text-executive-primary font-sans">Connected Workspaces</h2>
        </div>
        <WorkspaceIntegration />
      </section>

      <!-- Email Ingestion Settings -->
      <section v-if="integration" class="bg-white p-8 rounded-executive border border-slate-200 shadow-sm">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <i class="pi pi-filter text-xl text-executive-primary"></i>
            <h2 class="text-xl font-bold text-executive-primary font-sans">Email Ingestion</h2>
          </div>
          <Button 
            v-if="hasChanges"
            label="Save Changes" 
            icon="pi pi-check" 
            @click="savePreferences" 
            :loading="saving"
            severity="success"
            size="small"
          />
        </div>
        
        <GmailLabelSelector 
          :organizationId="integration.organization_id" 
          :initialPreferences="integration.label_preferences || []"
          @update:preferences="handlePreferenceUpdate"
        />
      </section>
    </div>
  </div>
</template>
