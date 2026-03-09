<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import Card from 'primevue/card';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Dropdown from 'primevue/dropdown';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Message from 'primevue/message';

const userStore = useUserStore();

interface WatchTopic {
  id?: string;
  topic: string;
  priority: 'High' | 'Medium' | 'Low';
}

const topics = ref<WatchTopic[]>([]);
const newTopic = ref<string>('');
const newPriority = ref<'High' | 'Medium' | 'Low'>('Medium');
const loading = ref(false);
const error = ref<string | null>(null);

const priorityOptions = [
  { label: 'High', value: 'High' },
  { label: 'Medium', value: 'Medium' },
  { label: 'Low', value: 'Low' }
];

async function fetchTopics() {
  if (!userStore.profile?.organization_id) return;
  loading.value = true;
  try {
    const { data, error: err } = await supabase
      .from('watch_topics')
      .select('id, topic, priority')
      .eq('organization_id', userStore.profile.organization_id)
      .order('created_at', { ascending: false });

    if (err) throw err;
    
    topics.value = (data || []).map((row: any) => ({
      id: row.id,
      topic: row.topic,
      priority: (row.priority as WatchTopic['priority']) || 'Medium'
    }));
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function addTopic() {
  if (!newTopic.value.trim() || !userStore.profile?.organization_id) return;
  
  loading.value = true;
  try {
    const { data, error: err } = await supabase
      .from('watch_topics')
      .insert({
        organization_id: userStore.profile.organization_id,
        topic: newTopic.value.trim(),
        priority: newPriority.value,
        keywords_array: []
      } as any)
      .select()
      .single();

    if (err) throw err;
    if (data) {
      const row = data as any;
      topics.value.unshift({
        id: row.id,
        topic: row.topic,
        priority: row.priority || 'Medium'
      });
    }
    newTopic.value = '';
    newPriority.value = 'Medium';
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function deleteTopic(id: string) {
  loading.value = true;
  try {
    const { error: err } = await supabase
      .from('watch_topics')
      .delete()
      .eq('id', id);

    if (err) throw err;
    topics.value = topics.value.filter(t => t.id !== id);
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

onMounted(fetchTopics);
</script>

<template>
  <Card class="border-none shadow-sm overflow-hidden">
    <template #title>
      <div class="text-lg font-semibold text-executive-primary uppercase tracking-wider px-2">
        Watch Topics & Priority Highlights
      </div>
    </template>
    <template #content>
      <div class="space-y-6">
        <p class="text-sm text-slate-500 font-technical px-2">
          Define keywords or topics that Antigravity should prioritize when triaging your inbox.
        </p>

        <div class="flex gap-4 p-2 bg-slate-50 rounded-executive border border-slate-200">
          <div class="flex-1">
            <InputText 
              v-model="newTopic" 
              placeholder="e.g. Investor, Urgent, Newsletter" 
              class="w-full font-technical"
              @keyup.enter="addTopic"
            />
          </div>
          <div class="w-32">
            <Dropdown 
              v-model="newPriority" 
              :options="priorityOptions" 
              option-label="label" 
              option-value="value"
              class="w-full font-technical"
            />
          </div>
          <Button 
            icon="pi pi-plus" 
            :loading="loading" 
            class="bg-executive-primary border-none"
            @click="addTopic"
          />
        </div>

        <Message
          v-if="error"
          severity="error"
        >
          {{ error }}
        </Message>

        <DataTable
          :value="topics"
          class="p-datatable-sm font-technical"
          :loading="loading"
        >
          <Column
            field="topic"
            header="Topic"
          />
          <Column
            field="priority"
            header="Priority"
          >
            <template #body="slotProps">
              <span
                :class="{
                  'text-red-600 font-bold': slotProps.data.priority === 'High',
                  'text-orange-600': slotProps.data.priority === 'Medium',
                  'text-slate-600': slotProps.data.priority === 'Low'
                }"
              >
                {{ slotProps.data.priority }}
              </span>
            </template>
          </Column>
          <Column style="width: 3rem">
            <template #body="slotProps">
              <Button 
                icon="pi pi-trash" 
                severity="danger" 
                text 
                rounded
                @click="deleteTopic(slotProps.data.id)"
              />
            </template>
          </Column>
          <template #empty>
            <div class="text-center p-4 text-slate-400 italic">
              No watch topics defined.
            </div>
          </template>
        </DataTable>
      </div>
    </template>
  </Card>
</template>
