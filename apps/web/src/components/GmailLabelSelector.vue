<script setup lang="ts">
import { ref, onMounted, defineProps, defineEmits, watch } from 'vue';
import Checkbox from 'primevue/checkbox';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';

const props = defineProps<{
  organizationId: string;
  initialPreferences: string[];
}>();

const emit = defineEmits(['update:preferences']);

const labels = ref<{ id: string; name: string; type: string }[]>([]);
const selectedLabels = ref<string[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const fetchLabels = async () => {
  loading.value = true;
  error.value = null;
  try {
    const agentUrl = import.meta.env.VITE_AGENT_URL || 'http://localhost:3001';
    const response = await fetch(`${agentUrl}/api/gmail/labels?organizationId=${props.organizationId}`);
    
    if (!response.ok) {
        throw new Error('Failed to fetch labels');
    }
    
    const data = await response.json();
    labels.value = data.labels;
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  // If initialPreferences is empty, we don't necessarily select all in UI,
  // but if it's meant to be "all", user sees none selected which implies all (or none).
  // The spec says: "default to empty array (no filtering = all labels)".
  // "If none selected, all emails will be ingested".
  selectedLabels.value = [...props.initialPreferences];
  fetchLabels();
});

watch(selectedLabels, (newVal) => {
  emit('update:preferences', newVal);
});
</script>

<template>
  <div class="gmail-label-selector">
    <h3 class="text-lg font-semibold mb-2">
      Email Ingestion Labels
    </h3>
    <p class="text-sm text-gray-500 mb-4">
      Select which Gmail labels to include in AI analysis. If none selected, ALL emails will be ingested (legacy behavior).
    </p>
    
    <div
      v-if="loading"
      class="flex justify-center p-4"
    >
      <ProgressSpinner style="width: 30px; height: 30px" />
    </div>

    <Message
      v-if="error"
      severity="error"
      :text="error"
    />

    <div
      v-if="!loading && !error"
      class="labels-grid max-h-60 overflow-y-auto border border-gray-200 rounded p-4"
    >
      <div
        v-for="label in labels"
        :key="label.id"
        class="field-checkbox flex items-center mb-2"
      >
        <Checkbox
          v-model="selectedLabels"
          :input-id="label.id"
          name="label"
          :value="label.id"
        />
        <label
          :for="label.id"
          class="ml-2 text-sm cursor-pointer"
        >{{ label.name }}</label>
      </div>
    </div>
    
    <div
      v-if="!loading && !error && labels.length === 0"
      class="text-gray-500 text-center py-4"
    >
      No labels found or not connected.
    </div>

    <div
      v-if="selectedLabels.length === 0 && !loading"
      class="mt-2 text-xs text-orange-500 flex items-center gap-1"
    >
      <i class="pi pi-exclamation-triangle" />
      <span>Warning: No labels selected implies ALL emails will be ingested.</span>
    </div>
  </div>
</template>

<style scoped>
.labels-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.5rem;
}
</style>
