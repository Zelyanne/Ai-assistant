<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';

import type { CommandState, CommandTimelineEntry } from './types';

const props = withDefaults(defineProps<{
  items: CommandTimelineEntry[];
}>(), {
  items: () => []
});

const stateLabel: Record<CommandState, string> = {
  intent_preview: 'Intent Preview',
  queued: 'Queued',
  processing: 'Processing',
  done: 'Done',
  error: 'Error',
  escalation: 'Escalation',
  paused: 'Paused'
};

const stateBadgeClass: Record<CommandState, string> = {
  intent_preview: 'bg-slate-100 text-slate-700',
  queued: 'bg-sky-100 text-sky-700',
  processing: 'bg-indigo-100 text-indigo-700',
  done: 'bg-emerald-100 text-emerald-700',
  error: 'bg-rose-100 text-rose-700',
  escalation: 'bg-amber-100 text-amber-700',
  paused: 'bg-slate-200 text-slate-700'
};

const executionStatusLabel: Record<string, string> = {
  planned: 'Plan Ready',
  processing: 'Worker Active',
  completed: 'Run Complete',
  failed: 'Run Failed',
  escalated: 'Needs Review',
  blocked: 'Blocked',
};

const executionStatusBadgeClass: Record<string, string> = {
  planned: 'bg-sky-100 text-sky-700',
  processing: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  escalated: 'bg-amber-100 text-amber-700',
  blocked: 'bg-amber-100 text-amber-700',
};

const sortedItems = computed(() => {
  return [...props.items].sort((a, b) => {
    const left = new Date(a.createdAt).getTime();
    const right = new Date(b.createdAt).getTime();
    return left - right;
  });
});

const scrollContainer = ref<HTMLElement | null>(null);
const isNearBottom = ref(true);
const showJumpToLatest = ref(false);

const NEAR_BOTTOM_THRESHOLD_PX = 120;

function distanceFromBottom(el: HTMLElement): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

function computeNearBottom(el: HTMLElement): boolean {
  return distanceFromBottom(el) <= NEAR_BOTTOM_THRESHOLD_PX;
}

function updateScrollState(): void {
  const el = scrollContainer.value;
  if (!el) return;
  isNearBottom.value = computeNearBottom(el);
  if (isNearBottom.value) showJumpToLatest.value = false;
}

function scrollToBottom(): void {
  const el = scrollContainer.value;
  if (!el) return;
  el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
  showJumpToLatest.value = false;
}

const lastItemSignature = computed(() => {
  const last = sortedItems.value[sortedItems.value.length - 1];
  if (!last) return '';
  const run = last.executionRun;
  return [
    last.id,
    last.content,
    last.state ?? '',
    run?.status ?? '',
    run?.currentStepKey ?? '',
    run?.updatedAt ?? '',
    run?.completedSteps ?? '',
    run?.totalSteps ?? '',
  ].join('|');
});

watch(
  () => sortedItems.value.length,
  async (nextCount, prevCount) => {
    if (nextCount <= prevCount) return;
    await nextTick();

    if (isNearBottom.value) {
      scrollToBottom();
    } else {
      showJumpToLatest.value = true;
    }
  }
);

watch(
  lastItemSignature,
  async (next, prev) => {
    if (!next || next === prev) return;
    await nextTick();

    if (isNearBottom.value) {
      scrollToBottom();
    } else {
      showJumpToLatest.value = true;
    }
  }
);

onMounted(() => {
  void nextTick().then(() => {
    scrollToBottom();
    updateScrollState();
  });
});

function roleLabel(role: CommandTimelineEntry['role']): string {
  if (role === 'user') return 'You';
  if (role === 'assistant') return 'Assistant';
  return 'System';
}

function formatWorkerType(workerType?: string | null): string {
  if (!workerType) return 'Planner';
  return workerType.charAt(0).toUpperCase() + workerType.slice(1);
}

function executionProgress(item: CommandTimelineEntry): string | null {
  const run = item.executionRun;
  if (!run) return null;
  if (typeof run.completedSteps !== 'number' || typeof run.totalSteps !== 'number') return null;
  return `${run.completedSteps}/${run.totalSteps} steps complete`;
}

