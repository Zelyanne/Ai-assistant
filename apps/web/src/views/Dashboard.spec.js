import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import Dashboard from './Dashboard.vue';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { useUserStore } from '../stores/user';
import { supabase } from '../services/supabase';
vi.mock('../services/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    order: vi.fn(() => ({
                        limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
                    }))
                }))
            }))
        })),
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
                    Card: true
                }
            }
        });
    };
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
        supabase.from.mockImplementation((table) => ({
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
        }));
        const wrapper = mountView();
        // Wait for async data fetch
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('2'); // Wins
            expect(wrapper.text()).toContain('30m saved'); // Momentum
            expect(wrapper.text()).toContain('2'); // Attention (1 task + 1 thread)
        });
    });
    it('displays empty state when no data is found', async () => {
        const userStore = useUserStore();
        userStore.profile = { id: 'user-1', organization_id: 'org-1' };
        supabase.from.mockImplementation(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    order: vi.fn(() => ({
                        limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
                    }))
                }))
            }))
        }));
        const wrapper = mountView();
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('All Quiet on the Front');
        });
    });
});
//# sourceMappingURL=Dashboard.spec.js.map