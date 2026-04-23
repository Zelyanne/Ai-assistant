import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

import CommandCenter from './CommandCenter.vue';

const startRealtimeSyncMock = vi.fn();
const stopRealtimeSyncMock = vi.fn();
const startNewDiscussionMock = vi.fn();
const loadConversationsMock = vi.fn();
const switchConversationMock = vi.fn();
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
    conversations: ref([
      {
        id: 'conv-1',
        title: 'Command Center',
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]),
    activeConversationId: ref('conv-1'),
    loadConversations: loadConversationsMock,
    switchConversation: switchConversationMock,
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

const DrawerStub = defineComponent({
  name: 'DrawerStub',
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:visible'],
  template: '<div><slot /></div>',
});

const ConversationListStub = defineComponent({
  name: 'ConversationListStub',
  emits: ['newChat', 'selectConversation'],
  template: `
    <div>
      <button data-testid="new-chat" @click="$emit('newChat')">new</button>
      <button data-testid="select-conv" @click="$emit('selectConversation', 'conv-1')">select</button>
    </div>
  `,
});

describe('CommandCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queues the command directly from the composer', async () => {
    const wrapper = mount(CommandCenter, {
      global: {
        stubs: {
          Drawer: DrawerStub,
          ConversationList: ConversationListStub,
          CommandComposer: CommandComposerStub,
          CommandTimeline: CommandTimelineStub,
        },
      },
    });

    expect(wrapper.text()).toContain('Command Center');
    expect(wrapper.text()).toContain('Conversation');
    expect(loadConversationsMock).toHaveBeenCalledTimes(1);
    expect(startRealtimeSyncMock).toHaveBeenCalledTimes(1);

    await wrapper.get('[data-testid="submit"]').trigger('click');

    expect(submitCommandMock).toHaveBeenCalledWith('Send email update');

    wrapper.unmount();
    expect(stopRealtimeSyncMock).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh discussion from the conversation list', async () => {
    const wrapper = mount(CommandCenter, {
      global: {
        stubs: {
          Drawer: DrawerStub,
          ConversationList: ConversationListStub,
          CommandComposer: CommandComposerStub,
          CommandTimeline: CommandTimelineStub,
        },
      },
    });

    await wrapper.get('[data-testid="new-chat"]').trigger('click');

    expect(startNewDiscussionMock).toHaveBeenCalledTimes(1);
  });

  it('switches conversation from the conversation list', async () => {
    const wrapper = mount(CommandCenter, {
      global: {
        stubs: {
          Drawer: DrawerStub,
          ConversationList: ConversationListStub,
          CommandComposer: CommandComposerStub,
          CommandTimeline: CommandTimelineStub,
        },
      },
    });

    await wrapper.get('[data-testid="select-conv"]').trigger('click');

    expect(switchConversationMock).toHaveBeenCalledWith('conv-1');
  });
});
