<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { type UserScheduleRecord, useSchedules } from '../../composables/useSchedules';

const {
  loading,
  error,
  listSchedules,
  createSchedule,
  updateSchedule,
  pauseSchedule,
  resumeSchedule,
  deleteSchedule,
} = useSchedules();

const schedules = ref<UserScheduleRecord[]>([]);
const creating = ref(false);
const editingId = ref<string | null>(null);
const form = ref({
  task_type: 'schedule.execute',
  cron_expression: '0 9 * * 1',
  timezone: 'UTC',
});
const editForm = ref({
  task_type: '',
  cron_expression: '',
  timezone: 'UTC',
});

async function refresh(): Promise<void> {
  schedules.value = await listSchedules();
}

async function submit(): Promise<void> {
  creating.value = true;
  const created = await createSchedule({
    task_type: form.value.task_type,
    cron_expression: form.value.cron_expression,
    timezone: form.value.timezone,
    task_payload: {},
    is_active: true,
  });

  creating.value = false;
  if (created) {
    form.value = {
      task_type: 'schedule.execute',
      cron_expression: '0 9 * * 1',
      timezone: 'UTC',
    };
    await refresh();
  }
}

function startEdit(schedule: UserScheduleRecord): void {
  editingId.value = schedule.id;
  editForm.value = {
    task_type: schedule.task_type,
    cron_expression: schedule.cron_expression,
    timezone: schedule.timezone ?? 'UTC',
  };
}

function cancelEdit(): void {
  editingId.value = null;
}

async function saveEdit(schedule: UserScheduleRecord): Promise<void> {
  const updated = await updateSchedule(schedule.id, {
    task_type: editForm.value.task_type,
    cron_expression: editForm.value.cron_expression,
    timezone: editForm.value.timezone,
    task_payload: schedule.task_payload ?? {},
    is_active: schedule.is_active,
  });

  if (updated) {
    editingId.value = null;
    await refresh();
  }
}

async function toggle(schedule: UserScheduleRecord): Promise<void> {
  if (schedule.is_active) {
    await pauseSchedule(schedule.id);
  } else {
    await resumeSchedule(schedule);
  }

  await refresh();
}

async function remove(schedule: UserScheduleRecord): Promise<void> {
  await deleteSchedule(schedule.id);
  await refresh();
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <div class="space-y-5">
    <Message v-if="error" severity="error" :closable="false">
      {{ error }}
    </Message>

    <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 class="mb-3 text-sm font-semibold text-slate-800">Create Schedule</h3>
      <div class="grid gap-3 md:grid-cols-3">
        <InputText v-model="form.task_type" placeholder="task type (domain.action)" />
        <InputText v-model="form.cron_expression" placeholder="cron expression" />
        <InputText v-model="form.timezone" placeholder="timezone (e.g. UTC)" />
      </div>
      <div class="mt-3 flex justify-end">
        <Button label="Create" icon="pi pi-plus" :loading="creating" @click="submit" />
      </div>
    </div>

    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-slate-800">Schedules</h3>
        <Button label="Refresh" text icon="pi pi-refresh" :loading="loading" @click="refresh" />
      </div>

      <div
        v-if="schedules.length === 0"
        class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500"
      >
        No schedules found.
      </div>

      <article
        v-for="item in schedules"
        :key="item.id"
        class="rounded-xl border border-slate-200 bg-white p-4"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <template v-if="editingId === item.id">
              <div class="grid gap-3 md:grid-cols-3">
                <InputText v-model="editForm.task_type" placeholder="task type" />
                <InputText v-model="editForm.cron_expression" placeholder="cron expression" />
                <InputText v-model="editForm.timezone" placeholder="timezone" />
              </div>
            </template>
            <template v-else>
              <p class="text-sm font-semibold text-slate-900">{{ item.task_type }}</p>
              <p class="text-xs text-slate-500">{{ item.cron_expression }} · {{ item.timezone }}</p>
              <p class="mt-1 text-xs text-slate-400">Next run: {{ new Date(item.next_run).toLocaleString() }}</p>
            </template>
          </div>

          <div class="flex flex-wrap gap-2">
            <template v-if="editingId === item.id">
              <Button label="Save" icon="pi pi-check" size="small" @click="saveEdit(item)" />
              <Button label="Cancel" icon="pi pi-times" size="small" severity="secondary" @click="cancelEdit" />
            </template>
            <template v-else>
              <Button label="Edit" icon="pi pi-pencil" size="small" severity="secondary" @click="startEdit(item)" />
              <Button
                :label="item.is_active ? 'Pause' : 'Resume'"
                :icon="item.is_active ? 'pi pi-pause' : 'pi pi-play'"
                size="small"
                severity="secondary"
                @click="toggle(item)"
              />
              <Button label="Delete" icon="pi pi-trash" size="small" severity="danger" @click="remove(item)" />
            </template>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
