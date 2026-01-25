<script setup lang="ts">
import { type ThreadSummary } from '@ai-assistant/shared';
import Card from 'primevue/card';
import Checkbox from 'primevue/checkbox';
import Timeline from 'primevue/timeline';

interface Props {
  summary: ThreadSummary;
  externalId?: string;
}

const props = defineProps<Props>();

// Define sections for the 3-bullet executive layout (AC 4)
const timelineItems = [
  { label: 'Context', value: props.summary.context, icon: 'pi pi-info-circle', color: '#3B82F6' },
  { label: 'Decisions', value: props.summary.decisions, icon: 'pi pi-check-circle', color: '#10B981' },
  { label: 'Action Items', value: props.summary.action_items, icon: 'pi pi-list', color: '#F59E0B' }
];
</script>

<template>
  <div class="thread-summary space-y-4 font-sans">
    <!-- 3-Bullet Layout using PrimeVue Timeline for scannability (AC 4, 5) -->
    <Timeline :value="timelineItems" class="customized-timeline">
      <template #marker="slotProps">
        <span class="flex w-6 h-6 items-center justify-center text-white rounded-full z-10 shadow-sm" :style="{ backgroundColor: slotProps.item.color }">
          <i :class="slotProps.item.icon" style="font-size: 0.75rem"></i>
        </span>
      </template>
      <template #content="slotProps">
        <Card class="mb-2 border-none shadow-none bg-transparent">
          <template #title>
            <span class="text-[10px] font-bold uppercase tracking-widest text-slate-400">{{ slotProps.item.label }}</span>
          </template>
          <template #content>
            <div v-if="Array.isArray(slotProps.item.value)" class="space-y-2 mt-1">
              <div v-for="(item, index) in slotProps.item.value" :key="index" class="flex items-start gap-3">
                <!-- Checkbox for action items to enhance scannability and interaction (AC 5) -->
                <Checkbox v-if="slotProps.item.label === 'Action Items'" :binary="true" class="mt-0.5" />
                <span class="text-sm text-slate-700 leading-snug">{{ item }}</span>
              </div>
              <div v-if="slotProps.item.value.length === 0" class="text-sm text-slate-400 italic">None identified</div>
            </div>
            <p v-else class="text-sm text-slate-700 leading-snug mt-1">
              {{ slotProps.item.value }}
            </p>
          </template>
        </Card>
      </template>
    </Timeline>

    <!-- Source Citation: Traceability to original message (AC 6) -->
    <div v-if="externalId" class="flex justify-end pt-2 border-t border-slate-100">
      <a 
        :href="`https://mail.google.com/mail/u/0/#all/${props.externalId}`" 
        target="_blank" 
        class="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-1 font-mono uppercase tracking-tight"
      >
        <i class="pi pi-external-link" style="font-size: 0.7rem"></i>
        Source Citation: {{ props.externalId }}
      </a>
    </div>
  </div>
</template>

<style scoped>
.customized-timeline :deep(.p-timeline-event-content) {
  padding-top: 0;
}
.customized-timeline :deep(.p-timeline-event-opposite) {
  display: none;
}
.customized-timeline :deep(.p-card-body) {
  padding: 0.5rem 0 1rem 0;
}
.customized-timeline :deep(.p-card-content) {
  padding: 0;
}
</style>
