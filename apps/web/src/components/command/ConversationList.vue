<script setup lang="ts">
import { computed, ref } from 'vue';
import Button from 'primevue/button';

import type { ConversationListItem } from '../../composables/useCommandCenter';

const props = withDefaults(defineProps<{
  conversations: ConversationListItem[];
  activeConversationId: string | null;
  disabled?: boolean;
}>(), {
  conversations: () => [],
  activeConversationId: null,
  disabled: false,
});

const emit = defineEmits<{
  newChat: [];
  selectConversation: [conversationId: string];
}>();

const hasConversations = computed(() => props.conversations.length > 0);
const showAllEmpty = ref(false);

function conversationTitle(item: ConversationListItem): string {
  const raw = item.title?.trim();
  if (raw && raw.length > 0 && raw !== 'Command Center') return raw;
  return 'Empty chat';
}

function formatTimestamp(value: string | null): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
  }).format(date);
}

function isEmptyConversation(item: ConversationListItem): boolean {
  return Boolean(item.updatedAt && item.updatedAt === item.createdAt);
}

const activeConversations = computed(() => {
  return props.conversations.filter((item) => !isEmptyConversation(item));
});

const emptyConversations = computed(() => {
  return props.conversations.filter((item) => isEmptyConversation(item));
});

const visibleEmptyConversations = computed(() => {
  return showAllEmpty.value ? emptyConversations.value : emptyConversations.value.slice(0, 6);
});

function subtitle(item: ConversationListItem): string {
  const date = formatTimestamp(item.updatedAt ?? item.createdAt);
  if (isEmptyConversation(item)) return `Empty • ${date}`;
  return `Updated • ${date}`;
}

function onSelect(item: ConversationListItem): void {
  if (props.disabled) return;
  emit('selectConversation', item.id);
}
</script>

<template>
  <section class="flex min-h-0 flex-col gap-3" aria-label="Conversation history">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Chats
      </h2>

      <Button
        label="New chat"
        icon="pi pi-plus"
        severity="contrast"
        size="small"
        :disabled="disabled"
        @click="emit('newChat')"
      />
    </div>

    <div
      v-if="!hasConversations"
      class="rounded-executive border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500"
    >
      No conversations yet.
    </div>

    <div
      v-else
      class="min-h-0 overflow-y-auto rounded-executive border border-slate-200 bg-white"
    >
      <div class="px-3 py-3">
        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Recent
        </div>
      </div>

      <ul class="divide-y divide-slate-100">
        <li
          v-for="item in activeConversations"
          :key="item.id"
        >
          <button
            type="button"
            class="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-executive-primary/30"
            :class="item.id === props.activeConversationId
              ? 'bg-slate-50 text-executive-primary'
              : 'bg-white text-slate-700 hover:bg-slate-50'"
            :aria-current="item.id === props.activeConversationId ? 'true' : undefined"
            :disabled="disabled"
            @click="onSelect(item)"
          >
            <span
              class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"
              aria-hidden="true"
            >
              <i class="pi pi-comment" aria-hidden="true" />
            </span>

            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold">
                {{ conversationTitle(item) }}
              </span>
              <span class="block truncate text-xs text-slate-500">
                {{ subtitle(item) }}
              </span>
            </span>

            <span
              v-if="item.id === props.activeConversationId"
              class="ml-2 inline-flex h-2 w-2 shrink-0 rounded-full bg-executive-primary"
              aria-hidden="true"
            />
          </button>
        </li>
      </ul>

      <div
        v-if="emptyConversations.length > 0"
        class="border-t border-slate-100"
      >
        <div class="flex items-center justify-between gap-3 px-3 py-3">
          <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Empty
          </div>

          <button
            v-if="emptyConversations.length > 6"
            type="button"
            class="text-xs font-semibold text-slate-600 hover:text-executive-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-executive-primary/30 rounded"
            @click="showAllEmpty = !showAllEmpty"
          >
            {{ showAllEmpty ? 'Hide' : `Show ${emptyConversations.length - 6} more` }}
          </button>
        </div>

        <ul class="divide-y divide-slate-100">
          <li
            v-for="item in visibleEmptyConversations"
            :key="item.id"
          >
            <button
              type="button"
              class="flex w-full items-center gap-3 px-3 py-3 text-left text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-executive-primary/30"
              :class="item.id === props.activeConversationId ? 'bg-slate-50 text-executive-primary' : 'bg-white'"
              :aria-current="item.id === props.activeConversationId ? 'true' : undefined"
              :disabled="disabled"
              @click="onSelect(item)"
            >
              <span
                class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"
                aria-hidden="true"
              >
                <i class="pi pi-comment" aria-hidden="true" />
              </span>

              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold">
                  {{ conversationTitle(item) }}
                </span>
                <span class="block truncate text-xs text-slate-500">
                  {{ subtitle(item) }}
                </span>
              </span>

              <span
                v-if="item.id === props.activeConversationId"
                class="ml-2 inline-flex h-2 w-2 shrink-0 rounded-full bg-executive-primary"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
