import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import AppSidebar from './AppSidebar.vue';
const routeMock = vi.fn(() => ({ path: '/dashboard' }));
vi.mock('vue-router', () => ({
    useRoute: () => routeMock(),
}));
describe('AppSidebar', () => {
    it('renders Command Center navigation entry', () => {
        const wrapper = mount(AppSidebar, {
            global: {
                stubs: {
                    RouterLink: {
                        props: ['to'],
                        template: '<a :data-to="to"><slot /></a>',
                    },
                },
            },
        });
        const links = wrapper.findAll('a');
        const commandCenterLink = links.find((link) => link.text().includes('Command Center'));
        expect(commandCenterLink).toBeDefined();
        expect(commandCenterLink?.attributes('data-to')).toBe('/dashboard/command-center');
    });
});
//# sourceMappingURL=AppSidebar.spec.js.map