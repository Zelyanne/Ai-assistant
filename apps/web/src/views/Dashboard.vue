<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useUserStore } from '../stores/user';
import { useAgent } from '../composables/useAgent';
import { supabase } from '../services/supabase';
import OutcomeCard from '../components/activity/OutcomeCard.vue';
import ReasoningTracePane from '../components/activity/ReasoningTracePane.vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Dialog from 'primevue/dialog';
import Toast from 'primevue/toast';
import { useToast } from 'primevue/usetoast';
import type { MorningBrief } from '@ai-assistant/shared';

const toast = useToast();
const isTraceVisible = ref(false);
const selectedTaskId = ref<string | null>(null);
const activeTab = ref('briefing');
const morningBrief = ref<MorningBrief | null>(null);
const triggeringBrief = ref(false);

const isDetailOpen = ref(false);
const selectedItem = ref<OutcomeItem | null>(null);
let clickTimeout: any = null;

function openDetail(item: OutcomeItem) {
  if (clickTimeout) clearTimeout(clickTimeout);
  clickTimeout = setTimeout(() => {
    selectedItem.value = item;
    isDetailOpen.value = true;
  }, 300);
}

async function triggerMorningBrief() {
  if (!userStore.profile?.organization_id) return;
  
  triggeringBrief.value = true;
  try {
    const { error } = await supabase.from('tasks').insert({
      organization_id: userStore.profile.organization_id,
      user_id: userStore.profile.id,
      domain_action: 'morning.brief',
      status: 'queued',
      payload: { force: true }
    });

    if (error) throw error;
    
    toast.add({ 
      severity: 'info', 
      summary: 'Brief Generation', 
      detail: 'Brief generation started.', 
      life: 3000 
    });
    // We don't wait for it to finish here, Realtime will update the UI 
    // when the brief is saved to the database.
  } catch (err) {
    console.error('Error triggering brief:', err);
    toast.add({ 
      severity: 'error', 
      summary: 'Error', 
      detail: 'Failed to start brief generation.', 
      life: 5000 
    });
  } finally {
    triggeringBrief.value = false;
  }
}

function openTrace(taskId: string) {
  selectedTaskId.value = taskId;
  isTraceVisible.value = true;
}

// Explicit interfaces to avoid TS2589 deep recursion with Supabase types
interface DashboardTask {
  id: string;
  domain_action: string;
  status: 'queued' | 'processing' | 'done' | 'error' | 'escalation';
  payload: {
    agency_tier?: 'Public' | 'Controlled' | 'Restricted';
    [key: string]: any;
  };
  result: {
    summary?: string;
    [key: string]: any;
  };
  created_at: string;
}

interface DashboardThread {
  id: string;
  subject: string | null;
  summary: string | null;
  summary_json: any;
  external_id: string;
  classification?: {
    matches?: Array<{
      topic: string;
      reason: string;
      priority_score: number;
    }>;
  };
  metadata: {
    is_escalation?: boolean;
    subject?: string;
    [key: string]: any;
  };
  created_at: string;
}

const TIME_SAVED_PER_WIN_MINUTES = 15;

const userStore = useUserStore();
const { subscribeToTable } = useAgent();

const threads = ref<DashboardThread[]>([]);
const tasks = ref<DashboardTask[]>([]);
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
    if (thread.metadata?.is_escalation === true) threadEscalations++;
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
  original: DashboardTask | DashboardThread;
  topics?: string[];
  domainAction?: string;
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

    items.push({
      id: task.id,
      type: 'task',
      title: task.domain_action.split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
      summary: task.result?.summary || `Action executed: ${task.domain_action}`,
      status,
      agencyTier: task.payload?.agency_tier || 'Controlled',
      timestamp: new Date(task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      original: task,
      domainAction: task.domain_action
    });
  });

  // Map Threads (Insights & High-Priority)
  threads.value.forEach(thread => {
    const isEscalation = thread.metadata?.is_escalation === true;
    const topics = thread.classification?.matches?.map(m => m.topic) || [];
    items.push({
      id: thread.id,
      type: 'thread',
      title: thread.metadata?.subject || thread.subject || 'Incoming Communication',
      summary: thread.summary || 'New priority thread detected and classified.',
      summaryJson: thread.summary_json,
      externalId: thread.external_id,
      status: isEscalation ? 'escalation' : 'insight',
      agencyTier: 'Public', // Threads are usually Public tier until actioned
      timestamp: new Date(thread.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      original: thread,
      topics
    });
  });

  // Sort by timestamp desc
  return items.sort((a, b) => {
    const aTime = new Date(a.original.created_at).getTime();
    const bTime = new Date(b.original.created_at).getTime();
    return bTime - aTime;
  });
});

