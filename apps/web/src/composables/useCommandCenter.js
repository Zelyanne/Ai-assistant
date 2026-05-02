import { computed, ref } from 'vue';
import { useAgent } from './useAgent';
import { useUserStore } from '../stores/user';
import { supabase } from '../services/supabase';
const STORAGE_KEY_BASE = 'command-center-timeline-v1';
const CONVERSATION_STORAGE_KEY_BASE = 'command-center-conversation-id-v1';
const timeline = ref([]);
const isSubmitting = ref(false);
const activeConversationId = ref(null);
const conversations = ref([]);
let initialized = false;
let idCounter = 0;
let stopTaskSubscription = null;
let stopMessageSubscription = null;
let stopExecutionRunSubscription = null;
let stopConversationSubscription = null;
let messagesLoadedConversationId = null;
let realtimeBootstrapNonce = 0;
const messageIdByEntryId = new Map();
function nextId(prefix) {
    idCounter += 1;
    return `${prefix}-${Date.now()}-${idCounter}`;
}
function defaultTimeline() {
    return [
        {
            id: 'welcome-assistant-message',
            role: 'assistant',
            content: 'Welcome to Command Center. Describe a task and I will queue execution.',
            state: 'done',
            createdAt: new Date().toISOString(),
        },
    ];
}
function timelineStorageKey(organizationId, userId, conversationId) {
    return `${STORAGE_KEY_BASE}:${organizationId}:${userId}:${conversationId}`;
}
function conversationStorageKey(organizationId, userId) {
    return `${CONVERSATION_STORAGE_KEY_BASE}:${organizationId}:${userId}`;
}
async function createConversationId(organizationId, userId) {
    const inserted = await supabase
        .from('command_conversations')
        .insert({
        organization_id: organizationId,
        created_by: userId,
        channel: 'web',
        title: 'Command Center',
        metadata: { source: 'dashboard-command-center' },
    })
        .select('id')
        .single();
    if (!inserted.data?.id)
        return null;
    activeConversationId.value = inserted.data.id;
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(conversationStorageKey(organizationId, userId), inserted.data.id);
    }
    return inserted.data.id;
}
function persistTimeline() {
    if (typeof window === 'undefined')
        return;
    const userStore = useUserStore();
    const organizationId = userStore.profile?.organization_id;
    const userId = userStore.profile?.id;
    const conversationId = activeConversationId.value;
    if (!organizationId || !userId || !conversationId)
        return;
    window.localStorage.setItem(timelineStorageKey(organizationId, userId, conversationId), JSON.stringify(timeline.value));
}
function restoreTimelineFromCache(organizationId, userId, conversationId) {
    if (typeof window === 'undefined')
        return;
    const raw = window.localStorage.getItem(timelineStorageKey(organizationId, userId, conversationId));
    if (!raw)
        return;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
            timeline.value = parsed;
        }
    }
    catch {
        // Ignore bad cache
    }
}
function initializeTimeline() {
    if (initialized)
        return;
    timeline.value = defaultTimeline();
    initialized = true;
}
function updateEntry(id, patch) {
    timeline.value = timeline.value.map((entry) => {
        if (entry.id !== id)
            return entry;
        return {
            ...entry,
            ...patch,
        };
    });
    persistTimeline();
}
function findEntryById(id) {
    return timeline.value.find((entry) => entry.id === id);
}
function appendEntries(entries) {
    timeline.value = [...timeline.value, ...entries];
    persistTimeline();
}
function statusToTimelineState(status) {
    return status;
}
function taskResultSummary(result, fallback) {
    if (!result || typeof result !== 'object' || Array.isArray(result))
        return fallback;
    const summary = result.summary;
    if (typeof summary === 'string' && summary.trim().length > 0) {
        return summary.trim();
    }
    const prompt = result.prompt;
    if (typeof prompt === 'string' && prompt.trim().length > 0) {
        return prompt.trim();
    }
    const reason = result.reason;
    if (typeof reason === 'string' && reason.trim().length > 0) {
        return reason.trim();
    }
    return fallback;
}
function asResultRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return value;
}
function isInternalExecutionSummary(text) {
    const lower = text.toLowerCase();
    return lower.startsWith('execution run completed with') || lower.startsWith('execution run ');
}
function buildScheduleCreatedMessage(result) {
    if (result.outcome !== 'schedule_created')
        return null;
    const schedule = asResultRecord(result.schedule);
    const nextRun = typeof schedule.next_run === 'string' && schedule.next_run.trim().length > 0
        ? schedule.next_run.trim()
        : null;
    if (nextRun) {
        return `Got it — I scheduled this. First run: ${nextRun}.`;
    }
    return 'Got it — your schedule is created.';
}
function doneAssistantMessage(task, executionRun) {
    const result = asResultRecord(task.result);
    const scheduleMessage = buildScheduleCreatedMessage(result);
    if (scheduleMessage)
        return scheduleMessage;
    const summary = typeof result.summary === 'string' ? result.summary.trim() : '';
    if (summary && !isInternalExecutionSummary(summary)) {
        return summary;
    }
    if (executionRun?.summary && executionRun.summary.trim().length > 0) {
        return `Done — ${executionRun.summary.trim()}`;
    }
    if (typeof executionRun?.completedSteps === 'number' && executionRun.completedSteps > 0) {
        const plural = executionRun.completedSteps > 1 ? 's' : '';
        return `Done — I completed ${executionRun.completedSteps} step${plural}.`;
    }
    return 'Done.';
}
function toCommandRole(value) {
    if (value === 'assistant' || value === 'system')
        return value;
    return 'user';
}
function toCommandState(value) {
    if (!value)
        return undefined;
    if (value === 'intent_preview' || value === 'queued' || value === 'processing' || value === 'done' || value === 'error' || value === 'escalation' || value === 'paused') {
        return value;
    }
    return undefined;
}
function taskStatusMessage(task, executionRun) {
    if (task.status === 'queued')
        return 'Queued for asynchronous execution.';
    if (task.status === 'processing')
        return executionRun ? executionRunMessage(executionRun) : 'Processing command...';
    if (task.status === 'done')
        return doneAssistantMessage(task, executionRun);
    if (task.status === 'escalation')
        return taskResultSummary(task.result, 'Command escalated for review.');
    if (task.status === 'paused')
        return taskResultSummary(task.result, 'Command paused by safety controls.');
    return taskResultSummary(task.result, 'Command execution failed.');
}
function applyTaskUpdate(task) {
    const targets = timeline.value.filter((entry) => entry.taskId === task.id && entry.role === 'assistant');
    targets.forEach((entry) => {
        const executionRun = normalizeExecutionRun(task.result && typeof task.result === 'object' && !Array.isArray(task.result)
            ? task.result.execution_run
            : undefined) ?? entry.executionRun;
        const content = taskStatusMessage(task, executionRun);
        updateEntry(entry.id, {
            state: statusToTimelineState(task.status),
            content,
            executionRun,
        });
        const messageDbId = messageIdByEntryId.get(entry.id);
        if (messageDbId) {
            void supabase
                .from('command_messages')
                .update({
                state: task.status,
                content,
                source_task_id: task.id,
            })
                .eq('id', messageDbId)
                .then(() => undefined);
        }
    });
}
function applyExecutionRunUpdate(row) {
    const executionRun = normalizeExecutionRun(row);
    if (!executionRun)
        return;
    const targets = timeline.value.filter((entry) => entry.taskId === row.task_id && entry.role === 'assistant');
    targets.forEach((entry) => {
        const terminalState = entry.state === 'done' || entry.state === 'error' || entry.state === 'escalation' || entry.state === 'paused';
        updateEntry(entry.id, {
            executionRun,
            state: terminalState ? entry.state : executionRunToTimelineState(executionRun),
            content: terminalState ? entry.content : executionRunMessage(executionRun),
        });
    });
}
function toConversationListItem(row) {
    return {
        id: row.id,
        title: row.title,
        updatedAt: row.updated_at,
        createdAt: row.created_at,
    };
}
function safeTimestamp(value) {
    if (!value)
        return 0;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}
