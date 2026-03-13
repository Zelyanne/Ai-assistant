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
import { buildStatusReportPayload } from '@ai-assistant/shared';
import ThreadSummaryComponent from '../components/activity/ThreadSummary.vue';
import { hasNormalizedBlockerSignal, hasRiskSignal } from '../utils/dashboardFilters';
import { formatMorningBriefNarrative, maskSourceId } from '../utils/morningBriefFormat';
const toast = useToast();
const confirm = useConfirm();
const safetyControls = useSafetyControls();
const relancingSetup = useRelancingSetup();
const isEmergencyBrakeEngaged = computed(() => safetyControls.emergencyBrakeEnabled.value);
const isTraceVisible = ref(false);
const selectedTaskId = ref(null);
const activeTab = ref('briefing');
const morningBrief = ref(null);
const triggeringBrief = ref(false);
const statusReport = ref(null);
const triggeringStatusReport = ref(false);
const formattedBrief = computed(() => {
    if (!morningBrief.value)
        return null;
    return formatMorningBriefNarrative(morningBrief.value.summary_text, morningBrief.value.metadata);
});
const statusReportCriticalActions = computed(() => {
    if (!statusReport.value)
        return [];
    return statusReport.value.critical_actions || [];
});
const statusReportSections = computed(() => {
    if (!statusReport.value)
        return [];
    return [
        { key: 'wins', title: 'Wins', items: statusReport.value.wins || [] },
        { key: 'blockers_risks', title: 'Blockers & Risks', items: statusReport.value.blockers_risks || [] },
        { key: 'commitments', title: 'Commitments', items: statusReport.value.commitments || [] },
        { key: 'next_actions', title: 'Next Actions', items: statusReport.value.next_actions || [] },
    ];
});
const statusReportPeriodLabel = computed(() => {
    if (!statusReport.value)
        return '';
    const start = new Date(statusReport.value.report_period_start).toLocaleDateString();
    const end = new Date(statusReport.value.report_period_end).toLocaleDateString();
    return `${start} -> ${end}`;
});
const isPeekOpen = ref(false);
const selectedItem = ref(null);
const selectedItemIds = ref([]);
const activeFilter = ref('all');
const isBulkProcessing = ref(false);
const bulkProgressMessage = ref('');
const openedAt = ref(0);
const failureSummaryVisible = ref(false);
const failedItemsList = ref([]);
const integrationOwnerId = ref(null);
const isApproveSending = ref(false);
const relancingSetupVisible = ref(false);
const relancingSetupSaving = ref(false);
const relancingContextId = ref(null);
const relancingProjectName = ref('');
const relancingMembersInput = ref('');
const relancingDeadlineInput = ref('');
const relancingValidationErrors = ref([]);
function toDateTimeLocalValue(isoValue) {
    if (!isoValue)
        return '';
    const parsed = new Date(isoValue);
    if (Number.isNaN(parsed.getTime()))
        return '';
    const tzOffsetMs = parsed.getTimezoneOffset() * 60 * 1000;
    return new Date(parsed.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}
function prettySetupField(field) {
    if (field === 'project_name')
        return 'project name';
    if (field === 'members')
        return 'members';
    if (field === 'deadline')
        return 'deadline';
    return field;
}
async function openRelancingSetupDialog() {
    if (!userStore.profile?.organization_id)
        return;
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load relancing setup.';
        toast.add({
            severity: 'error',
            summary: 'Setup Load Failed',
            detail: message,
            life: 5000,
        });
    }
}
async function saveRelancingSetup() {
    if (!userStore.profile?.organization_id || relancingSetupSaving.value)
        return;
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save relancing setup.';
        toast.add({
            severity: 'error',
            summary: 'Setup Save Failed',
            detail: message,
            life: 5000,
        });
    }
    finally {
        relancingSetupSaving.value = false;
    }
}
function parseEscalationMeta(result) {
    if (!result)
        return {};
    const confidenceScoreRaw = result.confidence_score;
    const confidenceThresholdRaw = result.confidence_threshold;
    const escalationTriggerRaw = result.escalation_trigger;
    const confidenceScore = typeof confidenceScoreRaw === 'number' ? confidenceScoreRaw : undefined;
    const confidenceThreshold = typeof confidenceThresholdRaw === 'number' ? confidenceThresholdRaw : undefined;
    const escalationTrigger = escalationTriggerRaw === 'low_confidence'
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
function formatEscalationTrigger(trigger) {
    return trigger.replace(/_/g, ' ');
}
function formatConfidencePercent(value) {
    const clamped = Math.max(0, Math.min(1, value));
    return `${Math.round(clamped * 100)}%`;
}
const editableDraft = ref(null);
function cloneDraft(raw) {
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
let clickTimeout = null;
function openPeek(item) {
    selectedItem.value = item;
    openedAt.value = Date.now();
    if (item.type === 'task') {
        const task = item.original;
        const result = (task.result ?? {});
        const rawDraft = result.draft;
        if (rawDraft && typeof rawDraft === 'object') {
            editableDraft.value = cloneDraft(rawDraft);
        }
        else {
            editableDraft.value = null;
        }
    }
    else {
        editableDraft.value = null;
    }
    isPeekOpen.value = true;
}
function openDetail(item) {
    if (clickTimeout)
        clearTimeout(clickTimeout);
    clickTimeout = setTimeout(() => {
        openPeek(item);
    }, 300);
}
function toggleSelection(id, isSelected) {
    if (isSelected) {
        if (!selectedItemIds.value.includes(id)) {
            selectedItemIds.value.push(id);
        }
    }
    else {
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
function toggleFilter(filter) {
    if (activeFilter.value === filter)
        activeFilter.value = 'all';
    else
        activeFilter.value = filter;
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
    }
    else {
        executeBulkAutomation(selected);
    }
}
async function executeBulkAutomation(items) {
    if (items.length === 0)
        return;
    const organizationId = userStore.profile?.organization_id;
    const userId = userStore.profile?.id;
    if (!organizationId || !userId)
        return;
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
                        .single();
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
                    if (error)
                        throw error;
                }
                catch (err) {
                    console.error(`Failed to automate item ${item.id}:`, err);
                    failedItemsList.value.push({ title: item.title, error: err.message || 'Unknown error' });
                }
                finally {
                    clearTimeout(timeout);
                }
            }));
        }
        clearTimeout(timeoutId);
        if (failedItemsList.value.length > 0) {
            failureSummaryVisible.value = true;
        }
        else {
            toast.add({
                severity: 'success',
                summary: 'Bulk Action Successful',
                detail: `Successfully triggered ${items.length} automated actions.`,
                life: 3000
            });
            selectedItemIds.value = [];
        }
    }
    catch {
        toast.add({
            severity: 'error',
            summary: 'Critical Error',
            detail: 'The bulk automation request failed.',
            life: 5000
        });
    }
    finally {
        isBulkProcessing.value = false;
        bulkProgressMessage.value = '';
    }
}
function maskedSourceLabel(id) {
    return maskSourceId(id);
}
async function triggerMorningBrief() {
    if (!userStore.profile?.organization_id)
        return;
    triggeringBrief.value = true;
    try {
        const { error } = await supabase.from('tasks').insert({
            organization_id: userStore.profile.organization_id,
            user_id: userStore.profile.id,
            domain_action: 'morning.brief',
            status: 'queued',
            payload: { force: true }
        });
        if (error)
            throw error;
        toast.add({
            severity: 'info',
            summary: 'Brief Generation',
            detail: 'Brief generation started.',
            life: 3000
        });
        // We don't wait for it to finish here, Realtime will update the UI 
        // when the brief is saved to the database.
    }
    catch (err) {
        console.error('Error triggering brief:', err);
        toast.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to start brief generation.',
            life: 5000
        });
    }
    finally {
        triggeringBrief.value = false;
    }
}
async function triggerStatusReport() {
    if (!userStore.profile?.organization_id)
        return;
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
        if (error)
            throw error;
        toast.add({
            severity: 'info',
            summary: 'Status Report',
            detail: 'Status report generation started.',
            life: 3000,
        });
    }
    catch (err) {
        console.error('Error triggering status report:', err);
        toast.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to start status report generation.',
            life: 5000,
        });
    }
    finally {
        triggeringStatusReport.value = false;
    }
}
function openTrace(taskId) {
    selectedTaskId.value = taskId;
    isTraceVisible.value = true;
}
const selectedTask = computed(() => {
    if (!selectedItem.value || selectedItem.value.type !== 'task')
        return null;
    return selectedItem.value.original;
});
const selectedTaskResult = computed(() => {
    return selectedTask.value?.result ?? null;
});
const selectedEscalationMeta = computed(() => {
    return parseEscalationMeta(selectedTaskResult.value);
});
const selectedEscalationPrompt = computed(() => {
    const prompt = selectedTaskResult.value?.prompt;
    return typeof prompt === 'string' ? prompt : null;
});
const selectedEscalationCitations = computed(() => {
    const citations = selectedTaskResult.value?.citations;
    return Array.isArray(citations) ? citations : [];
});
const selectedEscalationThreadLink = computed(() => {
    const firstLinked = selectedEscalationCitations.value.find((citation) => typeof citation.link === 'string' && citation.link.length > 0);
    return firstLinked?.link ?? null;
});
const hasEscalationDraft = computed(() => {
    return !!(selectedTask.value?.status === 'escalation' && editableDraft.value);
});
const isCurrentUserGmailOwner = computed(() => {
    const userId = userStore.profile?.id;
    return !!userId && !!integrationOwnerId.value && userId === integrationOwnerId.value;
});
async function requestApproveAndSend() {
    if (!hasEscalationDraft.value || !isCurrentUserGmailOwner.value || isApproveSending.value)
        return;
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
async function queueApprovedSend() {
    if (!selectedTask.value || !editableDraft.value || !userStore.profile?.organization_id || !userStore.profile?.id)
        return;
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
        if (error)
            throw error;
        toast.add({
            severity: 'success',
            summary: 'Send Task Queued',
            detail: 'Approved email has been queued for execution.',
            life: 3000,
        });
        isPeekOpen.value = false;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to queue send task.';
        toast.add({
            severity: 'error',
            summary: 'Approve & Send Failed',
            detail: message,
            life: 5000,
        });
    }
    finally {
        isApproveSending.value = false;
    }
}
const TIME_SAVED_PER_WIN_MINUTES = 15;
const userStore = useUserStore();
const { subscribeToTable } = useAgent();
const threads = ref([]);
const tasks = ref([]);
const loading = ref(true);
const greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12)
        return 'Good morning';
    if (hour < 18)
        return 'Good afternoon';
    return 'Good evening';
});
const stats = computed(() => {
    let autonomousWins = 0;
    let taskEscalations = 0;
    for (const task of tasks.value) {
        if (task.status === 'done')
            autonomousWins++;
        if (task.status === 'escalation')
            taskEscalations++;
    }
    let threadEscalations = 0;
    for (const thread of threads.value) {
        if (thread.metadata?.is_escalation === true)
            threadEscalations++;
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
const outcomeItems = computed(() => {
    const items = [];
    // Map Tasks (Silent Wins & Escalations)
    tasks.value.forEach(task => {
        let status = 'insight';
        if (task.status === 'done')
            status = 'done';
        else if (task.status === 'escalation')
            status = 'escalation';
        else if (task.status === 'paused')
            status = 'paused';
        else if (task.status === 'processing')
            status = 'processing';
        else if (task.status === 'error')
            status = 'error';
        else
            status = 'queued';
        const escalationMeta = parseEscalationMeta((task.result ?? {}));
        const taskTopics = new Set();
        if (typeof task.topic === 'string' && task.topic.trim().length > 0) {
            taskTopics.add(task.topic.trim());
        }
        if (task.domain_action === 'relancing.update') {
            const intents = task.result?.intents;
            if (Array.isArray(intents)) {
                if (intents.includes('blocker_report')) {
                    taskTopics.add('Blocker');
                }
                if (intents.includes('status_update')) {
                    taskTopics.add('Status update');
                }
            }
            if (task.result?.blocker_paused === true) {
                taskTopics.add('Blocker');
            }
            if (task.result?.blocker_resumed === true) {
                taskTopics.add('Resumed');
            }
            const resultSummary = task.result?.summary;
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
const briefingItems = computed(() => {
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
        if (item.status === 'processing' || item.status === 'queued')
            return true;
        // Include all threads (Insights & Escalations)
        if (item.type === 'thread')
            return true;
        // For Tasks, include if they are high-value and not yet done
        const isHighValueTask = item.type === 'task' && item.status !== 'done' && item.domainAction !== 'email.triage';
        return isHighValueTask;
    });
});
// Activity Tab: Show all tasks including background operations for audit
const activityItems = computed(() => {
    return outcomeItems.value.filter(item => {
        // Include all tasks for audit trail
        if (item.type === 'task')
            return true;
        // Exclude threads from activity tab
        return false;
    });
});
async function fetchData() {
    if (!userStore.profile?.organization_id)
        return;
    loading.value = true;
    try {
        const ownerQuery = supabase
            .from('workspace_integrations')
            .select('user_id')
            .eq('organization_id', userStore.profile.organization_id);
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
        if (threadsRes.error)
            throw threadsRes.error;
        if (tasksRes.error)
            throw tasksRes.error;
        if (ownerRes.error)
            throw ownerRes.error;
        threads.value = threadsRes.data || [];
        tasks.value = tasksRes.data || [];
        integrationOwnerId.value = ownerRes.data?.user_id ?? null;
        await Promise.all([fetchMorningBrief(), fetchStatusReport()]);
    }
    catch (err) {
        console.error('Error fetching dashboard data:', err);
    }
    finally {
        loading.value = false;
    }
}
async function fetchMorningBrief() {
    if (!userStore.profile?.organization_id)
        return;
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
    }
    catch (err) {
        console.error('Error fetching morning brief:', err);
    }
}
async function fetchStatusReport() {
    if (!userStore.profile?.organization_id)
        return;
    try {
        const { data, error } = await supabase
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
        statusReport.value = data || null;
    }
    catch (err) {
        console.error('Error fetching status report:', err);
    }
}
let cleanupThreads = null;
let cleanupTasks = null;
let cleanupBriefs = null;
let cleanupStatusReports = null;
onMounted(async () => {
    void safetyControls.refresh();
    safetyControls.subscribe();
    await fetchData();
    cleanupThreads = subscribeToTable('ingested_threads', (payload) => {
        if (payload.eventType === 'INSERT') {
            threads.value = [payload.new, ...threads.value].slice(0, 10);
        }
        else if (payload.eventType === 'UPDATE') {
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
        }
        else if (payload.eventType === 'DELETE') {
            threads.value = threads.value.filter(t => t.id !== payload.old.id);
        }
    });
    cleanupTasks = subscribeToTable('tasks', (payload) => {
        if (payload.eventType === 'INSERT') {
            tasks.value = [payload.new, ...tasks.value].slice(0, 10);
        }
        else if (payload.eventType === 'UPDATE') {
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
        }
        else if (payload.eventType === 'DELETE') {
            tasks.value = tasks.value.filter(t => t.id !== payload.old.id);
        }
    });
    cleanupBriefs = subscribeToTable('morning_briefs', (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            morningBrief.value = payload.new;
        }
        else if (payload.eventType === 'DELETE') {
            morningBrief.value = null;
        }
    });
    cleanupStatusReports = subscribeToTable('status_reports', (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            statusReport.value = payload.new;
        }
        else if (payload.eventType === 'DELETE') {
            statusReport.value = null;
        }
    });
});
onUnmounted(() => {
    safetyControls.unsubscribe();
    if (cleanupThreads)
        cleanupThreads();
    if (cleanupTasks)
        cleanupTasks();
    if (cleanupBriefs)
        cleanupBriefs();
    if (cleanupStatusReports)
        cleanupStatusReports();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "space-y-6 p-6 lg:p-10 max-w-7xl mx-auto" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "flex flex-col md:flex-row md:items-end justify-between gap-6" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "space-y-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "text-4xl font-bold text-executive-primary tracking-tight font-sans" },
});
(__VLS_ctx.greeting);
(__VLS_ctx.userStore.profile?.full_name?.split(' ')[0] || 'Executive');
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-slate-500 font-technical text-lg" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex gap-4 items-center" },
});
const __VLS_0 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    label: "Generate Brief",
    icon: "pi pi-refresh",
    loading: (__VLS_ctx.triggeringBrief),
    ...{ class: "p-button-technical mr-2" },
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    label: "Generate Brief",
    icon: "pi pi-refresh",
    loading: (__VLS_ctx.triggeringBrief),
    ...{ class: "p-button-technical mr-2" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.triggerMorningBrief)
};
var __VLS_3;
const __VLS_8 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ 'onClick': {} },
    label: "Generate Status Report",
    icon: "pi pi-file-edit",
    loading: (__VLS_ctx.triggeringStatusReport),
    severity: "secondary",
    ...{ class: "p-button-technical mr-2" },
}));
const __VLS_10 = __VLS_9({
    ...{ 'onClick': {} },
    label: "Generate Status Report",
    icon: "pi pi-file-edit",
    loading: (__VLS_ctx.triggeringStatusReport),
    severity: "secondary",
    ...{ class: "p-button-technical mr-2" },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
let __VLS_12;
let __VLS_13;
let __VLS_14;
const __VLS_15 = {
    onClick: (__VLS_ctx.triggerStatusReport)
};
var __VLS_11;
const __VLS_16 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    ...{ 'onClick': {} },
    label: "Relancing Setup",
    icon: "pi pi-sliders-h",
    severity: "secondary",
    outlined: true,
    ...{ class: "p-button-technical" },
}));
const __VLS_18 = __VLS_17({
    ...{ 'onClick': {} },
    label: "Relancing Setup",
    icon: "pi pi-sliders-h",
    severity: "secondary",
    outlined: true,
    ...{ class: "p-button-technical" },
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
let __VLS_20;
let __VLS_21;
let __VLS_22;
const __VLS_23 = {
    onClick: (__VLS_ctx.openRelancingSetupDialog)
};
var __VLS_19;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "px-6 py-3 bg-white border border-slate-200 rounded-executive shadow-sm flex flex-col items-center min-w-[120px]" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-xs font-bold text-slate-400 uppercase tracking-widest font-technical" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-2xl font-bold text-executive-success font-sans" },
});
(__VLS_ctx.stats.autonomousWins);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "px-6 py-3 bg-white border border-slate-200 rounded-executive shadow-sm flex flex-col items-center min-w-[120px]" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-xs font-bold text-slate-400 uppercase tracking-widest font-technical" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-2xl font-bold text-executive-info font-sans" },
});
(__VLS_ctx.stats.timeSavedLabel);
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" },
    });
    for (const [i] of __VLS_getVForSourceType((6))) {
        const __VLS_24 = {}.Card;
        /** @type {[typeof __VLS_components.Card, ]} */ ;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
            key: (i),
            ...{ class: "h-48 border-none shadow-sm animate-pulse bg-slate-50" },
        }));
        const __VLS_26 = __VLS_25({
            key: (i),
            ...{ class: "h-48 border-none shadow-sm animate-pulse bg-slate-50" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    }
}
if (!__VLS_ctx.loading && __VLS_ctx.activeTab === 'briefing') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex flex-wrap gap-3 mb-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.loading && __VLS_ctx.activeTab === 'briefing'))
                    return;
                __VLS_ctx.activeFilter = 'all';
            } },
        ...{ class: "px-4 py-2 rounded-full text-sm font-bold transition-all border" },
        ...{ class: (__VLS_ctx.activeFilter === 'all' ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300') },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.loading && __VLS_ctx.activeTab === 'briefing'))
                    return;
                __VLS_ctx.toggleFilter('wins');
            } },
        ...{ class: "px-4 py-2 rounded-full text-sm font-bold transition-all border flex items-center gap-2" },
        ...{ class: (__VLS_ctx.activeFilter === 'wins' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-white text-emerald-600 border-emerald-200 hover:border-emerald-300') },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
        ...{ class: "pi pi-check-circle" },
    });
    if (__VLS_ctx.filterCounts.wins > 0) {
        const __VLS_28 = {}.Badge;
        /** @type {[typeof __VLS_components.Badge, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
            value: (__VLS_ctx.filterCounts.wins),
            severity: "success",
            ...{ class: "scale-75" },
        }));
        const __VLS_30 = __VLS_29({
            value: (__VLS_ctx.filterCounts.wins),
            severity: "success",
            ...{ class: "scale-75" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.loading && __VLS_ctx.activeTab === 'briefing'))
                    return;
                __VLS_ctx.toggleFilter('blockers');
            } },
        ...{ class: "px-4 py-2 rounded-full text-sm font-bold transition-all border flex items-center gap-2" },
        ...{ class: (__VLS_ctx.activeFilter === 'blockers' ? 'bg-amber-600 text-white border-amber-600 shadow-md' : 'bg-white text-amber-600 border-amber-200 hover:border-amber-300') },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
        ...{ class: "pi pi-exclamation-triangle" },
    });
    if (__VLS_ctx.filterCounts.blockers > 0) {
        const __VLS_32 = {}.Badge;
        /** @type {[typeof __VLS_components.Badge, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
            value: (__VLS_ctx.filterCounts.blockers),
            severity: "warn",
            ...{ class: "scale-75" },
        }));
        const __VLS_34 = __VLS_33({
            value: (__VLS_ctx.filterCounts.blockers),
            severity: "warn",
            ...{ class: "scale-75" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.loading && __VLS_ctx.activeTab === 'briefing'))
                    return;
                __VLS_ctx.toggleFilter('risks');
            } },
        ...{ class: "px-4 py-2 rounded-full text-sm font-bold transition-all border flex items-center gap-2" },
        ...{ class: (__VLS_ctx.activeFilter === 'risks' ? 'bg-rose-600 text-white border-rose-600 shadow-md' : 'bg-white text-rose-600 border-rose-200 hover:border-rose-300') },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
        ...{ class: "pi pi-shield" },
    });
    if (__VLS_ctx.filterCounts.risks > 0) {
        const __VLS_36 = {}.Badge;
        /** @type {[typeof __VLS_components.Badge, ]} */ ;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
            value: (__VLS_ctx.filterCounts.risks),
            severity: "danger",
            ...{ class: "scale-75" },
        }));
        const __VLS_38 = __VLS_37({
            value: (__VLS_ctx.filterCounts.risks),
            severity: "danger",
            ...{ class: "scale-75" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    }
}
if (!__VLS_ctx.loading) {
    const __VLS_40 = {}.Tabs;
    /** @type {[typeof __VLS_components.Tabs, typeof __VLS_components.Tabs, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        value: (__VLS_ctx.activeTab),
        ...{ class: "dashboard-tabs" },
    }));
    const __VLS_42 = __VLS_41({
        value: (__VLS_ctx.activeTab),
        ...{ class: "dashboard-tabs" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    __VLS_43.slots.default;
    const __VLS_44 = {}.TabList;
    /** @type {[typeof __VLS_components.TabList, typeof __VLS_components.TabList, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({}));
    const __VLS_46 = __VLS_45({}, ...__VLS_functionalComponentArgsRest(__VLS_45));
    __VLS_47.slots.default;
    const __VLS_48 = {}.Tab;
    /** @type {[typeof __VLS_components.Tab, typeof __VLS_components.Tab, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        value: "briefing",
    }));
    const __VLS_50 = __VLS_49({
        value: "briefing",
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    __VLS_51.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    const __VLS_52 = {}.Badge;
    /** @type {[typeof __VLS_components.Badge, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        value: (`${__VLS_ctx.systemPulse.count} actions`),
        severity: "info",
        ...{ class: "text-xs font-technical" },
    }));
    const __VLS_54 = __VLS_53({
        value: (`${__VLS_ctx.systemPulse.count} actions`),
        severity: "info",
        ...{ class: "text-xs font-technical" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    var __VLS_51;
    const __VLS_56 = {}.Tab;
    /** @type {[typeof __VLS_components.Tab, typeof __VLS_components.Tab, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        value: "activity",
    }));
    const __VLS_58 = __VLS_57({
        value: "activity",
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_59.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    var __VLS_59;
    var __VLS_47;
    const __VLS_60 = {}.TabPanels;
    /** @type {[typeof __VLS_components.TabPanels, typeof __VLS_components.TabPanels, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({}));
    const __VLS_62 = __VLS_61({}, ...__VLS_functionalComponentArgsRest(__VLS_61));
    __VLS_63.slots.default;
    const __VLS_64 = {}.TabPanel;
    /** @type {[typeof __VLS_components.TabPanel, typeof __VLS_components.TabPanel, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
        value: "briefing",
        ...{ class: "pt-6" },
    }));
    const __VLS_66 = __VLS_65({
        value: "briefing",
        ...{ class: "pt-6" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    __VLS_67.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "space-y-6" },
    });
    if (__VLS_ctx.statusReport) {
        const __VLS_68 = {}.Card;
        /** @type {[typeof __VLS_components.Card, typeof __VLS_components.Card, ]} */ ;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
            ...{ class: "border-l-4 border-l-emerald-500" },
        }));
        const __VLS_70 = __VLS_69({
            ...{ class: "border-l-4 border-l-emerald-500" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_69));
        __VLS_71.slots.default;
        {
            const { title: __VLS_thisSlot } = __VLS_71.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "flex items-center gap-3" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
                ...{ class: "pi pi-chart-line text-emerald-500 text-xl" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-xl font-bold font-sans" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-sm text-slate-400 font-technical" },
            });
            (__VLS_ctx.statusReportPeriodLabel);
        }
        {
            const { content: __VLS_thisSlot } = __VLS_71.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "space-y-4" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "text-slate-700 font-technical whitespace-pre-line leading-relaxed" },
            });
            (__VLS_ctx.statusReport.narrative);
            if (__VLS_ctx.statusReportCriticalActions.length > 0) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "space-y-2" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
                    ...{ class: "text-sm font-bold text-slate-700 uppercase tracking-wide" },
                });
                for (const [action, idx] of __VLS_getVForSourceType((__VLS_ctx.statusReportCriticalActions))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        key: (`${action.source_id || action.title}-${idx}`),
                        ...{ class: "rounded-md border border-amber-200 bg-amber-50 p-3" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "flex items-center justify-between gap-2" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "font-semibold text-slate-800" },
                    });
                    (action.title);
                    const __VLS_72 = {}.Badge;
                    /** @type {[typeof __VLS_components.Badge, ]} */ ;
                    // @ts-ignore
                    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
                        value: (action.priority),
                        severity: (action.priority === 'high' ? 'danger' : action.priority === 'medium' ? 'warn' : 'info'),
                    }));
                    const __VLS_74 = __VLS_73({
                        value: (action.priority),
                        severity: (action.priority === 'high' ? 'danger' : action.priority === 'medium' ? 'warn' : 'info'),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "text-sm text-slate-700 mt-1 font-technical" },
                    });
                    (action.action_required);
                }
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "grid grid-cols-1 md:grid-cols-2 gap-4" },
            });
            for (const [section] of __VLS_getVForSourceType((__VLS_ctx.statusReportSections))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (section.key),
                    ...{ class: "rounded-lg border border-slate-200 bg-white p-4" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
                    ...{ class: "text-sm font-bold text-slate-700 uppercase tracking-wide mb-3" },
                });
                (section.title);
                if (section.items.length > 0) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "space-y-3" },
                    });
                    for (const [item, idx] of __VLS_getVForSourceType((section.items))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            key: (`${section.key}-${item.source_id || item.title}-${idx}`),
                            ...{ class: "border-b border-slate-100 pb-3 last:border-b-0 last:pb-0" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                            ...{ class: "text-sm font-semibold text-slate-800" },
                        });
                        (item.title);
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                            ...{ class: "text-sm text-slate-600 font-technical mt-1" },
                        });
                        (item.detail);
                    }
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "text-sm text-slate-400 font-technical" },
                    });
                }
            }
        }
        var __VLS_71;
    }
    if (__VLS_ctx.morningBrief) {
        const __VLS_76 = {}.Card;
        /** @type {[typeof __VLS_components.Card, typeof __VLS_components.Card, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
            ...{ class: "morning-brief-card border-l-4 border-l-blue-500" },
        }));
        const __VLS_78 = __VLS_77({
            ...{ class: "morning-brief-card border-l-4 border-l-blue-500" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        __VLS_79.slots.default;
        {
            const { title: __VLS_thisSlot } = __VLS_79.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "flex items-center gap-3" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
                ...{ class: "pi pi-sun text-blue-500 text-xl" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-xl font-bold font-sans" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "text-sm text-slate-400 font-technical" },
            });
            (new Date(__VLS_ctx.morningBrief.generated_at).toLocaleDateString());
        }
        {
            const { content: __VLS_thisSlot } = __VLS_79.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "space-y-5" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "executive-prose p-6 bg-white border border-slate-100 rounded-lg shadow-sm" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
                ...{ class: "text-slate-900 font-bold font-sans mb-4 flex items-center gap-2 not-italic" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
                ...{ class: "pi pi-align-left text-blue-500" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({});
            __VLS_asFunctionalDirective(__VLS_directives.vHtml)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.formattedBrief?.narrativeHtml || '') }, null, null);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "sources-row" },
            });
            if ((__VLS_ctx.formattedBrief?.sourceIds?.length || 0) > 0) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "sources-label" },
                });
                (__VLS_ctx.formattedBrief?.sourceIds.length);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "sources-list" },
                });
                for (const [id] of __VLS_getVForSourceType((__VLS_ctx.formattedBrief?.sourceIds))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        key: (id),
                        ...{ class: "source-pill" },
                        title: (__VLS_ctx.maskedSourceLabel(id)),
                    });
                    (__VLS_ctx.maskedSourceLabel(id));
                }
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "sources-fallback" },
                });
            }
            if (__VLS_ctx.morningBrief.topic_deep_dives?.length > 0) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "grid grid-cols-1 md:grid-cols-2 gap-4" },
                });
                for (const [dive] of __VLS_getVForSourceType((__VLS_ctx.morningBrief.topic_deep_dives))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        key: (dive.topic),
                        ...{ class: "bg-white border border-slate-100 rounded-lg p-4 shadow-sm" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.h5, __VLS_intrinsicElements.h5)({
                        ...{ class: "font-bold text-slate-700 mb-2 flex items-center gap-2" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
                        ...{ class: "pi pi-tag text-blue-400" },
                    });
                    (dive.topic);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "text-sm text-slate-600 font-technical leading-relaxed" },
                    });
                    (dive.summaries[0]);
                }
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "pt-4 border-t border-slate-200" },
            });
            const __VLS_80 = {}.Button;
            /** @type {[typeof __VLS_components.Button, ]} */ ;
            // @ts-ignore
            const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
                ...{ 'onClick': {} },
                label: "Audit Activity Log",
                icon: "pi pi-history",
                text: true,
                size: "small",
                ...{ class: "p-button-technical" },
            }));
            const __VLS_82 = __VLS_81({
                ...{ 'onClick': {} },
                label: "Audit Activity Log",
                icon: "pi pi-history",
                text: true,
                size: "small",
                ...{ class: "p-button-technical" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_81));
            let __VLS_84;
            let __VLS_85;
            let __VLS_86;
            const __VLS_87 = {
                onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.loading))
                        return;
                    if (!(__VLS_ctx.morningBrief))
                        return;
                    __VLS_ctx.activeTab = 'activity';
                }
            };
            var __VLS_83;
        }
        var __VLS_79;
    }
    else {
        const __VLS_88 = {}.Card;
        /** @type {[typeof __VLS_components.Card, typeof __VLS_components.Card, ]} */ ;
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
            ...{ class: "border-l-4 border-l-slate-300 bg-slate-50" },
        }));
        const __VLS_90 = __VLS_89({
            ...{ class: "border-l-4 border-l-slate-300 bg-slate-50" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_89));
        __VLS_91.slots.default;
        {
            const { content: __VLS_thisSlot } = __VLS_91.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "flex items-center gap-4 py-4" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
                ...{ class: "pi pi-check-circle text-slate-400 text-2xl" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
                ...{ class: "font-bold font-sans text-slate-600" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "text-sm text-slate-500 font-technical" },
            });
        }
        var __VLS_91;
    }
    if (__VLS_ctx.briefingItems.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" },
        });
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.briefingItems))) {
            /** @type {[typeof OutcomeCard, typeof OutcomeCard, ]} */ ;
            // @ts-ignore
            const __VLS_92 = __VLS_asFunctionalComponent(OutcomeCard, new OutcomeCard({
                ...{ 'onUpdate:selected': {} },
                ...{ 'onOpenTrace': {} },
                ...{ 'onClick': {} },
                key: (item.id),
                title: (item.title),
                summary: (item.summary),
                summaryJson: (item.summaryJson),
                externalId: (item.externalId),
                taskId: (item.type === 'task' ? item.id : undefined),
                status: (item.status),
                agencyTier: (item.agencyTier),
                escalationConfidenceScore: (item.escalationConfidenceScore),
                escalationConfidenceThreshold: (item.escalationConfidenceThreshold),
                escalationTrigger: (item.escalationTrigger),
                timestamp: (item.timestamp),
                topics: (item.topics),
                isMini: (true),
                selectable: (true),
                selected: (__VLS_ctx.selectedItemIds.includes(item.id)),
            }));
            const __VLS_93 = __VLS_92({
                ...{ 'onUpdate:selected': {} },
                ...{ 'onOpenTrace': {} },
                ...{ 'onClick': {} },
                key: (item.id),
                title: (item.title),
                summary: (item.summary),
                summaryJson: (item.summaryJson),
                externalId: (item.externalId),
                taskId: (item.type === 'task' ? item.id : undefined),
                status: (item.status),
                agencyTier: (item.agencyTier),
                escalationConfidenceScore: (item.escalationConfidenceScore),
                escalationConfidenceThreshold: (item.escalationConfidenceThreshold),
                escalationTrigger: (item.escalationTrigger),
                timestamp: (item.timestamp),
                topics: (item.topics),
                isMini: (true),
                selectable: (true),
                selected: (__VLS_ctx.selectedItemIds.includes(item.id)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_92));
            let __VLS_95;
            let __VLS_96;
            let __VLS_97;
            const __VLS_98 = {
                'onUpdate:selected': ((val) => __VLS_ctx.toggleSelection(item.id, val))
            };
            const __VLS_99 = {
                onOpenTrace: (__VLS_ctx.openTrace)
            };
            const __VLS_100 = {
                onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.loading))
                        return;
                    if (!(__VLS_ctx.briefingItems.length > 0))
                        return;
                    __VLS_ctx.openDetail(item);
                }
            };
            __VLS_94.slots.default;
            {
                const { actions: __VLS_thisSlot } = __VLS_94.slots;
                const __VLS_101 = {}.Button;
                /** @type {[typeof __VLS_components.Button, ]} */ ;
                // @ts-ignore
                const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({
                    ...{ 'onClick': {} },
                    label: "Handle It",
                    icon: "pi pi-external-link",
                    text: true,
                    size: "small",
                    ...{ class: "p-button-technical" },
                }));
                const __VLS_103 = __VLS_102({
                    ...{ 'onClick': {} },
                    label: "Handle It",
                    icon: "pi pi-external-link",
                    text: true,
                    size: "small",
                    ...{ class: "p-button-technical" },
                }, ...__VLS_functionalComponentArgsRest(__VLS_102));
                let __VLS_105;
                let __VLS_106;
                let __VLS_107;
                const __VLS_108 = {
                    onClick: (...[$event]) => {
                        if (!(!__VLS_ctx.loading))
                            return;
                        if (!(__VLS_ctx.briefingItems.length > 0))
                            return;
                        __VLS_ctx.openPeek(item);
                    }
                };
                var __VLS_104;
            }
            var __VLS_94;
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "bg-white p-12 rounded-executive border border-dashed border-slate-300 flex flex-col items-center justify-center text-center" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center text-4xl mb-6" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
            ...{ class: "pi pi-sparkles text-slate-400" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
            ...{ class: "text-2xl font-semibold text-executive-primary mb-3 font-sans" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "text-slate-500 font-technical max-w-md" },
        });
    }
    var __VLS_67;
    const __VLS_109 = {}.TabPanel;
    /** @type {[typeof __VLS_components.TabPanel, typeof __VLS_components.TabPanel, ]} */ ;
    // @ts-ignore
    const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
        value: "activity",
        ...{ class: "pt-6" },
    }));
    const __VLS_111 = __VLS_110({
        value: "activity",
        ...{ class: "pt-6" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_110));
    __VLS_112.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "space-y-4" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center justify-between" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "text-lg font-bold font-sans text-slate-700" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-sm text-slate-400 font-technical" },
    });
    (new Date(__VLS_ctx.systemPulse.lastActive).toLocaleString());
    if (__VLS_ctx.activityItems.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" },
        });
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.activityItems))) {
            /** @type {[typeof OutcomeCard, ]} */ ;
            // @ts-ignore
            const __VLS_113 = __VLS_asFunctionalComponent(OutcomeCard, new OutcomeCard({
                ...{ 'onOpenTrace': {} },
                ...{ 'onClick': {} },
                key: (item.id),
                title: (item.title),
                summary: (item.summary),
                taskId: (item.type === 'task' ? item.id : undefined),
                status: (item.status),
                agencyTier: (item.agencyTier),
                escalationConfidenceScore: (item.escalationConfidenceScore),
                escalationConfidenceThreshold: (item.escalationConfidenceThreshold),
                escalationTrigger: (item.escalationTrigger),
                timestamp: (item.timestamp),
                isMini: (true),
            }));
            const __VLS_114 = __VLS_113({
                ...{ 'onOpenTrace': {} },
                ...{ 'onClick': {} },
                key: (item.id),
                title: (item.title),
                summary: (item.summary),
                taskId: (item.type === 'task' ? item.id : undefined),
                status: (item.status),
                agencyTier: (item.agencyTier),
                escalationConfidenceScore: (item.escalationConfidenceScore),
                escalationConfidenceThreshold: (item.escalationConfidenceThreshold),
                escalationTrigger: (item.escalationTrigger),
                timestamp: (item.timestamp),
                isMini: (true),
            }, ...__VLS_functionalComponentArgsRest(__VLS_113));
            let __VLS_116;
            let __VLS_117;
            let __VLS_118;
            const __VLS_119 = {
                onOpenTrace: (__VLS_ctx.openTrace)
            };
            const __VLS_120 = {
                onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.loading))
                        return;
                    if (!(__VLS_ctx.activityItems.length > 0))
                        return;
                    __VLS_ctx.openDetail(item);
                }
            };
            var __VLS_115;
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "bg-white p-12 rounded-executive border border-dashed border-slate-300 flex flex-col items-center justify-center text-center" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center text-4xl mb-6" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
            ...{ class: "pi pi-history text-slate-400" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
            ...{ class: "text-2xl font-semibold text-executive-primary mb-3 font-sans" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "text-slate-500 font-technical max-w-md" },
        });
    }
    var __VLS_112;
    var __VLS_63;
    var __VLS_43;
}
/** @type {[typeof ReasoningTracePane, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(ReasoningTracePane, new ReasoningTracePane({
    visible: (__VLS_ctx.isTraceVisible),
    taskId: (__VLS_ctx.selectedTaskId),
}));
const __VLS_122 = __VLS_121({
    visible: (__VLS_ctx.isTraceVisible),
    taskId: (__VLS_ctx.selectedTaskId),
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
const __VLS_124 = {}.Drawer;
/** @type {[typeof __VLS_components.Drawer, typeof __VLS_components.Drawer, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    visible: (__VLS_ctx.isPeekOpen),
    position: "right",
    modal: (true),
    dismissable: (true),
    ...{ class: "executive-drawer" },
    ...{ style: ({ width: '40rem' }) },
}));
const __VLS_126 = __VLS_125({
    visible: (__VLS_ctx.isPeekOpen),
    position: "right",
    modal: (true),
    dismissable: (true),
    ...{ class: "executive-drawer" },
    ...{ style: ({ width: '40rem' }) },
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
__VLS_127.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_127.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-3" },
    });
    const __VLS_128 = {}.Badge;
    /** @type {[typeof __VLS_components.Badge, ]} */ ;
    // @ts-ignore
    const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
        value: (__VLS_ctx.selectedItem?.status),
        severity: (__VLS_ctx.selectedItem?.status === 'done' ? 'success' : 'warn'),
    }));
    const __VLS_130 = __VLS_129({
        value: (__VLS_ctx.selectedItem?.status),
        severity: (__VLS_ctx.selectedItem?.status === 'done' ? 'success' : 'warn'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_129));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "text-xl font-bold font-sans" },
    });
    (__VLS_ctx.selectedItem?.title);
}
if (__VLS_ctx.selectedItem) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "space-y-6 p-4" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "bg-slate-50 p-6 rounded-lg border-l-4 border-blue-500" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
        ...{ class: "text-lg font-bold mb-2 font-sans" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "text-slate-700 leading-relaxed font-technical whitespace-pre-line" },
    });
    (__VLS_ctx.selectedItem.summary);
    if (__VLS_ctx.selectedEscalationPrompt) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "bg-amber-50 p-4 rounded-lg border border-amber-100" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
            ...{ class: "text-sm font-bold mb-1 text-amber-800" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "text-sm text-amber-700 font-technical" },
        });
        (__VLS_ctx.selectedEscalationPrompt);
    }
    if (__VLS_ctx.selectedTask?.status === 'escalation' && (__VLS_ctx.selectedEscalationMeta.confidenceScore !== undefined || __VLS_ctx.selectedEscalationMeta.confidenceThreshold !== undefined || __VLS_ctx.selectedEscalationMeta.escalationTrigger)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "bg-amber-50 p-4 rounded-lg border border-amber-100" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
            ...{ class: "text-sm font-bold mb-2 text-amber-800" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-sm text-amber-700 font-technical space-y-1" },
        });
        if (__VLS_ctx.selectedEscalationMeta.confidenceScore !== undefined) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (__VLS_ctx.formatConfidencePercent(__VLS_ctx.selectedEscalationMeta.confidenceScore));
        }
        if (__VLS_ctx.selectedEscalationMeta.confidenceThreshold !== undefined) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (__VLS_ctx.formatConfidencePercent(__VLS_ctx.selectedEscalationMeta.confidenceThreshold));
        }
        if (__VLS_ctx.selectedEscalationMeta.escalationTrigger) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (__VLS_ctx.formatEscalationTrigger(__VLS_ctx.selectedEscalationMeta.escalationTrigger));
        }
    }
    if (__VLS_ctx.hasEscalationDraft && __VLS_ctx.editableDraft) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "space-y-4 border border-slate-200 rounded-lg p-4 bg-white" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
            ...{ class: "text-base font-bold font-sans text-slate-800" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "grid grid-cols-1 gap-3" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1" },
        });
        const __VLS_132 = {}.InputText;
        /** @type {[typeof __VLS_components.InputText, ]} */ ;
        // @ts-ignore
        const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
            modelValue: (__VLS_ctx.editableDraft.to),
            ...{ class: "w-full" },
        }));
        const __VLS_134 = __VLS_133({
            modelValue: (__VLS_ctx.editableDraft.to),
            ...{ class: "w-full" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_133));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1" },
        });
        const __VLS_136 = {}.InputText;
        /** @type {[typeof __VLS_components.InputText, ]} */ ;
        // @ts-ignore
        const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
            modelValue: (__VLS_ctx.editableDraft.cc),
            ...{ class: "w-full" },
        }));
        const __VLS_138 = __VLS_137({
            modelValue: (__VLS_ctx.editableDraft.cc),
            ...{ class: "w-full" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_137));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1" },
        });
        const __VLS_140 = {}.InputText;
        /** @type {[typeof __VLS_components.InputText, ]} */ ;
        // @ts-ignore
        const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
            modelValue: (__VLS_ctx.editableDraft.bcc),
            ...{ class: "w-full" },
        }));
        const __VLS_142 = __VLS_141({
            modelValue: (__VLS_ctx.editableDraft.bcc),
            ...{ class: "w-full" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_141));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1" },
        });
        const __VLS_144 = {}.InputText;
        /** @type {[typeof __VLS_components.InputText, ]} */ ;
        // @ts-ignore
        const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
            modelValue: (__VLS_ctx.editableDraft.subject),
            ...{ class: "w-full" },
        }));
        const __VLS_146 = __VLS_145({
            modelValue: (__VLS_ctx.editableDraft.subject),
            ...{ class: "w-full" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_145));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1" },
        });
        const __VLS_148 = {}.Textarea;
        /** @type {[typeof __VLS_components.Textarea, ]} */ ;
        // @ts-ignore
        const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
            modelValue: (__VLS_ctx.editableDraft.body),
            rows: "8",
            ...{ class: "w-full" },
            autoResize: true,
        }));
        const __VLS_150 = __VLS_149({
            modelValue: (__VLS_ctx.editableDraft.body),
            rows: "8",
            ...{ class: "w-full" },
            autoResize: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_149));
        if (__VLS_ctx.selectedEscalationThreadLink) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "text-xs text-slate-500" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
                href: (__VLS_ctx.selectedEscalationThreadLink),
                target: "_blank",
                rel: "noopener",
                ...{ class: "text-blue-600 underline" },
            });
        }
    }
    if (__VLS_ctx.selectedItem.summaryJson) {
        /** @type {[typeof ThreadSummaryComponent, ]} */ ;
        // @ts-ignore
        const __VLS_152 = __VLS_asFunctionalComponent(ThreadSummaryComponent, new ThreadSummaryComponent({
            summary: (__VLS_ctx.selectedItem.summaryJson),
            externalId: (__VLS_ctx.selectedItem.externalId),
        }));
        const __VLS_153 = __VLS_152({
            summary: (__VLS_ctx.selectedItem.summaryJson),
            externalId: (__VLS_ctx.selectedItem.externalId),
        }, ...__VLS_functionalComponentArgsRest(__VLS_152));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex justify-end gap-3 pt-6 border-t border-slate-100" },
    });
    if (__VLS_ctx.hasEscalationDraft) {
        const __VLS_155 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_156 = __VLS_asFunctionalComponent(__VLS_155, new __VLS_155({
            ...{ 'onClick': {} },
            label: (__VLS_ctx.isCurrentUserGmailOwner ? 'Approve & Send' : 'Owner Approval Required'),
            icon: "pi pi-send",
            severity: "danger",
            disabled: (!__VLS_ctx.isCurrentUserGmailOwner),
            loading: (__VLS_ctx.isApproveSending),
        }));
        const __VLS_157 = __VLS_156({
            ...{ 'onClick': {} },
            label: (__VLS_ctx.isCurrentUserGmailOwner ? 'Approve & Send' : 'Owner Approval Required'),
            icon: "pi pi-send",
            severity: "danger",
            disabled: (!__VLS_ctx.isCurrentUserGmailOwner),
            loading: (__VLS_ctx.isApproveSending),
        }, ...__VLS_functionalComponentArgsRest(__VLS_156));
        let __VLS_159;
        let __VLS_160;
        let __VLS_161;
        const __VLS_162 = {
            onClick: (__VLS_ctx.requestApproveAndSend)
        };
        var __VLS_158;
    }
    if (__VLS_ctx.selectedItem.type === 'task') {
        const __VLS_163 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_164 = __VLS_asFunctionalComponent(__VLS_163, new __VLS_163({
            ...{ 'onClick': {} },
            label: "View Full Trace",
            icon: "pi pi-search",
            text: true,
            ...{ class: "p-button-technical" },
        }));
        const __VLS_165 = __VLS_164({
            ...{ 'onClick': {} },
            label: "View Full Trace",
            icon: "pi pi-search",
            text: true,
            ...{ class: "p-button-technical" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_164));
        let __VLS_167;
        let __VLS_168;
        let __VLS_169;
        const __VLS_170 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.selectedItem))
                    return;
                if (!(__VLS_ctx.selectedItem.type === 'task'))
                    return;
                __VLS_ctx.openTrace(__VLS_ctx.selectedItem.id);
                __VLS_ctx.isPeekOpen = false;
            }
        };
        var __VLS_166;
    }
    const __VLS_171 = {}.Button;
    /** @type {[typeof __VLS_components.Button, ]} */ ;
    // @ts-ignore
    const __VLS_172 = __VLS_asFunctionalComponent(__VLS_171, new __VLS_171({
        ...{ 'onClick': {} },
        label: "Close",
        text: true,
    }));
    const __VLS_173 = __VLS_172({
        ...{ 'onClick': {} },
        label: "Close",
        text: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_172));
    let __VLS_175;
    let __VLS_176;
    let __VLS_177;
    const __VLS_178 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.selectedItem))
                return;
            __VLS_ctx.isPeekOpen = false;
        }
    };
    var __VLS_174;
}
var __VLS_127;
const __VLS_179 = {}.transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.transition, typeof __VLS_components.Transition, typeof __VLS_components.transition, ]} */ ;
// @ts-ignore
const __VLS_180 = __VLS_asFunctionalComponent(__VLS_179, new __VLS_179({
    name: "fade",
}));
const __VLS_181 = __VLS_180({
    name: "fade",
}, ...__VLS_functionalComponentArgsRest(__VLS_180));
__VLS_182.slots.default;
if (__VLS_ctx.selectedItemIds.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-full shadow-2xl z-50 flex items-center gap-8 border border-slate-700" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-3" },
    });
    const __VLS_183 = {}.Badge;
    /** @type {[typeof __VLS_components.Badge, ]} */ ;
    // @ts-ignore
    const __VLS_184 = __VLS_asFunctionalComponent(__VLS_183, new __VLS_183({
        value: (__VLS_ctx.selectedItemIds.length),
        severity: "info",
    }));
    const __VLS_185 = __VLS_184({
        value: (__VLS_ctx.selectedItemIds.length),
        severity: "info",
    }, ...__VLS_functionalComponentArgsRest(__VLS_184));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-bold text-sm" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
        ...{ class: "h-6 w-px bg-slate-700" },
    });
    if (__VLS_ctx.isEmergencyBrakeEngaged) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-xs text-rose-200 font-technical whitespace-nowrap" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex gap-4" },
    });
    const __VLS_187 = {}.Button;
    /** @type {[typeof __VLS_components.Button, ]} */ ;
    // @ts-ignore
    const __VLS_188 = __VLS_asFunctionalComponent(__VLS_187, new __VLS_187({
        ...{ 'onClick': {} },
        label: "Automate",
        icon: "pi pi-bolt",
        severity: "info",
        rounded: true,
        disabled: (__VLS_ctx.isEmergencyBrakeEngaged),
        loading: (__VLS_ctx.isBulkProcessing),
    }));
    const __VLS_189 = __VLS_188({
        ...{ 'onClick': {} },
        label: "Automate",
        icon: "pi pi-bolt",
        severity: "info",
        rounded: true,
        disabled: (__VLS_ctx.isEmergencyBrakeEngaged),
        loading: (__VLS_ctx.isBulkProcessing),
    }, ...__VLS_functionalComponentArgsRest(__VLS_188));
    let __VLS_191;
    let __VLS_192;
    let __VLS_193;
    const __VLS_194 = {
        onClick: (__VLS_ctx.automateTasks)
    };
    var __VLS_190;
    const __VLS_195 = {}.Button;
    /** @type {[typeof __VLS_components.Button, ]} */ ;
    // @ts-ignore
    const __VLS_196 = __VLS_asFunctionalComponent(__VLS_195, new __VLS_195({
        ...{ 'onClick': {} },
        label: "Cancel",
        text: true,
        severity: "secondary",
    }));
    const __VLS_197 = __VLS_196({
        ...{ 'onClick': {} },
        label: "Cancel",
        text: true,
        severity: "secondary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_196));
    let __VLS_199;
    let __VLS_200;
    let __VLS_201;
    const __VLS_202 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.selectedItemIds.length > 0))
                return;
            __VLS_ctx.selectedItemIds = [];
        }
    };
    var __VLS_198;
}
var __VLS_182;
const __VLS_203 = {}.ConfirmDialog;
/** @type {[typeof __VLS_components.ConfirmDialog, ]} */ ;
// @ts-ignore
const __VLS_204 = __VLS_asFunctionalComponent(__VLS_203, new __VLS_203({}));
const __VLS_205 = __VLS_204({}, ...__VLS_functionalComponentArgsRest(__VLS_204));
const __VLS_207 = {}.Dialog;
/** @type {[typeof __VLS_components.Dialog, typeof __VLS_components.Dialog, ]} */ ;
// @ts-ignore
const __VLS_208 = __VLS_asFunctionalComponent(__VLS_207, new __VLS_207({
    visible: (__VLS_ctx.relancingSetupVisible),
    header: "Relancing Scheduler Setup",
    ...{ style: ({ width: '36rem' }) },
    modal: true,
}));
const __VLS_209 = __VLS_208({
    visible: (__VLS_ctx.relancingSetupVisible),
    header: "Relancing Scheduler Setup",
    ...{ style: ({ width: '36rem' }) },
    modal: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_208));
