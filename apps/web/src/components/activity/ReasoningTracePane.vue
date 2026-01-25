<template>
  <Drawer
    v-model:visible="isVisible"
    position="right"
    header="Reasoning Trace"
    class="reasoning-trace-drawer w-full md:w-[32rem]"
    :modal="true"
  >
    <div v-if="loading" class="flex flex-col items-center justify-center h-48 gap-4">
      <i class="pi pi-spin pi-spinner text-4xl text-primary"></i>
      <span class="text-surface-500">Analyzing reasoning path...</span>
    </div>

    <div v-else-if="error" class="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400">
      <div class="flex items-center gap-2 mb-2">
        <i class="pi pi-exclamation-triangle"></i>
        <span class="font-bold">Error Loading Trace</span>
      </div>
      <p class="text-sm">{{ error }}</p>
    </div>

    <div v-else-if="traceLog" class="flex flex-col gap-8">
      <!-- Logic Timeline -->
      <section>
        <h3 class="text-lg font-semibold mb-6 flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
          <i class="pi pi-sitemap"></i>
          Execution Logic
        </h3>
        
        <Timeline :value="traceLog.reasoning_trace" class="custom-timeline">
          <template #marker="slotProps">
            <span 
              class="flex w-8 h-8 items-center justify-center text-white rounded-full z-10 shadow-sm"
              :class="getConfidenceClass(slotProps.item.confidence_score)"
            >
              <i :class="getConfidenceIcon(slotProps.item.confidence_score)"></i>
            </span>
          </template>
          
          <template #opposite="slotProps">
            <small class="text-surface-500 dark:text-surface-400 font-mono">
              {{ formatTime(slotProps.item.timestamp) }}
            </small>
          </template>

          <template #content="slotProps">
            <div class="flex flex-col gap-1 mb-6">
              <span class="font-bold text-surface-900 dark:text-surface-0">{{ slotProps.item.step_name }}</span>
              <p class="text-surface-600 dark:text-surface-400 text-sm leading-relaxed">
                {{ slotProps.item.message }}
              </p>
              <div v-if="slotProps.item.confidence_score !== undefined" class="mt-1">
                <Badge 
                  :value="`Confidence: ${(slotProps.item.confidence_score * 100).toFixed(0)}%`" 
                  :severity="getConfidenceSeverity(slotProps.item.confidence_score)"
                  size="small"
                />
              </div>
            </div>
          </template>
        </Timeline>
      </section>

      <!-- Citations Section -->
      <section v-if="traceLog.citations?.length" class="border-t border-surface-200 dark:border-surface-700 pt-6">
        <h3 class="text-lg font-semibold mb-4 flex items-center gap-2 text-teal-700 dark:text-teal-400">
          <i class="pi pi-link"></i>
          Evidence & Citations
        </h3>
        <ul class="list-none p-0 m-0 flex flex-col gap-3">
          <li v-for="(citation, index) in traceLog.citations" :key="index">
            <a 
              :href="citation.link" 
              target="_blank" 
              class="flex items-start gap-3 p-3 rounded-lg border border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors no-underline group"
            >
              <i class="pi pi-external-link mt-1 text-surface-400 group-hover:text-primary"></i>
              <div class="flex flex-col gap-0.5">
                <span class="font-medium text-surface-900 dark:text-surface-0 group-hover:text-primary transition-colors">
                  {{ citation.description }}
                </span>
                <span class="text-xs text-surface-500 uppercase tracking-wider font-semibold">
                  Source: {{ citation.source_type }} ({{ citation.source_id }})
                </span>
              </div>
            </a>
          </li>
        </ul>
      </section>
    </div>

    <div v-else class="text-center p-8 text-surface-500">
      No reasoning trace found for this task.
    </div>
  </Drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Drawer from 'primevue/drawer';
import Timeline from 'primevue/timeline';
import Badge from 'primevue/badge';
import { useReasoningTrace } from '../../composables/useReasoningTrace';

const props = defineProps<{
  visible: boolean;
  taskId: string | null;
}>();

const emit = defineEmits(['update:visible']);

const { traceLog, loading, error, fetchTrace } = useReasoningTrace();

const isVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
});

// Watch for visibility changes to fetch data
import { watch } from 'vue';
watch(() => props.visible, (newVal) => {
  if (newVal && props.taskId) {
    fetchTrace(props.taskId);
  }
});

function getConfidenceClass(score?: number) {
  if (score === undefined) return 'bg-surface-400';
  if (score >= 0.8) return 'bg-green-500';
  if (score >= 0.5) return 'bg-amber-500';
  return 'bg-red-500';
}

function getConfidenceIcon(score?: number) {
  if (score === undefined) return 'pi pi-info-circle';
  if (score >= 0.8) return 'pi pi-check';
  if (score >= 0.5) return 'pi pi-exclamation-circle';
  return 'pi pi-times-circle';
}

function getConfidenceSeverity(score?: number) {
  if (score === undefined) return 'secondary';
  if (score >= 0.8) return 'success';
  if (score >= 0.5) return 'warn';
  return 'danger';
}

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
</script>

<style scoped>
.reasoning-trace-drawer {
  background: var(--surface-0);
}

:deep(.custom-timeline .p-timeline-event-opposite) {
  flex: 0;
  padding-right: 1rem;
  min-width: 80px;
}

:deep(.custom-timeline .p-timeline-event-content) {
  padding-bottom: 2rem;
}

/* Executive Calm Theme overrides */
h3 {
  letter-spacing: -0.01em;
}
</style>
