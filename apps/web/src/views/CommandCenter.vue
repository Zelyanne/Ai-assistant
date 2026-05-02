<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import Button from 'primevue/button';
import Drawer from 'primevue/drawer';

import CommandComposer from '../components/command/CommandComposer.vue';
import CommandTimeline from '../components/command/CommandTimeline.vue';
import ConversationList from '../components/command/ConversationList.vue';
import { useCommandCenter } from '../composables/useCommandCenter';

const mobileChatsVisible = ref(false);

const {
  activeExecutionRun,
  timeline,
  conversations,
  activeConversationId,
  loadConversations,
  switchConversation,
  isSubmitting,
  startNewDiscussion,
  submitCommand,
  startRealtimeSync,
  stopRealtimeSync,
} = useCommandCenter();

onMounted(() => {
  void loadConversations();
  startRealtimeSync();
});

onUnmounted(() => {
  stopRealtimeSync();
});

async function onSubmitCommand(message: string): Promise<void> {
  await submitCommand(message);
}

async function onStartNewDiscussion(): Promise<void> {
  await startNewDiscussion();
  mobileChatsVisible.value = false;
}

async function onSelectConversation(conversationId: string): Promise<void> {
  await switchConversation(conversationId);
  mobileChatsVisible.value = false;
}
</script>

<template>
  <div class="mx-auto flex w-full flex-col gap-4 px-1 py-2 md:gap-6 md:px-0">
    <header class="flex items-start justify-between gap-4 px-1">
      <div class="space-y-2">
        <h1 class="text-2xl font-bold tracking-tight text-executive-primary md:text-3xl">
          Assistant
        </h1>
        <p class="text-sm text-slate-500 md:text-base">
          Chat with your assistant for safe, delegated Google Workspace actions.
        </p>
      </div>

      <div class="flex items-center gap-2 md:hidden">
        <Button
          icon="pi pi-comments"
          severity="secondary"
          text
          aria-label="Open chat list"
          :aria-controls="mobileChatsVisible ? 'command-center-chats' : undefined"
          :aria-expanded="mobileChatsVisible"
          @click="mobileChatsVisible = true"
        />
        <Button
          icon="pi pi-plus"
          severity="contrast"
          aria-label="New chat"
          :disabled="isSubmitting"
          @click="onStartNewDiscussion"
        />
      </div>
    </header>

    <Drawer
      id="command-center-chats"
      v-model:visible="mobileChatsVisible"
      header="Chats"
      class="!w-full sm:!w-96"
      role="region"
    >
      <ConversationList
        :conversations="conversations"
        :active-conversation-id="activeConversationId"
        :disabled="isSubmitting"
        @new-chat="onStartNewDiscussion"
        @select-conversation="onSelectConversation"
      />
    </Drawer>

    <div class="grid min-h-0 grid-cols-1 gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
      <aside class="hidden min-h-0 md:block">
        <ConversationList
          :conversations="conversations"
          :active-conversation-id="activeConversationId"
          :disabled="isSubmitting"
          @new-chat="onStartNewDiscussion"
          @select-conversation="onSelectConversation"
        />
      </aside>

      <section class="min-h-0">
        <section
          v-if="activeExecutionRun?.executionRun"
          class="mb-4 rounded-executive border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 px-4 py-4 text-slate-50 shadow-sm"
        >
          <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                Active orchestration
              </p>
              <h2 class="text-lg font-semibold md:text-xl">
                {{ activeExecutionRun.executionRun.summary || 'Planner-led workspace run' }}
              </h2>
              <p class="text-sm text-slate-200">
                {{ activeExecutionRun.content }}
              </p>
            </div>

            <div class="grid gap-2 text-sm text-slate-200 md:min-w-[220px]">
              <div>
                <span class="text-slate-400">Status:</span>
                {{ activeExecutionRun.executionRun.status }}
              </div>
              <div v-if="activeExecutionRun.executionRun.currentWorkerType">
                <span class="text-slate-400">Worker:</span>
                {{ activeExecutionRun.executionRun.currentWorkerType }}
              </div>
              <div v-if="activeExecutionRun.executionRun.currentStepKey">
                <span class="text-slate-400">Step:</span>
                {{ activeExecutionRun.executionRun.currentStepKey }}
              </div>
            </div>
          </div>
        </section>

        <div class="flex min-h-0 flex-col gap-3">
          <CommandTimeline :items="timeline" />

          <div class="sticky bottom-0 z-10">
            <CommandComposer
              variant="chat"
              :disabled="isSubmitting"
              @submit="onSubmitCommand"
            />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
