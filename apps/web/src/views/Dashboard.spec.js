import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import Dashboard from './Dashboard.vue';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { useUserStore } from '../stores/user';
import { supabase } from '../services/supabase';

vi.mock('primevue/usetoast', () => ({
    useToast: () => ({
        add: () => undefined,
        removeGroup: () => undefined,
    }),
}));

vi.mock('primevue/useconfirm', () => ({
    useConfirm: () => ({
        require: () => undefined,
    }),
}));
vi.mock('../services/supabase', () => ({
    supabase: {
        from: vi.fn((table) => {
            if (table === 'morning_briefs') {
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
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        order: vi.fn(() => ({
                            limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
                        }))
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
describe('Dashboard.vue', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
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
            if (table === 'morning_briefs') {
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
            if (table === 'morning_briefs') {
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
    it('renders correctly and fetches data on mount', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1', full_name: 'Alexis CEO' };
        const wrapper = mountView();
        expect(wrapper.text()).toContain('Alexis');
        expect(supabase.from).toHaveBeenCalledWith('ingested_threads');
        expect(supabase.from).toHaveBeenCalledWith('tasks');
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
            if (table === 'morning_briefs') {
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
            if (table === 'morning_briefs') {
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
});
//# sourceMappingURL=Dashboard.spec.js.map
