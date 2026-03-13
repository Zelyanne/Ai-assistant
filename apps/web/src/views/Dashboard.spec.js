import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import Dashboard from './Dashboard.vue';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { buildStatusReportPayload } from '@ai-assistant/shared';
import { useUserStore } from '../stores/user';
import { supabase } from '../services/supabase';
const confirmRequireMock = vi.fn();
const tasksInsertMock = vi.fn(() => Promise.resolve({ error: null }));
vi.mock('primevue/usetoast', () => ({
    useToast: () => ({
        add: () => undefined,
        removeGroup: () => undefined,
    }),
}));
vi.mock('primevue/useconfirm', () => ({
    useConfirm: () => ({
        require: confirmRequireMock,
    }),
}));
vi.mock('../services/supabase', () => ({
    supabase: {
        from: vi.fn((table) => {
            if (table === 'morning_briefs' || table === 'status_reports') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            order: vi.fn(() => ({
                                limit: vi.fn(() => ({
                                    single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
                                }))
                            }))
                        }))
                    }))
                };
            }
            const defaultSelectResult = Promise.resolve({ data: [], error: null });
            const defaultSingleResult = Promise.resolve({ data: { status: null }, error: null });
            const defaultMaybeSingleResult = Promise.resolve({ data: { user_id: 'user-1' }, error: null });
            const insert = table === 'tasks' ? tasksInsertMock : vi.fn(() => Promise.resolve({ error: null }));
            return {
                insert,
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn(() => defaultMaybeSingleResult),
                        })),
                        maybeSingle: vi.fn(() => defaultMaybeSingleResult),
                        single: vi.fn(() => defaultSingleResult),
                        order: vi.fn(() => ({
                            limit: vi.fn(() => defaultSelectResult)
                        })),
                        limit: vi.fn(() => defaultSelectResult)
                    }))
                }))
            };
        }),
        channel: vi.fn(() => ({
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn().mockReturnThis(),
        })),
        removeChannel: vi.fn(),
    },
}));
vi.mock('../composables/useAgent', () => ({
    useAgent: vi.fn(() => ({
        subscribeToTable: vi.fn(() => vi.fn()),
    })),
}));
const defaultSupabaseFromImpl = supabase.from.getMockImplementation();
describe('Dashboard.vue', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        supabase.from.mockImplementation(defaultSupabaseFromImpl);
    });
    const mountView = () => {
        return mount(Dashboard, {
            global: {
                plugins: [PrimeVue],
                stubs: {
                    OutcomeCard: true,
                    Button: true,
                    Card: {
                        template: '<div><slot name="title" /><slot name="content" /><slot /></div>'
                    },
                    Drawer: {
                        props: ['visible'],
                        template: '<div v-if="visible"><slot name="header" /><slot /></div>',
                    },
                    Tabs: { template: '<div><slot /></div>' },
                    TabList: { template: '<div><slot /></div>' },
                    Tab: { template: '<button><slot /></button>' },
                    TabPanels: { template: '<div><slot /></div>' },
                    TabPanel: { template: '<div><slot /></div>' },
                    Badge: {
                        props: ['value'],
                        template: '<span>{{ value }}<slot /></span>'
                    },
                    ReasoningTracePane: true
                }
            }
        });
    };
    it('renders ReasoningTracePane in all states (regression check for broken v-if chain)', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1' };
        // 1. Loading state
        const wrapper = mountView();
        expect(wrapper.findComponent({ name: 'ReasoningTracePane' }).exists()).toBe(true);
        // 2. Data state
        supabase.from.mockImplementation((table) => {
            if (table === 'morning_briefs' || table === 'status_reports') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            order: vi.fn(() => ({
                                limit: vi.fn(() => ({
                                    single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
                                }))
                            }))
                        }))
                    }))
                };
            }
            if (table === 'workspace_integrations') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                maybeSingle: vi.fn(() => Promise.resolve({ data: { user_id: 'user-1' }, error: null }))
                            }))
                        }))
                    }))
                };
            }
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        order: vi.fn(() => ({
                            limit: vi.fn(() => Promise.resolve({
                                data: table === 'tasks' ? [{ id: '1', status: 'done', created_at: new Date().toISOString(), domain_action: 'test' }] : [],
                                error: null
                            }))
                        }))
                    }))
                }))
            };
        });
        await wrapper.vm.$nextTick(); // Wait for fetch
        await vi.waitFor(() => {
            expect(wrapper.findComponent({ name: 'ReasoningTracePane' }).exists()).toBe(true);
        });
        // 3. Empty state
        // Create a NEW wrapper to ensure clean state and fresh onMounted call
        supabase.from.mockImplementation((table) => {
            if (table === 'morning_briefs' || table === 'status_reports') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            order: vi.fn(() => ({
                                limit: vi.fn(() => ({
                                    single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
                                }))
                            }))
                        }))
                    }))
                };
            }
            if (table === 'workspace_integrations') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                maybeSingle: vi.fn(() => Promise.resolve({ data: { user_id: 'user-1' }, error: null }))
                            }))
                        }))
                    }))
                };
            }
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        order: vi.fn(() => ({
                            limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
                        }))
                    }))
                }))
            };
        });
        const emptyWrapper = mountView();
        // Wait for the fetch cycle to complete
        await emptyWrapper.vm.$nextTick();
        await vi.waitFor(() => {
            // Verify text content to confirm we are actually in the empty state
            expect(emptyWrapper.text()).toContain('All Quiet');
            // Verify the component still exists (meaning it wasn't hidden/broken by the v-if chain)
            expect(emptyWrapper.findComponent({ name: 'ReasoningTracePane' }).exists()).toBe(true);
        });
    });
    it('treats thread.action as a high-risk bulk automation action', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1' };
        const wrapper = mountView();
        wrapper.vm.threads = [
            {
                id: 'thread-1',
                subject: 'Subject',
                summary: 'Summary',
                summary_json: null,
                external_id: 'ext-1',
                classification: { matches: [{ topic: 'Scheduling', reason: 'x', priority_score: 1 }] },
                metadata: { subject: 'Subject' },
                created_at: new Date().toISOString(),
            },
        ];
        wrapper.vm.selectedItemIds = ['thread-1'];
        await wrapper.vm.automateTasks();
        expect(confirmRequireMock).toHaveBeenCalledTimes(1);
    });
    it('disables bulk automation when Emergency Brake is engaged', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1' };
        supabase.from.mockImplementation((table) => {
            if (table === 'org_safety_controls') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn(() => Promise.resolve({ data: { emergency_brake_enabled: true }, error: null })),
                        })),
                    })),
                };
            }
            return defaultSupabaseFromImpl(table);
        });
        const wrapper = mountView();
        await vi.waitFor(() => {
            expect(wrapper.vm.isEmergencyBrakeEngaged).toBe(true);
        });
        wrapper.vm.threads = [
            {
                id: 'thread-1',
                subject: 'Subject',
                summary: 'Summary',
                summary_json: null,
                external_id: 'ext-1',
                classification: { matches: [{ topic: 'Scheduling', reason: 'x', priority_score: 1 }] },
                metadata: { subject: 'Subject' },
                created_at: new Date().toISOString(),
            },
        ];
        wrapper.vm.selectedItemIds = ['thread-1'];
        await wrapper.vm.automateTasks();
        expect(confirmRequireMock).not.toHaveBeenCalled();
        expect(tasksInsertMock).not.toHaveBeenCalled();
    });
    it('includes topic when inserting a thread.action task for a thread item', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1' };
        const wrapper = mountView();
        await wrapper.vm.executeBulkAutomation([
            {
                id: 'thread-1',
                type: 'thread',
                title: 'Subject',
                summary: 'Summary',
                externalId: 'ext-1',
                status: 'insight',
                agencyTier: 'Public',
                timestamp: 'now',
                original: { created_at: new Date().toISOString() },
                topics: ['Scheduling', 'Other'],
            },
        ]);
        expect(tasksInsertMock).toHaveBeenCalledTimes(1);
        expect(tasksInsertMock).toHaveBeenCalledWith(expect.objectContaining({
            domain_action: 'thread.action',
            topic: 'Scheduling',
        }));
    });
    it('renders correctly and fetches data on mount', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1', full_name: 'Alexis CEO' };
        const wrapper = mountView();
        expect(wrapper.text()).toContain('Alexis');
        expect(supabase.from).toHaveBeenCalledWith('ingested_threads');
        expect(supabase.from).toHaveBeenCalledWith('tasks');
    });
    it('maps relancing.update blocker results into blocker filters', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1' };
        const wrapper = mountView();
        wrapper.vm.tasks = [
            {
                id: 'relancing-task-1',
                domain_action: 'relancing.update',
                status: 'done',
                payload: {},
                result: {
                    summary: 'Blocker recorded and relancing cycle paused.',
                    intents: ['blocker_report'],
                    blocker_paused: true,
                },
                created_at: new Date().toISOString(),
            },
        ];
        await wrapper.vm.$nextTick();
        const outcomeItems = wrapper.vm.outcomeItems;
        expect(outcomeItems[0].topics).toContain('Blocker');
    });
    it('does not count unrelated escalations as blocker filter results', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1' };
        const wrapper = mountView();
        await vi.waitFor(() => {
            expect(wrapper.vm.loading).toBe(false);
        });
        wrapper.vm.tasks = [
            {
                id: 'escalation-task-1',
                domain_action: 'email.draft',
                status: 'escalation',
                topic: 'Finance',
                payload: {},
                result: {
                    summary: 'Needs approval',
                },
                created_at: new Date().toISOString(),
            },
            {
                id: 'relancing-task-1',
                domain_action: 'relancing.update',
                status: 'done',
                payload: {},
                result: {
                    summary: 'Blocker recorded and relancing cycle paused.',
                    intents: ['blocker_report'],
                    blocker_paused: true,
                },
                created_at: new Date().toISOString(),
            },
        ];
        await wrapper.vm.$nextTick();
        expect(wrapper.vm.filterCounts.blockers).toBe(1);
        wrapper.vm.activeFilter = 'blockers';
        await wrapper.vm.$nextTick();
        expect(wrapper.vm.briefingItems.map((item) => item.id)).toEqual(['relancing-task-1']);
    });
    it('maps relancing.update resume results into resumed topic chips', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1' };
        const wrapper = mountView();
        wrapper.vm.tasks = [
            {
                id: 'relancing-task-resume',
                domain_action: 'relancing.update',
                status: 'done',
                payload: {},
                result: {
                    summary: 'Relancing update resumed the cycle for "Q2 Launch".',
                    intents: ['status_update'],
                    blocker_resumed: true,
                },
                created_at: new Date().toISOString(),
            },
        ];
        await wrapper.vm.$nextTick();
        const outcomeItems = wrapper.vm.outcomeItems;
        expect(outcomeItems[0].topics).toContain('Resumed');
    });
    it('calculates momentum metrics correctly', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1' };
        // Mock data
        const mockTasks = [
            { id: '1', status: 'done', created_at: new Date().toISOString(), domain_action: 'email.send' },
            { id: '2', status: 'done', created_at: new Date().toISOString(), domain_action: 'calendar.create' },
            { id: '3', status: 'escalation', created_at: new Date().toISOString(), domain_action: 'email.draft' }
        ];
        const mockThreads = [
            { id: '4', metadata: { is_escalation: true }, created_at: new Date().toISOString() }
        ];
        supabase.from.mockImplementation((table) => {
            if (table === 'morning_briefs' || table === 'status_reports') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            order: vi.fn(() => ({
                                limit: vi.fn(() => ({
                                    single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
                                }))
                            }))
                        }))
                    }))
                };
            }
            if (table === 'workspace_integrations') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                maybeSingle: vi.fn(() => Promise.resolve({ data: { user_id: 'user-1' }, error: null }))
                            }))
                        }))
                    }))
                };
            }
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        order: vi.fn(() => ({
                            limit: vi.fn(() => Promise.resolve({
                                data: table === 'tasks' ? mockTasks : mockThreads,
                                error: null
                            }))
                        }))
                    }))
                }))
            };
        });
        const wrapper = mountView();
        // Wait for async data fetch
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('2'); // Wins
            expect(wrapper.text()).toContain('30m saved'); // Momentum
        });
    });
    it('displays empty state when no data is found', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1' };
        supabase.from.mockImplementation((table) => {
            if (table === 'morning_briefs' || table === 'status_reports') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            order: vi.fn(() => ({
                                limit: vi.fn(() => ({
                                    single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
                                }))
                            }))
                        }))
                    }))
                };
            }
            if (table === 'workspace_integrations') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                maybeSingle: vi.fn(() => Promise.resolve({ data: { user_id: 'user-1' }, error: null }))
                            }))
                        }))
                    }))
                };
            }
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        order: vi.fn(() => ({
                            limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
                        }))
                    }))
                }))
            };
        });
        const wrapper = mountView();
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('All Quiet');
        });
    });
    it('renders morning brief without leaking UUIDs into prose and shows Sources row', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1', full_name: 'Alexis CEO' };
        const uuid = '123e4567-e89b-12d3-a456-426614174000';
        const mockBrief = {
            id: 'brief-1',
            organization_id: 'org-1',
            user_id: 'user-1',
            generated_at: new Date().toISOString(),
            summary_text: `BLUF sentence.\n\nBody mentions ${uuid} inline.`,
            blockers: [],
            risks: [],
            topic_deep_dives: [],
            metadata: { source_ids: [uuid] },
            is_read: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        supabase.from.mockImplementation((table) => {
            if (table === 'morning_briefs' || table === 'status_reports') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            order: vi.fn(() => ({
                                limit: vi.fn(() => ({
                                    single: vi.fn(() => Promise.resolve({ data: mockBrief, error: null }))
                                }))
                            }))
                        }))
                    }))
                };
            }
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        order: vi.fn(() => ({
                            limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
                        }))
                    }))
                }))
            };
        });
        const wrapper = mountView();
        await vi.waitFor(() => {
            const text = wrapper.text();
            expect(text).toContain('Morning Brief');
            expect(text).toContain('Sources');
            expect(text).not.toContain(uuid);
            expect(text).toContain('123e4567...');
        });
    });
    it('queues email.send task with approval metadata from escalation draft', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1' };
        const wrapper = mountView();
        wrapper.vm.selectedItem = {
            id: 'task-esc-1',
            type: 'task',
            title: 'Thread Action',
            summary: 'Needs approval',
            status: 'escalation',
            agencyTier: 'Controlled',
            timestamp: 'now',
            original: {
                id: 'task-esc-1',
                topic: 'Finance',
                domain_action: 'thread.action',
                status: 'escalation',
                payload: {},
                result: {},
                created_at: new Date().toISOString(),
            },
        };
        wrapper.vm.editableDraft = {
            to: 'owner@example.com',
            cc: '',
            bcc: '',
            subject: 'Re: Finance update',
            body: 'Approved response',
            body_format: 'plain',
            thread_external_id: 'gmail-thread-1',
            thread_id: 'thread-1',
        };
        await wrapper.vm.queueApprovedSend();
        expect(tasksInsertMock).toHaveBeenCalled();
        expect(tasksInsertMock).toHaveBeenCalledWith(expect.objectContaining({
            domain_action: 'email.send',
            topic: 'Finance',
            payload: expect.objectContaining({
                approved_by: 'user-1',
                source_task_id: 'task-esc-1',
                to: 'owner@example.com',
            }),
        }));
    });
    it('renders latest status report draft with highlighted critical actions', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1', full_name: 'Alexis CEO' };
        const mockReport = {
            id: 'report-1',
            organization_id: 'org-1',
            source_task_id: 'task-1',
            report_period_start: '2026-03-01T00:00:00.000Z',
            report_period_end: '2026-03-08T00:00:00.000Z',
            idempotency_key: 'status-report:org-1:2026-03-01:2026-03-08',
            narrative: 'Weekly draft narrative.',
            wins: [
                {
                    title: 'Release prep moved forward',
                    detail: 'Team completed testing checklist.',
                    source_type: 'task',
                    source_id: 'task-2',
                },
            ],
            blockers_risks: [
                {
                    title: 'Launch API blocker',
                    detail: 'Platform approval still pending.',
                    source_type: 'relancing_update',
                    source_id: 'rel-2',
                },
            ],
            commitments: [
                {
                    title: 'Weekly stakeholder update',
                    detail: 'Send recap after unblock confirmation.',
                    source_type: 'task',
                    source_id: 'task-3',
                },
            ],
            next_actions: [
                {
                    title: 'Confirm access owner',
                    detail: 'Escalate to platform lead if approval slips another day.',
                    source_type: 'task',
                    source_id: 'task-4',
                },
            ],
            critical_actions: [
                {
                    title: 'Unblock Launch dependency',
                    action_required: 'Review API access blocker with platform team.',
                    priority: 'high',
                    rationale: 'Blocker report detected.',
                    source_type: 'relancing_update',
                    source_id: 'rel-1',
                },
            ],
            metadata: { source_ids: ['rel-1'], source_links: [] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        supabase.from.mockImplementation((table) => {
            if (table === 'morning_briefs') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            order: vi.fn(() => ({
                                limit: vi.fn(() => ({
                                    single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } })),
                                })),
                            })),
                        })),
                    })),
                };
            }
            if (table === 'status_reports') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            order: vi.fn(() => ({
                                limit: vi.fn(() => ({
                                    single: vi.fn(() => Promise.resolve({ data: mockReport, error: null })),
                                })),
                            })),
                        })),
                    })),
                };
            }
            if (table === 'workspace_integrations') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                maybeSingle: vi.fn(() => Promise.resolve({ data: { user_id: 'user-1' }, error: null })),
                            })),
                        })),
                    })),
                };
            }
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        order: vi.fn(() => ({
                            limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
                        })),
                    })),
                })),
            };
        });
        const wrapper = mountView();
        await vi.waitFor(() => {
            const text = wrapper.text();
            expect(text).toContain('Status Report Draft');
            expect(text).toContain('Unblock Launch dependency');
            expect(text).toContain('Review API access blocker with platform team.');
            expect(text).toContain('Wins');
            expect(text).toContain('Release prep moved forward');
            expect(text).toContain('Blockers & Risks');
            expect(text).toContain('Launch API blocker');
            expect(text).toContain('Commitments');
            expect(text).toContain('Weekly stakeholder update');
            expect(text).toContain('Next Actions');
            expect(text).toContain('Confirm access owner');
        });
    });
    it('queues status.report task from manual dashboard trigger', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1' };
        const wrapper = mountView();
        await wrapper.vm.triggerStatusReport();
        const expectedPayload = buildStatusReportPayload('org-1', new Date(), {
            force: true,
            manualTrigger: true,
        });
        expect(tasksInsertMock).toHaveBeenCalledWith(expect.objectContaining({
            domain_action: 'status.report',
            topic: 'Relancing',
            payload: expectedPayload,
        }));
    });
    it('shows confidence context in escalation peek when metadata exists', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1' };
        const wrapper = mountView();
        wrapper.vm.selectedItem = {
            id: 'task-esc-ctx',
            type: 'task',
            title: 'Thread Action',
            summary: 'Needs review',
            status: 'escalation',
            agencyTier: 'Controlled',
            timestamp: 'now',
            original: {
                id: 'task-esc-ctx',
                topic: 'Finance',
                domain_action: 'thread.action',
                status: 'escalation',
                payload: {},
                result: {
                    escalation: true,
                    confidence_score: 0.79,
                    confidence_threshold: 0.8,
                    escalation_trigger: 'low_confidence',
                    prompt: 'Please review.',
                },
                created_at: new Date().toISOString(),
            },
        };
        wrapper.vm.isPeekOpen = true;
        await wrapper.vm.$nextTick();
        expect(wrapper.text()).toContain('Confidence Context');
        expect(wrapper.text()).toContain('Score: 79%');
        expect(wrapper.text()).toContain('Threshold: 80%');
        expect(wrapper.text()).toContain('Trigger: low confidence');
    });
    it('does not show confidence context in escalation peek when metadata is absent', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1' };
        const wrapper = mountView();
        wrapper.vm.selectedItem = {
            id: 'task-esc-no-ctx',
            type: 'task',
            title: 'Thread Action',
            summary: 'Needs review',
            status: 'escalation',
            agencyTier: 'Controlled',
            timestamp: 'now',
            original: {
                id: 'task-esc-no-ctx',
                topic: 'Finance',
                domain_action: 'thread.action',
                status: 'escalation',
                payload: {},
                result: {
                    escalation: true,
                    prompt: 'Please review.',
                },
                created_at: new Date().toISOString(),
            },
        };
        wrapper.vm.isPeekOpen = true;
        await wrapper.vm.$nextTick();
        expect(wrapper.text()).not.toContain('Confidence Context');
    });
    it('exposes relancing setup action for header button handler', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1', full_name: 'Alexis CEO' };
        const wrapper = mountView();
        await wrapper.vm.$nextTick();
        expect(typeof wrapper.vm.openRelancingSetupDialog).toBe('function');
    });
});
//# sourceMappingURL=Dashboard.spec.js.map