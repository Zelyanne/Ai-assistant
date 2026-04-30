<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Dropdown from 'primevue/dropdown';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
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
const formError = ref<string | null>(null);
const editError = ref<string | null>(null);

type ScheduleTaskType = 'assistant.command' | 'channel.send';
type ScheduleChannel = 'web' | 'telegram' | 'whatsapp';
const TASK_TYPE_OPTIONS: ScheduleTaskType[] = ['assistant.command', 'channel.send'];
const CHANNEL_OPTIONS: ScheduleChannel[] = ['web', 'telegram', 'whatsapp'];

const form = ref({
  task_type: 'assistant.command',
  cron_expression: '0 9 * * 1',
  timezone: 'UTC',
  command: '',
  channel: 'web',
  thread_id: '',
  message_text: '',
});
const editForm = ref({
  task_type: '',
  cron_expression: '',
  timezone: 'UTC',
  command: '',
  channel: 'web',
  thread_id: '',
  message_text: '',
});

type ScheduleFormState = {
  task_type: string;
  cron_expression: string;
  timezone: string;
  command: string;
  channel: string;
  thread_id: string;
  message_text: string;
};

function isSupportedTaskType(taskType: string): taskType is ScheduleTaskType {
  return (TASK_TYPE_OPTIONS as readonly string[]).includes(taskType);
}

function isSupportedChannel(channel: string): channel is ScheduleChannel {
  return (CHANNEL_OPTIONS as readonly string[]).includes(channel);
}

function buildTaskPayload(input: ScheduleFormState): { payload: Record<string, unknown> | null; error: string | null } {
  if (!isSupportedTaskType(input.task_type)) {
    return {
      payload: null,
      error: 'Unsupported task type. Choose assistant.command or channel.send.',
    };
  }

  if (input.task_type === 'assistant.command') {
    const command = input.command.trim();
    if (!command) {
      return {
        payload: null,
        error: 'Command is required for assistant.command schedules.',
      };
    }

    return {
      payload: {
        command,
        command_text: command,
        message_text: command,
        confirmed: true,
        high_risk: true,
      },
      error: null,
    };
  }

  if (!isSupportedChannel(input.channel)) {
    return {
      payload: null,
      error: 'Unsupported channel. Choose web, telegram, or whatsapp.',
    };
  }

  const threadId = input.thread_id.trim();
  const messageText = input.message_text.trim();

  if (!threadId) {
    return {
      payload: null,
      error: 'thread_id is required for channel.send schedules.',
    };
  }

  if (!messageText) {
    return {
      payload: null,
      error: 'message_text is required for channel.send schedules.',
    };
  }

  return {
    payload: {
      channel: input.channel,
      thread_id: threadId,
      message_text: messageText,
      confirmed: true,
      high_risk: true,
    },
    error: null,
  };
}

async function refresh(): Promise<void> {
  schedules.value = await listSchedules();
}

async function submit(): Promise<void> {
  creating.value = true;
  formError.value = null;

  const { payload: taskPayload, error: validationError } = buildTaskPayload(form.value);
  if (!taskPayload) {
    formError.value = validationError;
    creating.value = false;
    return;
  }

  const created = await createSchedule({
    task_type: form.value.task_type,
    cron_expression: form.value.cron_expression,
    timezone: form.value.timezone,
    task_payload: taskPayload,
    is_active: true,
  });

  creating.value = false;
  if (created) {
    form.value = {
      task_type: 'assistant.command',
      cron_expression: '0 9 * * 1',
      timezone: 'UTC',
      command: '',
      channel: 'web',
      thread_id: '',
      message_text: '',
    };
    await refresh();
  }
}

function startEdit(schedule: UserScheduleRecord): void {
  editingId.value = schedule.id;
  editError.value = null;
  const payload = schedule.task_payload ?? {};
  const command = typeof payload.command === 'string'
    ? payload.command
    : (typeof payload.command_text === 'string' ? payload.command_text : '');
  editForm.value = {
    task_type: schedule.task_type,
    cron_expression: schedule.cron_expression,
    timezone: schedule.timezone ?? 'UTC',
    command,
    channel: typeof payload.channel === 'string' ? payload.channel : 'web',
    thread_id: typeof payload.thread_id === 'string' ? payload.thread_id : '',
    message_text: typeof payload.message_text === 'string' ? payload.message_text : '',
  };
}

function cancelEdit(): void {
  editingId.value = null;
  editError.value = null;
}