__VLS_210.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "space-y-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-sm text-slate-600" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1" },
});
const __VLS_211 = {}.InputText;
/** @type {[typeof __VLS_components.InputText, ]} */ ;
// @ts-ignore
const __VLS_212 = __VLS_asFunctionalComponent(__VLS_211, new __VLS_211({
    modelValue: (__VLS_ctx.relancingProjectName),
    ...{ class: "w-full" },
    placeholder: "e.g. Q2 Launch Readiness",
}));
const __VLS_213 = __VLS_212({
    modelValue: (__VLS_ctx.relancingProjectName),
    ...{ class: "w-full" },
    placeholder: "e.g. Q2 Launch Readiness",
}, ...__VLS_functionalComponentArgsRest(__VLS_212));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1" },
});
const __VLS_215 = {}.Textarea;
/** @type {[typeof __VLS_components.Textarea, ]} */ ;
// @ts-ignore
const __VLS_216 = __VLS_asFunctionalComponent(__VLS_215, new __VLS_215({
    modelValue: (__VLS_ctx.relancingMembersInput),
    rows: "3",
    autoResize: true,
    ...{ class: "w-full" },
    placeholder: "Comma-separated names, e.g. Alexis, Jordan",
}));
const __VLS_217 = __VLS_216({
    modelValue: (__VLS_ctx.relancingMembersInput),
    rows: "3",
    autoResize: true,
    ...{ class: "w-full" },
    placeholder: "Comma-separated names, e.g. Alexis, Jordan",
}, ...__VLS_functionalComponentArgsRest(__VLS_216));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input, __VLS_intrinsicElements.input)({
    type: "datetime-local",
    ...{ class: "w-full border border-slate-300 rounded-md px-3 py-2 text-sm" },
});
(__VLS_ctx.relancingDeadlineInput);
if (__VLS_ctx.relancingValidationErrors.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rounded-md border border-amber-200 bg-amber-50 p-3" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "text-xs font-semibold uppercase tracking-wide text-amber-700" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "text-sm text-amber-700 mt-1" },
    });
    (__VLS_ctx.relancingValidationErrors.map(__VLS_ctx.prettySetupField).join(', '));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex justify-end gap-2 pt-2" },
});
const __VLS_219 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_220 = __VLS_asFunctionalComponent(__VLS_219, new __VLS_219({
    ...{ 'onClick': {} },
    label: "Cancel",
    text: true,
}));
const __VLS_221 = __VLS_220({
    ...{ 'onClick': {} },
    label: "Cancel",
    text: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_220));
