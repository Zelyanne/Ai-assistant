<script setup lang="ts">
import { computed } from 'vue';
import Card from 'primevue/card';
import Badge from 'primevue/badge';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import ProgressSpinner from 'primevue/progressspinner';
import { type ThreadSummary } from '@ai-assistant/shared';
import ThreadSummaryComponent from './ThreadSummary.vue';

interface Props {
  title: string;
  summary: string;
  summaryJson?: ThreadSummary;
  externalId?: string;
  taskId?: string;
  status: 'done' | 'escalation' | 'paused' | 'processing' | 'queued' | 'error' | 'insight' | 'optimization';
  agencyTier?: 'Public' | 'Controlled' | 'Restricted';
  timestamp: string;
  topics?: string[];
  escalationConfidenceScore?: number;
  escalationConfidenceThreshold?: number;
  escalationTrigger?: 'low_confidence' | 'ambiguity_detected' | 'restricted_topic' | 'approval_guardrail';
  isMini?: boolean;
  selected?: boolean;
  selectable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isMini: false,
  selected: false,
  selectable: false
});
const emit = defineEmits(['open-trace', 'click', 'update:selected']);

const isProcessing = computed(() => props.status === 'processing' || props.status === 'queued');

const isSelected = computed({
  get: () => props.selected,
  set: (val) => emit('update:selected', val)
});

const cardStyle = computed(() => {
  if (isProcessing.value) {
    return { borderLeft: '4px solid #94A3B8', background: 'rgba(148, 163, 184, 0.05)', opacity: 0.7 };
  }
  switch (props.status) {
    case 'done':
      return { borderLeft: '4px solid #059669', background: 'rgba(5, 150, 105, 0.02)' };
    case 'escalation':
      return { borderLeft: '4px solid #D97706', background: 'rgba(217, 119, 6, 0.02)' };
    case 'paused':
      return { borderLeft: '4px solid #E11D48', background: 'rgba(225, 29, 72, 0.02)' };
    case 'insight':
      return { borderLeft: '4px solid #2563EB', background: 'rgba(37, 99, 235, 0.02)' };
    case 'optimization':
      return { borderLeft: '4px solid #334155', background: 'rgba(51, 65, 85, 0.05)' };
    default:
      return { borderLeft: '4px solid #2563EB', background: 'rgba(37, 99, 235, 0.02)' };
  }
});

const statusLabel = computed(() => {
  switch (props.status) {
    case 'done': return 'Silent Win';
    case 'escalation': return 'Escalation';
    case 'paused': return 'Paused';
    case 'insight': return 'Insight';
    case 'optimization': return 'Optimization Suggestion';
    default: return props.status.charAt(0).toUpperCase() + props.status.slice(1);
  }
});

const statusSeverity = computed(() => {
  switch (props.status) {
    case 'done': return 'success';
    case 'escalation': return 'warn';
    case 'paused': return 'danger';
    case 'error': return 'danger';
    case 'insight': return 'info';
    case 'optimization': return 'secondary';
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

function toPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const hasEscalationConfidence = computed(() => {
  return props.status === 'escalation'
    && (
      typeof props.escalationConfidenceScore === 'number'
      || typeof props.escalationConfidenceThreshold === 'number'
      || typeof props.escalationTrigger === 'string'
    );
});

const escalationHint = computed(() => {
  if (!hasEscalationConfidence.value) return '';

  const segments: string[] = [];
  if (typeof props.escalationConfidenceScore === 'number') {
    segments.push(`score ${toPercent(props.escalationConfidenceScore)}`);
  }

  if (typeof props.escalationConfidenceThreshold === 'number') {
    segments.push(`threshold ${toPercent(props.escalationConfidenceThreshold)}`);
  }

  if (props.escalationTrigger) {
    const triggerLabel = props.escalationTrigger.replace(/_/g, ' ');
    segments.push(`trigger ${triggerLabel}`);
  }

  return segments.join(' • ');
});
</script>

<template>
  <Card 
    class="outcome-card shadow-sm border border-slate-200" 
    :style="cardStyle"
    :class="{ 
      'mini-card': isMini, 
      'cursor-pointer': !isProcessing,
      'pointer-events-none': isProcessing,
      'border-blue-500 shadow-md ring-1 ring-blue-500': selected 
    }"
    tabindex="0"
    @click="!isProcessing && emit('click')"
    @keydown.enter="!isProcessing && emit('click')"
  >
    <template #title>
      <div
        class="flex justify-between items-start gap-3"
        :class="{ 'mb-1': isMini }"
      >
        <div class="flex items-start gap-3 flex-1">
          <Checkbox 
            v-if="selectable" 
            v-model="isSelected" 
            :binary="true" 
            class="mt-1" 
            @click.stop
          />
          <h3 
            class="text-executive-primary leading-tight font-sans"
            :class="isMini ? 'text-base font-semibold line-clamp-2' : 'text-lg font-bold'"
          >
            {{ title }}
          </h3>
        </div>
        <div class="flex flex-col items-end gap-1">
          <Badge
            :value="statusLabel"
            :severity="statusSeverity"
            class="font-technical text-[9px] uppercase tracking-tighter"
          />
          <ProgressSpinner
            v-if="isProcessing"
            style="width: 14px; height: 14px"
            stroke-width="8"
          />
        </div>
      </div>
    </template>
    <template #subtitle>
      <div class="flex items-center gap-2 mt-1 flex-wrap">
        <span class="text-xs text-slate-400 font-technical">{{ timestamp }}</span>
        <Badge
          v-if="agencyTier"
          :value="agencyTier"
          :severity="tierSeverity"
          size="small"
          class="opacity-70 scale-90 origin-left"
        />
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
        <p
          v-if="hasEscalationConfidence"
          class="mt-2 text-[11px] leading-relaxed font-technical text-amber-700"
          :class="{ 'line-clamp-2': isMini }"
        >
          {{ escalationHint }}
        </p>
      </div>
    </template>
    <template #footer>
      <div
        class="flex justify-end gap-2"
        :class="{ 'mt-2': isMini }"
      >
        <slot name="actions">
          <Button 
            v-if="taskId"
            v-tooltip.top="isMini ? 'View Trace' : ''"
            :icon="isMini ? 'pi pi-search' : 'pi pi-search'"
            :label="isMini ? '' : 'View Trace'" 
            text
            :size="isMini ? 'small' : 'small'"
            class="p-button-technical"
            :class="{ 'p-0 h-8 w-8': isMini }"
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
