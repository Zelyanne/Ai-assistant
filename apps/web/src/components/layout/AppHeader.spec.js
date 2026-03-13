import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { defineComponent, nextTick } from 'vue';
import AppHeader from './AppHeader.vue';
import { useUserStore } from '../../stores/user';
import { supabase } from '../../services/supabase';
const upsertMock = vi.fn(async () => ({ error: null }));
vi.mock('../../services/supabase', () => ({
    supabase: {
        from: vi.fn((table) => {
            if (table === 'org_safety_controls') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                        })),
                    })),
                    upsert: upsertMock,
                    eq: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                    })),
                };
            }
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                    })),
                })),
            };
        }),
        channel: vi.fn(() => ({
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn().mockReturnThis(),
            unsubscribe: vi.fn(async () => undefined),
        })),
        removeChannel: vi.fn(),
    },
}));
const ToggleSwitchStub = defineComponent({
    name: 'ToggleSwitch',
    props: {
        modelValue: { type: Boolean, required: true },
        disabled: { type: Boolean, default: false },
    },
    emits: ['update:modelValue'],
    template: '<button data-testid="emergency-brake-toggle" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)">toggle</button>',
});
describe('AppHeader.vue Emergency Brake', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
    });
    async function flush() {
        await Promise.resolve();
        await nextTick();
    }
    function mountView() {
        return mount(AppHeader, {
            global: {
                plugins: [PrimeVue],
                stubs: {
                    RouterLink: { template: '<a><slot /></a>' },
                    Button: true,
                    ToggleSwitch: ToggleSwitchStub,
                },
                directives: {
                    tooltip: () => undefined,
                },
            },
        });
    }
    it('shows Brake Engaged when org_safety_controls indicates enabled=true', async () => {
        const userStore = useUserStore();
        userStore.profile = {
            id: 'user-1',
            organization_id: 'org-1',
            role: 'CEO',
        };
        const fromMock = supabase.from;
        fromMock.mockImplementation((table) => {
            if (table === 'org_safety_controls') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn(async () => ({ data: { emergency_brake_enabled: true }, error: null })),
                        })),
                    })),
                    upsert: upsertMock,
                };
            }
            return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })) };
        });
        const wrapper = mountView();
        await flush();
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Brake Engaged');
        });
    });
    it('upserts enabled=true when toggled ON', async () => {
        const userStore = useUserStore();
        userStore.profile = {
            id: 'user-1',
            organization_id: 'org-1',
            role: 'Team Member',
        };
        const wrapper = mountView();
        await flush();
        wrapper.findComponent({ name: 'ToggleSwitch' }).vm.$emit('update:modelValue', true);
        await flush();
        expect(upsertMock).toHaveBeenCalledTimes(1);
        expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
            organization_id: 'org-1',
            emergency_brake_enabled: true,
            updated_by: 'user-1',
        }), expect.objectContaining({ onConflict: 'organization_id' }));
    });
    it('disables toggling OFF for non-CEO users', async () => {
        const userStore = useUserStore();
        userStore.profile = {
            id: 'user-1',
            organization_id: 'org-1',
            role: 'Team Member',
        };
        const fromMock = supabase.from;
        fromMock.mockImplementation((table) => {
            if (table === 'org_safety_controls') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn(async () => ({ data: { emergency_brake_enabled: true }, error: null })),
                        })),
                    })),
                    upsert: upsertMock,
                };
            }
            return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })) };
        });
        const wrapper = mountView();
        await flush();
        expect(wrapper.get('[data-testid="emergency-brake-toggle"]').attributes('disabled')).toBeDefined();
    });
});
//# sourceMappingURL=AppHeader.spec.js.map