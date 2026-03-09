import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

import CommandComposer from './CommandComposer.vue';

describe('CommandComposer', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  function mountView() {
    return mount(CommandComposer, {
      global: {
        plugins: [PrimeVue],
      },
    });
  }

  it('emits submit and clears draft on Enter', async () => {
    const wrapper = mountView();

    const textarea = wrapper.get('textarea');
    await textarea.setValue('Run the relancing update');

    await textarea.trigger('keydown', { key: 'Enter', shiftKey: false });
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('submit')).toEqual([['Run the relancing update']]);
    expect((textarea.element as HTMLTextAreaElement).value).toBe('');
  });

  it('does not emit submit on Shift+Enter', async () => {
    const wrapper = mountView();

    const textarea = wrapper.get('textarea');
    await textarea.setValue('Line 1');

    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true });

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect((textarea.element as HTMLTextAreaElement).value).toBe('Line 1');
  });

  it('does not emit submit on empty input', async () => {
    const wrapper = mountView();

    const textarea = wrapper.get('textarea');
    await textarea.setValue('   ');

    await textarea.trigger('keydown', { key: 'Enter', shiftKey: false });

    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('associates visible label with the textarea', () => {
    const wrapper = mountView();

    const label = wrapper.get('label');
    const textarea = wrapper.get('textarea');

    expect(label.attributes('for')).toBe(textarea.attributes('id'));
  });
});
