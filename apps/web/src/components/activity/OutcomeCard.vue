<script setup lang="ts">
import { computed } from 'vue';
import Card from 'primevue/card';
import Badge from 'primevue/badge';
import Button from 'primevue/button';
import { type ThreadSummary } from '@ai-assistant/shared';
import ThreadSummaryComponent from './ThreadSummary.vue';

interface Props {
  title: string;
  summary: string;
  summaryJson?: ThreadSummary;
  externalId?: string;
  taskId?: string;
  status: 'done' | 'escalation' | 'processing' | 'queued' | 'error' | 'insight';
  agencyTier?: 'Public' | 'Controlled' | 'Restricted';
  timestamp: string;
  topics?: string[];
  isMini?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isMini: false
});
const emit = defineEmits(['open-trace', 'click']);

const cardStyle = computed(() => {
  switch (props.status) {
    case 'done':
      return { borderLeft: '4px solid #059669', background: 'rgba(5, 150, 105, 0.02)' };
    case 'escalation':
      return { borderLeft: '4px solid #D97706', background: 'rgba(217, 119, 6, 0.02)' };
    case 'insight':
    default:
      return { borderLeft: '4px solid #2563EB', background: 'rgba(37, 99, 235, 0.02)' };
  }
});

const statusLabel = computed(() => {
  switch (props.status) {
    case 'done': return 'Silent Win';
    case 'escalation': return 'Escalation';
    case 'insight': return 'Insight';
    default: return props.status.charAt(0).toUpperCase() + props.status.slice(1);
  }
});

const statusSeverity = computed(() => {
  switch (props.status) {
    case 'done': return 'success';
    case 'escalation': return 'warn';
    case 'error': return 'danger';
    case 'insight': return 'info';
    default: return 'secondary';
  }
});

const tierSeverity = computed(() => {
  switch (props.agencyTier) {
    case 'Public': return 'info';
    case 'Controlled': return 'warn';
    case 'Restricted': return 'danger';
    default: return 'secondary';
  }
});

function getTopicSeverity(topic: string): string {
  const lower = topic.toLowerCase();
  if (lower.includes('blocker') || lower.includes('urgent') || lower.includes('critical')) return 'danger';
  if (lower.includes('investor') || lower.includes('client') || lower.includes('revenue')) return 'success';
  if (lower.includes('risk') || lower.includes('deadline')) return 'warn';
  return 'info';
}
</script>

<template>
  <Card 
    class="outcome-card shadow-sm border border-slate-200 cursor-pointer" 
    :style="cardStyle"
    :class="{ 'mini-card': isMini }"
    tabindex="0"
    @click="emit('click')"
    @keydown.enter="emit('click')"
  >
    <template #title>
      <div class="flex justify-between items-start gap-4" :class="{ 'mb-1': isMini }">
        <h3 
          class="text-executive-primary leading-tight font-sans"
          :class="isMini ? 'text-base font-semibold line-clamp-2' : 'text-lg font-bold'"
        >
          {{ title }}
        </h3>
        <Badge :value="statusLabel" :severity="statusSeverity" class="font-technical text-[9px] uppercase tracking-tighter" />
      </div>
    </template>
    <template #subtitle>
      <div class="flex items-center gap-2 mt-1 flex-wrap">
        <span class="text-xs text-slate-400 font-technical">{{ timestamp }}</span>
        <Badge v-if="agencyTier" :value="agencyTier" :severity="tierSeverity" size="small" class="opacity-70 scale-90 origin-left" />
      </div>
    </template>
    <template #content>
      <div class="mt-2">
        <ThreadSummaryComponent 
          v-if="summaryJson && !isMini" 
          :summary="summaryJson" 
          :external-id="externalId" 
        />
        <p 
          v-else 
          class="text-slate-600 leading-relaxed font-technical"
          :class="isMini ? 'text-xs line-clamp-3' : 'text-sm'"
        >
          {{ summary }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2" :class="{ 'mt-2': isMini }">
        <slot name="actions">
          <Button 
            v-if="taskId"
            :icon="isMini ? 'pi pi-search' : 'pi pi-search'"
            :label="isMini ? '' : 'View Trace'"
            text 
            :size="isMini ? 'small' : 'small'"
            class="p-button-technical"
            :class="{ 'p-0 h-8 w-8': isMini }"
            v-tooltip.top="isMini ? 'View Trace' : ''"
            @click.stop="emit('open-trace', taskId)"
          />
        </slot>
      </div>
    </template>
  </Card>
</template>

<style scoped>
.outcome-card {
  transition: all 0.2s ease;
}
.outcome-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
}
.mini-card :deep(.p-card-body) {
  padding: 1rem !important;
}
.mini-card :deep(.p-card-content) {
  padding: 0 !important;
}
</style>
