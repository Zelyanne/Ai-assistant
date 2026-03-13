<template>
  <div
    class="audit-log-container p-6 w-full max-w-7xl mx-auto flex flex-col gap-6"
  >
    <div class="header-section flex flex-col gap-2">
      <h1
        class="text-2xl font-semibold text-surface-900 dark:text-surface-0 flex items-center gap-3"
      >
        <i class="pi pi-shield text-indigo-600 dark:text-indigo-400" />
        Audit Log
      </h1>
      <p class="text-surface-600 dark:text-surface-400">
        Immutable record of autonomous system activity and agent reasoning
        traces.
      </p>
    </div>

    <!-- Filters Section -->
    <div
      class="filters-card bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-4 flex flex-wrap gap-4 items-end"
    >
      <div class="flex flex-col gap-2 flex-grow max-w-xs">
        <label
          for="actionFilter"
          class="text-sm font-medium text-surface-700 dark:text-surface-300"
        >Action Type</label>
        <InputText
          id="actionFilter"
          v-model="filters.action_taken"
          placeholder="Filter by action (e.g., task_completed)"
        />
      </div>
      <div class="flex flex-col gap-2 flex-grow max-w-xs">
        <label
          for="taskFilter"
          class="text-sm font-medium text-surface-700 dark:text-surface-300"
        >Task ID</label>
        <InputText
          id="taskFilter"
          v-model="filters.task_id"
          placeholder="Filter by specific task ID"
        />
      </div>
      <div class="flex gap-2 ml-auto">
        <Button
          label="Clear"
          icon="pi pi-filter-slash"
          severity="secondary"
          outlined
          @click="clearFilters"
        />
        <Button
          label="Refresh"
          icon="pi pi-refresh"
          :loading="loading"
          @click="fetchLogs"
        />
      </div>
    </div>

    <!-- Data Table -->
    <div
      class="table-card bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl overflow-hidden shadow-sm"
    >
      <DataTable
        v-model:filters="primeFilters"
        :value="logs"
        :loading="loading"
        :paginator="true"
        :rows="15"
        :total-records="totalRecords"
        :lazy="true"
        filter-display="menu"
        data-key="id"
        class="audit-table"
        striped-rows
        hoverable-rows
        :row-class="rowClass"
        @page="onPage"
        @row-click="onRowClick"
      >
        <template #empty>
          <div class="text-center p-8 text-surface-500">
            <i
              class="pi pi-inbox text-4xl mb-4 text-surface-300 dark:text-surface-600 block"
            />
            No audit logs found matching the criteria.
          </div>
        </template>

        <template #loading>
          <div class="text-center p-8 text-surface-500">
            <i
              class="pi pi-spin pi-spinner text-4xl mb-4 text-indigo-500 block"
            />
            Loading audit records...
          </div>
        </template>

        <Column
          field="created_at"
          header="Timestamp"
          :sortable="false"
        >
          <template #body="{ data }">
            <span class="font-mono text-sm">{{
              formatDateTime(data.created_at)
            }}</span>
          </template>
        </Column>

        <Column
          field="agent_id"
          header="Actor"
          :sortable="false"
        >
          <template #body="{ data }">
            <Badge
              :value="data.agent_id === 'agent-controller' ? 'System' : 'User'"
              :severity="
                data.agent_id === 'agent-controller' ? 'info' : 'secondary'
              "
              class="mr-2"
            />
            <span
              class="text-sm truncate max-w-[120px] inline-block align-bottom"
              :title="data.agent_id"
            >
              {{ data.agent_id }}
            </span>
          </template>
        </Column>

        <Column
          field="action_taken"
          header="Action Taken"
          :sortable="false"
        >
          <template #body="{ data }">
            <div class="flex items-center gap-2">
              <i
                :class="getActionIcon(data.action_taken)"
                class="text-surface-500"
              />
              <span
                class="font-medium text-surface-900 dark:text-surface-100"
              >{{ data.action_taken }}</span>
            </div>
          </template>
        </Column>

        <Column
          field="task_id"
          header="Task ID"
          :sortable="false"
        >
          <template #body="{ data }">
            <span
              v-if="data.task_id"
              class="font-mono text-xs bg-surface-100 dark:bg-surface-800 px-2 py-1 rounded text-surface-600 dark:text-surface-400"
            >
              {{ truncateId(data.task_id) }}
            </span>
            <span
              v-else
              class="text-surface-400 italic text-sm"
            >-</span>
          </template>
        </Column>

        <Column
          header="Evidence"
          :sortable="false"
          align-frozen="right"
        >
          <template #body="{ data }">
            <div class="flex gap-2">
              <Tag
                :severity="
                  data.reasoning_trace?.length ? 'success' : 'secondary'
                "
                :value="`${data.reasoning_trace?.length || 0} Steps`"
                rounded
              />
              <Tag
                :severity="data.citations?.length ? 'info' : 'secondary'"
                :value="`${data.citations?.length || 0} Refs`"
                rounded
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Trace Drawer -->
    <ReasoningTracePane
      v-model:visible="drawerVisible"
      :task-id="selectedTaskId"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import InputText from "primevue/inputtext";