// System Pulse: count of actions in last 24h
const systemPulse = computed(() => {
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentTasks = tasks.value.filter(t => new Date(t.created_at).getTime() > twentyFourHoursAgo);
  return {
    count: recentTasks.length,
    lastActive: tasks.value[0]?.created_at || new Date().toISOString()
  };
});

// Briefing Tab: Filter for items with specific actionable intent
const briefingItems = computed((): OutcomeItem[] => {
  return outcomeItems.value.filter(item => {
    // 1. Always include tasks that are 'processing' or 'queued' (system status)
    if (item.status === 'processing' || item.status === 'queued') return true;

    // 2. ONLY include threads that have explicit action items
    // This removes the "just for info" cards from the grid
    if (item.type === 'thread') {
      const hasActionableContent = item.original.summary_json?.action_items?.length > 0;
      const isEscalation = item.status === 'escalation';
      return hasActionableContent || isEscalation;
    }
    
    // 3. For Tasks, include if they are not background noise
    const isHighValueTask = item.type === 'task' && item.status !== 'done' && item.domainAction !== 'email.triage';

    return isHighValueTask;
  });
});

// Activity Tab: Show all tasks including background operations for audit
const activityItems = computed((): OutcomeItem[] => {
  return outcomeItems.value.filter(item => {
    // Include all tasks for audit trail
    if (item.type === 'task') return true;
    // Exclude threads from activity tab
    return false;
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

    threads.value = (threadsRes.data as any[]) || [];
    tasks.value = (tasksRes.data as any[]) || [];

    // Fetch morning brief in parallel
    await fetchMorningBrief();
  } catch (err) {
    console.error('Error fetching dashboard data:', err);
  } finally {
    loading.value = false;
  }
}

async function fetchMorningBrief() {
  if (!userStore.profile?.organization_id) return;

  try {
    const { data, error } = await supabase
      .from('morning_briefs')
      .select('*')
      .eq('organization_id', userStore.profile.organization_id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching morning brief:', error);
      return;
    }

    morningBrief.value = data || null;
  } catch (err) {
    console.error('Error fetching morning brief:', err);
  }
}

let cleanupThreads: (() => void) | null = null;
let cleanupTasks: (() => void) | null = null;
let cleanupBriefs: (() => void) | null = null;

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

  cleanupBriefs = subscribeToTable('morning_briefs', (payload) => {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      morningBrief.value = payload.new;
    } else if (payload.eventType === 'DELETE') {
      morningBrief.value = null;
    }
  });
});

onUnmounted(() => {
  if (cleanupThreads) cleanupThreads();
  if (cleanupTasks) cleanupTasks();
  if (cleanupBriefs) cleanupBriefs();
});
</script>

