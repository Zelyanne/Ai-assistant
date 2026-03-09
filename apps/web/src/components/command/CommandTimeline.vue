<script setup lang="ts">
import { computed } from 'vue';

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

const sortedItems = computed(() => {
  return [...props.items].sort((a, b) => {
    const left = new Date(a.createdAt).getTime();
    const right = new Date(b.createdAt).getTime();
    return left - right;
  });
});

function roleLabel(role: CommandTimelineEntry['role']): string {
  if (role === 'user') return 'You';
  if (role === 'assistant') return 'Assistant';
  return 'System';
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

    <ul
      v-else
      class="max-h-[58vh] space-y-3 overflow-y-auto px-3 py-4"
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
        </article>
      </li>
    </ul>
  </section>
</template>
