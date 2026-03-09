<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import MessagesLayout from '../components/messages/MessagesLayout.vue';
import EmailListItem from '../components/messages/EmailListItem.vue';
import VirtualScroller from 'primevue/virtualscroller';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';

const userStore = useUserStore();
const emails = ref<any[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const fetchEmails = async () => {
    if (!userStore.profile?.organization_id) return;
    loading.value = true;
    
    try {
        // Fetch emails associated with watch topics
        // This is a bit complex in Supabase without a view, so we might need a join or two queries.
        // For MVP, let's fetch emails that HAVE a priority score (implies relevance) 
        // OR we can rely on `metadata->>'topic'` if we store it.
        // But `ingested_threads` doesn't explicitly link to `watch_topics`.
        // The `MorningBriefProcessor` does this matching.
        // For this view, we'll just show all ingested threads sorted by date for now, 
        // as "Topics" view usually implies "Relevant stuff".
        // IMPROVEMENT: Add a `topic` column to `ingested_threads` or a junction table.
        // For now, let's filter by `priority_score > 0` as a proxy for "Matched a topic/relevant".
        
        const { data, error: err } = await supabase
            .from('ingested_threads')
            .select('*')
            .eq('organization_id', userStore.profile.organization_id)
            .order('created_at', { ascending: false })
            .limit(100); // Pagination needed for real scale

        if (err) throw err;
        emails.value = data || [];
    } catch (err: any) {
        error.value = err.message;
    } finally {
        loading.value = false;
    }
};

onMounted(fetchEmails);
</script>

<template>
  <MessagesLayout>
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
        No emails found. Connect your workspace in Settings.
      </div>
        
      <div
        v-else
        class="h-[calc(100vh-250px)] min-h-[500px]"
      >
        <!-- Virtual Scroller for performance -->
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