let __VLS_223;
let __VLS_224;
let __VLS_225;
const __VLS_226 = {
    onClick: (...[$event]) => {
        __VLS_ctx.relancingSetupVisible = false;
    }
};
var __VLS_222;
const __VLS_227 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_228 = __VLS_asFunctionalComponent(__VLS_227, new __VLS_227({
    ...{ 'onClick': {} },
    label: "Save Setup",
    icon: "pi pi-save",
    loading: (__VLS_ctx.relancingSetupSaving),
}));
const __VLS_229 = __VLS_228({
    ...{ 'onClick': {} },
    label: "Save Setup",
    icon: "pi pi-save",
    loading: (__VLS_ctx.relancingSetupSaving),
}, ...__VLS_functionalComponentArgsRest(__VLS_228));
let __VLS_231;
let __VLS_232;
let __VLS_233;
const __VLS_234 = {
    onClick: (__VLS_ctx.saveRelancingSetup)
};
var __VLS_230;
var __VLS_210;
const __VLS_235 = {}.Dialog;
/** @type {[typeof __VLS_components.Dialog, typeof __VLS_components.Dialog, ]} */ ;
// @ts-ignore
const __VLS_236 = __VLS_asFunctionalComponent(__VLS_235, new __VLS_235({
    visible: (__VLS_ctx.failureSummaryVisible),
    header: "Action Failure Summary",
    ...{ style: ({ width: '35rem' }) },
    modal: true,
}));
const __VLS_237 = __VLS_236({
    visible: (__VLS_ctx.failureSummaryVisible),
    header: "Action Failure Summary",
    ...{ style: ({ width: '35rem' }) },
    modal: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_236));
