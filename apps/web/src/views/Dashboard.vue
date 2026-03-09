<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useUserStore } from '../stores/user';
import { useAgent } from '../composables/useAgent';
import { useSafetyControls } from '../composables/useSafetyControls';
import { useRelancingSetup } from '../composables/useRelancingSetup';
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
import Drawer from 'primevue/drawer';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Badge from 'primevue/badge';
import ConfirmDialog from 'primevue/confirmdialog';
import { useConfirm } from 'primevue/useconfirm';
import Toast from 'primevue/toast';
import { useToast } from 'primevue/usetoast';
import { buildStatusReportPayload, type MorningBrief } from '@ai-assistant/shared';
import ThreadSummaryComponent from '../components/activity/ThreadSummary.vue';
import { hasNormalizedBlockerSignal, hasRiskSignal } from '../utils/dashboardFilters';
import { formatMorningBriefNarrative, maskSourceId } from '../utils/morningBriefFormat';

const toast = useToast();
const confirm = useConfirm();
const safetyControls = useSafetyControls();
const relancingSetup = useRelancingSetup();
const isEmergencyBrakeEngaged = computed(() => safetyControls.emergencyBrakeEnabled.value);
const isTraceVisible = ref(false);
const selectedTaskId = ref<string | null>(null);
const activeTab = ref('briefing');
const morningBrief = ref<MorningBrief | null>(null);
const triggeringBrief = ref(false);
type StatusReportRecord = {
  id: string;
  organization_id: string;
  source_task_id?: string | null;
  report_period_start: string;
  report_period_end: string;
  idempotency_key: string;
  narrative: string;
  wins: StatusReportSectionRecord[];
  blockers_risks: StatusReportSectionRecord[];
  commitments: StatusReportSectionRecord[];
  next_actions: StatusReportSectionRecord[];
  critical_actions: Array<{
    title: string;
    action_required: string;
    priority: 'high' | 'medium' | 'low';
    rationale?: string;
    source_type?: string;
    source_id?: string;
  }>;
  metadata?: Record<string, unknown>;
};

type StatusReportSectionRecord = {
  title: string;
  detail: string;
  source_type?: string;
  source_id?: string;
};

type StatusReportSection = {
  key: 'wins' | 'blockers_risks' | 'commitments' | 'next_actions';
  title: string;
  items: StatusReportSectionRecord[];
};

const statusReport = ref<StatusReportRecord | null>(null);
const triggeringStatusReport = ref(false);

const formattedBrief = computed(() => {
  if (!morningBrief.value) return null;
  return formatMorningBriefNarrative(morningBrief.value.summary_text, morningBrief.value.metadata);
});

const statusReportCriticalActions = computed(() => {
  if (!statusReport.value) return [];
  return statusReport.value.critical_actions || [];
});

const statusReportSections = computed<StatusReportSection[]>(() => {
  if (!statusReport.value) return [];

  return [
    { key: 'wins', title: 'Wins', items: statusReport.value.wins || [] },
    { key: 'blockers_risks', title: 'Blockers & Risks', items: statusReport.value.blockers_risks || [] },
    { key: 'commitments', title: 'Commitments', items: statusReport.value.commitments || [] },
    { key: 'next_actions', title: 'Next Actions', items: statusReport.value.next_actions || [] },
  ];
});

const statusReportPeriodLabel = computed(() => {
  if (!statusReport.value) return '';
  const start = new Date(statusReport.value.report_period_start).toLocaleDateString();
  const end = new Date(statusReport.value.report_period_end).toLocaleDateString();
  return `${start} -> ${end}`;
});

const isPeekOpen = ref(false);
const selectedItem = ref<OutcomeItem | null>(null);
const selectedItemIds = ref<string[]>([]);
const activeFilter = ref<'all' | 'wins' | 'blockers' | 'risks'>('all');
const isBulkProcessing = ref(false);
const bulkProgressMessage = ref('');
const openedAt = ref<number>(0);
const failureSummaryVisible = ref(false);
const failedItemsList = ref<{title: string, error: string}[]>([]);
const integrationOwnerId = ref<string | null>(null);
const isApproveSending = ref(false);
const relancingSetupVisible = ref(false);
const relancingSetupSaving = ref(false);
const relancingContextId = ref<string | null>(null);
const relancingProjectName = ref('');
const relancingMembersInput = ref('');
const relancingDeadlineInput = ref('');
const relancingValidationErrors = ref<string[]>([]);

