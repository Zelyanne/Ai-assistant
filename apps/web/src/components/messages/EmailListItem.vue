<script setup lang="ts">
import { defineProps, computed } from 'vue';
import Tag from 'primevue/tag';
import Card from 'primevue/card';

const props = defineProps<{
    email: any;
}>();

const formatDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const categorySeverity = computed(() => {
    switch (props.email.category?.toLowerCase()) {
        case 'critical': return 'danger';
        case 'high priority': return 'warning';
        case 'action required': return 'info';
        case 'fyi': return 'secondary';
        case 'low priority': return 'success';
        default: return 'secondary';
    }
});

const isLimited = computed(() => !props.email.body && !props.email.summary_json);
</script>

<template>
  <Card
    class="mb-3 hover:shadow-md transition-shadow border-l-4"
    :class="[`border-l-${categorySeverity}-500`]"
  >
    <template #content>
      <div class="flex justify-between items-start">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <h4 class="font-bold text-lg text-gray-900 truncate">
              {{ email.subject }}
            </h4>
            <Tag
              :value="email.category || 'Uncategorized'"
              :severity="categorySeverity"
              class="text-xs"
            />
          </div>
          <p class="text-sm text-gray-600 line-clamp-2">
            {{ email.summary }}
          </p>
          
          <div
            v-if="isLimited"
            class="mt-2 text-xs text-orange-500 flex items-center gap-1"
          >
            <i class="pi pi-bolt" />
            <span>Limited analysis (snippet only)</span>
          </div>
        </div>
        <div class="ml-4 flex flex-col items-end whitespace-nowrap">
          <span class="text-xs text-gray-400">{{ formatDate(email.created_at) }}</span>
          <div
            v-if="email.priority_score"
            class="mt-2"
          >
            <span
              class="text-xs font-bold"
              :class="email.priority_score > 80 ? 'text-red-500' : 'text-gray-500'"
            >
              Score: {{ email.priority_score }}
            </span>
          </div>
        </div>
      </div>
    </template>
  </Card>
</template>

<style scoped>
:deep(.p-card-body) {
    padding: 1rem;
}
:deep(.p-card-content) {
    padding: 0;
}
</style>
