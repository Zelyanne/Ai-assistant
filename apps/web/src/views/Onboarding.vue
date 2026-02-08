<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Card from 'primevue/card';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import SelectButton from 'primevue/selectbutton';

const router = useRouter();
const userStore = useUserStore();

const orgName = ref('');
const loading = ref(false);
const showCreateTeam = ref(false);
const showSoloTierSelection = ref(false);
const errorMessage = ref('');

const selectedTier = ref('Public');
const tierOptions = [
  { label: 'Full Autonomy', value: 'Public', icon: 'pi pi-bolt', description: 'Agent takes action automatically for maximum speed.' },
  { label: 'Balanced', value: 'Controlled', icon: 'pi pi-sliders-h', description: 'Agent takes action but flags sensitive items for review.' },
  { label: 'High Security', value: 'Restricted', icon: 'pi pi-shield', description: 'Agent analyzes but always waits for your approval.' }
];

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
    } catch (err: unknown) {
      console.error(`Profile fetch retry ${retryCount.value} failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
    try {
      await router.push('/dashboard');
    } catch (navError: unknown) {
      console.error('Navigation to dashboard failed:', navError instanceof Error ? navError.message : navError);
      loadError.value = 'Unable to redirect to dashboard. Please try refreshing the page.';
    }
  }
});

const handleCreateOrganization = async (role: 'CEO' | 'Simple User', tier: string = 'Restricted') => {
  loading.value = true;
  errorMessage.value = '';
  
  try {
    // If starting solo, we force role to CEO so they have full permissions over their own workspace
    const finalRole = role === 'Simple User' ? 'CEO' : role;
    const finalOrgName = role === 'Simple User' ? `${userName.value}'s Workspace` : orgName.value;
    
    if (!finalOrgName) {
      throw new Error('Organization name is required');
    }

    // Ensure profile is loaded
    if (!userStore.profile?.id) {
      await userStore.fetchProfile();
      if (!userStore.profile?.id) {
        throw new Error('User profile not found. Please try refreshing the page.');
      }
    }

    // Call the RPC function to initialize organization with the selected tier
    const { data: orgData, error: rpcError } = await supabase.rpc('initialize_organization', {
      org_name: finalOrgName,
      user_role: finalRole,
      default_tier: tier
    });

    if (rpcError) throw rpcError;

    // 3. Force refresh session
    await supabase.auth.refreshSession();

    // 4. Refresh profile in store and redirect
    await userStore.fetchProfile();
    router.push('/dashboard');
  } catch (error: any) {
    errorMessage.value = error.message || 'Failed to initialize workspace';
    console.error('Onboarding error:', error);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-executive-background flex items-center justify-center p-6 font-sans">
    <div class="w-full max-w-2xl">
      <div v-if="isLoadingProfile" class="text-center py-12">
        <ProgressSpinner aria-label="Loading profile" />
        <p class="text-slate-500 mt-4">Setting up your workspace...</p>
      </div>

      <div v-else-if="loadError" class="text-center py-12">
        <Message severity="error" class="mb-6">{{ loadError }}</Message>
        <Button label="Try Again" icon="pi pi-refresh" @click="fetchProfileWithRetry" />
      </div>

      <template v-else>
        <div class="text-center mb-10">
          <h1 class="text-3xl font-bold text-executive-primary tracking-tight">Setup Your Workspace</h1>
          <p class="text-slate-500 mt-2">Choose how you want to use AI Assistant</p>
        </div>

        <Message v-if="errorMessage" severity="error" class="mb-6">{{ errorMessage }}</Message>

        <!-- Initial Selection -->
        <div v-if="!showCreateTeam && !showSoloTierSelection" class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Solo Option -->
        <Card class="border-2 border-transparent hover:border-executive-primary transition-all cursor-pointer overflow-hidden shadow-sm" @click="showSoloTierSelection = true">
          <template #title>
            <div class="flex items-center gap-3">
              <i class="pi pi-user text-2xl text-executive-primary"></i>
              <span>Start Solo</span>
            </div>
          </template>
          <template #content>
            <p class="text-slate-600 mb-6">
              Perfect for individuals or self-employed professionals. One-click setup for your personal productivity environment.
            </p>
            <Button 
              label="I'm Working Solo" 
              class="w-full" 
              severity="contrast" 
              @click.stop="showSoloTierSelection = true"
            />
          </template>
        </Card>

        <!-- Team Option -->
        <Card class="border-2 border-transparent hover:border-executive-primary transition-all cursor-pointer overflow-hidden shadow-sm" @click="showCreateTeam = true">
          <template #title>
            <div class="flex items-center gap-3">
              <i class="pi pi-users text-2xl text-executive-primary"></i>
              <span>Create a Team</span>
            </div>
          </template>
          <template #content>
            <p class="text-slate-600 mb-6">
              Build an organization, invite team members, and coordinate tasks with background intelligence.
            </p>
            <Button 
              label="Setup Organization" 
              class="w-full" 
              outlined 
              @click.stop="showCreateTeam = true"
            />
          </template>
        </Card>
      </div>

      <!-- Solo Tier Selection -->
      <Card v-else-if="showSoloTierSelection" class="shadow-sm border border-slate-200">
        <template #title>Configure Your Agent</template>
        <template #subtitle>Choose your agent's autonomy level. You can change this later.</template>
        <template #content>
          <div class="flex flex-col gap-6 mt-4">
            <div class="flex flex-col gap-3">
              <div 
                v-for="opt in tierOptions" 
                :key="opt.value"
                class="flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors"
                :class="selectedTier === opt.value ? 'border-executive-primary bg-slate-50' : 'border-slate-200'"
                @click="selectedTier = opt.value"
              >
                <div class="h-10 w-10 rounded-full bg-white shadow-sm flex items-center justify-center border border-slate-100">
                  <i :class="[opt.icon, selectedTier === opt.value ? 'text-executive-primary' : 'text-slate-400']"></i>
                </div>
                <div class="flex-1">
                  <div class="font-bold text-executive-primary">{{ opt.label }}</div>
                  <div class="text-xs text-slate-500 font-technical">{{ opt.description }}</div>
                </div>
                <div class="h-5 w-5 rounded-full border-2 flex items-center justify-center" :class="selectedTier === opt.value ? 'border-executive-primary' : 'border-slate-300'">
                  <div v-if="selectedTier === opt.value" class="h-2.5 w-2.5 rounded-full bg-executive-primary"></div>
                </div>
              </div>
            </div>

            <div class="flex gap-3 mt-4">
              <Button label="Back" severity="secondary" outlined class="flex-1" @click="showSoloTierSelection = false" :disabled="loading" />
              <Button label="Finish Setup" severity="contrast" class="flex-1" @click="handleCreateOrganization('Simple User', selectedTier)" :loading="loading" />
            </div>
          </div>
        </template>
      </Card>

      <!-- Create Team Form -->
      <Card v-else class="shadow-sm border border-slate-200">
        <template #title>Create Your Organization</template>
        <template #content>
          <div class="flex flex-col gap-4 mt-2">
            <div class="flex flex-col gap-2">
              <label for="orgName" class="text-xs font-semibold uppercase tracking-wider text-slate-500 font-technical">Organization Name</label>
              <InputText 
                id="orgName" 
                v-model="orgName" 
                placeholder="Acme Corp" 
                class="w-full font-technical"
                :disabled="loading"
                autofocus
              />
            </div>
            
            <div class="flex flex-col gap-2 mt-4">
              <label class="text-xs font-semibold uppercase tracking-wider text-slate-500 font-technical">Default Autonomy Level</label>
              <div class="grid grid-cols-3 gap-2">
                <div 
                  v-for="opt in tierOptions" 
                  :key="opt.value"
                  class="flex flex-col items-center gap-2 p-2 border rounded cursor-pointer text-center"
                  :class="selectedTier === opt.value ? 'border-executive-primary bg-slate-50' : 'border-slate-100'"
                  @click="selectedTier = opt.value"
                >
                  <i :class="[opt.icon, 'text-sm', selectedTier === opt.value ? 'text-executive-primary' : 'text-slate-400']"></i>
                  <span class="text-[10px] font-bold">{{ opt.label }}</span>
                </div>
              </div>
            </div>
            
            <div class="flex gap-3 mt-6">
              <Button label="Back" severity="secondary" outlined class="flex-1" @click="showCreateTeam = false" :disabled="loading" />
              <Button label="Create & Continue" severity="contrast" class="flex-1" @click="handleCreateOrganization('CEO', selectedTier)" :loading="loading" :disabled="!orgName" />
            </div>
          </div>
        </template>
      </Card>
      </template>
    </div>
  </div>
</template>
