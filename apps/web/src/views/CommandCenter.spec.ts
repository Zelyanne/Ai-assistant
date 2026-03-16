import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

import CommandCenter from './CommandCenter.vue';

const startRealtimeSyncMock = vi.fn();
const stopRealtimeSyncMock = vi.fn();
const startNewDiscussionMock = vi.fn();
const submitCommandMock = vi.fn(async () => {
  return {
    requiresConfirmation: false,
    queued: true,
    highRisk: true,
  };
});

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
    startNewDiscussion: startNewDiscussionMock,
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

  it('queues the command directly from the composer', async () => {
    const wrapper = mount(CommandCenter, {
      global: {
        stubs: {
          CommandComposer: CommandComposerStub,
          CommandTimeline: CommandTimelineStub,
        },
      },
    });

    expect(wrapper.text()).toContain('Command Center');
    expect(wrapper.text()).toContain('Conversation');
    expect(startRealtimeSyncMock).toHaveBeenCalledTimes(1);

    await wrapper.get('[data-testid="submit"]').trigger('click');

    expect(submitCommandMock).toHaveBeenCalledWith('Send email update');

    wrapper.unmount();
    expect(stopRealtimeSyncMock).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh discussion from the header action', async () => {
    const wrapper = mount(CommandCenter, {
      global: {
        stubs: {
          CommandComposer: CommandComposerStub,
          CommandTimeline: CommandTimelineStub,
        },
      },
    });

    await wrapper.get('button.p-button').trigger('click');

    expect(startNewDiscussionMock).toHaveBeenCalledTimes(1);
  });
});
