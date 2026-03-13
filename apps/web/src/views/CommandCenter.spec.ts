import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

import CommandCenter from './CommandCenter.vue';

const confirmRequireMock = vi.fn();
const startRealtimeSyncMock = vi.fn();
const stopRealtimeSyncMock = vi.fn();
const submitCommandMock = vi.fn(async (_message: string, options?: { force?: boolean }) => {
  if (!options?.force) {
    return {
      requiresConfirmation: true,
      queued: false,
      highRisk: true,
    };
  }

  return {
    requiresConfirmation: false,
    queued: true,
    highRisk: true,
  };
});

vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => ({
    require: confirmRequireMock,
  }),
}));

vi.mock('../composables/useCommandCenter', () => ({
  useCommandCenter: () => ({
    activeExecutionRun: ref(null),
    timeline: ref([
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Welcome to Command Center',
        createdAt: new Date().toISOString(),
        state: 'done',
      },
    ]),
    isSubmitting: ref(false),
    submitCommand: submitCommandMock,
    startRealtimeSync: startRealtimeSyncMock,
    stopRealtimeSync: stopRealtimeSyncMock,
  }),
}));

const CommandComposerStub = defineComponent({
  name: 'CommandComposerStub',
  emits: ['submit'],
  template: '<button data-testid="submit" @click="$emit(\'submit\', \'Send email update\')">submit</button>',
});

const CommandTimelineStub = defineComponent({
  name: 'CommandTimelineStub',
  props: {
    items: {
      type: Array,
      required: true,
    },
  },
  template: '<div>Conversation {{ items.length }}</div>',
});

describe('CommandCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens high-risk confirmation before forced enqueue', async () => {
    const wrapper = mount(CommandCenter, {
      global: {
        stubs: {
          CommandComposer: CommandComposerStub,
          CommandTimeline: CommandTimelineStub,
          ConfirmDialog: true,
        },
      },
    });

    expect(wrapper.text()).toContain('Command Center');
    expect(wrapper.text()).toContain('Conversation');
    expect(startRealtimeSyncMock).toHaveBeenCalledTimes(1);

    await wrapper.get('[data-testid="submit"]').trigger('click');

    expect(submitCommandMock).toHaveBeenCalledWith('Send email update');
    expect(confirmRequireMock).toHaveBeenCalledTimes(1);

    const confirmConfig = confirmRequireMock.mock.calls[0][0] as { accept: () => void };
    confirmConfig.accept();

    expect(submitCommandMock).toHaveBeenCalledWith('Send email update', { force: true });

    wrapper.unmount();
    expect(stopRealtimeSyncMock).toHaveBeenCalledTimes(1);
  });
});
