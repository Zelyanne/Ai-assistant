<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import TabMenu from 'primevue/tabmenu';
import { supabase } from '../../services/supabase';
import { useUserStore } from '../../stores/user';
import { formatDate } from '@vueuse/core';
import Button from 'primevue/button';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const items = ref([
    { label: 'Topics You Watch', icon: 'pi pi-search', to: '/messages/topic', 
      tooltip: 'Emails matching your watch keywords' },
    { label: 'AI Categories', icon: 'pi pi-tags', to: '/messages/category',
      tooltip: 'Emails classified by importance by the AI' }
]);

const activeIndex = ref(0);
const lastSync = ref<string | null>(null);
const loading = ref(false);

const updateActiveIndex = () => {
  const currentPath = route.path;
  if (currentPath.includes('/messages/topic')) activeIndex.value = 0;
  else if (currentPath.includes('/messages/category')) activeIndex.value = 1;
};

const fetchSyncStatus = async () => {
    if (!userStore.profile?.organization_id) return;
    
    const { data } = await supabase
        .from('workspace_integrations')
        .select('last_sync_at')
        .eq('organization_id', userStore.profile.organization_id)
        .eq('provider', 'google')
        .single();
    
    if (data) {
        lastSync.value = data.last_sync_at;
    }
};

const refreshSync = async () => {
    loading.value = true;
    // Trigger sync endpoint or task if available, for now just reload status
    // Ideally this would trigger an ingestion task
    await fetchSyncStatus();
    // Simulate delay
    setTimeout(() => { loading.value = false; }, 1000);
};

const onTabChange = (event: any) => {
    router.push(event.value.to);
};

onMounted(() => {
    updateActiveIndex();
    fetchSyncStatus();
});

// Watch for route changes to update tab
router.afterEach(() => {
    updateActiveIndex();
});
</script>

<template>
  <div class="messages-layout space-y-6">
    <header class="flex justify-between items-center px-6 pt-6">
      <div>
        <h1 class="text-3xl font-bold text-executive-primary tracking-tight font-sans">Messages</h1>
        <p class="text-slate-500 mt-2 font-technical">AI-analyzed email stream</p>
      </div>
      <div class="flex items-center gap-4">
        <div v-if="lastSync" class="text-sm text-slate-500 italic">
             Last synced: {{ new Date(lastSync).toLocaleString() }}
        </div>
        <Button 
            icon="pi pi-refresh" 
            text 
            rounded 
            aria-label="Refresh" 
            @click="refreshSync"
            :loading="loading"
        />
      </div>
    </header>

    <div class="px-6">
        <TabMenu :model="items" :activeIndex="activeIndex" @tab-change="onTabChange">
            <template #item="{ item, props }">
                <a v-bind="props.action" class="flex align-items-center gap-2" v-tooltip.top="item.tooltip">
                    <span :class="item.icon" />
                    <span class="font-bold">{{ item.label }}</span>
                </a>
            </template>
        </TabMenu>
    </div>

    <div class="content px-6 pb-6">
        <slot></slot>
    </div>
  </div>
</template>

<style scoped>
/* Add any custom styles if needed */
</style>
