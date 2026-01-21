import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import OutcomeCard from './OutcomeCard.vue';
import PrimeVue from 'primevue/config';
describe('OutcomeCard', () => {
    const mountComponent = (props) => {
        return mount(OutcomeCard, {
            props,
            global: {
                plugins: [PrimeVue]
            }
        });
    };
    it('renders correctly with "done" status (Silent Win)', () => {
        const wrapper = mountComponent({
            title: 'Email Sent',
            summary: 'Automatically replied to inquiry.',
            status: 'done',
            agencyTier: 'Public',
            timestamp: '10:00 AM'
        });
        expect(wrapper.text()).toContain('Email Sent');
        expect(wrapper.text()).toContain('Silent Win');
        expect(wrapper.find('.p-badge-success').exists()).toBe(true);
        expect(wrapper.element.style.borderLeft).toContain('rgb(5, 150, 105)');
    });
    it('renders correctly with "escalation" status', () => {
        const wrapper = mountComponent({
            title: 'Urgent Request',
            summary: 'Decision needed on contract.',
            status: 'escalation',
            agencyTier: 'Restricted',
            timestamp: '11:00 AM'
        });
        expect(wrapper.text()).toContain('Urgent Request');
        expect(wrapper.text()).toContain('Escalation');
        expect(wrapper.find('.p-badge-warn').exists()).toBe(true);
        expect(wrapper.element.style.borderLeft).toContain('rgb(217, 119, 6)');
    });
    it('renders correctly with "insight" status', () => {
        const wrapper = mountComponent({
            title: 'Daily Digest',
            summary: 'Market trends updated.',
            status: 'insight',
            timestamp: '09:00 AM'
        });
        expect(wrapper.text()).toContain('Daily Digest');
        expect(wrapper.text()).toContain('Insight');
        expect(wrapper.find('.p-badge-info').exists()).toBe(true);
    });
    it('displays the correct Agency Tier badge', () => {
        const wrapper = mountComponent({
            title: 'Test',
            summary: 'Test',
            status: 'done',
            agencyTier: 'Controlled',
            timestamp: '12:00 PM'
        });
        expect(wrapper.text()).toContain('Controlled');
    });
});
//# sourceMappingURL=OutcomeCard.spec.js.map