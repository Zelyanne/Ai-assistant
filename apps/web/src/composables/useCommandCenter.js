import { computed, ref } from 'vue';
import { useAgent } from './useAgent';
import { useUserStore } from '../stores/user';
import { supabase } from '../services/supabase';
const STORAGE_KEY_BASE = 'command-center-timeline-v1';
const CONVERSATION_STORAGE_KEY_BASE = 'command-center-conversation-id-v1';
const HIGH_RISK_PATTERNS = [
    /\bsend\b/i,
    /\bemail\b/i,
    /\bforward\b/i,
    /\breply\b/i,
    /\bmessage\b/i,
    /\bnotify\b/i,
];
const timeline = ref([]);
const isSubmitting = ref(false);
const activeConversationId = ref(null);
let initialized = false;
let idCounter = 0;
let stopTaskSubscription = null;
let stopMessageSubscription = null;
let stopExecutionRunSubscription = null;
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
function timelineStorageKey(organizationId, userId) {
    if (!organizationId || !userId)
        return STORAGE_KEY_BASE;
    return `${STORAGE_KEY_BASE}:${organizationId}:${userId}`;
}
function conversationStorageKey(organizationId, userId) {
    return `${CONVERSATION_STORAGE_KEY_BASE}:${organizationId}:${userId}`;
}
function persistTimeline() {
    if (typeof window === 'undefined')
        return;
    const userStore = useUserStore();
    const organizationId = userStore.profile?.organization_id ?? null;
    const userId = userStore.profile?.id ?? null;
    window.localStorage.setItem(timelineStorageKey(organizationId, userId), JSON.stringify(timeline.value));
}
function initializeTimeline() {
    if (initialized)
        return;
    if (typeof window === 'undefined') {
        timeline.value = defaultTimeline();
        initialized = true;
        return;
    }
    const userStore = useUserStore();
    const organizationId = userStore.profile?.organization_id ?? null;
    const userId = userStore.profile?.id ?? null;
    const raw = window.localStorage.getItem(timelineStorageKey(organizationId, userId));
    if (!raw) {
        timeline.value = defaultTimeline();
        persistTimeline();
        initialized = true;
        return;
    }
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
            timeline.value = parsed;
        }
        else {
            timeline.value = defaultTimeline();
            persistTimeline();
        }
    }
    catch {
        timeline.value = defaultTimeline();
        persistTimeline();
    }
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
    return typeof summary === 'string' && summary.trim().length > 0 ? summary : fallback;
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
        return taskResultSummary(task.result, 'Command completed.');
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
            ? `Plan ready: ${executionRun.summary}`
            : 'Plan ready. Waiting to begin worker execution.';
    }
    if (executionRun.status === 'processing') {
        const worker = executionRun.currentWorkerType ? `${executionRun.currentWorkerType} worker` : 'planner';
        const step = executionRun.currentStepKey ? `Step: ${executionRun.currentStepKey}.` : 'Advancing the plan.';
        return `Processing with ${worker}. ${step}`;
    }
    if (executionRun.status === 'completed') {
        return 'Execution run completed. Finalizing task...';
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
    const rows = data ?? [];
    if (rows.length > 0) {
        timeline.value = [];
    }
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
function isHighRiskCommand(command) {
    return HIGH_RISK_PATTERNS.some((pattern) => pattern.test(command));
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
    function startRealtimeSync() {
        if (!userStore.profile?.organization_id)
            return;
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
            const conversationId = await ensureConversationId();
            if (!conversationId)
                return;
            await loadConversationMessages(conversationId);
            await loadExecutionRunsForTimeline(organizationId);
            if (stopMessageSubscription)
                return;
            stopMessageSubscription = subscribeToTable('command_messages', (payload) => {
                if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE')
                    return;
                if (!payload.new || typeof payload.new !== 'object')
                    return;
                const row = payload.new;
                if (row.conversation_id !== conversationId)
                    return;
                const entry = normalizeMessageRow(row);
                messageIdByEntryId.set(entry.id, row.id);
                upsertTimelineEntry(entry);
            }) ?? null;
        })();
    }
    function stopRealtimeSync() {
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
    }
    async function submitCommand(message, options = {}) {
        const command = message.trim();
        if (!command) {
            return {
                requiresConfirmation: false,
                queued: false,
                highRisk: false,
            };
        }
        const highRisk = isHighRiskCommand(command);
        if (highRisk && !options.force) {
            return {
                requiresConfirmation: true,
                queued: false,
                highRisk,
            };
        }
        const organizationId = userStore.profile?.organization_id ?? null;
        const userId = userStore.profile?.id ?? null;
        const priorContext = timeline.value.slice(-20).map((entry) => ({
            role: entry.role,
            content: entry.content,
            state: entry.state,
            created_at: entry.createdAt,
            task_id: entry.taskId,
            correlation_id: entry.correlationId,
        }));
        const createdAt = new Date().toISOString();
        const correlationId = nextId('command-correlation');
        const userMessageId = nextId('command-user');
        const assistantMessageId = nextId('command-assistant');
        const conversationId = await ensureConversationId();
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
            source: 'dashboard-command-center',
            high_risk: highRisk,
            confirmed: options.force === true,
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
        startRealtimeSync,
        stopRealtimeSync,
        submitCommand,
    };
}
//# sourceMappingURL=useCommandCenter.js.map