async function saveEdit(schedule: UserScheduleRecord): Promise<void> {
  editError.value = null;

  const { payload: taskPayload, error: validationError } = buildTaskPayload(editForm.value);
  if (!taskPayload) {
    editError.value = validationError;
    return;
  }

  const updated = await updateSchedule(schedule.id, {
    task_type: editForm.value.task_type,
    cron_expression: editForm.value.cron_expression,
    timezone: editForm.value.timezone,
    task_payload: taskPayload,
    is_active: schedule.is_active,
  });

  if (updated) {
    editError.value = null;
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
    <Message
      v-if="error"
      severity="error"
      :closable="false"
    >
      {{ error }}
    </Message>

    <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 class="mb-3 text-sm font-semibold text-slate-800">
        Create Schedule
      </h3>
      <Message
        v-if="formError"
        severity="error"
        :closable="false"
        class="mb-3"
      >
        {{ formError }}
      </Message>
      <div class="grid gap-3 md:grid-cols-3">
        <Dropdown
          v-model="form.task_type"
          :options="TASK_TYPE_OPTIONS"
          placeholder="task type"
          fluid
        />
        <InputText
          v-model="form.cron_expression"
          placeholder="cron expression"
        />
        <InputText
          v-model="form.timezone"
          placeholder="timezone (e.g. UTC)"
        />
      </div>

      <div class="mt-3 grid gap-3 md:grid-cols-3">
        <template v-if="form.task_type === 'assistant.command'">
          <Textarea
            v-model="form.command"
            auto-resize
            rows="2"
            class="md:col-span-3"
            placeholder="Command to run at each scheduled time"
          />
        </template>
        <template v-else>
          <Dropdown
            v-model="form.channel"
            :options="CHANNEL_OPTIONS"
            placeholder="channel"
            fluid
          />
          <InputText
            v-model="form.thread_id"
            placeholder="thread_id"
          />
          <InputText
            v-model="form.message_text"
            placeholder="message_text"
          />
        </template>
      </div>
      <div class="mt-3 flex justify-end">
        <Button
          label="Create"
          icon="pi pi-plus"
          :loading="creating"
          @click="submit"
        />
      </div>
    </div>

    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-slate-800">
          Schedules
        </h3>
        <Button
          label="Refresh"
          text
          icon="pi pi-refresh"
          :loading="loading"
          @click="refresh"
        />
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
              <Message
                v-if="editError"
                severity="error"
                :closable="false"
                class="mb-3"
              >
                {{ editError }}
              </Message>
              <div class="grid gap-3 md:grid-cols-3">
                <Dropdown
                  v-model="editForm.task_type"
                  :options="TASK_TYPE_OPTIONS"
                  placeholder="task type"
                  fluid
                />
                <InputText
                  v-model="editForm.cron_expression"
                  placeholder="cron expression"
                />
                <InputText
                  v-model="editForm.timezone"
                  placeholder="timezone"
                />
              </div>

              <div class="mt-3 grid gap-3 md:grid-cols-3">
                <template v-if="editForm.task_type === 'assistant.command'">
                  <Textarea
                    v-model="editForm.command"
                    auto-resize
                    rows="2"
                    class="md:col-span-3"
                    placeholder="Command"
                  />
                </template>
                <template v-else>
                  <Dropdown
                    v-model="editForm.channel"
                    :options="CHANNEL_OPTIONS"
                    placeholder="channel"
                    fluid
                  />
                  <InputText
                    v-model="editForm.thread_id"
                    placeholder="thread_id"
                  />
                  <InputText
                    v-model="editForm.message_text"
                    placeholder="message_text"
                  />
                </template>
              </div>
            </template>
            <template v-else>
              <p class="text-sm font-semibold text-slate-900">
                {{ item.task_type }}
              </p>
              <p class="text-xs text-slate-500">
                {{ item.cron_expression }} · {{ item.timezone }}
              </p>
              <p class="mt-1 text-xs text-slate-400">
                Next run: {{ new Date(item.next_run).toLocaleString() }}
              </p>
            </template>
          </div>

          <div class="flex flex-wrap gap-2">
            <template v-if="editingId === item.id">
              <Button
                label="Save"
                icon="pi pi-check"
                size="small"
                @click="saveEdit(item)"
              />
              <Button
                label="Cancel"
                icon="pi pi-times"
                size="small"
                severity="secondary"
                @click="cancelEdit"
              />
            </template>
            <template v-else>
              <Button
                label="Edit"
                icon="pi pi-pencil"
                size="small"
                severity="secondary"
                @click="startEdit(item)"
              />
              <Button
                :label="item.is_active ? 'Pause' : 'Resume'"
                :icon="item.is_active ? 'pi pi-pause' : 'pi pi-play'"
                size="small"
                severity="secondary"
                @click="toggle(item)"
              />
              <Button
                label="Delete"
                icon="pi pi-trash"
                size="small"
                severity="danger"
                @click="remove(item)"
              />
            </template>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
