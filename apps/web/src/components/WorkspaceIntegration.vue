<script setup lang="ts">
import { ref } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Message from 'primevue/message';
import { useAuth } from '../composables/useAuth';

const { signInWithGoogle } = useAuth();
const loading = ref(false);
const error = ref<string | null>(null);

const handleConnect = async () => {
  loading.value = true;
  error.value = null;
  try {
    await signInWithGoogle();
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
        <div class="flex items-center gap-3">
          <i class="pi pi-google text-blue-500 text-3xl" />
          <span class="font-bold text-xl text-gray-800">Google Workspace</span>
        </div>
      </template>
      <template #content>
        <div class="py-4">
          <p class="m-0 text-gray-600 leading-relaxed">
            Securely connect your Google Workspace to allow the AI assistant to access your calendar and email. 
            This data is used to populate your personalized morning briefs.
          </p>
          
          <div class="mt-4 flex flex-col gap-2">
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <i class="pi pi-check-circle text-green-500" />
              <span>Read-only access to Gmail</span>
            </div>
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <i class="pi pi-check-circle text-green-500" />
              <span>Read-only access to Calendar</span>
            </div>
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <i class="pi pi-shield text-blue-500" />
              <span>Secure AES-256 encryption</span>
            </div>
          </div>

          <Message v-if="error" severity="error" class="mt-6" :closable="false">
            {{ error }}
          </Message>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end pt-2">
          <Button 
            label="Connect Workspace" 
            icon="pi pi-external-link" 
            iconPos="right"
            :loading="loading" 
            @click="handleConnect"
            severity="primary"
            class="px-6 py-2"
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
