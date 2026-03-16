import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
let useCommandCenter;
async function waitFor(callback, timeout = 1000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            callback();
            return;
        }
        catch {
            await new Promise((r) => setTimeout(r, 10));
        }
    }
    callback(); // One last try to throw the actual error
}
const { supabaseFromMock, resetSupabaseMock } = vi.hoisted(() => {
    let currentTable = '';
    let action = 'select';
    let insertRows = null;
    let updatePatch = null;
    const mockChain = {
        select: vi.fn((_columns) => mockChain),
        eq: vi.fn((_key, _value) => mockChain),
        in: vi.fn((_key, _values) => mockChain),
        order: vi.fn((_column, _opts) => mockChain),
        limit: vi.fn((_n) => mockChain),
        insert: vi.fn((rows) => {
            action = 'insert';
            insertRows = rows;
            return mockChain;
        }),
        update: vi.fn((patch) => {
            action = 'update';
            updatePatch = patch;
            return mockChain;
        }),
        single: vi.fn(async () => {
            if (currentTable === 'command_conversations' && action === 'insert') {
                return { data: { id: 'conv-1' }, error: null };
            }
            return { data: null, error: null };
        }),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        then: vi.fn((resolve) => {
            if (currentTable === 'command_messages' && action === 'insert') {
                const rows = Array.isArray(insertRows) ? insertRows : [];
                const data = rows.map((row, idx) => {
                    const record = (row && typeof row === 'object' && !Array.isArray(row))
                        ? row
                        : {};
                    return {
                        id: `msg-${idx + 1}`,
                        metadata: (record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata))
                            ? record.metadata
                            : {},
                    };
                });
                return Promise.resolve(resolve({ data, error: null }));
            }
            if (currentTable === 'command_messages' && action === 'select') {
                return Promise.resolve(resolve({ data: [], error: null }));
            }
            if (currentTable === 'command_messages' && action === 'update') {
                return Promise.resolve(resolve({ data: updatePatch ?? null, error: null }));
            }
            if (currentTable === 'command_conversations' && action === 'select') {
                return Promise.resolve(resolve({ data: null, error: null }));
            }
            return Promise.resolve(resolve({ data: null, error: null }));
        }),
    };
    const supabaseFromMock = vi.fn((table) => {
        currentTable = table;
        action = 'select';
        insertRows = null;
        updatePatch = null;
        return mockChain;
    });
    function resetSupabaseMock() {
        supabaseFromMock.mockClear();
        mockChain.select.mockClear();
        mockChain.eq.mockClear();
        mockChain.in.mockClear();
        mockChain.order.mockClear();
        mockChain.limit.mockClear();
        mockChain.insert.mockClear();
        mockChain.update.mockClear();
        mockChain.single.mockClear();
        mockChain.maybeSingle.mockClear();
        mockChain.then.mockClear();
    }
    return { supabaseFromMock, resetSupabaseMock };
});
vi.mock('../services/supabase', () => ({
    supabase: {
        from: supabaseFromMock,
    },
}));
const submitTaskMock = vi.fn();
const subscribeToTableMock = vi.fn();
vi.mock('./useAgent', () => ({
    useAgent: () => ({
        submitTask: submitTaskMock,
        subscribeToTable: subscribeToTableMock,
    }),
}));
describe('useCommandCenter', () => {
    const subscriptions = new Map();
    const unsubs = new Map();
    beforeEach(async () => {
        vi.resetModules();
        setActivePinia(createPinia());
        window.localStorage.clear();
        submitTaskMock.mockReset();
        subscribeToTableMock.mockReset();
        resetSupabaseMock();
        subscriptions.clear();
        unsubs.clear();
        ({ useCommandCenter } = await import('./useCommandCenter'));
        subscribeToTableMock.mockImplementation((table, cb) => {
            subscriptions.set(table, cb);
            const stop = vi.fn();
            unsubs.set(table, stop);
            return stop;
        });
    });
    it('queues low-risk command via assistant.command task', async () => {
        submitTaskMock.mockResolvedValue({ id: 'task-low-risk-1' });
        const center = useCommandCenter();
        const result = await center.submitCommand('Draft project summary');
        expect(result.queued).toBe(true);
        expect(result.requiresConfirmation).toBe(false);
        expect(submitTaskMock).toHaveBeenCalledWith('assistant.command', expect.objectContaining({
            command: 'Draft project summary',
            source: 'dashboard-command-center',
            high_risk: false,
        }), 'Command Center');
    });
    it('queues high-risk command immediately without confirmation', async () => {
        submitTaskMock.mockResolvedValue({ id: 'task-high-risk-1' });
        const center = useCommandCenter();
        const result = await center.submitCommand('Send email update to leadership');
        expect(result.requiresConfirmation).toBe(false);
        expect(result.queued).toBe(true);
        expect(submitTaskMock).toHaveBeenCalledWith('assistant.command', expect.objectContaining({
            channel: 'web',
            user_initiated: true,
            high_risk: true,
        }), 'Command Center');
    });
    it('marks assistant entry as error when queue insert fails', async () => {
        submitTaskMock.mockResolvedValue(null);
        const center = useCommandCenter();
        const result = await center.submitCommand('Draft project summary');
        const lastEntry = center.timeline.value[center.timeline.value.length - 1];
        expect(result.queued).toBe(false);
        expect(lastEntry.state).toBe('error');
        expect(lastEntry.content).toContain('enqueue failed');
    });
    it('starts a new discussion by resetting the timeline and creating a fresh conversation', async () => {
        const center = useCommandCenter();
        const { useUserStore } = await import('../stores/user');
        const userStore = useUserStore();
        userStore.profile = {
            id: '123e4567-e89b-12d3-a456-426614174002',
            organization_id: '123e4567-e89b-12d3-a456-426614174001',
        };
        center.startRealtimeSync();
        await waitFor(() => {
            expect(subscribeToTableMock).toHaveBeenCalledWith('tasks', expect.any(Function));
        });
        await center.submitCommand('Draft project summary');
        expect(center.timeline.value.length).toBeGreaterThan(1);
        await center.startNewDiscussion();
        expect(center.timeline.value).toHaveLength(1);
        expect(center.timeline.value[0]?.content).toContain('Welcome to Command Center');
        await center.submitCommand('Draft follow-up summary');
        expect(center.timeline.value.some((entry) => entry.content === 'Draft follow-up summary')).toBe(true);
    });
    it('applies realtime task updates and cleans up subscriptions', async () => {
        submitTaskMock.mockResolvedValue({ id: 'task-realtime-1' });
        const center = useCommandCenter();
        const { useUserStore } = await import('../stores/user');
        const userStore = useUserStore();
        userStore.profile = {
            id: '123e4567-e89b-12d3-a456-426614174002',
            organization_id: '123e4567-e89b-12d3-a456-426614174001',
        };
        center.startRealtimeSync();
        await waitFor(() => {
            expect(subscribeToTableMock).toHaveBeenCalledWith('tasks', expect.any(Function));
            expect(subscribeToTableMock).toHaveBeenCalledWith('command_messages', expect.any(Function));
            expect(subscribeToTableMock).toHaveBeenCalledWith('execution_runs', expect.any(Function));
        });
        await center.submitCommand('Draft project summary');
        const taskCallback = subscriptions.get('tasks');
        expect(taskCallback).toBeDefined();
        taskCallback?.({
            eventType: 'UPDATE',
            new: {
                id: 'task-realtime-1',
                status: 'processing',
                result: {},
            },
        });
        await waitFor(() => {
            const latestAssistantEntry = center.timeline.value.find((entry) => entry.taskId === 'task-realtime-1');
            expect(latestAssistantEntry?.state).toBe('processing');
        });
        center.stopRealtimeSync();
        expect(unsubs.get('tasks')).toHaveBeenCalledTimes(1);
        expect(unsubs.get('command_messages')).toHaveBeenCalledTimes(1);
        expect(unsubs.get('execution_runs')).toHaveBeenCalledTimes(1);
    });
    it('supports submit -> queued -> processing -> done timeline progression', async () => {
        submitTaskMock.mockResolvedValue({ id: 'task-flow-1' });
        const center = useCommandCenter();
        const { useUserStore } = await import('../stores/user');
        const userStore = useUserStore();
        userStore.profile = {
            id: '123e4567-e89b-12d3-a456-426614174002',
            organization_id: '123e4567-e89b-12d3-a456-426614174001',
        };
        center.startRealtimeSync();
        await waitFor(() => {
            expect(subscribeToTableMock).toHaveBeenCalledWith('tasks', expect.any(Function));
            expect(subscribeToTableMock).toHaveBeenCalledWith('execution_runs', expect.any(Function));
        });
        await center.submitCommand('Draft project summary');
        const taskCallback = subscriptions.get('tasks');
        taskCallback?.({
            eventType: 'UPDATE',
            new: {
                id: 'task-flow-1',
                status: 'processing',
                result: {},
            },
        });
        taskCallback?.({
            eventType: 'UPDATE',
            new: {
                id: 'task-flow-1',
                status: 'done',
                result: {
                    summary: 'Status report generated successfully.',
                },
            },
        });
        await waitFor(() => {
            const assistantEntry = center.timeline.value.find((entry) => entry.taskId === 'task-flow-1');
            expect(assistantEntry?.state).toBe('done');
            expect(assistantEntry?.content).toContain('Status report generated successfully.');
        });
        center.stopRealtimeSync();
    });
    it('attaches execution run details to the queued assistant timeline entry', async () => {
        submitTaskMock.mockResolvedValue({ id: 'task-run-1' });
        const center = useCommandCenter();
        const { useUserStore } = await import('../stores/user');
        const userStore = useUserStore();
        userStore.profile = {
            id: '123e4567-e89b-12d3-a456-426614174002',
            organization_id: '123e4567-e89b-12d3-a456-426614174001',
        };
        center.startRealtimeSync();
        await waitFor(() => {
            expect(subscribeToTableMock).toHaveBeenCalledWith('execution_runs', expect.any(Function));
        });
        await center.submitCommand('Draft project summary');
        const runCallback = subscriptions.get('execution_runs');
        runCallback?.({
            eventType: 'UPDATE',
            new: {
                id: 'run-1',
                task_id: 'task-run-1',
                organization_id: '123e4567-e89b-12d3-a456-426614174001',
                status: 'processing',
                current_step_key: 'gmail-step',
                current_worker_type: 'gmail',
                ledger_markdown: '# Execution Run Ledger',
                last_error: null,
                updated_at: new Date().toISOString(),
                plan_json: {
                    summary: 'Draft and send the weekly update',
                    replan_count: 1,
                    steps: [
                        { worker_type: 'drive', status: 'completed' },
                        { worker_type: 'gmail', status: 'in_progress' },
                    ],
                },
            },
        });
        await waitFor(() => {
            const assistantEntry = center.timeline.value.find((entry) => entry.taskId === 'task-run-1');
            expect(assistantEntry?.executionRun).toMatchObject({
                status: 'processing',
                currentStepKey: 'gmail-step',
                currentWorkerType: 'gmail',
                replanCount: 1,
                completedSteps: 1,
                totalSteps: 2,
            });
            expect(assistantEntry?.content).toContain('Processing with gmail worker');
            expect(center.activeExecutionRun.value?.executionRun?.id).toBe('run-1');
        });
    });
});
//# sourceMappingURL=useCommandCenter.spec.js.map