import Button from "primevue/button";
import Badge from "primevue/badge";
import Tag from "primevue/tag";
import ReasoningTracePane from "../components/activity/ReasoningTracePane.vue";
import { supabase } from "../services/supabase";
import { AgentActivityLog } from "@ai-assistant/shared";

// State
const logs = ref<AgentActivityLog[]>([]);
const loading = ref(true);
const totalRecords = ref(0);
const drawerVisible = ref(false);
const selectedTaskId = ref<string | null>(null);

// Pagination & Filtering
const currentPage = ref(0);
const rowsPerPage = ref(15);
const filters = ref({
  action_taken: "",
  task_id: "",
});
const primeFilters = ref({}); // Empty object for primevue structure

// Realtime subscription
let subscription: any = null;

// Methods
const fetchLogs = async () => {
  loading.value = true;
  try {
    const from = currentPage.value * rowsPerPage.value;
    const to = from + rowsPerPage.value - 1;

    let query = supabase
      .from("agent_activity_log")
      .select("*", { count: "exact" });

    // Apply custom filters
    if (filters.value.action_taken) {
      query = query.ilike("action_taken", `%${filters.value.action_taken}%`);
    }
    if (filters.value.task_id) {
      query = query.eq("task_id", filters.value.task_id);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    logs.value = data as AgentActivityLog[];
    if (count !== null) {
      totalRecords.value = count;
    }
  } catch (error) {
    console.error("Error fetching audit logs:", error);
  } finally {
    loading.value = false;
  }
};

const setupRealtime = () => {
  subscription = supabase
    .channel("audit-logs-channel")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "agent_activity_log" },
      (payload) => {
        // If we're on the first page and filters match, unshift the new log
        if (currentPage.value === 0) {
          const newLog = payload.new as AgentActivityLog;

          // Check if it matches current filters
          const matchesAction =
            !filters.value.action_taken ||
            newLog.action_taken
              .toLowerCase()
              .includes(filters.value.action_taken.toLowerCase());
          const matchesTask =
            !filters.value.task_id || newLog.task_id === filters.value.task_id;

          if (matchesAction && matchesTask) {
            logs.value.unshift(newLog);
            // Remove last item if we exceed page size to maintain consistent view
            if (logs.value.length > rowsPerPage.value) {
              logs.value.pop();
            }
            totalRecords.value += 1;
          }
        } else {
          // Just update the total count if we're on a different page
          totalRecords.value += 1;
        }
      },
    )
    .subscribe();
};

const onPage = (event: any) => {
  currentPage.value = event.page;
  rowsPerPage.value = event.rows;
  fetchLogs();
};

const clearFilters = () => {
  filters.value = { action_taken: "", task_id: "" };
  currentPage.value = 0;
  fetchLogs();
};

const onRowClick = (event: any) => {
  if (event.data.task_id) {
    selectedTaskId.value = event.data.task_id;
    drawerVisible.value = true;
  }
};

// Debounce filter changes
let filterTimeout: any = null;
watch(
  filters,
  () => {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
      currentPage.value = 0;
      fetchLogs();
    }, 500);
  },
  { deep: true },
);

// Formatting Helpers
const formatDateTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const truncateId = (id: string) => {
  if (!id) return "";
  return `${id.substring(0, 8)}...${id.substring(id.length - 4)}`;
};

const getActionIcon = (action: string) => {
  const map: Record<string, string> = {
    task_completed: "pi pi-check-circle text-green-500",
    task_error: "pi pi-times-circle text-red-500",
    task_escalation: "pi pi-exclamation-circle text-amber-500",
    task_paused: "pi pi-pause-circle text-blue-500",
  };
  return map[action] || "pi pi-info-circle text-surface-400";
};

const rowClass = () =>
  "cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors";

// Lifecycle
onMounted(() => {
  fetchLogs();
  setupRealtime();
});

onUnmounted(() => {
  if (subscription) {
    supabase.removeChannel(subscription);
  }
});
</script>

<style scoped>
.audit-table :deep(.p-datatable-tbody > tr > td) {
  padding: 1rem;
}
</style>
