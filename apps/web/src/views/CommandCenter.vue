<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import ConfirmDialog from 'primevue/confirmdialog';
import { useConfirm } from 'primevue/useconfirm';

import CommandComposer from '../components/command/CommandComposer.vue';
import CommandTimeline from '../components/command/CommandTimeline.vue';
import { useCommandCenter } from '../composables/useCommandCenter';

const confirm = useConfirm();
const { activeExecutionRun, timeline, isSubmitting, submitCommand, startRealtimeSync, stopRealtimeSync } = useCommandCenter();

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

    <section
      v-if="activeExecutionRun?.executionRun"
      class="rounded-executive border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 px-4 py-4 text-slate-50 shadow-sm"
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

    <CommandTimeline :items="timeline" />
    <CommandComposer
      :disabled="isSubmitting"
      @submit="onSubmitCommand"
    />
    <ConfirmDialog />
  </div>
</template>