function executionStatusText(status: string): string {
  return executionStatusLabel[status] ?? status;
}

function executionStatusClass(status: string): string {
  return executionStatusBadgeClass[status] ?? 'bg-slate-100 text-slate-700';
}
</script>

<template>
  <section
    class="rounded-executive border border-slate-200 bg-white shadow-sm"
    aria-label="Command timeline"
  >
    <header class="border-b border-slate-100 px-4 py-3">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Conversation
      </h2>
    </header>

    <div
      v-if="sortedItems.length === 0"
      class="px-4 py-8 text-center text-sm text-slate-500"
    >
      No commands yet. Start with a message below.
    </div>

    <div
      v-else
      ref="scrollContainer"
      class="relative max-h-[70vh] min-h-[18rem] overflow-y-auto px-3 py-4"
      @scroll.passive="updateScrollState"
    >
      <div
        v-if="showJumpToLatest"
        class="sticky bottom-4 z-10 flex justify-end"
      >
        <Button
          label="Jump to Latest"
          icon="pi pi-arrow-down"
          severity="secondary"
          size="small"
          class="shadow-sm"
          @click="scrollToBottom"
        />
      </div>

      <TransitionGroup
        tag="ul"
        name="timeline"
        class="space-y-3"
      >
        <li
          v-for="item in sortedItems"
          :key="item.id"
          class="flex"
          :class="item.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <article
            class="max-w-[92%] rounded-xl border px-4 py-3 md:max-w-[72%]"
            :class="item.role === 'user' ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-white'"
          >
            <div class="mb-1 flex items-center gap-2 text-xs">
              <span class="font-semibold text-slate-700">{{ roleLabel(item.role) }}</span>
              <span
                v-if="item.state"
                class="rounded-full px-2 py-0.5 font-medium"
                :class="stateBadgeClass[item.state]"
              >
                {{ stateLabel[item.state] }}
              </span>
            </div>

            <p class="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {{ item.content }}
            </p>

            <div
              v-if="item.executionRun"
              class="mt-3 space-y-3 border-t border-slate-100 pt-3"
            >
              <div class="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span
                  class="rounded-full px-2 py-0.5 font-medium"
                  :class="executionStatusClass(item.executionRun.status)"
                >
                  {{ executionStatusText(item.executionRun.status) }}
                </span>
                <span v-if="executionProgress(item)">{{ executionProgress(item) }}</span>
                <span v-if="item.executionRun.replanCount">Re-plans: {{ item.executionRun.replanCount }}</span>
              </div>

              <div class="grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                <div>
                  <span class="font-semibold text-slate-700">Worker:</span>
                  {{ formatWorkerType(item.executionRun.currentWorkerType) }}
                </div>
                <div v-if="item.executionRun.currentStepKey">
                  <span class="font-semibold text-slate-700">Current step:</span>
                  {{ item.executionRun.currentStepKey }}
                </div>
              </div>

              <p
                v-if="item.executionRun.summary"
                class="text-xs leading-relaxed text-slate-600"
              >
                {{ item.executionRun.summary }}
              </p>

              <p
                v-if="item.executionRun.lastError"
                class="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800"
              >
                {{ item.executionRun.lastError }}
              </p>

              <details
                v-if="item.executionRun.ledgerMarkdown"
                class="rounded-lg bg-slate-50 px-3 py-2"
              >
                <summary class="cursor-pointer text-xs font-semibold text-slate-700">
                  View handoff ledger
                </summary>
                <pre class="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-600">{{ item.executionRun.ledgerMarkdown }}</pre>
              </details>
            </div>
          </article>
        </li>
      </TransitionGroup>
    </div>
  </section>
</template>

<style scoped>
.timeline-enter-active,
.timeline-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.timeline-enter-from,
.timeline-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@media (prefers-reduced-motion: reduce) {
  .timeline-enter-active,
  .timeline-leave-active {
    transition: none;
  }

  .timeline-enter-from,
  .timeline-leave-to {
    opacity: 1;
    transform: none;
  }
}
</style>
