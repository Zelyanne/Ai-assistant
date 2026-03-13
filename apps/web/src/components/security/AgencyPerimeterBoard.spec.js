import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import AgencyPerimeterBoard from './AgencyPerimeterBoard.vue';
vi.mock('primevue/usetoast', () => ({
    useToast: () => ({
        add: () => undefined,
    }),
}));
let selectData = [];
let insertResult = { data: null, error: null };
let updateError = null;
const updateCalls = [];
const insertCalls = [];
vi.mock('../../services/supabase', () => ({
    supabase: {
        from: vi.fn((_table) => {
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => Promise.resolve({ data: selectData, error: null })),
                })),
                insert: vi.fn((payload) => {
                    insertCalls.push(payload);
                    return {
                        select: vi.fn(() => ({
                            single: vi.fn(() => Promise.resolve(insertResult)),
                        })),
                    };
                }),
                update: vi.fn((payload) => ({
                    eq: vi.fn((_field, id) => {
                        updateCalls.push({ payload, id });
                        return Promise.resolve({ error: updateError });
                    }),
                })),
                delete: vi.fn(() => ({
                    eq: vi.fn(() => Promise.resolve({ error: null })),
                })),
            };
        }),
    },
}));
describe('AgencyPerimeterBoard', () => {
    beforeEach(() => {
        selectData = [];
        insertResult = { data: null, error: null };
        updateError = null;
        updateCalls.splice(0, updateCalls.length);
        insertCalls.splice(0, insertCalls.length);
    });
    const mountBoard = (canWrite) => {
        return mount(AgencyPerimeterBoard, {
            props: {
                organizationId: 'org-1',
                canWrite,
            },
            global: {
                plugins: [PrimeVue],
            },
        });
    };
    it('groups and sorts topics by tier', async () => {
        selectData = [
            { id: '1', organization_id: 'org-1', topic_name: 'Zeta', tier: 'Public' },
            { id: '2', organization_id: 'org-1', topic_name: 'Alpha', tier: 'Public' },
            { id: '3', organization_id: 'org-1', topic_name: 'General', tier: 'Controlled' },
            { id: '4', organization_id: 'org-1', topic_name: 'Bravo', tier: 'Controlled' },
            { id: '5', organization_id: 'org-1', topic_name: 'Ops', tier: 'Restricted' },
        ];
        const wrapper = mountBoard(true);
        await flushPromises();
        const publicText = wrapper.get('[data-testid="tier-column-Public"]').text();
        expect(publicText.indexOf('Alpha')).toBeLessThan(publicText.indexOf('Zeta'));
        const controlledText = wrapper.get('[data-testid="tier-column-Controlled"]').text();
        expect(controlledText.indexOf('General')).toBeLessThan(controlledText.indexOf('Bravo'));
    });
    it('drag/drop moves a topic and persists tier update', async () => {
        selectData = [
            { id: 't-1', organization_id: 'org-1', topic_name: 'Project Logistics', tier: 'Restricted' },
            { id: 'gen', organization_id: 'org-1', topic_name: 'General', tier: 'Restricted' },
        ];
        const wrapper = mountBoard(true);
        await flushPromises();
        await wrapper.get('[data-testid="topic-card-t-1"]').trigger('dragstart', {
            dataTransfer: { setData: vi.fn(), effectAllowed: 'move' },
        });
        await wrapper.get('[data-testid="tier-dropzone-Public"]').trigger('drop', {
            preventDefault: () => undefined,
            dataTransfer: { getData: () => '' },
        });
        await flushPromises();
        expect(updateCalls).toEqual([{ payload: { tier: 'Public' }, id: 't-1' }]);
        const publicColumn = wrapper.get('[data-testid="tier-column-Public"]').text();
        expect(publicColumn).toContain('Project Logistics');
    });
    it('surfaces unique constraint failures as a friendly error', async () => {
        selectData = [
            { id: 'gen', organization_id: 'org-1', topic_name: 'General', tier: 'Restricted' },
        ];
        insertResult = { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
        const wrapper = mountBoard(true);
        await flushPromises();
        await wrapper.get('[data-testid="new-topic-input"]').setValue('Project Logistics');
        await wrapper.get('[data-testid="new-topic-submit"]').trigger('click');
        await flushPromises();
        expect(wrapper.get('[data-testid="inline-error"]').text()).toContain('already exists');
    });
    it('switches to read-only mode when a write is blocked by RLS', async () => {
        selectData = [
            { id: 't-1', organization_id: 'org-1', topic_name: 'Project Logistics', tier: 'Restricted' },
            { id: 'gen', organization_id: 'org-1', topic_name: 'General', tier: 'Restricted' },
        ];
        updateError = { message: 'Forbidden', status: 403 };
        const wrapper = mountBoard(true);
        await flushPromises();
        await wrapper.get('[data-testid="topic-card-t-1"]').trigger('dragstart');
        await wrapper.get('[data-testid="tier-dropzone-Public"]').trigger('drop', {
            preventDefault: () => undefined,
            dataTransfer: { getData: () => '' },
        });
        await flushPromises();
        expect(wrapper.find('[data-testid="read-only-banner"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="tier-column-Restricted"]').text()).toContain('Project Logistics');
    });
    it('prompts non-CEO users when default General topic is missing', async () => {
        selectData = [];
        const wrapper = mountBoard(false);
        await flushPromises();
        expect(wrapper.get('[data-testid="read-only-banner"]').text()).toContain('default topic "General" is missing');
        expect(insertCalls).toHaveLength(0);
    });
    it('auto-creates General as Restricted for CEO when missing', async () => {
        selectData = [];
        insertResult = {
            data: { id: 'gen', organization_id: 'org-1', topic_name: 'General', tier: 'Restricted' },
            error: null,
        };
        const wrapper = mountBoard(true);
        await flushPromises();
        expect(insertCalls).toHaveLength(1);
        expect(wrapper.get('[data-testid="tier-column-Restricted"]').text()).toContain('General');
    });
});
//# sourceMappingURL=AgencyPerimeterBoard.spec.js.map