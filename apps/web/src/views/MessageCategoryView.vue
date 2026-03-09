<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import MessagesLayout from '../components/messages/MessagesLayout.vue';
import EmailListItem from '../components/messages/EmailListItem.vue';
import VirtualScroller from 'primevue/virtualscroller';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';
import Dropdown from 'primevue/dropdown';

const userStore = useUserStore();
const emails = ref<any[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const categories = ['All', 'Critical', 'High Priority', 'Action Required', 'FYI', 'Low Priority'];
const selectedCategory = ref('All');

const fetchEmails = async () => {
    if (!userStore.profile?.organization_id) return;
    loading.value = true;
    
    try {
        let query = supabase
            .from('ingested_threads')
            .select('*')
            .eq('organization_id', userStore.profile.organization_id)
            .order('created_at', { ascending: false })
            .limit(100);

        if (selectedCategory.value !== 'All') {
            query = query.ilike('category', selectedCategory.value);
        }
        
        const { data, error: err } = await query;

        if (err) throw err;
        emails.value = data || [];
    } catch (err: any) {
        error.value = err.message;
    } finally {
        loading.value = false;
    }
};

const onCategoryChange = () => {
    fetchEmails();
};

onMounted(fetchEmails);
</script>

<template>
  <MessagesLayout>
    <div class="mb-4 flex items-center gap-2">
      <label class="font-bold text-gray-700">Filter by Category:</label>
      <Dropdown 
        v-model="selectedCategory" 
        :options="categories" 
        class="w-56" 
        @change="onCategoryChange"
      />
    </div>

    <div
      v-if="loading"
      class="flex justify-center p-10"
    >
      <ProgressSpinner />
    </div>
    
    <Message
      v-if="error"
      severity="error"
      :text="error"
    />

    <div v-if="!loading && !error">
      <div
        v-if="emails.length === 0"
        class="text-center text-gray-500 py-10"
      >
        No emails found in this category.
      </div>
        
      <div
        v-else
        class="h-[calc(100vh-300px)] min-h-[500px]"
      >
        <VirtualScroller
          :items="emails"
          :item-size="120"
          class="h-full"
        >
          <template #item="{ item }">
            <EmailListItem :email="item" />
          </template>
        </VirtualScroller>
      </div>
    </div>
  </MessagesLayout>
</template>