<template>
  <div class="space-y-6 p-6 lg:p-10 max-w-7xl mx-auto">
    <!-- Executive Header -->
    <header class="flex flex-col md:flex-row md:items-end justify-between gap-6">
      <div class="space-y-2">
        <h1 class="text-4xl font-bold text-executive-primary tracking-tight font-sans">
          {{ greeting }}, {{ userStore.profile?.full_name?.split(' ')[0] || 'Executive' }}
        </h1>
        <p class="text-slate-500 font-technical text-lg">
          Your proxy agent has been active. Here is your synthesized brief.
        </p>
      </div>
      
      <div class="flex gap-4 items-center">
        <Button 
          label="Generate Brief" 
          icon="pi pi-refresh" 
          :loading="triggeringBrief"
          @click="triggerMorningBrief"
          class="p-button-technical mr-2"
        />
        <div class="px-6 py-3 bg-white border border-slate-200 rounded-executive shadow-sm flex flex-col items-center min-w-[120px]">
          <span class="text-xs font-bold text-slate-400 uppercase tracking-widest font-technical">Wins</span>
          <span class="text-2xl font-bold text-executive-success font-sans">{{ stats.autonomousWins }}</span>
        </div>
        <div class="px-6 py-3 bg-white border border-slate-200 rounded-executive shadow-sm flex flex-col items-center min-w-[120px]">
          <span class="text-xs font-bold text-slate-400 uppercase tracking-widest font-technical">Momentum</span>
          <span class="text-2xl font-bold text-executive-info font-sans">{{ stats.timeSavedLabel }}</span>
        </div>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <Card v-for="i in 6" :key="i" class="h-48 border-none shadow-sm animate-pulse bg-slate-50" />
    </div>

    <!-- Tabbed Interface -->
    <Tabs v-else v-model:value="activeTab" class="dashboard-tabs">
      <TabList>
        <Tab value="briefing">
          <div class="flex items-center gap-2">
            <span>Briefing</span>
            <Badge 
              :value="`${systemPulse.count} actions`" 
              severity="info" 
              class="text-xs font-technical"
            />
          </div>
        </Tab>
        <Tab value="activity">
          <span>Activity Log</span>
        </Tab>
      </TabList>

      <TabPanels>
        <!-- Briefing Tab -->
        <TabPanel value="briefing" class="pt-6">
          <div class="space-y-6">
            <!-- Morning Brief Featured Card -->
            <Card v-if="morningBrief" class="morning-brief-card border-l-4 border-l-blue-500">
              <template #title>
                <div class="flex items-center gap-3">
                  <i class="pi pi-sun text-blue-500 text-xl"></i>
                  <span class="text-xl font-bold font-sans">Morning Brief</span>
                  <span class="text-sm text-slate-400 font-technical">
                    {{ new Date(morningBrief.generated_at).toLocaleDateString() }}
                  </span>
                </div>
              </template>
              <template #content>
                <div class="space-y-5">
                  <!-- Narrative Overview - Conversational Style -->
                  <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 rounded-r-lg p-5">
                    <h4 class="text-blue-800 font-bold font-sans mb-3 flex items-center gap-2">
                      <i class="pi pi-comments"></i>
                      Executive Rundown
                    </h4>
                    <p class="text-slate-800 leading-relaxed font-technical text-base whitespace-pre-line">
                      {{ morningBrief.summary_text }}
                    </p>
                  </div>

                  <!-- Topic Summaries -->
                  <div v-if="morningBrief.topic_deep_dives?.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div 
                      v-for="dive in morningBrief.topic_deep_dives" 
                      :key="dive.topic"
                      class="bg-white border border-slate-100 rounded-lg p-4 shadow-sm"
                    >
                      <h5 class="font-bold text-slate-700 mb-2 flex items-center gap-2">
                        <i class="pi pi-tag text-blue-400"></i>
                        {{ dive.topic }}
                      </h5>
                      <p class="text-sm text-slate-600 font-technical leading-relaxed">
                        {{ dive.summaries[0] }}
                      </p>
                    </div>
                  </div>

                  <!-- Trace Linkage -->
                  <div class="pt-4 border-t border-slate-200">
                    <Button 
                      label="Audit Activity Log" 
                      icon="pi pi-history" 
                      text 
                      size="small"
                      class="p-button-technical"
                      @click="activeTab = 'activity'"
                    />
                  </div>
                </div>
              </template>
            </Card>

            <!-- Empty Brief State -->
            <Card v-else class="border-l-4 border-l-slate-300 bg-slate-50">
              <template #content>
                <div class="flex items-center gap-4 py-4">
                  <i class="pi pi-check-circle text-slate-400 text-2xl"></i>
                  <div>
                    <h4 class="font-bold font-sans text-slate-600">All Quiet</h4>
                    <p class="text-sm text-slate-500 font-technical">
                      No critical updates since your last brief. Your proxy agent continues monitoring.
                    </p>
                  </div>
                </div>
              </template>
            </Card>

            <div v-if="briefingItems.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <OutcomeCard
                v-for="item in briefingItems"
                :key="item.id"
                :title="item.title"
                :summary="item.summary"
                :summary-json="item.summaryJson"
                :external-id="item.externalId"
                :task-id="item.type === 'task' ? item.id : undefined"
                :status="item.status"
                :agency-tier="item.agencyTier"
                :timestamp="item.timestamp"
                :topics="item.topics"
                :is-mini="true"
                @open-trace="openTrace"
                @click="openDetail(item)"
              />
            </div>

            <!-- Briefing Empty State -->
            <section v-else class="bg-white p-12 rounded-executive border border-dashed border-slate-300 flex flex-col items-center justify-center text-center">
              <div class="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center text-4xl mb-6">
                <i class="pi pi-sparkles text-slate-400" style="font-size: 2rem"></i>
              </div>
              <h2 class="text-2xl font-semibold text-executive-primary mb-3 font-sans">No Priority Items</h2>
              <p class="text-slate-500 font-technical max-w-md">
                No synthesized insights at the moment. Check the Activity tab for background operations.
              </p>
            </section>
          </div>
        </TabPanel>

        <!-- Activity Tab -->
        <TabPanel value="activity" class="pt-6">
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-bold font-sans text-slate-700">Reasoning Traces & Audit History</h3>
              <span class="text-sm text-slate-400 font-technical">
                Last active: {{ new Date(systemPulse.lastActive).toLocaleString() }}
              </span>
            </div>

            <div v-if="activityItems.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <OutcomeCard
                v-for="item in activityItems"
                :key="item.id"
                :title="item.title"
                :summary="item.summary"
                :task-id="item.type === 'task' ? item.id : undefined"
                :status="item.status"
                :agency-tier="item.agencyTier"
                :timestamp="item.timestamp"
                :is-mini="true"
                @open-trace="openTrace"
                @click="openDetail(item)"
              />
            </div>

            <!-- Activity Empty State -->
            <section v-else class="bg-white p-12 rounded-executive border border-dashed border-slate-300 flex flex-col items-center justify-center text-center">
              <div class="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center text-4xl mb-6">
                <i class="pi pi-history text-slate-400" style="font-size: 2rem"></i>
              </div>
              <h2 class="text-2xl font-semibold text-executive-primary mb-3 font-sans">No Activity History</h2>
              <p class="text-slate-500 font-technical max-w-md">
                No background operations recorded yet. Activity will appear here as the agent processes tasks.
              </p>
            </section>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <ReasoningTracePane 
      v-model:visible="isTraceVisible" 
      :task-id="selectedTaskId" 
    />

    <Dialog 
      v-model:visible="isDetailOpen" 
      modal 
      :header="selectedItem?.title" 
      :style="{ width: '50rem' }" 
      :breakpoints="{ '1199px': '75vw', '575px': '90vw' }"
      class="executive-dialog"
    >
      <div v-if="selectedItem" class="space-y-6">
        <div class="flex items-center gap-3">
          <Badge :value="selectedItem.status" :severity="selectedItem.status === 'done' ? 'success' : 'warn'" />
          <span class="text-sm text-slate-400 font-technical">{{ selectedItem.timestamp }}</span>
        </div>

        <div class="bg-slate-50 p-6 rounded-lg border-l-4" :style="{ borderLeftColor: selectedItem.status === 'done' ? '#059669' : '#D97706' }">
          <h4 class="text-lg font-bold mb-2 font-sans">Executive Summary</h4>
          <p class="text-slate-700 leading-relaxed font-technical whitespace-pre-line">
            {{ selectedItem.summary }}
          </p>
        </div>

        <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button 
            v-if="selectedItem.status === 'escalation'" 
            label="Take Action" 
            icon="pi pi-bolt" 
            severity="warning" 
            class="p-button-technical" 
          />
          <Button 
            v-if="selectedItem.type === 'task'" 
            label="View Full Trace" 
            icon="pi pi-search" 
            text 
            class="p-button-technical" 
            @click="openTrace(selectedItem.id); isDetailOpen = false" 
          />
          <Button label="Close" text @click="isDetailOpen = false" />
        </div>
      </div>
    </Dialog>

    <Toast />
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
