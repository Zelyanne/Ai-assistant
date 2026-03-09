<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import ConfirmDialog from 'primevue/confirmdialog';
import { useConfirm } from 'primevue/useconfirm';

import CommandComposer from '../components/command/CommandComposer.vue';
import CommandTimeline from '../components/command/CommandTimeline.vue';
import { useCommandCenter } from '../composables/useCommandCenter';

const confirm = useConfirm();
const { timeline, isSubmitting, submitCommand, startRealtimeSync, stopRealtimeSync } = useCommandCenter();

onMounted(() => {
  startRealtimeSync();
});

onUnmounted(() => {
  stopRealtimeSync();
});

async function onSubmitCommand(message: string): Promise<void> {
  const initialResult = await submitCommand(message);
  if (!initialResult.requiresConfirmation) return;

  confirm.require({
    message: 'This command appears high-risk. Confirm before queuing execution?',
    header: 'Confirm High-Risk Action',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    accept: () => {
      void submitCommand(message, { force: true });
    },
  });
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-4 px-2 py-2 md:gap-6 md:px-0">
    <header class="space-y-2">
      <h1 class="text-2xl font-bold text-executive-primary md:text-3xl">
        Command Center
      </h1>
      <p class="text-sm text-slate-500 md:text-base">
        Use natural language to prepare and execute delegated operational actions.
      </p>
    </header>

    <CommandTimeline :items="timeline" />
    <CommandComposer
      :disabled="isSubmitting"
      @submit="onSubmitCommand"
    />
    <ConfirmDialog />
  </div>
</template>
