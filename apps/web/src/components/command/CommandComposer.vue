<script setup lang="ts">
import { ref } from 'vue';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';

const props = withDefaults(defineProps<{
  disabled?: boolean;
  placeholder?: string;
}>(), {
  disabled: false,
  placeholder: 'Type a command...'
});

const emit = defineEmits<{
  submit: [message: string];
}>();

const draft = ref('');
const composerInputId = 'command-composer-input';

function submitDraft(): void {
  if (props.disabled) return;

  const trimmed = draft.value.trim();
  if (!trimmed) return;

  emit('submit', trimmed);
  draft.value = '';
}

function onComposerKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey) return;

  event.preventDefault();
  submitDraft();
}
</script>

<template>
  <section class="rounded-executive border border-slate-200 bg-white p-4 shadow-sm">
    <label
      :for="composerInputId"
      class="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
    >
      Command
    </label>

    <div class="flex flex-col gap-3 md:flex-row md:items-end">
      <Textarea
        :id="composerInputId"
        v-model="draft"
        :disabled="disabled"
        :placeholder="placeholder"
        rows="3"
        auto-resize
        class="w-full"
        @keydown="onComposerKeydown"
      />

      <Button
        label="Send"
        icon="pi pi-send"
        :disabled="disabled || draft.trim().length === 0"
        class="md:w-auto"
        @click="submitDraft"
      />
    </div>

    <p class="mt-2 text-xs text-slate-500">
      Enter submits. Shift+Enter adds a newline.
    </p>
  </section>
</template>
