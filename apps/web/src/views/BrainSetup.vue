<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import WatchTopics from '../components/WatchTopics.vue';
import OutcomeCard from '../components/activity/OutcomeCard.vue';
import { useAgent } from '../composables/useAgent';
import { useProtocolOptimization } from '../composables/useProtocolOptimization';
import { useUserStore } from '../stores/user';
import { supabase } from '../services/supabase';
import type { Task, ProtocolOptimizationTaskResult, ProtocolOptimizationSuggestion } from '@ai-assistant/shared';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Badge from 'primevue/badge';
import Textarea from 'primevue/textarea';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';

const userStore = useUserStore();
const { loading: agentLoading, error: agentError, submitTask, monitorTask } = useAgent();
const { suggestions, loading: optLoading, fetchSuggestions, approveOptimization, declineOptimization } = useProtocolOptimization();

const philosophy = ref('');
const generatedProtocol = ref<string | null>(null);
const generatedMetadata = ref<any | null>(null);
const currentTaskId = ref<string | null>(null);
const isSaving = ref(false);
const saveSuccess = ref(false);

const loading = computed(() => agentLoading.value || optLoading.value);

let unsubscribe: (() => void) | null = null;

onMounted(() => {
  fetchSuggestions();
});

function getOptimizationSuggestion(task: Task): ProtocolOptimizationSuggestion | null {
  const result = task.result as ProtocolOptimizationTaskResult | null | undefined;
  return result?.suggestion ?? null;
}

async function handleGenerate() {
  if (!philosophy.value.trim()) return;

  generatedProtocol.value = null;
  generatedMetadata.value = null;
  saveSuccess.value = false;
  
  const task = await submitTask('protocol.generate', { philosophy: philosophy.value });
  
  if (task && task.id) {
    currentTaskId.value = task.id;
    unsubscribe = monitorTask(task.id, (updatedTask) => {
      if (updatedTask.status === 'done' && updatedTask.result) {
        generatedProtocol.value = typeof updatedTask.result.protocol_markdown === 'string'
          ? updatedTask.result.protocol_markdown
          : null;
        generatedMetadata.value = updatedTask.result.metadata ?? null;
        currentTaskId.value = null;
        if (unsubscribe) unsubscribe();
      } else if (updatedTask.status === 'error') {
        currentTaskId.value = null;
        if (unsubscribe) unsubscribe();
      }
    });
  }
}

async function handleApprove() {
  if (!generatedProtocol.value || !userStore.profile?.organization_id) return;

  isSaving.value = true;
  try {
    const { error } = await supabase
      .from('user_protocols')
      .upsert({
        organization_id: userStore.profile.organization_id,
        user_id: userStore.profile.id,
        title: 'Primary Leadership Protocol',
        content_markdown: generatedProtocol.value,
        metadata: generatedMetadata.value || {},
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'organization_id'
      });

    if (error) throw error;
    saveSuccess.value = true;
  } catch (err: any) {
    console.error('Failed to save protocol:', err);
  } finally {
    isSaving.value = false;
  }
}

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-8 py-4">
    <header>
      <h1 class="text-3xl font-bold text-executive-primary tracking-tight font-sans">
        Protocol Brain Setup
      </h1>
      <p class="text-slate-500 mt-2 font-technical">
        Describe your leadership style and philosophy. Antigravity will generate a behavior protocol that governs its autonomous actions.
      </p>
    </header>

    <Card class="border-none shadow-sm overflow-hidden">
      <template #content>
        <div class="space-y-4">
          <label
            for="philosophy"
            class="block text-sm font-medium text-slate-700 uppercase tracking-wider"
          >
            Leadership Philosophy & Nudging Style
          </label>
          <Textarea 
            id="philosophy"
            v-model="philosophy"
            rows="8"
            class="w-full font-technical text-executive-primary border-slate-200 focus:border-executive-info"
            placeholder="Example: I prefer a direct but supportive communication style. Nudge me if a task is overdue by more than 24 hours. For critical escalations, use a more urgent tone..."
            :disabled="loading || !!currentTaskId"
          />
          <div class="flex justify-end">
            <Button 
              label="Generate Protocol" 
              icon="pi pi-bolt" 
              :loading="loading || !!currentTaskId" 
              class="bg-executive-primary text-white border-none px-6"
              @click="handleGenerate"
            />
          </div>
        </div>
      </template>
    </Card>

    <div
      v-if="currentTaskId"
      class="flex flex-col items-center justify-center p-12 space-y-4"
    >
      <ProgressSpinner
        style="width: 50px; height: 50px"
        stroke-width="4"
      />
      <p class="text-executive-info font-technical animate-pulse">
        Antigravity is synthesizing your protocol...
      </p>
    </div>

    <Message
      v-if="agentError"
      severity="error"
      class="font-technical"
    >
      {{ agentError }}
    </Message>

    <section
      v-if="generatedProtocol"
      class="space-y-6"
    >
      <Card class="border-none shadow-sm overflow-hidden bg-slate-50">
        <template #title>
          <div class="flex items-center justify-between px-2">
            <span class="text-lg font-semibold text-executive-primary">Generated Protocol Preview</span>
            <div class="space-x-2">
              <Button 
                label="Regenerate" 
                icon="pi pi-refresh" 
                severity="secondary" 
                text 
                class="font-technical"
                @click="handleGenerate"
              />
              <Button 
                label="Approve & Save" 
                icon="pi pi-check" 
                :loading="isSaving"
                class="bg-executive-success text-white border-none px-6"
                @click="handleApprove"
              />
            </div>
          </div>
        </template>
        <template #content>
          <div class="prose prose-slate max-w-none bg-white p-8 rounded-executive border border-slate-200 shadow-inner">
            <div class="whitespace-pre-wrap font-technical text-executive-primary">
              {{ generatedProtocol }}
            </div>
          </div>
        </template>
      </Card>

      <Message
        v-if="saveSuccess"
        severity="success"
        class="font-technical"
      >
        Protocol saved successfully! Antigravity will now follow these guidelines for all future tasks.
      </Message>
    </section>

    <section v-if="suggestions.length > 0" class="space-y-6">
      <header class="flex items-center justify-between">
        <h2 class="text-xl font-bold text-executive-primary tracking-tight font-sans">
          Protocol Optimization Suggestions
        </h2>
        <Badge :value="suggestions.length" severity="info" />
      </header>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OutcomeCard
          v-for="task in suggestions"
          :key="task.id"
          :title="getOptimizationSuggestion(task)?.nl_diff_summary || 'Suggested protocol optimization'"
          :summary="getOptimizationSuggestion(task)?.rationale || 'Review this protocol improvement suggestion.'"
          status="optimization"
          :timestamp="new Date(task.created_at || '').toLocaleString()"
          :task-id="task.id"
        >
          <template #actions>
            <div class="flex gap-2">
              <Button
                label="Decline"
                severity="secondary"
                size="small"
                text
                class="font-technical"
                @click="declineOptimization(task)"
              />
              <Button
                label="Approve & Apply"
                icon="pi pi-check"
                severity="success"
                size="small"
                class="font-technical"
                @click="approveOptimization(task)"
              />
            </div>
          </template>
        </OutcomeCard>
      </div>
    </section>

    <WatchTopics />
  </div>
</template>

<style scoped>
:deep(.p-card-body) {
  padding: 1.5rem;
}
</style>