function toDateTimeLocalValue(isoValue: string): string {
  if (!isoValue) return '';
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return '';
  const tzOffsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function prettySetupField(field: string): string {
  if (field === 'project_name') return 'project name';
  if (field === 'members') return 'members';
  if (field === 'deadline') return 'deadline';
  return field;
}

async function openRelancingSetupDialog(): Promise<void> {
  if (!userStore.profile?.organization_id) return;

  try {
    const snapshot = await relancingSetup.loadSnapshot(userStore.profile.organization_id);
    relancingContextId.value = snapshot.contextId;
    relancingProjectName.value = snapshot.projectName;
    relancingMembersInput.value = snapshot.members.join(', ');
    relancingDeadlineInput.value = snapshot.deadline ? toDateTimeLocalValue(snapshot.deadline) : '';
    relancingValidationErrors.value = snapshot.missingFields;
    relancingSetupVisible.value = true;

    if (snapshot.missingFields.length > 0) {
      toast.add({
        severity: 'warn',
        summary: 'Relancing setup incomplete',
        detail: `Please provide: ${snapshot.missingFields.map(prettySetupField).join(', ')}`,
        life: 5000,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load relancing setup.';
    toast.add({
      severity: 'error',
      summary: 'Setup Load Failed',
      detail: message,
      life: 5000,
    });
  }
}

async function saveRelancingSetup(): Promise<void> {
  if (!userStore.profile?.organization_id || relancingSetupSaving.value) return;

  relancingSetupSaving.value = true;
  try {
    const snapshot = await relancingSetup.saveSetup({
      organizationId: userStore.profile.organization_id,
      contextId: relancingContextId.value,
      projectName: relancingProjectName.value,
      membersInput: relancingMembersInput.value,
      deadlineInput: relancingDeadlineInput.value,
    });

    relancingContextId.value = snapshot.contextId;
    relancingValidationErrors.value = snapshot.missingFields;

    if (snapshot.setupStatus === 'complete') {
      toast.add({
        severity: 'success',
        summary: 'Relancing setup complete',
        detail: 'Adaptive scheduler context is now active.',
        life: 4000,
      });
      relancingSetupVisible.value = false;
      return;
    }

    toast.add({
      severity: 'warn',
      summary: 'Relancing setup incomplete',
      detail: `Please provide: ${snapshot.missingFields.map(prettySetupField).join(', ')}`,
      life: 5000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save relancing setup.';
    toast.add({
      severity: 'error',
      summary: 'Setup Save Failed',
      detail: message,
      life: 5000,
    });
  } finally {
    relancingSetupSaving.value = false;
  }
}

interface EscalationDraft {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  body_format: 'plain' | 'html';
  thread_external_id?: string;
  thread_id?: string;
  in_reply_to?: string;
  references?: string;
}

interface EscalationCitation {
  source_type?: string;
  source_id?: string;
  description?: string;
  link?: string;
}

type EscalationTrigger = 'low_confidence' | 'ambiguity_detected' | 'restricted_topic' | 'approval_guardrail';

interface EscalationMeta {
  confidenceScore?: number;
  confidenceThreshold?: number;
  escalationTrigger?: EscalationTrigger;
}

function parseEscalationMeta(result: Record<string, unknown> | null): EscalationMeta {
  if (!result) return {};

  const confidenceScoreRaw = result.confidence_score;
  const confidenceThresholdRaw = result.confidence_threshold;
  const escalationTriggerRaw = result.escalation_trigger;

  const confidenceScore = typeof confidenceScoreRaw === 'number' ? confidenceScoreRaw : undefined;
  const confidenceThreshold = typeof confidenceThresholdRaw === 'number' ? confidenceThresholdRaw : undefined;
  const escalationTrigger =
    escalationTriggerRaw === 'low_confidence'
    || escalationTriggerRaw === 'ambiguity_detected'
    || escalationTriggerRaw === 'restricted_topic'
    || escalationTriggerRaw === 'approval_guardrail'
      ? escalationTriggerRaw
      : undefined;

  return {
    confidenceScore,
    confidenceThreshold,
    escalationTrigger,
  };
}

function formatEscalationTrigger(trigger: EscalationTrigger): string {
  return trigger.replace(/_/g, ' ');
}

function formatConfidencePercent(value: number): string {
  const clamped = Math.max(0, Math.min(1, value));
  return `${Math.round(clamped * 100)}%`;
}

const editableDraft = ref<EscalationDraft | null>(null);

function cloneDraft(raw: Record<string, unknown>): EscalationDraft {
  return {
    to: typeof raw.to === 'string' ? raw.to : '',
    cc: typeof raw.cc === 'string' ? raw.cc : '',
    bcc: typeof raw.bcc === 'string' ? raw.bcc : '',
    subject: typeof raw.subject === 'string' ? raw.subject : '',
    body: typeof raw.body === 'string' ? raw.body : '',
    body_format: raw.body_format === 'html' ? 'html' : 'plain',
    thread_external_id: typeof raw.thread_external_id === 'string' ? raw.thread_external_id : undefined,
    thread_id: typeof raw.thread_id === 'string' ? raw.thread_id : undefined,
    in_reply_to: typeof raw.in_reply_to === 'string' ? raw.in_reply_to : undefined,
    references: typeof raw.references === 'string' ? raw.references : undefined,
  };
}

let clickTimeout: any = null;

function openPeek(item: OutcomeItem) {
  selectedItem.value = item;
  openedAt.value = Date.now();

  if (item.type === 'task') {
    const task = item.original as DashboardTask;
    const result = (task.result ?? {}) as Record<string, unknown>;
    const rawDraft = result.draft;
    if (rawDraft && typeof rawDraft === 'object') {
      editableDraft.value = cloneDraft(rawDraft as Record<string, unknown>);
    } else {
      editableDraft.value = null;
    }
  } else {
    editableDraft.value = null;
  }

  isPeekOpen.value = true;
}

function openDetail(item: OutcomeItem) {
  if (clickTimeout) clearTimeout(clickTimeout);
  clickTimeout = setTimeout(() => {
    openPeek(item);
  }, 300);
}

function toggleSelection(id: string, isSelected: boolean) {
  if (isSelected) {
    if (!selectedItemIds.value.includes(id)) {
      selectedItemIds.value.push(id);
    }
  } else {
    selectedItemIds.value = selectedItemIds.value.filter(itemId => itemId !== id);
  }
}

// Interactive Filtering Logic
const filterCounts = computed(() => {
  const all = outcomeItems.value;
  return {
    wins: all.filter(i => i.status === 'done').length,
    blockers: all.filter(i => hasNormalizedBlockerSignal(i)).length,
    risks: all.filter(i => hasRiskSignal(i.topics)).length,
  };
});

function toggleFilter(filter: 'wins' | 'blockers' | 'risks') {
  if (activeFilter.value === filter) activeFilter.value = 'all';
  else activeFilter.value = filter;
}

// Bulk Actions Handling
async function automateTasks() {
  if (isEmergencyBrakeEngaged.value) {
    toast.add({
      severity: 'warn',
      summary: 'Brake Engaged',
      detail: 'Bulk automation is disabled while the Emergency Brake is engaged.',
      life: 4000,
    });
    return;
  }

  const selected = briefingItems.value.filter(i => selectedItemIds.value.includes(i.id));
  const highRiskActions = ['email.send', 'thread.action'];
  const hasHighRisk = selected.some(i => highRiskActions.includes(i.domainAction || 'thread.action'));

  if (hasHighRisk) {
    confirm.require({
      message: 'You have selected high-risk actions (e.g. sending emails). Are you sure you want to proceed?',
      header: 'Security Confirmation',
      icon: 'pi pi-exclamation-triangle',
      acceptClass: 'p-button-danger',
      accept: () => executeBulkAutomation(selected),
    });
  } else {
    executeBulkAutomation(selected);
  }
}

async function executeBulkAutomation(items: OutcomeItem[]) {
  if (items.length === 0) return;
  const organizationId = userStore.profile?.organization_id;
  const userId = userStore.profile?.id;
  if (!organizationId || !userId) return;
  
  isBulkProcessing.value = true;
  bulkProgressMessage.value = 'Initializing automation...';
  failedItemsList.value = [];
  
  const BATCH_SIZE = 5;
  const timeoutId = setTimeout(() => {
    bulkProgressMessage.value = 'Taking longer than expected...';
  }, 10000);

  try {
    // Process in batches
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      bulkProgressMessage.value = `Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(items.length / BATCH_SIZE)}...`;
      
      await Promise.all(batch.map(async (item) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout per item

        try {
          const domainAction = item.domainAction || 'thread.action';

          // Verify state before action
          const latestStatusQuery = supabase
            .from(item.type === 'task' ? 'tasks' : 'ingested_threads')
            .select('status')
            .eq('id', item.id)
            .single() as unknown as Promise<{ data: { status?: string | null } | null; error: unknown }>;

          const { data: latest } = await latestStatusQuery;

          if (latest?.status === 'processing') {
            throw new Error('Item state changed: already processing');
          }

          const { error } = await supabase.from('tasks').insert({
            organization_id: organizationId,
            user_id: userId,
            domain_action: domainAction,
            status: 'queued',
            ...(domainAction === 'thread.action' ? { topic: item.topics?.[0] ?? 'General' } : {}),
            payload: { 
              source_id: item.id,
              source_type: item.type,
              ...(item.type === 'thread' ? { thread_id: item.externalId } : {})
            }
          });

          if (error) throw error;
        } catch (err: any) {
          console.error(`Failed to automate item ${item.id}:`, err);
          failedItemsList.value.push({ title: item.title, error: err.message || 'Unknown error' });
        } finally {
          clearTimeout(timeout);
        }
      }));
    }
    
    clearTimeout(timeoutId);

    if (failedItemsList.value.length > 0) {
      failureSummaryVisible.value = true;
    } else {
      toast.add({
        severity: 'success',
        summary: 'Bulk Action Successful',
        detail: `Successfully triggered ${items.length} automated actions.`,
        life: 3000
      });
      selectedItemIds.value = [];
    }
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Critical Error',
      detail: 'The bulk automation request failed.',
      life: 5000
    });
  } finally {
    isBulkProcessing.value = false;
    bulkProgressMessage.value = '';
  }
}

function maskedSourceLabel(id: string): string {
  return maskSourceId(id);
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

async function triggerStatusReport() {
  if (!userStore.profile?.organization_id) return;

  triggeringStatusReport.value = true;
  try {
    const payload = buildStatusReportPayload(userStore.profile.organization_id, new Date(), {
      force: true,
      manualTrigger: true,
    });

    const { error } = await supabase.from('tasks').insert({
      organization_id: userStore.profile.organization_id,
      user_id: userStore.profile.id,
      domain_action: 'status.report',
      status: 'queued',
      topic: 'Relancing',
      payload,
    });

    if (error) throw error;

    toast.add({
      severity: 'info',
      summary: 'Status Report',
      detail: 'Status report generation started.',
      life: 3000,
    });
  } catch (err) {
    console.error('Error triggering status report:', err);
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to start status report generation.',
      life: 5000,
    });
  } finally {
    triggeringStatusReport.value = false;
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
  topic?: string;
  status: 'queued' | 'processing' | 'done' | 'error' | 'escalation' | 'paused';
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

const selectedTask = computed<DashboardTask | null>(() => {
  if (!selectedItem.value || selectedItem.value.type !== 'task') return null;
  return selectedItem.value.original as DashboardTask;
});

const selectedTaskResult = computed<Record<string, unknown> | null>(() => {
  return (selectedTask.value?.result as Record<string, unknown>) ?? null;
});

const selectedEscalationMeta = computed<EscalationMeta>(() => {
  return parseEscalationMeta(selectedTaskResult.value);
});

const selectedEscalationPrompt = computed<string | null>(() => {
  const prompt = selectedTaskResult.value?.prompt;
  return typeof prompt === 'string' ? prompt : null;
});

const selectedEscalationCitations = computed<EscalationCitation[]>(() => {
  const citations = selectedTaskResult.value?.citations;
  return Array.isArray(citations) ? (citations as EscalationCitation[]) : [];
});

const selectedEscalationThreadLink = computed<string | null>(() => {
  const firstLinked = selectedEscalationCitations.value.find(
    (citation) => typeof citation.link === 'string' && citation.link.length > 0,
  );
  return firstLinked?.link ?? null;
});

const hasEscalationDraft = computed<boolean>(() => {
  return !!(selectedTask.value?.status === 'escalation' && editableDraft.value);
});

const isCurrentUserGmailOwner = computed<boolean>(() => {
  const userId = userStore.profile?.id;
  return !!userId && !!integrationOwnerId.value && userId === integrationOwnerId.value;
});

async function requestApproveAndSend(): Promise<void> {
  if (!hasEscalationDraft.value || !isCurrentUserGmailOwner.value || isApproveSending.value) return;

  confirm.require({
    message: 'This will queue an approved send action for execution. Continue?',
    header: 'Approve & Send Confirmation',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    accept: () => {
      void queueApprovedSend();
    },
  });
}

async function queueApprovedSend(): Promise<void> {
  if (!selectedTask.value || !editableDraft.value || !userStore.profile?.organization_id || !userStore.profile?.id) return;

  const sourceTask = selectedTask.value;
  const approvedDraft = editableDraft.value;

  isApproveSending.value = true;
  try {
    const approvedAt = new Date().toISOString();

    const { error } = await supabase.from('tasks').insert({
      organization_id: userStore.profile.organization_id,
      user_id: userStore.profile.id,
      domain_action: 'email.send',
      status: 'queued',
      topic: sourceTask.topic ?? 'General',
      payload: {
        to: approvedDraft.to,
        cc: approvedDraft.cc || undefined,
        bcc: approvedDraft.bcc || undefined,
        subject: approvedDraft.subject,
        body: approvedDraft.body,
        body_format: approvedDraft.body_format,
        thread_external_id: approvedDraft.thread_external_id,
        thread_id: approvedDraft.thread_id,
        in_reply_to: approvedDraft.in_reply_to,
        references: approvedDraft.references,
        approved_by: userStore.profile.id,
        approved_at: approvedAt,
        source_task_id: sourceTask.id,
      },
    });

    if (error) throw error;

    toast.add({
      severity: 'success',
      summary: 'Send Task Queued',
      detail: 'Approved email has been queued for execution.',
      life: 3000,
    });

    isPeekOpen.value = false;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to queue send task.';
    toast.add({
      severity: 'error',
      summary: 'Approve & Send Failed',
      detail: message,
      life: 5000,
    });
  } finally {
    isApproveSending.value = false;
  }
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
  status: 'done' | 'escalation' | 'paused' | 'processing' | 'queued' | 'error' | 'insight';
  agencyTier: 'Public' | 'Controlled' | 'Restricted';
  timestamp: string;
  original: DashboardTask | DashboardThread;
  topics?: string[];
  domainAction?: string;
  escalationConfidenceScore?: number;
  escalationConfidenceThreshold?: number;
  escalationTrigger?: EscalationTrigger;
}

const outcomeItems = computed((): OutcomeItem[] => {
  const items: OutcomeItem[] = [];

  // Map Tasks (Silent Wins & Escalations)
  tasks.value.forEach(task => {
    let status: 'done' | 'escalation' | 'paused' | 'processing' | 'queued' | 'error' | 'insight' = 'insight';
    if (task.status === 'done') status = 'done';
    else if (task.status === 'escalation') status = 'escalation';
    else if (task.status === 'paused') status = 'paused';
    else if (task.status === 'processing') status = 'processing';
    else if (task.status === 'error') status = 'error';
    else status = 'queued';

    const escalationMeta = parseEscalationMeta((task.result ?? {}) as Record<string, unknown>);

    const taskTopics = new Set<string>();
    if (typeof task.topic === 'string' && task.topic.trim().length > 0) {
      taskTopics.add(task.topic.trim());
    }

    if (task.domain_action === 'relancing.update') {
      const intents = (task.result as Record<string, unknown> | null | undefined)?.intents;
      if (Array.isArray(intents)) {
        if (intents.includes('blocker_report')) {
          taskTopics.add('Blocker');
        }
        if (intents.includes('status_update')) {
          taskTopics.add('Status update');
        }
      }
      if ((task.result as Record<string, unknown> | null | undefined)?.blocker_paused === true) {
        taskTopics.add('Blocker');
      }
      if ((task.result as Record<string, unknown> | null | undefined)?.blocker_resumed === true) {
        taskTopics.add('Resumed');
      }

      const resultSummary = (task.result as Record<string, unknown> | null | undefined)?.summary;
      if (typeof resultSummary === 'string' && resultSummary.toLowerCase().includes('blocker')) {
        taskTopics.add('Blocker');
      }
    }

    items.push({
      id: task.id,
      type: 'task',
      title: task.domain_action.split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
      summary: task.result?.summary || `Action executed: ${task.domain_action}`,
      status,
      agencyTier: task.payload?.agency_tier || 'Controlled',
      timestamp: new Date(task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      original: task,
      topics: taskTopics.size > 0 ? Array.from(taskTopics) : undefined,
      domainAction: task.domain_action,
      escalationConfidenceScore: escalationMeta.confidenceScore,
      escalationConfidenceThreshold: escalationMeta.confidenceThreshold,
      escalationTrigger: escalationMeta.escalationTrigger,
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
  const all = outcomeItems.value;
  
  // 1. If a specific highlight filter is active, return matching items from the full list
  if (activeFilter.value === 'wins') {
    return all.filter(i => i.status === 'done');
  }
  if (activeFilter.value === 'blockers') {
    return all.filter(i => hasNormalizedBlockerSignal(i));
  }
  if (activeFilter.value === 'risks') {
    return all.filter(i => hasRiskSignal(i.topics));
  }

  // 2. Default 'all' view: Show actionable items + Insights
  // We exclude 'done' tasks and 'email.triage' noise from the default view to keep it clean,
  // but we show them if the user explicitly clicks the 'Wins' filter.
  return all.filter(item => {
    // Always include tasks that are 'processing' or 'queued'
    if (item.status === 'processing' || item.status === 'queued') return true;

    // Include all threads (Insights & Escalations)
    if (item.type === 'thread') return true;
    
    // For Tasks, include if they are high-value and not yet done
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
    const ownerQuery = supabase
      .from('workspace_integrations')
      .select('user_id')
      .eq('organization_id', userStore.profile.organization_id) as unknown as { maybeSingle?: () => Promise<{ data: { user_id?: string } | null; error: unknown }> };

    const ownerPromise = ownerQuery.maybeSingle
      ? ownerQuery.maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const [threadsRes, tasksRes, ownerRes] = await Promise.all([
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
        .limit(10),
      ownerPromise
    ]);

    if (threadsRes.error) throw threadsRes.error;
    if (tasksRes.error) throw tasksRes.error;
    if (ownerRes.error) throw ownerRes.error;

    threads.value = (threadsRes.data as any[]) || [];
    tasks.value = (tasksRes.data as any[]) || [];
    integrationOwnerId.value = ownerRes.data?.user_id ?? null;

    await Promise.all([fetchMorningBrief(), fetchStatusReport()]);
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

    morningBrief.value = (data as MorningBrief | null) || null;
  } catch (err) {
    console.error('Error fetching morning brief:', err);
  }
}

async function fetchStatusReport() {
  if (!userStore.profile?.organization_id) return;

  try {
    const { data, error } = await (supabase as any)
      .from('status_reports')
      .select('*')
      .eq('organization_id', userStore.profile.organization_id)
      .order('report_period_end', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching status report:', error);
      return;
    }

    statusReport.value = (data as StatusReportRecord | null) || null;
  } catch (err) {
    console.error('Error fetching status report:', err);
  }
}

let cleanupThreads: (() => void) | null = null;
let cleanupTasks: (() => void) | null = null;
let cleanupBriefs: (() => void) | null = null;
let cleanupStatusReports: (() => void) | null = null;

onMounted(async () => {
  void safetyControls.refresh();
  safetyControls.subscribe();

  await fetchData();

  cleanupThreads = subscribeToTable('ingested_threads', (payload) => {
    if (payload.eventType === 'INSERT') {
      threads.value = [payload.new, ...threads.value].slice(0, 10);
    } else if (payload.eventType === 'UPDATE') {
      threads.value = threads.value.map(t => t.id === payload.new.id ? payload.new : t);
      
      // Data Freshness check for Peek
      if (isPeekOpen.value && selectedItem.value?.id === payload.new.id) {
        toast.add({
          severity: 'info',
          summary: 'Data Updated',
          detail: 'The item you are viewing has been updated.',
          group: 'peek-update',
          life: 0
        });
      }
    } else if (payload.eventType === 'DELETE') {
      threads.value = threads.value.filter(t => t.id !== payload.old.id);
    }
  });

  cleanupTasks = subscribeToTable('tasks', (payload) => {
    if (payload.eventType === 'INSERT') {
      tasks.value = [payload.new, ...tasks.value].slice(0, 10);
    } else if (payload.eventType === 'UPDATE') {
      tasks.value = tasks.value.map(t => t.id === payload.new.id ? payload.new : t);
      
      // Data Freshness check for Peek
      if (isPeekOpen.value && selectedItem.value?.id === payload.new.id) {
        toast.add({
          severity: 'info',
          summary: 'Status Changed',
          detail: `Task status is now: ${payload.new.status}`,
          group: 'peek-update',
          life: 0
        });
      }
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

  cleanupStatusReports = subscribeToTable('status_reports', (payload) => {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      statusReport.value = payload.new;
    } else if (payload.eventType === 'DELETE') {
      statusReport.value = null;
    }
  });
});

onUnmounted(() => {
  safetyControls.unsubscribe();
  if (cleanupThreads) cleanupThreads();
  if (cleanupTasks) cleanupTasks();
  if (cleanupBriefs) cleanupBriefs();
  if (cleanupStatusReports) cleanupStatusReports();
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
          class="p-button-technical mr-2"
          @click="triggerMorningBrief"
        />
        <Button
          label="Generate Status Report"
          icon="pi pi-file-edit"
          :loading="triggeringStatusReport"
          severity="secondary"
          class="p-button-technical mr-2"
          @click="triggerStatusReport"
        />
        <Button
          label="Relancing Setup"
          icon="pi pi-sliders-h"
          severity="secondary"
          outlined
          class="p-button-technical"
          @click="openRelancingSetupDialog"
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
    <div
      v-if="loading"
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      <Card
        v-for="i in 6"
        :key="i"
        class="h-48 border-none shadow-sm animate-pulse bg-slate-50"
      />
    </div>

    <!-- Executive Highlights Bar -->
    <div
      v-if="!loading && activeTab === 'briefing'"
      class="flex flex-wrap gap-3 mb-2"
    >
      <button 
        class="px-4 py-2 rounded-full text-sm font-bold transition-all border"
        :class="activeFilter === 'all' ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'"
        @click="activeFilter = 'all'"
      >
        All Items
      </button>
      <button 
        class="px-4 py-2 rounded-full text-sm font-bold transition-all border flex items-center gap-2"
        :class="activeFilter === 'wins' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-white text-emerald-600 border-emerald-200 hover:border-emerald-300'"
        @click="toggleFilter('wins')"
      >
        <i class="pi pi-check-circle" />
        Wins
        <Badge
          v-if="filterCounts.wins > 0"
          :value="filterCounts.wins"
          severity="success"
          class="scale-75"
        />
      </button>
      <button 
        class="px-4 py-2 rounded-full text-sm font-bold transition-all border flex items-center gap-2"
        :class="activeFilter === 'blockers' ? 'bg-amber-600 text-white border-amber-600 shadow-md' : 'bg-white text-amber-600 border-amber-200 hover:border-amber-300'"
        @click="toggleFilter('blockers')"
      >
        <i class="pi pi-exclamation-triangle" />
        Blockers
        <Badge
          v-if="filterCounts.blockers > 0"
          :value="filterCounts.blockers"
          severity="warn"
          class="scale-75"
        />
      </button>
      <button 
        class="px-4 py-2 rounded-full text-sm font-bold transition-all border flex items-center gap-2"
        :class="activeFilter === 'risks' ? 'bg-rose-600 text-white border-rose-600 shadow-md' : 'bg-white text-rose-600 border-rose-200 hover:border-rose-300'"
        @click="toggleFilter('risks')"
      >
        <i class="pi pi-shield" />
        Risks
        <Badge
          v-if="filterCounts.risks > 0"
          :value="filterCounts.risks"
          severity="danger"
          class="scale-75"
        />
      </button>
    </div>

    <!-- Tabbed Interface -->
    <Tabs
      v-if="!loading"
      v-model:value="activeTab"
      class="dashboard-tabs"
    >
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
        <TabPanel
          value="briefing"
          class="pt-6"
        >
          <div class="space-y-6">
            <Card
              v-if="statusReport"
              class="border-l-4 border-l-emerald-500"
            >
              <template #title>
                <div class="flex items-center gap-3">
                  <i class="pi pi-chart-line text-emerald-500 text-xl" />
                  <span class="text-xl font-bold font-sans">Status Report Draft</span>
                  <span class="text-sm text-slate-400 font-technical">
                    {{ statusReportPeriodLabel }}
                  </span>
                </div>
              </template>
              <template #content>
                <div class="space-y-4">
                  <p class="text-slate-700 font-technical whitespace-pre-line leading-relaxed">
                    {{ statusReport.narrative }}
                  </p>

                  <div
                    v-if="statusReportCriticalActions.length > 0"
                    class="space-y-2"
                  >
                    <h4 class="text-sm font-bold text-slate-700 uppercase tracking-wide">
                      Critical Actions
                    </h4>
                    <div
                      v-for="(action, idx) in statusReportCriticalActions"
                      :key="`${action.source_id || action.title}-${idx}`"
                      class="rounded-md border border-amber-200 bg-amber-50 p-3"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <span class="font-semibold text-slate-800">{{ action.title }}</span>
                        <Badge
                          :value="action.priority"
                          :severity="action.priority === 'high' ? 'danger' : action.priority === 'medium' ? 'warn' : 'info'"
                        />
                      </div>
                      <p class="text-sm text-slate-700 mt-1 font-technical">
                        {{ action.action_required }}
                      </p>
                    </div>
                  </div>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div
                      v-for="section in statusReportSections"
                      :key="section.key"
                      class="rounded-lg border border-slate-200 bg-white p-4"
                    >
                      <h4 class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">
                        {{ section.title }}
                      </h4>

                      <div
                        v-if="section.items.length > 0"
                        class="space-y-3"
                      >
                        <div
                          v-for="(item, idx) in section.items"
                          :key="`${section.key}-${item.source_id || item.title}-${idx}`"
                          class="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0"
                        >
                          <p class="text-sm font-semibold text-slate-800">
                            {{ item.title }}
                          </p>
                          <p class="text-sm text-slate-600 font-technical mt-1">
                            {{ item.detail }}
                          </p>
                        </div>
                      </div>

                      <p
                        v-else
                        class="text-sm text-slate-400 font-technical"
                      >
                        No items captured for this section.
                      </p>
                    </div>
                  </div>
                </div>
              </template>
            </Card>

            <!-- Morning Brief Featured Card -->
            <Card
              v-if="morningBrief"
              class="morning-brief-card border-l-4 border-l-blue-500"
            >
              <template #title>
                <div class="flex items-center gap-3">
                  <i class="pi pi-sun text-blue-500 text-xl" />
                  <span class="text-xl font-bold font-sans">Morning Brief</span>
                  <span class="text-sm text-slate-400 font-technical">
                    {{ new Date(morningBrief.generated_at).toLocaleDateString() }}
                  </span>
                </div>
              </template>
              <template #content>
                <div class="space-y-5">
                  <!-- Narrative Overview - Executive Style -->
                  <div class="executive-prose p-6 bg-white border border-slate-100 rounded-lg shadow-sm">
                    <h4 class="text-slate-900 font-bold font-sans mb-4 flex items-center gap-2 not-italic">
                      <i class="pi pi-align-left text-blue-500" />
                      Executive Rundown
                    </h4>

                    <div v-html="formattedBrief?.narrativeHtml || ''" />

                    <section class="sources-row">
                      <template v-if="(formattedBrief?.sourceIds?.length || 0) > 0">
                        <div class="sources-label">
                          Sources ({{ formattedBrief?.sourceIds.length }})
                        </div>
                        <div class="sources-list">
                          <span
                            v-for="id in formattedBrief?.sourceIds"
                            :key="id"
                            class="source-pill"
                            :title="maskedSourceLabel(id)"
                          >
                            {{ maskedSourceLabel(id) }}
                          </span>
                        </div>
                      </template>
                      <template v-else>
                        <div class="sources-fallback">
                          Sources unavailable for this brief.
                        </div>
                      </template>
                    </section>
                  </div>

                  <!-- Topic Summaries -->
                  <div
                    v-if="morningBrief.topic_deep_dives?.length > 0"
                    class="grid grid-cols-1 md:grid-cols-2 gap-4"
                  >
                    <div 
                      v-for="dive in morningBrief.topic_deep_dives" 
                      :key="dive.topic"
                      class="bg-white border border-slate-100 rounded-lg p-4 shadow-sm"
                    >
                      <h5 class="font-bold text-slate-700 mb-2 flex items-center gap-2">
                        <i class="pi pi-tag text-blue-400" />
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
            <Card
              v-else
              class="border-l-4 border-l-slate-300 bg-slate-50"
            >
              <template #content>
                <div class="flex items-center gap-4 py-4">
                  <i class="pi pi-check-circle text-slate-400 text-2xl" />
                  <div>
                    <h4 class="font-bold font-sans text-slate-600">
                      All Quiet
                    </h4>
                    <p class="text-sm text-slate-500 font-technical">
                      No critical updates since your last brief. Your proxy agent continues monitoring.
                    </p>
                  </div>
                </div>
              </template>
            </Card>

            <div
              v-if="briefingItems.length > 0"
              class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            >
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
                :escalation-confidence-score="item.escalationConfidenceScore"
                :escalation-confidence-threshold="item.escalationConfidenceThreshold"
                :escalation-trigger="item.escalationTrigger"
                :timestamp="item.timestamp"
                :topics="item.topics"
                :is-mini="true"
                :selectable="true"
                :selected="selectedItemIds.includes(item.id)"
                @update:selected="(val) => toggleSelection(item.id, val)"
                @open-trace="openTrace"
                @click="openDetail(item)"
              >
                <template #actions>
                  <Button 
                    label="Handle It" 
                    icon="pi pi-external-link" 
                    text 
                    size="small" 
                    class="p-button-technical"
                    @click.stop="openPeek(item)" 
                  />
                </template>
              </OutcomeCard>
            </div>

            <!-- Briefing Empty State -->
            <section
              v-else
              class="bg-white p-12 rounded-executive border border-dashed border-slate-300 flex flex-col items-center justify-center text-center"
            >
              <div class="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center text-4xl mb-6">
                <i
                  class="pi pi-sparkles text-slate-400"
                  style="font-size: 2rem"
                />
              </div>
              <h2 class="text-2xl font-semibold text-executive-primary mb-3 font-sans">
                No Priority Items
              </h2>
              <p class="text-slate-500 font-technical max-w-md">
                No synthesized insights at the moment. Check the Activity tab for background operations.
              </p>
            </section>
          </div>
        </TabPanel>

        <!-- Activity Tab -->
        <TabPanel
          value="activity"
          class="pt-6"
        >
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-bold font-sans text-slate-700">
                Reasoning Traces & Audit History
              </h3>
              <span class="text-sm text-slate-400 font-technical">
                Last active: {{ new Date(systemPulse.lastActive).toLocaleString() }}
              </span>
            </div>

            <div
              v-if="activityItems.length > 0"
              class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            >
              <OutcomeCard
                v-for="item in activityItems"
                :key="item.id"
                :title="item.title"
                :summary="item.summary"
                :task-id="item.type === 'task' ? item.id : undefined"
                :status="item.status"
                :agency-tier="item.agencyTier"
                :escalation-confidence-score="item.escalationConfidenceScore"
                :escalation-confidence-threshold="item.escalationConfidenceThreshold"
                :escalation-trigger="item.escalationTrigger"
                :timestamp="item.timestamp"
                :is-mini="true"
                @open-trace="openTrace"
                @click="openDetail(item)"
              />
            </div>

            <!-- Activity Empty State -->
            <section
              v-else
              class="bg-white p-12 rounded-executive border border-dashed border-slate-300 flex flex-col items-center justify-center text-center"
            >
              <div class="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center text-4xl mb-6">
                <i
                  class="pi pi-history text-slate-400"
                  style="font-size: 2rem"
                />
              </div>
              <h2 class="text-2xl font-semibold text-executive-primary mb-3 font-sans">
                No Activity History
              </h2>
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

    <!-- Side-panel "Peek" View -->
    <Drawer 
      v-model:visible="isPeekOpen" 
      position="right" 
      :modal="true" 
      :dismissable="true"
      class="executive-drawer"
      :style="{ width: '40rem' }"
    >
      <template #header>
        <div class="flex items-center gap-3">
          <Badge
            :value="selectedItem?.status"
            :severity="selectedItem?.status === 'done' ? 'success' : 'warn'"
          />
          <h3 class="text-xl font-bold font-sans">
            {{ selectedItem?.title }}
          </h3>
        </div>
      </template>
      <div
        v-if="selectedItem"
        class="space-y-6 p-4"
      >
        <div class="bg-slate-50 p-6 rounded-lg border-l-4 border-blue-500">
          <h4 class="text-lg font-bold mb-2 font-sans">
            Executive Summary
          </h4>
          <p class="text-slate-700 leading-relaxed font-technical whitespace-pre-line">
            {{ selectedItem.summary }}
          </p>
        </div>

        <div
          v-if="selectedEscalationPrompt"
          class="bg-amber-50 p-4 rounded-lg border border-amber-100"
        >
          <h4 class="text-sm font-bold mb-1 text-amber-800">
            Escalation Prompt
          </h4>
          <p class="text-sm text-amber-700 font-technical">
            {{ selectedEscalationPrompt }}
          </p>
        </div>

        <div
          v-if="selectedTask?.status === 'escalation' && (selectedEscalationMeta.confidenceScore !== undefined || selectedEscalationMeta.confidenceThreshold !== undefined || selectedEscalationMeta.escalationTrigger)"
          class="bg-amber-50 p-4 rounded-lg border border-amber-100"
        >
          <h4 class="text-sm font-bold mb-2 text-amber-800">
            Confidence Context
          </h4>
          <div class="text-sm text-amber-700 font-technical space-y-1">
            <p v-if="selectedEscalationMeta.confidenceScore !== undefined">
              Score: {{ formatConfidencePercent(selectedEscalationMeta.confidenceScore) }}
            </p>
            <p v-if="selectedEscalationMeta.confidenceThreshold !== undefined">
              Threshold: {{ formatConfidencePercent(selectedEscalationMeta.confidenceThreshold) }}
            </p>
            <p v-if="selectedEscalationMeta.escalationTrigger">
              Trigger: {{ formatEscalationTrigger(selectedEscalationMeta.escalationTrigger) }}
            </p>
          </div>
        </div>

        <div
          v-if="hasEscalationDraft && editableDraft"
          class="space-y-4 border border-slate-200 rounded-lg p-4 bg-white"
        >
          <h4 class="text-base font-bold font-sans text-slate-800">
            Approval Draft
          </h4>

          <div class="grid grid-cols-1 gap-3">
            <div>
              <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">To</label>
              <InputText
                v-model="editableDraft.to"
                class="w-full"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Cc</label>
              <InputText
                v-model="editableDraft.cc"
                class="w-full"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Bcc</label>
              <InputText
                v-model="editableDraft.bcc"
                class="w-full"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Subject</label>
              <InputText
                v-model="editableDraft.subject"
                class="w-full"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Body</label>
              <Textarea
                v-model="editableDraft.body"
                rows="8"
                class="w-full"
                auto-resize
              />
            </div>
          </div>

          <div
            v-if="selectedEscalationThreadLink"
            class="text-xs text-slate-500"
          >
            Thread: <a
              :href="selectedEscalationThreadLink"
              target="_blank"
              rel="noopener"
              class="text-blue-600 underline"
            >Open original thread</a>
          </div>
        </div>

        <ThreadSummaryComponent 
          v-if="selectedItem.summaryJson" 
          :summary="selectedItem.summaryJson" 
          :external-id="selectedItem.externalId" 
        />

        <div class="flex justify-end gap-3 pt-6 border-t border-slate-100">
          <Button
            v-if="hasEscalationDraft"
            :label="isCurrentUserGmailOwner ? 'Approve & Send' : 'Owner Approval Required'"
            icon="pi pi-send"
            severity="danger"
            :disabled="!isCurrentUserGmailOwner"
            :loading="isApproveSending"
            @click="requestApproveAndSend"
          />
          <Button 
            v-if="selectedItem.type === 'task'" 
            label="View Full Trace" 
            icon="pi pi-search" 
            text 
            class="p-button-technical" 
            @click="openTrace(selectedItem.id); isPeekOpen = false" 
          />
          <Button
            label="Close"
            text
            @click="isPeekOpen = false"
          />
        </div>
      </div>
    </Drawer>

    <!-- Global Action Bar -->
    <transition name="fade">
      <div 
        v-if="selectedItemIds.length > 0" 
        class="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-full shadow-2xl z-50 flex items-center gap-8 border border-slate-700"
      >
        <div class="flex items-center gap-3">
          <Badge
            :value="selectedItemIds.length"
            severity="info"
          />
          <span class="font-bold text-sm">Items Selected</span>
        </div>
        
        <div class="h-6 w-px bg-slate-700" />

        <div
          v-if="isEmergencyBrakeEngaged"
          class="text-xs text-rose-200 font-technical whitespace-nowrap"
        >
          Brake engaged - automation paused
        </div>

        <div class="flex gap-4">
          <Button 
            label="Automate" 
            icon="pi pi-bolt" 
            severity="info" 
            rounded 
            :disabled="isEmergencyBrakeEngaged"
            :loading="isBulkProcessing"
            @click="automateTasks" 
          />
          <Button 
            label="Cancel" 
            text 
            severity="secondary" 
            @click="selectedItemIds = []" 
          />
        </div>
      </div>
    </transition>

    <ConfirmDialog />
    <Dialog
      v-model:visible="relancingSetupVisible"
      header="Relancing Scheduler Setup"
      :style="{ width: '36rem' }"
      modal
    >
      <div class="space-y-4">
        <p class="text-sm text-slate-600">
          Provide a project name, at least one member, and a valid deadline before adaptive relancing nudges can run.
        </p>

        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Project Name</label>
          <InputText
            v-model="relancingProjectName"
            class="w-full"
            placeholder="e.g. Q2 Launch Readiness"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Members</label>
          <Textarea
            v-model="relancingMembersInput"
            rows="3"
            auto-resize
            class="w-full"
            placeholder="Comma-separated names, e.g. Alexis, Jordan"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Deadline</label>
          <input
            v-model="relancingDeadlineInput"
            type="datetime-local"
            class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
        </div>

        <div
          v-if="relancingValidationErrors.length > 0"
          class="rounded-md border border-amber-200 bg-amber-50 p-3"
        >
          <p class="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Missing required fields
          </p>
          <p class="text-sm text-amber-700 mt-1">
            {{ relancingValidationErrors.map(prettySetupField).join(', ') }}
          </p>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <Button
            label="Cancel"
            text
            @click="relancingSetupVisible = false"
          />
          <Button
            label="Save Setup"
            icon="pi pi-save"
            :loading="relancingSetupSaving"
            @click="saveRelancingSetup"
          />
        </div>
      </div>
    </Dialog>
    <Dialog
      v-model:visible="failureSummaryVisible"
      header="Action Failure Summary"
      :style="{ width: '35rem' }"
      modal
    >
      <div class="space-y-4">
        <p class="text-sm text-slate-600">
          The following items could not be automated. You may need to handle them manually or retry.
        </p>
        <div class="max-h-60 overflow-y-auto space-y-2">
          <div
            v-for="fail in failedItemsList"
            :key="fail.title"
            class="p-3 bg-rose-50 border border-rose-100 rounded flex flex-col gap-1"
          >
            <span class="font-bold text-rose-800 text-sm">{{ fail.title }}</span>
            <span class="text-xs text-rose-600">{{ fail.error }}</span>
          </div>
        </div>
        <div class="flex justify-end pt-4">
          <Button
            label="Acknowledge"
            severity="secondary"
            @click="failureSummaryVisible = false"
          />
        </div>
      </div>
    </Dialog>
    <Toast />
    <Toast group="peek-update">
      <template #message="slotProps">
        <div class="flex flex-col items-start gap-3">
          <div class="flex items-center gap-2">
            <i class="pi pi-info-circle text-blue-500" />
            <span class="font-bold">{{ slotProps.message.summary }}</span>
          </div>
          <div class="text-sm text-slate-600">
            {{ slotProps.message.detail }}
          </div>
          <Button 
            label="Refresh View" 
            size="small" 
            severity="info" 
            class="p-button-technical"
            @click="fetchData(); toast.removeGroup('peek-update')" 
          />
        </div>
      </template>
    </Toast>
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