function deriveConversationTitleFromCommand(command) {
    const firstLine = command
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? command.trim();
    const compact = firstLine.replace(/\s+/g, ' ').trim();
    if (compact.length <= 64)
        return compact;
    return `${compact.slice(0, 61)}…`;
}
function isGenericConversationTitle(title) {
    const raw = title?.trim();
    if (!raw)
        return true;
    return raw === 'Command Center' || raw === 'New chat' || raw === 'Empty chat';
}
async function maybeSetConversationTitle(conversationId, organizationId, command, currentTitle) {
    if (!isGenericConversationTitle(currentTitle))
        return;
    const nextTitle = deriveConversationTitleFromCommand(command);
    if (!nextTitle)
        return;
    await supabase
        .from('command_conversations')
        .update({ title: nextTitle })
        .eq('organization_id', organizationId)
        .eq('id', conversationId);
}
function parseExecutionPlanSteps(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return [];
    const steps = value.steps;
    return Array.isArray(steps)
        ? steps.filter((step) => Boolean(step) && typeof step === 'object')
        : [];
}
function normalizeExecutionRun(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const record = value;
    const id = typeof record.id === 'string' ? record.id : null;
    const status = typeof record.status === 'string' ? record.status : null;
    if (!id || !status)
        return undefined;
    const steps = parseExecutionPlanSteps(record.plan_json);
    const workerSteps = steps.filter((step) => step.worker_type !== 'planner');
    const completedSteps = workerSteps.filter((step) => step.status === 'completed').length;
    const totalSteps = workerSteps.length > 0 ? workerSteps.length : undefined;
    const planSummary = record.plan_json && typeof record.plan_json === 'object' && !Array.isArray(record.plan_json)
        ? record.plan_json.summary
        : undefined;
    const replanCount = record.plan_json && typeof record.plan_json === 'object' && !Array.isArray(record.plan_json)
        ? record.plan_json.replan_count
        : undefined;
    return {
        id,
        status,
        currentStepKey: typeof record.current_step_key === 'string' ? record.current_step_key : null,
        currentWorkerType: typeof record.current_worker_type === 'string' ? record.current_worker_type : null,
        summary: typeof planSummary === 'string' ? planSummary : null,
        replanCount: typeof replanCount === 'number' ? replanCount : undefined,
        completedSteps,
        totalSteps,
        ledgerMarkdown: typeof record.ledger_markdown === 'string' ? record.ledger_markdown : null,
        lastError: typeof record.last_error === 'string' ? record.last_error : null,
        updatedAt: typeof record.updated_at === 'string' ? record.updated_at : undefined,
    };
}
function executionRunToTimelineState(executionRun) {
    switch (executionRun.status) {
        case 'planned':
            return 'queued';
        case 'processing':
        case 'completed':
            return 'processing';
        case 'blocked':
        case 'escalated':
            return 'escalation';
        case 'failed':
            return 'error';
        default:
            return 'processing';
    }
}
function executionRunMessage(executionRun) {
    if (executionRun.status === 'planned') {
        return executionRun.summary?.trim().length
            ? `I have a plan: ${executionRun.summary}`
            : 'I have a plan and I am about to run it.';
    }
    if (executionRun.status === 'processing') {
        const worker = executionRun.currentWorkerType ? `${executionRun.currentWorkerType} specialist` : 'planner';
        const step = executionRun.currentStepKey ? `Step ${executionRun.currentStepKey}.` : 'Advancing the plan.';
        return `Working on it with ${worker}. ${step}`;
    }
    if (executionRun.status === 'completed') {
        return 'Almost done — finalizing your response...';
    }
    if (executionRun.status === 'blocked') {
        return executionRun.lastError?.trim().length
            ? `Execution blocked: ${executionRun.lastError}`
            : 'Execution blocked before side effects.';
    }
    if (executionRun.status === 'escalated') {
        return executionRun.lastError?.trim().length
            ? `Execution escalated: ${executionRun.lastError}`
            : 'Execution escalated for review.';
    }
    return executionRun.lastError?.trim().length
        ? `Execution failed: ${executionRun.lastError}`
        : 'Execution failed.';
}
function normalizeMessageRow(row) {
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? row.metadata
        : {};
    const localEntryId = typeof metadata.local_entry_id === 'string' ? metadata.local_entry_id : null;
    const role = toCommandRole(row.role);
    const state = toCommandState(row.state);
    return {
        id: localEntryId ?? `message-${row.id}`,
        role,
        content: row.content,
        state,
        taskId: row.source_task_id ?? undefined,
        correlationId: row.correlation_id ?? undefined,
        threadId: row.thread_id ?? (typeof metadata.thread_id === 'string' ? metadata.thread_id : undefined),
        metadata,
        createdAt: row.created_at,
    };
}
function upsertTimelineEntry(entry) {
    const existing = findEntryById(entry.id);
    if (!existing) {
        appendEntries([entry]);
        return;
    }
    updateEntry(entry.id, {
        role: entry.role,
        content: entry.content,
        state: entry.state,
        taskId: entry.taskId,
        correlationId: entry.correlationId,
        threadId: entry.threadId,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
        executionRun: entry.executionRun,
    });
}
async function loadConversationMessages(conversationId) {
    const userStore = useUserStore();
    const organizationId = userStore.profile?.organization_id;
    if (!organizationId)
        return;
    const { data, error } = await supabase
        .from('command_messages')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
    if (error)
        return;
    // Avoid overwriting the UI if user switched conversations mid-flight.
    if (activeConversationId.value && activeConversationId.value !== conversationId)
        return;
    messagesLoadedConversationId = conversationId;
    messageIdByEntryId.clear();
    const rows = data ?? [];
    timeline.value = rows.length > 0 ? [] : defaultTimeline();
    persistTimeline();
    rows.forEach((row) => {
        const entry = normalizeMessageRow(row);
        messageIdByEntryId.set(entry.id, row.id);
        upsertTimelineEntry(entry);
    });
}
async function loadExecutionRunsForTimeline(organizationId) {
    const taskIds = Array.from(new Set(timeline.value
        .map((entry) => entry.taskId)
        .filter((taskId) => typeof taskId === 'string' && taskId.length > 0)));
    if (taskIds.length === 0)
        return;
    const { data, error } = await supabase
        .from('execution_runs')
        .select('*')
        .eq('organization_id', organizationId)
        .in('task_id', taskIds);
    if (error)
        return;
    (data ?? []).forEach((row) => {
        if (row && typeof row === 'object') {
            applyExecutionRunUpdate(row);
        }
    });
}
async function loadConversations() {
    const userStore = useUserStore();
    const organizationId = userStore.profile?.organization_id;
    const userId = userStore.profile?.id;
    if (!organizationId || !userId) {
        conversations.value = [];
        return;
    }
    const { data, error } = await supabase
        .from('command_conversations')
        .select('id, title, created_at, updated_at')
        .eq('organization_id', organizationId)
        .eq('created_by', userId)
        .eq('channel', 'web')
        .order('updated_at', { ascending: false })
        .limit(50);
    if (error)
        return;
    const rows = (data ?? []);
    conversations.value = rows.map(toConversationListItem);
}
async function ensureConversationId() {
    if (activeConversationId.value)
        return activeConversationId.value;
    const userStore = useUserStore();
    const organizationId = userStore.profile?.organization_id;
    const userId = userStore.profile?.id;
    if (!organizationId || !userId)
        return null;
    const cachedId = typeof window !== 'undefined'
        ? window.localStorage.getItem(conversationStorageKey(organizationId, userId))
        : null;
    if (cachedId) {
        activeConversationId.value = cachedId;
        return cachedId;
    }
    if (conversations.value.length > 0) {
        const first = conversations.value[0]?.id ?? null;
        if (first) {
            activeConversationId.value = first;
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(conversationStorageKey(organizationId, userId), first);
            }
            return first;
        }
    }
    const existing = await supabase
        .from('command_conversations')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('created_by', userId)
        .eq('channel', 'web')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (existing.data?.id) {
        activeConversationId.value = existing.data.id;
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(conversationStorageKey(organizationId, userId), existing.data.id);
        }
        return existing.data.id;
    }
    return createConversationId(organizationId, userId);
}
async function persistMessages(rows) {
    const insertRows = rows.filter((row) => Boolean(row.content && row.content.trim().length > 0));
    if (insertRows.length === 0)
        return new Map();
    const { data } = await supabase
        .from('command_messages')
        .insert(insertRows)
        .select('id, metadata');
    const insertedByEntryId = new Map();
    (data ?? []).forEach((row) => {
        const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
            ? row.metadata
            : {};
        const localEntryId = typeof metadata.local_entry_id === 'string' ? metadata.local_entry_id : null;
        if (localEntryId) {
            messageIdByEntryId.set(localEntryId, row.id);
            insertedByEntryId.set(localEntryId, row.id);
        }
    });
    return insertedByEntryId;
}
function shouldMarkHighRiskClientSide() {
    // Intentionally disabled.
    // Risk/confirmation is enforced server-side after delegation (AssistantCommandProcessor)
    // so we don't pause/surface warnings based on naive client-side keyword matches.
    return false;
}
export function useCommandCenter() {
    initializeTimeline();
    const { submitTask, subscribeToTable } = useAgent();
    const userStore = useUserStore();
    const activeExecutionRun = computed(() => {
        const withRuns = [...timeline.value]
            .filter((entry) => entry.executionRun)
            .sort((left, right) => {
            const leftTime = new Date(left.executionRun?.updatedAt ?? left.createdAt).getTime();
            const rightTime = new Date(right.executionRun?.updatedAt ?? right.createdAt).getTime();
            return rightTime - leftTime;
        });
        return withRuns[0] ?? null;
    });
    async function switchConversation(conversationId) {
        const organizationId = userStore.profile?.organization_id;
        const userId = userStore.profile?.id;
        if (!organizationId || !userId)
            return;
        if (stopMessageSubscription) {
            stopMessageSubscription();
            stopMessageSubscription = null;
        }
        messagesLoadedConversationId = null;
        realtimeBootstrapNonce += 1;
        activeConversationId.value = conversationId;
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(conversationStorageKey(organizationId, userId), conversationId);
        }
        messageIdByEntryId.clear();
        timeline.value = defaultTimeline();
        restoreTimelineFromCache(organizationId, userId, conversationId);
        persistTimeline();
        await loadConversationMessages(conversationId);
        await loadExecutionRunsForTimeline(organizationId);
        // Resume message subscription with current activeConversationId filtering.
        startRealtimeSync();
    }
    function startRealtimeSync() {
        if (!userStore.profile?.organization_id)
            return;
        const bootstrapNonce = (realtimeBootstrapNonce += 1);
        if (!stopConversationSubscription) {
            stopConversationSubscription = subscribeToTable('command_conversations', (payload) => {
                if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE')
                    return;
                if (!payload.new || typeof payload.new !== 'object')
                    return;
                const row = payload.new;
                if (row.channel !== 'web')
                    return;
                if (row.created_by !== userStore.profile?.id)
                    return;
                const nextItem = toConversationListItem(row);
                const without = conversations.value.filter((existing) => existing.id !== nextItem.id);
                conversations.value = [nextItem, ...without].sort((left, right) => {
                    const leftTime = safeTimestamp(left.updatedAt ?? left.createdAt);
                    const rightTime = safeTimestamp(right.updatedAt ?? right.createdAt);
                    return rightTime - leftTime;
                });
            });
        }
        if (!stopTaskSubscription) {
            stopTaskSubscription = subscribeToTable('tasks', (payload) => {
                if (payload.eventType !== 'UPDATE' && payload.eventType !== 'INSERT')
                    return;
                if (!payload.new || typeof payload.new !== 'object')
                    return;
                const task = payload.new;
                if (!task.id)
                    return;
                applyTaskUpdate(task);
            });
        }
        if (!stopExecutionRunSubscription) {
            stopExecutionRunSubscription = subscribeToTable('execution_runs', (payload) => {
                if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE')
                    return;
                if (!payload.new || typeof payload.new !== 'object')
                    return;
                applyExecutionRunUpdate(payload.new);
            });
        }
        if (stopMessageSubscription)
            return;
        void (async () => {
            const organizationId = userStore.profile?.organization_id;
            if (!organizationId)
                return;
            if (bootstrapNonce !== realtimeBootstrapNonce)
                return;
            await loadConversations();
            if (bootstrapNonce !== realtimeBootstrapNonce)
                return;
            const conversationId = await ensureConversationId();
            if (!conversationId)
                return;
            if (bootstrapNonce !== realtimeBootstrapNonce)
                return;
            const userId = userStore.profile?.id;
            if (typeof window !== 'undefined' && userId) {
                restoreTimelineFromCache(organizationId, userId, conversationId);
            }
            if (messagesLoadedConversationId !== conversationId) {
                await loadConversationMessages(conversationId);
                await loadExecutionRunsForTimeline(organizationId);
            }
            if (bootstrapNonce !== realtimeBootstrapNonce)
                return;
            if (stopMessageSubscription)
                return;
            stopMessageSubscription = subscribeToTable('command_messages', (payload) => {
                if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE')
                    return;
                if (!payload.new || typeof payload.new !== 'object')
                    return;
                const row = payload.new;
                const currentConversationId = activeConversationId.value;
                if (!currentConversationId)
                    return;
                if (row.conversation_id !== currentConversationId)
                    return;
                const entry = normalizeMessageRow(row);
                messageIdByEntryId.set(entry.id, row.id);
                upsertTimelineEntry(entry);
            }) ?? null;
        })();
    }
    function stopRealtimeSync() {
        realtimeBootstrapNonce += 1;
        if (stopTaskSubscription) {
            stopTaskSubscription();
            stopTaskSubscription = null;
        }
        if (stopMessageSubscription) {
            stopMessageSubscription();
            stopMessageSubscription = null;
        }
        if (stopExecutionRunSubscription) {
            stopExecutionRunSubscription();
            stopExecutionRunSubscription = null;
        }
        if (stopConversationSubscription) {
            stopConversationSubscription();
            stopConversationSubscription = null;
        }
    }
    async function startNewDiscussion() {
        const organizationId = userStore.profile?.organization_id;
        const userId = userStore.profile?.id;
        if (stopMessageSubscription) {
            stopMessageSubscription();
            stopMessageSubscription = null;
        }
        activeConversationId.value = null;
        messagesLoadedConversationId = null;
        realtimeBootstrapNonce += 1;
        messageIdByEntryId.clear();
        timeline.value = defaultTimeline();
        persistTimeline();
        if (typeof window !== 'undefined' && organizationId && userId) {
            window.localStorage.removeItem(conversationStorageKey(organizationId, userId));
        }
        if (organizationId && userId) {
            const nextConversationId = await createConversationId(organizationId, userId);
            await loadConversations();
            if (nextConversationId) {
                await loadConversationMessages(nextConversationId);
                await loadExecutionRunsForTimeline(organizationId);
            }
        }
        startRealtimeSync();
    }
    async function submitCommand(message, _options = {}) {
        const command = message.trim();
        if (!command) {
            return {
                requiresConfirmation: false,
                queued: false,
                highRisk: false,
            };
        }
        const highRisk = shouldMarkHighRiskClientSide();
        const organizationId = userStore.profile?.organization_id ?? null;
        const userId = userStore.profile?.id ?? null;
        const priorContext = timeline.value.slice(-20).map((entry) => ({
            role: entry.role,
            content: entry.content,
            state: entry.state,
            created_at: entry.createdAt,
            task_id: entry.taskId,
            correlation_id: entry.correlationId,
            thread_id: entry.threadId,
            metadata: entry.metadata,
        }));
        const createdAt = new Date().toISOString();
        const correlationId = nextId('command-correlation');
        const userMessageId = nextId('command-user');
        const assistantMessageId = nextId('command-assistant');
        const conversationId = await ensureConversationId();
        if (conversationId && organizationId) {
            const existing = conversations.value.find((item) => item.id === conversationId);
            void maybeSetConversationTitle(conversationId, organizationId, command, existing?.title);
            const nextTitle = deriveConversationTitleFromCommand(command);
            if (existing && isGenericConversationTitle(existing.title)) {
                conversations.value = conversations.value.map((item) => {
                    if (item.id !== conversationId)
                        return item;
                    return { ...item, title: nextTitle };
                });
            }
        }
        appendEntries([
            {
                id: userMessageId,
                role: 'user',
                content: command,
                correlationId,
                createdAt,
            },
            {
                id: assistantMessageId,
                role: 'assistant',
                content: `Intent preview: "${command}"`,
                state: 'intent_preview',
                correlationId,
                createdAt,
            },
        ]);
        let insertedIdsByEntryId = new Map();
        if (conversationId && organizationId && userId) {
            insertedIdsByEntryId = await persistMessages([
                {
                    conversation_id: conversationId,
                    organization_id: organizationId,
                    role: 'user',
                    content: command,
                    channel: 'web',
                    correlation_id: correlationId,
                    metadata: { local_entry_id: userMessageId },
                },
                {
                    conversation_id: conversationId,
                    organization_id: organizationId,
                    role: 'assistant',
                    content: `Intent preview: "${command}"`,
                    state: 'intent_preview',
                    channel: 'web',
                    correlation_id: correlationId,
                    metadata: { local_entry_id: assistantMessageId },
                },
            ]);
        }
        isSubmitting.value = true;
        const sourceMessageId = insertedIdsByEntryId.get(userMessageId);
        const task = await submitTask('assistant.command', {
            command,
            command_text: command,
            channel: 'web',
            source: 'dashboard-command-center',
            user_initiated: true,
            high_risk: highRisk,
            conversation_id: conversationId,
            correlation_id: correlationId,
            source_message_id: sourceMessageId,
            conversation_context: priorContext,
        }, 'Command Center');
        if (!task) {
            updateEntry(assistantMessageId, {
                state: 'error',
                content: 'Command enqueue failed. Please retry.',
            });
            const assistantMessageDbId = insertedIdsByEntryId.get(assistantMessageId) ?? messageIdByEntryId.get(assistantMessageId);
            if (assistantMessageDbId) {
                void supabase
                    .from('command_messages')
                    .update({ state: 'error', content: 'Command enqueue failed. Please retry.' })
                    .eq('id', assistantMessageDbId)
                    .then(() => undefined);
            }
            isSubmitting.value = false;
            return {
                requiresConfirmation: false,
                queued: false,
                highRisk,
            };
        }
        updateEntry(assistantMessageId, {
            state: 'queued',
            content: 'Queued for asynchronous execution.',
            taskId: task.id,
            correlationId,
        });
        const assistantMessageDbId = insertedIdsByEntryId.get(assistantMessageId) ?? messageIdByEntryId.get(assistantMessageId);
        if (assistantMessageDbId) {
            void supabase
                .from('command_messages')
                .update({ state: 'queued', source_task_id: task.id })
                .eq('id', assistantMessageDbId)
                .then(() => undefined);
        }
        isSubmitting.value = false;
        return {
            requiresConfirmation: false,
            queued: true,
            highRisk,
        };
    }
    return {
        activeExecutionRun,
        timeline,
        isSubmitting,
        conversations,
        activeConversationId,
        loadConversations,
        switchConversation,
        startRealtimeSync,
        startNewDiscussion,
        stopRealtimeSync,
        submitCommand,
    };
}
//# sourceMappingURL=useCommandCenter.js.map