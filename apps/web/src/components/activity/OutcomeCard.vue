<script setup lang="ts">
import { computed } from 'vue';
import Card from 'primevue/card';
import Badge from 'primevue/badge';
import Button from 'primevue/button';

interface Props {
  title: string;
  summary: string;
  status: 'done' | 'escalation' | 'processing' | 'queued' | 'error' | 'insight';
  agencyTier?: 'Public' | 'Controlled' | 'Restricted';
  timestamp: string;
}

const props = defineProps<Props>();

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
</script>

<template>
  <Card class="outcome-card shadow-sm border border-slate-200" :style="cardStyle">
    <template #title>
      <div class="flex justify-between items-start gap-4">
        <h3 class="text-lg font-bold text-executive-primary leading-tight font-sans">
          {{ title }}
        </h3>
        <Badge :value="statusLabel" :severity="statusSeverity" class="font-technical text-xs" />
      </div>
    </template>
    <template #subtitle>
      <div class="flex items-center gap-2 mt-1">
        <span class="text-xs text-slate-400 font-technical">{{ timestamp }}</span>
        <Badge v-if="agencyTier" :value="agencyTier" :severity="tierSeverity" size="small" class="opacity-80" />
      </div>
    </template>
    <template #content>
      <p class="text-slate-600 text-sm leading-relaxed font-technical">
        {{ summary }}
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <slot name="actions">
          <Button label="View Trace" icon="pi pi-search" text size="small" class="p-button-technical" />
        </slot>
      </div>
    </template>
  </Card>
</template>

<style scoped>
.outcome-card {
  transition: transform 0.2s ease, shadow 0.2s ease;
}
.outcome-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05) !important;
}
</style>