__VLS_238.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "space-y-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-sm text-slate-600" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "max-h-60 overflow-y-auto space-y-2" },
});
for (const [fail] of __VLS_getVForSourceType((__VLS_ctx.failedItemsList))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (fail.title),
        ...{ class: "p-3 bg-rose-50 border border-rose-100 rounded flex flex-col gap-1" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-bold text-rose-800 text-sm" },
    });
    (fail.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-xs text-rose-600" },
    });
    (fail.error);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex justify-end pt-4" },
});
const __VLS_239 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_240 = __VLS_asFunctionalComponent(__VLS_239, new __VLS_239({
    ...{ 'onClick': {} },
    label: "Acknowledge",
    severity: "secondary",
}));
const __VLS_241 = __VLS_240({
    ...{ 'onClick': {} },
    label: "Acknowledge",
    severity: "secondary",
}, ...__VLS_functionalComponentArgsRest(__VLS_240));
let __VLS_243;
let __VLS_244;
let __VLS_245;
const __VLS_246 = {
    onClick: (...[$event]) => {
        __VLS_ctx.failureSummaryVisible = false;
    }
};
var __VLS_242;
var __VLS_238;
const __VLS_247 = {}.Toast;
/** @type {[typeof __VLS_components.Toast, ]} */ ;
// @ts-ignore
const __VLS_248 = __VLS_asFunctionalComponent(__VLS_247, new __VLS_247({}));
const __VLS_249 = __VLS_248({}, ...__VLS_functionalComponentArgsRest(__VLS_248));
const __VLS_251 = {}.Toast;
/** @type {[typeof __VLS_components.Toast, typeof __VLS_components.Toast, ]} */ ;
// @ts-ignore
const __VLS_252 = __VLS_asFunctionalComponent(__VLS_251, new __VLS_251({
    group: "peek-update",
}));
const __VLS_253 = __VLS_252({
    group: "peek-update",
}, ...__VLS_functionalComponentArgsRest(__VLS_252));
__VLS_254.slots.default;
{
    const { message: __VLS_thisSlot } = __VLS_254.slots;
    const [slotProps] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex flex-col items-start gap-3" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
        ...{ class: "pi pi-info-circle text-blue-500" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-bold" },
    });
    (slotProps.message.summary);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-sm text-slate-600" },
    });
    (slotProps.message.detail);
    const __VLS_255 = {}.Button;
    /** @type {[typeof __VLS_components.Button, ]} */ ;
    // @ts-ignore
    const __VLS_256 = __VLS_asFunctionalComponent(__VLS_255, new __VLS_255({
        ...{ 'onClick': {} },
        label: "Refresh View",
        size: "small",
        severity: "info",
        ...{ class: "p-button-technical" },
    }));
    const __VLS_257 = __VLS_256({
        ...{ 'onClick': {} },
        label: "Refresh View",
        size: "small",
        severity: "info",
        ...{ class: "p-button-technical" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_256));
    let __VLS_259;
    let __VLS_260;
    let __VLS_261;
    const __VLS_262 = {
        onClick: (...[$event]) => {
            __VLS_ctx.fetchData();
            __VLS_ctx.toast.removeGroup('peek-update');
        }
    };
    var __VLS_258;
}
var __VLS_254;
/** @type {__VLS_StyleScopedClasses['space-y-6']} */ ;
/** @type {__VLS_StyleScopedClasses['p-6']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:p-10']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-7xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['md:flex-row']} */ ;
/** @type {__VLS_StyleScopedClasses['md:items-end']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-6']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-4xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['p-button-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['mr-2']} */ ;
/** @type {__VLS_StyleScopedClasses['p-button-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['mr-2']} */ ;
/** @type {__VLS_StyleScopedClasses['p-button-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['py-3']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-[120px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-widest']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-success']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['py-3']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-[120px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-widest']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-info']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-6']} */ ;
/** @type {__VLS_StyleScopedClasses['h-48']} */ ;
/** @type {__VLS_StyleScopedClasses['border-none']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['animate-pulse']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-all']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-all']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-check-circle']} */ ;
/** @type {__VLS_StyleScopedClasses['scale-75']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-all']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-exclamation-triangle']} */ ;
/** @type {__VLS_StyleScopedClasses['scale-75']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-all']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-shield']} */ ;
/** @type {__VLS_StyleScopedClasses['scale-75']} */ ;
/** @type {__VLS_StyleScopedClasses['dashboard-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-6']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-6']} */ ;
/** @type {__VLS_StyleScopedClasses['border-l-4']} */ ;
/** @type {__VLS_StyleScopedClasses['border-l-emerald-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-chart-line']} */ ;
/** @type {__VLS_StyleScopedClasses['text-emerald-500']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['whitespace-pre-line']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-md']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-amber-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-amber-50']} */ ;
/** @type {__VLS_StyleScopedClasses['p-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-800']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-3']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-3']} */ ;
/** @type {__VLS_StyleScopedClasses['border-b']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-100']} */ ;
/** @type {__VLS_StyleScopedClasses['pb-3']} */ ;
/** @type {__VLS_StyleScopedClasses['last:border-b-0']} */ ;
/** @type {__VLS_StyleScopedClasses['last:pb-0']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-800']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['morning-brief-card']} */ ;
/** @type {__VLS_StyleScopedClasses['border-l-4']} */ ;
/** @type {__VLS_StyleScopedClasses['border-l-blue-500']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-sun']} */ ;
/** @type {__VLS_StyleScopedClasses['text-blue-500']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-5']} */ ;
/** @type {__VLS_StyleScopedClasses['executive-prose']} */ ;
/** @type {__VLS_StyleScopedClasses['p-6']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-100']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-900']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-4']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['not-italic']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-align-left']} */ ;
/** @type {__VLS_StyleScopedClasses['text-blue-500']} */ ;
/** @type {__VLS_StyleScopedClasses['sources-row']} */ ;
/** @type {__VLS_StyleScopedClasses['sources-label']} */ ;
/** @type {__VLS_StyleScopedClasses['sources-list']} */ ;
/** @type {__VLS_StyleScopedClasses['source-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['sources-fallback']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-100']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['text-blue-400']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['p-button-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['border-l-4']} */ ;
/** @type {__VLS_StyleScopedClasses['border-l-slate-300']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-4']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-check-circle']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:grid-cols-4']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-6']} */ ;
/** @type {__VLS_StyleScopedClasses['p-button-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['p-12']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-dashed']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-300']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['h-20']} */ ;
/** @type {__VLS_StyleScopedClasses['w-20']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-4xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-6']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-sparkles']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-3']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-md']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-6']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-4']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:grid-cols-4']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-6']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['p-12']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-dashed']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-300']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['h-20']} */ ;
/** @type {__VLS_StyleScopedClasses['w-20']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-4xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-6']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-history']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-3']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-md']} */ ;
/** @type {__VLS_StyleScopedClasses['executive-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-6']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['p-6']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['border-l-4']} */ ;
/** @type {__VLS_StyleScopedClasses['border-blue-500']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['whitespace-pre-line']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-amber-50']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-amber-100']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber-800']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber-700']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-amber-50']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-amber-100']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber-800']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber-700']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-1']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-4']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['text-base']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-800']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['text-blue-600']} */ ;
/** @type {__VLS_StyleScopedClasses['underline']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-6']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-100']} */ ;
/** @type {__VLS_StyleScopedClasses['p-button-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed']} */ ;
/** @type {__VLS_StyleScopedClasses['bottom-10']} */ ;
/** @type {__VLS_StyleScopedClasses['left-1/2']} */ ;
/** @type {__VLS_StyleScopedClasses['-translate-x-1/2']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-900']} */ ;
/** @type {__VLS_StyleScopedClasses['text-white']} */ ;
/** @type {__VLS_StyleScopedClasses['px-8']} */ ;
/** @type {__VLS_StyleScopedClasses['py-4']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['z-50']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-8']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['h-6']} */ ;
/** @type {__VLS_StyleScopedClasses['w-px']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-700']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-rose-200']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['whitespace-nowrap']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-300']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-md']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-md']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-amber-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-amber-50']} */ ;
/** @type {__VLS_StyleScopedClasses['p-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber-700']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-amber-700']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['max-h-60']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-y-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['p-3']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-rose-50']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-rose-100']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-rose-800']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-rose-600']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-4']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-start']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-info-circle']} */ ;
/** @type {__VLS_StyleScopedClasses['text-blue-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['p-button-technical']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            OutcomeCard: OutcomeCard,
            ReasoningTracePane: ReasoningTracePane,
            Button: Button,
            Card: Card,
            Tabs: Tabs,
            TabList: TabList,
            Tab: Tab,
            TabPanels: TabPanels,
            TabPanel: TabPanel,
            Dialog: Dialog,
            Drawer: Drawer,
            InputText: InputText,
            Textarea: Textarea,
            Badge: Badge,
            ConfirmDialog: ConfirmDialog,
            Toast: Toast,
            ThreadSummaryComponent: ThreadSummaryComponent,
            toast: toast,
            isEmergencyBrakeEngaged: isEmergencyBrakeEngaged,
            isTraceVisible: isTraceVisible,
            selectedTaskId: selectedTaskId,
            activeTab: activeTab,
            morningBrief: morningBrief,
            triggeringBrief: triggeringBrief,
            statusReport: statusReport,
            triggeringStatusReport: triggeringStatusReport,
            formattedBrief: formattedBrief,
            statusReportCriticalActions: statusReportCriticalActions,
            statusReportSections: statusReportSections,
            statusReportPeriodLabel: statusReportPeriodLabel,
            isPeekOpen: isPeekOpen,
            selectedItem: selectedItem,
            selectedItemIds: selectedItemIds,
            activeFilter: activeFilter,
            isBulkProcessing: isBulkProcessing,
            failureSummaryVisible: failureSummaryVisible,
            failedItemsList: failedItemsList,
            isApproveSending: isApproveSending,
            relancingSetupVisible: relancingSetupVisible,
            relancingSetupSaving: relancingSetupSaving,
            relancingProjectName: relancingProjectName,
            relancingMembersInput: relancingMembersInput,
            relancingDeadlineInput: relancingDeadlineInput,
            relancingValidationErrors: relancingValidationErrors,
            prettySetupField: prettySetupField,
            openRelancingSetupDialog: openRelancingSetupDialog,
            saveRelancingSetup: saveRelancingSetup,
            formatEscalationTrigger: formatEscalationTrigger,
            formatConfidencePercent: formatConfidencePercent,
            editableDraft: editableDraft,
            openPeek: openPeek,
            openDetail: openDetail,
            toggleSelection: toggleSelection,
            filterCounts: filterCounts,
            toggleFilter: toggleFilter,
            automateTasks: automateTasks,
            maskedSourceLabel: maskedSourceLabel,
            triggerMorningBrief: triggerMorningBrief,
            triggerStatusReport: triggerStatusReport,
            openTrace: openTrace,
            selectedTask: selectedTask,
            selectedEscalationMeta: selectedEscalationMeta,
            selectedEscalationPrompt: selectedEscalationPrompt,
            selectedEscalationThreadLink: selectedEscalationThreadLink,
            hasEscalationDraft: hasEscalationDraft,
            isCurrentUserGmailOwner: isCurrentUserGmailOwner,
            requestApproveAndSend: requestApproveAndSend,
            userStore: userStore,
            loading: loading,
            greeting: greeting,
            stats: stats,
            systemPulse: systemPulse,
            briefingItems: briefingItems,
            activityItems: activityItems,
            fetchData: fetchData,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=Dashboard.vue.js.map