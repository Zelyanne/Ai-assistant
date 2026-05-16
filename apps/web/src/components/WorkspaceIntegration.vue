<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import { agentApiUrl } from '../services/agentApi';

const userStore = useUserStore();
const loading = ref(false);
const error = ref<string | null>(null);
const connectionStatus = ref<'connected' | 'disconnected' | 'error'>('disconnected');
const lastSync = ref<string | null>(null);

const fetchStatus = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const organizationId = userStore.profile?.organization_id;
  if (!organizationId) return;

  const { data } = await supabase
    .from('workspace_integrations')
    .select('sync_status, last_sync_at')
    .eq('organization_id', organizationId)
    .eq('provider', 'google')
    .single();

  if (data) {
    connectionStatus.value = data.sync_status === 'error' ? 'error' : 'connected';
    lastSync.value = data.last_sync_at;
  }
};

onMounted(fetchStatus);

const handleConnect = async () => {
  loading.value = true;
  error.value = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('You must be logged in');

    const organizationId = userStore.profile?.organization_id;
    if (!organizationId) throw new Error('Organization ID not found in user profile');

    const response = await fetch(agentApiUrl(`/api/auth/google/url?organizationId=${organizationId}&userId=${user.id}`));
    const { url } = await response.json();

    if (url) {
      window.location.href = url;
    } else {
      throw new Error('Failed to get authorization URL');
    }
  } catch (err: any) {
    error.value = err.message || 'Failed to connect to Google Workspace';
    console.error('Connection error:', err);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="p-4">
    <Card class="max-w-md mx-auto shadow-lg">
      <template #title>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <i class="pi pi-google text-blue-500 text-3xl" />
            <span class="font-bold text-xl text-gray-800">Google Workspace</span>
          </div>
          <Tag
            v-if="connectionStatus === 'connected'"
            severity="success"
            value="Connected"
          />
          <Tag
            v-else-if="connectionStatus === 'error'"
            severity="danger"
            value="Error"
          />
        </div>
      </template>
      <template #content>
        <div class="py-4">
          <p class="m-0 text-gray-600 leading-relaxed">
            Securely connect Google Workspace so the assistant can work across Gmail, Calendar, Drive, Docs, Sheets, and Slides when you delegate operational tasks.
          </p>

          <p class="mt-3 text-sm text-slate-500 leading-relaxed">
            These scopes support reading the context needed to act, creating new workspace artifacts, and writing drafts or updates back into Google on your behalf.
          </p>
          
          <div
            v-if="lastSync"
            class="mt-2 text-xs text-slate-400 italic"
          >
            Last synced: {{ new Date(lastSync).toLocaleString() }}
          </div>

          <div class="mt-4 flex flex-col gap-3">
            <div class="flex items-start gap-2 text-sm text-gray-500">
              <i class="pi pi-check-circle text-green-500" />
              <span>Gmail to read message context, create drafts, and send approved updates.</span>
            </div>
            <div class="flex items-start gap-2 text-sm text-gray-500">
              <i class="pi pi-check-circle text-green-500" />
              <span>Calendar to review availability and create or update scheduled events.</span>
            </div>
            <div class="flex items-start gap-2 text-sm text-gray-500">
              <i class="pi pi-check-circle text-green-500" />
              <span>Drive to read source files and attach newly created workspace content.</span>
            </div>
            <div class="flex items-start gap-2 text-sm text-gray-500">
              <i class="pi pi-check-circle text-green-500" />
              <span>Docs, Sheets, and Slides to generate working artifacts from delegated tasks.</span>
            </div>
            <div class="flex items-start gap-2 text-sm text-gray-500">
              <i class="pi pi-shield text-blue-500" />
              <span>Secure token storage with scoped access aligned to the current backend worker capabilities.</span>
            </div>
          </div>

          <Message
            v-if="error"
            severity="error"
            class="mt-6"
            :closable="false"
          >
            {{ error }}
          </Message>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end pt-2">
          <Button 
            :label="connectionStatus === 'connected' ? 'Reconnect Workspace' : 'Connect Workspace'" 
            icon="pi pi-external-link" 
            icon-pos="right"
            :loading="loading" 
            :severity="connectionStatus === 'connected' ? 'secondary' : 'primary'"
            class="px-6 py-2"
            @click="handleConnect"
          />
        </div>
      </template>
    </Card>
  </div>
</template>


<style scoped>
:deep(.p-card-title) {
  border-bottom: 1px solid #f3f4f6;
  padding-bottom: 1rem;
}
</style>
