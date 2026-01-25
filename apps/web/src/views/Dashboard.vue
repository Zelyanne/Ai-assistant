<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '../stores/user';
import { useAgent } from '../composables/useAgent';
import { supabase } from '../services/supabase';
import type { Tables } from '@ai-assistant/shared';
import OutcomeCard from '../components/activity/OutcomeCard.vue';
import ReasoningTracePane from '../components/activity/ReasoningTracePane.vue';
import Button from 'primevue/button';
import Card from 'primevue/card';

const isTraceVisible = ref(false);
const selectedTaskId = ref<string | null>(null);

function openTrace(taskId: string) {
  selectedTaskId.value = taskId;
  isTraceVisible.value = true;
}

type IngestedThread = Tables<'ingested_threads'>;
type Task = Tables<'tasks'>;

// Type guards for safer metadata access
interface ThreadMetadata {
  subject?: string;
  is_escalation?: boolean;
}

interface TaskPayload {
  agency_tier?: 'Public' | 'Controlled' | 'Restricted';
}

interface TaskResult {
  summary?: string;
}

const TIME_SAVED_PER_WIN_MINUTES = 15;

const router = useRouter();
const userStore = useUserStore();
const { subscribeToTable } = useAgent();

const threads = ref<IngestedThread[]>([]);
const tasks = ref<Task[]>([]);
const loading = ref(true);

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
});

// Aggregate stats for Momentum Header
interface MomentumStats {
  autonomousWins: number;
  escalations: number;
  timeSavedLabel: string;
}

const stats = computed<MomentumStats>(() => {
  let autonomousWins = 0;
  let taskEscalations = 0;
  
  for (const task of tasks.value) {
    if (task.status === 'done') autonomousWins++;
    if (task.status === 'escalation') taskEscalations++;
  }
  
  let threadEscalations = 0;
  for (const thread of threads.value) {
    const meta = thread.metadata as unknown as ThreadMetadata;
    if (meta?.is_escalation === true) threadEscalations++;
  }
  
  const escalations = taskEscalations + threadEscalations;
  const timeSavedMinutes = autonomousWins * TIME_SAVED_PER_WIN_MINUTES;
  const timeSavedLabel = timeSavedMinutes >= 60 
    ? `${(timeSavedMinutes / 60).toFixed(1)}h saved`
    : `${timeSavedMinutes}m saved`;

  return {
    autonomousWins,
    escalations,
    timeSavedLabel
  };
});

// Map threads and tasks to OutcomeCard props
interface OutcomeItem {
  id: string;
  type: 'task' | 'thread';
  title: string;
  summary: string;
  summaryJson?: any;
  externalId?: string;
  status: 'done' | 'escalation' | 'processing' | 'queued' | 'error' | 'insight';
  agencyTier: 'Public' | 'Controlled' | 'Restricted';
  timestamp: string;
  original: Task | IngestedThread;
}

const outcomeItems = computed((): OutcomeItem[] => {
  const items: OutcomeItem[] = [];

  // Map Tasks (Silent Wins & Escalations)
  tasks.value.forEach(task => {
    let status: 'done' | 'escalation' | 'processing' | 'queued' | 'error' | 'insight' = 'insight';
    if (task.status === 'done') status = 'done';
    else if (task.status === 'escalation') status = 'escalation';
    else if (task.status === 'processing') status = 'processing';
    else if (task.status === 'error') status = 'error';
    else status = 'queued';

    const taskPayload = task.payload as unknown as TaskPayload;
    const taskResult = task.result as unknown as TaskResult;

    items.push({
      id: task.id,
      type: 'task',
      title: task.domain_action.split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
      summary: taskResult?.summary || `Action executed: ${task.domain_action}`,
      status,
      agencyTier: taskPayload?.agency_tier || 'Controlled',
      timestamp: new Date(task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      original: task
    });
  });

  // Map Threads (Insights & High-Priority)
  threads.value.forEach(thread => {
    const threadMetadata = thread.metadata as unknown as ThreadMetadata;
    const isEscalation = threadMetadata?.is_escalation === true;
    items.push({
      id: thread.id,
      type: 'thread',
      title: threadMetadata?.subject || 'Incoming Communication',
      summary: thread.summary || 'New priority thread detected and classified.',
      summaryJson: thread.summary_json,
      externalId: thread.external_id,
      status: isEscalation ? 'escalation' : 'insight',
      agencyTier: 'Public', // Threads are usually Public tier until actioned
      timestamp: new Date(thread.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      original: thread
    });
  });

  // Sort by timestamp desc
  return items.sort((a, b) => {
    const aTime = new Date(a.original.created_at).getTime();
    const bTime = new Date(b.original.created_at).getTime();
    return bTime - aTime;
  });
});

async function fetchData() {
  if (!userStore.profile?.organization_id) return;

  loading.value = true;
  try {
    const [threadsRes, tasksRes] = await Promise.all([
      supabase
        .from('ingested_threads')
        .select('*')
        .eq('organization_id', userStore.profile.organization_id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('tasks')
        .select('*')
        .eq('organization_id', userStore.profile.organization_id)
        .order('created_at', { ascending: false })
        .limit(10)
    ]);

    if (threadsRes.error) throw threadsRes.error;
    if (tasksRes.error) throw tasksRes.error;

    threads.value = threadsRes.data;
    tasks.value = tasksRes.data;
  } catch (err) {
    console.error('Error fetching dashboard data:', err);
  } finally {
    loading.value = false;
  }
}

let cleanupThreads: (() => void) | null = null;
let cleanupTasks: (() => void) | null = null;

onMounted(async () => {
  await fetchData();

  cleanupThreads = subscribeToTable('ingested_threads', (payload) => {
    if (payload.eventType === 'INSERT') {
      threads.value = [payload.new, ...threads.value].slice(0, 10);
    } else if (payload.eventType === 'UPDATE') {
      threads.value = threads.value.map(t => t.id === payload.new.id ? payload.new : t);
    } else if (payload.eventType === 'DELETE') {
      threads.value = threads.value.filter(t => t.id !== payload.old.id);
    }
  });

  cleanupTasks = subscribeToTable('tasks', (payload) => {
    if (payload.eventType === 'INSERT') {
      tasks.value = [payload.new, ...tasks.value].slice(0, 10);
    } else if (payload.eventType === 'UPDATE') {
      tasks.value = tasks.value.map(t => t.id === payload.new.id ? payload.new : t);
    } else if (payload.eventType === 'DELETE') {
      tasks.value = tasks.value.filter(t => t.id !== payload.old.id);
    }
  });
});

onUnmounted(() => {
  if (cleanupThreads) cleanupThreads();
  if (cleanupTasks) cleanupTasks();
});
</script>

<template>
  <div class="space-y-8 p-6 lg:p-10 max-w-7xl mx-auto">
    <!-- Momentum Header -->
    <header class="flex flex-col md:flex-row md:items-end justify-between gap-6">
      <div class="space-y-2">
        <h1 class="text-4xl font-bold text-executive-primary tracking-tight font-sans">
          {{ greeting }}, {{ userStore.profile?.full_name?.split(' ')[0] || 'Executive' }}
        </h1>
        <p class="text-slate-500 font-technical text-lg">
          Your proxy agent has been active. Here is your synthesized brief.
        </p>
      </div>
      
      <div class="flex gap-4">
        <div class="px-6 py-3 bg-white border border-slate-200 rounded-executive shadow-sm flex flex-col items-center min-w-[120px]">
          <span class="text-xs font-bold text-slate-400 uppercase tracking-widest font-technical">Wins</span>
          <span class="text-2xl font-bold text-executive-success font-sans">{{ stats.autonomousWins }}</span>
        </div>
        <div class="px-6 py-3 bg-white border border-slate-200 rounded-executive shadow-sm flex flex-col items-center min-w-[120px]">
          <span class="text-xs font-bold text-slate-400 uppercase tracking-widest font-technical">Momentum</span>
          <span class="text-2xl font-bold text-executive-info font-sans">{{ stats.timeSavedLabel }}</span>
        </div>
        <div class="px-6 py-3 bg-white border border-slate-200 rounded-executive shadow-sm flex flex-col items-center min-w-[120px]">
          <span class="text-xs font-bold text-slate-400 uppercase tracking-widest font-technical">Attention</span>
          <span class="text-2xl font-bold text-executive-warning font-sans">{{ stats.escalations }}</span>
        </div>
      </div>
    </header>

    <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <Card v-for="i in 6" :key="i" class="h-48 border-none shadow-sm animate-pulse bg-slate-50" />
    </div>

    <!-- Outcome Grid -->
    <main v-else-if="outcomeItems.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <OutcomeCard
        v-for="item in outcomeItems"
        :key="item.id"
        :title="item.title"
        :summary="item.summary"
        :summary-json="item.summaryJson"
        :external-id="item.externalId"
        :task-id="item.type === 'task' ? item.id : undefined"
        :status="item.status"
        :agency-tier="item.agencyTier"
        :timestamp="item.timestamp"
        @open-trace="openTrace"
      >
        <template #actions>
          <Button 
            v-if="item.status === 'escalation'" 
            label="Take Action" 
            icon="pi pi-bolt" 
            severity="warning"
            size="small" 
            class="p-button-technical"
          />
          <Button 
            v-if="item.type === 'task'"
            label="View Trace" 
            icon="pi pi-search" 
            text 
            size="small" 
            class="p-button-technical"
            @click="openTrace(item.id)"
          />
        </template>
      </OutcomeCard>
    </main>

    <ReasoningTracePane 
      v-model:visible="isTraceVisible" 
      :task-id="selectedTaskId" 
    />

    <!-- Empty State -->
    <section v-else class="bg-white p-12 rounded-executive border border-dashed border-slate-300 flex flex-col items-center justify-center text-center">
      <div class="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center text-4xl mb-6">
        <i class="pi pi-sparkles text-slate-400" style="font-size: 2rem"></i>
      </div>
      <h2 class="text-2xl font-semibold text-executive-primary mb-3 font-sans">All Quiet on the Front</h2>
      <p class="text-slate-500 font-technical max-w-md">
        No new activities or escalations at the moment. Your proxy agent is monitoring in the background.
      </p>
      <Button label="Refresh Brief" icon="pi pi-refresh" text class="mt-6" @click="fetchData" />
    </section>
  </div>
</template>

<style scoped>
.rounded-executive {
  border-radius: 12px;
}
.text-executive-primary { color: #0f172a; }
.text-executive-success { color: #059669; }
.text-executive-warning { color: #d97706; }
.text-executive-info { color: #2563eb; }
</style>
