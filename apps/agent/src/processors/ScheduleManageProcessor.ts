import { randomUUID } from 'crypto';
import type { Task } from '@ai-assistant/shared';
import { BaseProcessor, type ProcessorResult } from './BaseProcessor.js';
import { computeNextRunFromCron } from '../services/CronSchedulerService.js';
import { channelRouter, type ChannelRouterService } from '../services/channelRouter.js';
import { ScheduleParser, type ScheduleParseResult } from '../services/scheduleParser.js';
import { supabase } from '../services/supabase.js';

type ScheduleManageDeps = {
  now?: () => Date;
  channelRouterService?: Pick<ChannelRouterService, 'enqueueOutbound'>;
  supabaseClient?: {
    from: (table: string) => any;
  };
  scheduleParser?: {
    parse: (input: string, options?: { timezone?: string }) => Promise<ScheduleParseResult>;
  };
};

type ScheduleManagePayload = Record<string, unknown> & {
  channel?: unknown;
  channel_metadata?: unknown;
  confirmed?: unknown;
  correlation_id?: unknown;
  external_message_id?: unknown;
  message_text?: unknown;
  run_at_iso?: unknown;
  thread_id?: unknown;
  timezone?: unknown;
};

const CONFIRM_SCHEDULE_PREFIX = /^confirm(?:\s+create)?\s+schedule\b[:\s-]*/i;

type ScheduleRow = {
  id: string;
  organization_id: string;
  user_id: string;
  task_type: string;
  task_payload: Record<string, unknown>;
  cron_expression: string;
  timezone: string;
  remaining_runs?: number | null;
  run_count?: number;
  end_at?: string | null;
  topic?: string | null;
  is_active: boolean;
  next_run: string;
  last_run: string | null;
  failure_count: number;
  last_error: string | null;
};

type ZonedDateParts = {
  minute: number;
  hour: number;
  day: number;
  month: number;
};

function readStringField(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseScheduleId(text: string): string | null {
  const match = text.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/i);
  return match?.[1] ?? null;
}

function isMessagingChannel(channel: string | null): channel is 'telegram' | 'whatsapp' {
  return channel === 'telegram' || channel === 'whatsapp';
}

function isConfirmedCreateCommand(messageText: string): boolean {
  return CONFIRM_SCHEDULE_PREFIX.test(messageText);
}

function stripConfirmationPrefix(messageText: string): string {
  return messageText.replace(CONFIRM_SCHEDULE_PREFIX, '').trim();
}

function formatScheduleRow(schedule: ScheduleRow): string {
  return `${schedule.task_type} | ${schedule.cron_expression} | ${schedule.timezone} | ${schedule.is_active ? 'active' : 'paused'} | next ${schedule.next_run}`;
}

function isListCommand(messageText: string): boolean {
  return /\b(list|show)\b/.test(messageText) && /\bschedules?\b/.test(messageText);
}

function isCreateCommand(messageText: string): boolean {
  return /\b(create\s+schedule|schedule\s+this|every\b|daily\b|weekly\b|monthly\b|in\s+\d+\s*(?:minutes?|mins?|min|hours?|hrs?|h|days?)|dans\s+\d+\s*(?:minutes?|mins?|min|heures?|heure|h|jours?|jour)|tomorrow|demain)\b/.test(messageText);
}

function isOneOffInOffset(messageText: string): { amount: number; unit: 'minutes' | 'hours' | 'days' } | null {
  const match = messageText.toLowerCase().match(/\b(?:in|dans)\s+(\d{1,3})\s*(minutes?|mins?|min|hours?|hrs?|heures?|heure|h|days?|jours?|jour)\b/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount <= 0) return null;

  const unitRaw = match[2];
  if (unitRaw.startsWith('minute') || unitRaw.startsWith('min')) return { amount, unit: 'minutes' };
  if (
    unitRaw.startsWith('hour')
    || unitRaw.startsWith('hr')
    || unitRaw === 'h'
    || unitRaw.startsWith('heure')
  ) {
    return { amount, unit: 'hours' };
  }
  return { amount, unit: 'days' };
}

function stripOneOffOffsetPrefix(messageText: string): string {
  return messageText
    .replace(/\b(?:in|dans)\s+\d{1,3}\s*(?:minutes?|mins?|min|hours?|hrs?|heures?|heure|h|days?|jours?|jour)\b\s*(?:[,\-:]\s*)?/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripFiniteEndConditions(commandText: string): string {
  return commandText
    .replace(/\bfor\s+\d{1,4}\s+times\b/gi, '')
    .replace(/\bfor\s+\d{1,3}\s+weeks?\b/gi, '')
    .replace(/\buntil\b[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeChannelSendRequest(commandText: string, payload: ScheduleManagePayload): boolean {
  const channel = readStringField(payload, 'channel');
  const threadId = readStringField(payload, 'thread_id');
  if (!isMessagingChannel(channel) || !threadId) {
    return false;
  }

  const lower = commandText.toLowerCase();
  return /^(?:please\s+)?(?:send|text|message|notify)\b/.test(lower) && !/\b(email|mail)\b/.test(lower);
}

function extractScheduledChannelMessageText(commandText: string): string | null {
  const normalized = commandText.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return null;
  }

  const quoted = normalized.match(/^(?:please\s+)?(?:send|text|message|notify)\s+(?:a\s+)?(?:telegram|whatsapp)?\s*(?:message|text)?\s*["“'](.+?)["”']$/i);
  if (quoted?.[1]) {
    return quoted[1].trim();
  }

  const leadingVerb = normalized.match(/^(?:please\s+)?(?:send|text|message|notify)\s+(.+)$/i);
  let candidate = leadingVerb?.[1]?.trim() ?? normalized;
  candidate = candidate.replace(/^(?:a|an)\s+/i, '').trim();
  candidate = candidate.replace(/\b(?:text|message)\b$/i, '').trim();

  return candidate.length > 0 ? candidate : null;
}

function getZonedDateParts(date: Date, timezone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '1');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '1');

  return { minute, hour, day, month };
}

function normalizeIanaTimezone(timezone: string | undefined): string {
  const candidate = typeof timezone === 'string' && timezone.trim().length > 0
    ? timezone.trim()
    : 'UTC';

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return 'UTC';
  }
}

function parseExplicitRunAtIso(payload: ScheduleManagePayload): Date | null {
  const raw = readStringField(payload, 'run_at_iso');
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid run_at_iso: expected an ISO-8601 datetime.');
  }

  parsed.setUTCSeconds(0, 0);
  return parsed;
}

function addWeeks(date: Date, weeks: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + (weeks * 7));
  return next;
}

function parseFiniteWeeks(messageText: string): number | null {
  const match = messageText.toLowerCase().match(/\bfor\s+(\d{1,3})\s+weeks?\b/);
  if (!match) return null;
  const weeks = Number(match[1]);
  return Number.isInteger(weeks) && weeks > 0 ? weeks : null;
}

function parseFiniteTimes(messageText: string): number | null {
  const match = messageText.toLowerCase().match(/\b(\d{1,4})\s+times\b/);
  if (!match) return null;
  const times = Number(match[1]);
  return Number.isInteger(times) && times > 0 ? times : null;
}

function shouldDefaultTimeForWeekdaySchedule(messageText: string): boolean {
  const lower = messageText.toLowerCase();
  const mentionsWeekday = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower);
  if (!mentionsWeekday) return false;
  const hasExplicitAtTime = /\b(at)\s+\d{1,2}(?::\d{2})?\s*(am|pm)?\b/.test(lower) || /\b(at)\s+(noon|midnight)\b/.test(lower);
  return !hasExplicitAtTime;
}

function inferRunLimitsFromText(
  messageText: string,
  cronExpression: string,
  now: Date,
): { remaining_runs: number | null; end_at: string | null } {
  const times = parseFiniteTimes(messageText);
  if (times) {
    return { remaining_runs: times, end_at: null };
  }

  const weeks = parseFiniteWeeks(messageText);
  if (!weeks) {
    return { remaining_runs: null, end_at: null };
  }

  const fields = cronExpression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return { remaining_runs: null, end_at: addWeeks(now, weeks).toISOString() };
  }

  const dayField = fields[2];
  const monthField = fields[3];
  const weekdayField = fields[4];

  const isExactWeekday = /^\d+$/.test(weekdayField ?? '')
    && weekdayField !== undefined
    && Number(weekdayField) >= 0
    && Number(weekdayField) <= 6;

  const isDaily = (dayField === '*' && monthField === '*' && weekdayField === '*');
  const isWeekly = (dayField === '*' && monthField === '*' && isExactWeekday);

  if (isWeekly) {
    return { remaining_runs: weeks, end_at: null };
  }

  if (isDaily) {
    return { remaining_runs: weeks * 7, end_at: null };
  }

  // For sub-daily or complex cadences, prefer end_at over remaining_runs.
  return { remaining_runs: null, end_at: addWeeks(now, weeks).toISOString() };
}

export class ScheduleManageProcessor extends BaseProcessor {
  private readonly channelRouterService: Pick<ChannelRouterService, 'enqueueOutbound'>;
  private readonly now: () => Date;
  private readonly supabaseClient: {
    from: (table: string) => any;
  };
  private readonly scheduleParser: {
    parse: (input: string, options?: { timezone?: string }) => Promise<ScheduleParseResult>;
  };

  constructor(deps: ScheduleManageDeps = {}) {
    super();
    this.channelRouterService = deps.channelRouterService ?? channelRouter;
    this.now = deps.now ?? (() => new Date());
    this.supabaseClient = deps.supabaseClient ?? supabase;
    this.scheduleParser = deps.scheduleParser ?? new ScheduleParser();
  }

  async process(task: Task): Promise<ProcessorResult> {
    this.clearTrace();
    const payload = task.payload as ScheduleManagePayload;
    const messageText = readStringField(payload, 'message_text') ?? readStringField(payload, 'command_text') ?? '';
    const confirmed = payload.confirmed === true
      || payload.user_initiated === true
      || isConfirmedCreateCommand(messageText);
    const normalizedCommandText = confirmed ? stripConfirmationPrefix(messageText) : messageText;
    const organizationId = task.organization_id;
    const userId = task.user_id;

    if (!organizationId || !userId) {
      throw new Error('schedule.manage requires organization_id and user_id');
    }

    const normalized = normalizedCommandText.toLowerCase();
    const hasExplicitRunAt = Boolean(readStringField(payload, 'run_at_iso'));
    this.addTraceStep('schedule_manage_received', `Received schedule.manage command: ${normalizedCommandText}`);

    let result: ProcessorResult;

    if (isListCommand(normalized)) {
      result = await this.listSchedules(organizationId, userId);
      await this.notifyChannelIfNeeded(task, payload, result);
      return result;
    }

    if (normalized.includes('pause schedule')) {
      result = await this.updateScheduleActiveState(organizationId, userId, normalizedCommandText, false);
      await this.notifyChannelIfNeeded(task, payload, result);
      return result;
    }

    if (normalized.includes('resume schedule')) {
      result = await this.updateScheduleActiveState(organizationId, userId, normalizedCommandText, true);
      await this.notifyChannelIfNeeded(task, payload, result);
      return result;
    }

    if (normalized.includes('delete schedule')) {
      result = await this.deleteSchedule(organizationId, userId, normalizedCommandText);
      await this.notifyChannelIfNeeded(task, payload, result);
      return result;
    }

    if (isCreateCommand(normalized) || hasExplicitRunAt) {
      result = await this.createSchedule(organizationId, userId, payload, normalizedCommandText, confirmed);
      await this.notifyChannelIfNeeded(task, payload, result);
      return result;
    }

    throw new Error('Unsupported schedule.manage command. Try list, create, pause, resume, or delete schedule.');
  }

  private async listSchedules(organizationId: string, userId: string): Promise<ProcessorResult> {
    const { data, error } = await this.supabaseClient
      .from('user_schedules')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .order('next_run', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const schedules = (data ?? []) as ScheduleRow[];
    this.addTraceStep('schedule_listed', `Listed ${schedules.length} schedules`);

    const summary = schedules.length === 0
      ? 'No schedules found.'
      : schedules.map((schedule, index) => `${index + 1}. ${formatScheduleRow(schedule)}`).join('\n');

    return {
      outcome: 'listed',
      total: schedules.length,
      schedules,
      summary,
      trace: this.getTrace(),
    };
  }

  private async createSchedule(
    organizationId: string,
    userId: string,
    payload: ScheduleManagePayload,
    messageText: string,
    confirmed: boolean,
  ): Promise<ProcessorResult> {
    const timezone = readStringField(payload, 'timezone') ?? undefined;
    const resolvedTimezone = normalizeIanaTimezone(timezone);
    const now = this.now();
    const explicitRunAt = parseExplicitRunAtIso(payload);

    if (explicitRunAt && explicitRunAt.getTime() <= now.getTime()) {
      throw new Error('run_at_iso must be in the future.');
    }

    const scheduleText = (() => {
      if (!shouldDefaultTimeForWeekdaySchedule(messageText)) {
        return messageText;
      }

      const weeksMatch = messageText.match(/\bfor\s+\d{1,3}\s+weeks?\b/i);
      if (weeksMatch?.index !== undefined) {
        const before = messageText.slice(0, weeksMatch.index).trim();
        const after = messageText.slice(weeksMatch.index).trim();
        return `${before} at 9am ${after}`.trim();
      }

      const timesMatch = messageText.match(/\b\d{1,4}\s+times\b/i);
      if (timesMatch?.index !== undefined) {
        const before = messageText.slice(0, timesMatch.index).trim();
        const after = messageText.slice(timesMatch.index).trim();
        return `${before} at 9am ${after}`.trim();
      }

      return `${messageText} at 9am`;
    })();

    const oneOff = isOneOffInOffset(messageText);

    const parsed = explicitRunAt
      ? (() => {
        const tz = resolvedTimezone;
        const zoned = getZonedDateParts(explicitRunAt, tz);
        const cronExpression = `${zoned.minute} ${zoned.hour} ${zoned.day} ${zoned.month} *`;
        const commandText = stripOneOffOffsetPrefix(messageText) || messageText;
        return {
          cronExpression,
          timezone: tz,
          taskType: 'assistant.command',
          taskPayload: {
            original_input: messageText,
            command: commandText,
            command_text: commandText,
            message_text: commandText,
          },
          confirmationMessage: `Confirmed: assistant.command once at ${explicitRunAt.toISOString()} (${tz}).`,
          source: 'rules' as const,
        };
      })()
      : oneOff
        ? (() => {
          const multiplier = oneOff.unit === 'minutes'
            ? 60 * 1000
            : oneOff.unit === 'hours'
              ? 60 * 60 * 1000
              : 24 * 60 * 60 * 1000;
          const target = new Date(now.getTime() + (oneOff.amount * multiplier));
          const tz = resolvedTimezone;
          const zoned = getZonedDateParts(target, tz);
          const cronExpression = `${zoned.minute} ${zoned.hour} ${zoned.day} ${zoned.month} *`;
          const commandText = stripOneOffOffsetPrefix(messageText) || messageText;
          return {
            cronExpression,
            timezone: tz,
            taskType: 'assistant.command',
            taskPayload: {
              original_input: messageText,
              command: commandText,
              command_text: commandText,
              message_text: commandText,
            },
            confirmationMessage: `Confirmed: assistant.command once at ${target.toISOString()} (${tz}).`,
            source: 'rules' as const,
          };
        })()
        : await this.scheduleParser.parse(scheduleText, resolvedTimezone ? { timezone: resolvedTimezone } : undefined);

    if (!confirmed) {
      this.addTraceStep('schedule_confirmation_requested', `Requested confirmation for cron ${parsed.cronExpression}`);

      return {
        outcome: 'confirmation_requested',
        confirmation_message: `${parsed.confirmationMessage} Reply with: confirm schedule ${messageText}`,
        summary: 'Schedule confirmation requested.',
        trace: this.getTrace(),
      };
    }

    const { remaining_runs, end_at } = (explicitRunAt || oneOff)
      ? { remaining_runs: 1, end_at: null }
      : inferRunLimitsFromText(messageText, parsed.cronExpression, now);

    const nextRun = explicitRunAt ?? computeNextRunFromCron(parsed.cronExpression, parsed.timezone, now);

    const taskPayload: Record<string, unknown> = {
      ...(parsed.taskPayload ?? {}),
      confirmed: true,
      high_risk: true,
    };

    const rawCommand = readStringField(taskPayload, 'command')
      ?? readStringField(taskPayload, 'command_text')
      ?? readStringField(taskPayload, 'message_text');
    const cleanedCommand = rawCommand ? stripFiniteEndConditions(rawCommand) : null;
    if (cleanedCommand) {
      taskPayload.command = cleanedCommand;
      taskPayload.command_text = cleanedCommand;
      taskPayload.message_text = cleanedCommand;
    }

    const taskType = (() => {
      if (parsed.taskType === 'channel.send') {
        return 'channel.send';
      }

      if (cleanedCommand && looksLikeChannelSendRequest(cleanedCommand, payload)) {
        return 'channel.send';
      }

      return parsed.taskType;
    })();

    if (taskType === 'channel.send') {
      const channel = readStringField(taskPayload, 'channel') ?? readStringField(payload, 'channel');
      const threadId = readStringField(taskPayload, 'thread_id') ?? readStringField(payload, 'thread_id');
      const extractedChannelMessage = cleanedCommand ? extractScheduledChannelMessageText(cleanedCommand) : null;
      const channelMessage = parsed.taskType === 'channel.send'
        ? readStringField(taskPayload, 'message_text')
          ?? extractedChannelMessage
          ?? readStringField(taskPayload, 'command')
        : extractedChannelMessage
          ?? readStringField(taskPayload, 'message_text')
          ?? readStringField(taskPayload, 'command');

      if (!isMessagingChannel(channel) || !threadId || !channelMessage) {
        throw new Error('channel.send schedules require channel, thread_id, and message_text.');
      }

      delete taskPayload.command;
      delete taskPayload.command_text;
      taskPayload.channel = channel;
      taskPayload.thread_id = threadId;
      taskPayload.message_text = channelMessage;
    }

    const { data, error } = await this.supabaseClient
      .from('user_schedules')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        task_type: taskType,
        task_payload: taskPayload,
        cron_expression: parsed.cronExpression,
        timezone: parsed.timezone,
        is_active: true,
        next_run: nextRun.toISOString(),
        remaining_runs,
        run_count: 0,
        end_at,
        topic: 'Schedule',
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    this.addTraceStep('schedule_created', `Created schedule ${(data as ScheduleRow).id}`);

    return {
      outcome: 'created',
      schedule: data,
      confirmation_message: parsed.confirmationMessage,
      summary: `Schedule created with next run at ${nextRun.toISOString()}.`,
      trace: this.getTrace(),
    };
  }

  private async notifyChannelIfNeeded(
    task: Task,
    payload: ScheduleManagePayload,
    result: ProcessorResult,
  ): Promise<void> {
    const channel = readStringField(payload, 'channel');
    if (!isMessagingChannel(channel)) {
      return;
    }

    const threadId = readStringField(payload, 'thread_id');
    if (!threadId) {
      return;
    }

    const resultRecord = result as Record<string, unknown>;
    const messageText = readStringField(resultRecord, 'confirmation_message') ?? readStringField(resultRecord, 'summary');
    if (!messageText) {
      return;
    }

    const externalMessageId = `${readStringField(payload, 'external_message_id') ?? task.id ?? 'schedule-manage'}:reply:${randomUUID()}`;
    const channelMetadata = payload.channel_metadata && typeof payload.channel_metadata === 'object' && !Array.isArray(payload.channel_metadata)
      ? payload.channel_metadata as Record<string, unknown>
      : {};

    await this.channelRouterService.enqueueOutbound({
      channel,
      organization_id: task.organization_id,
      user_id: task.user_id ?? undefined,
      external_message_id: externalMessageId,
      thread_id: threadId,
      message_text: messageText,
      channel_metadata: channelMetadata,
      correlation_id: readStringField(payload, 'correlation_id') ?? undefined,
    });
  }

  private async updateScheduleActiveState(
    organizationId: string,
    userId: string,
    messageText: string,
    active: boolean,
  ): Promise<ProcessorResult> {
    const scheduleId = parseScheduleId(messageText);
    if (!scheduleId) {
      throw new Error('Schedule id is required. Example: pause schedule <uuid>.');
    }

    const { data: existing, error: selectError } = await this.supabaseClient
      .from('user_schedules')
      .select('*')
      .eq('id', scheduleId)
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (selectError) {
      throw new Error(selectError.message);
    }

    if (!existing) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const existingSchedule = existing as ScheduleRow;
    const updatePayload: Record<string, unknown> = {
      is_active: active,
      updated_at: this.now().toISOString(),
    };

    if (active) {
      updatePayload.next_run = computeNextRunFromCron(
        existingSchedule.cron_expression,
        existingSchedule.timezone,
        this.now(),
      ).toISOString();
    }

    const { error: updateError } = await this.supabaseClient
      .from('user_schedules')
      .update(updatePayload)
      .eq('id', scheduleId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    const outcome = active ? 'resumed' : 'paused';
    this.addTraceStep('schedule_state_updated', `${outcome} schedule ${scheduleId}`);

    return {
      outcome,
      schedule_id: scheduleId,
      summary: active ? 'Schedule resumed.' : 'Schedule paused.',
      trace: this.getTrace(),
    };
  }

  private async deleteSchedule(
    organizationId: string,
    userId: string,
    messageText: string,
  ): Promise<ProcessorResult> {
    const scheduleId = parseScheduleId(messageText);
    if (!scheduleId) {
      throw new Error('Schedule id is required. Example: delete schedule <uuid>.');
    }

    const { data: existing, error: selectError } = await this.supabaseClient
      .from('user_schedules')
      .select('*')
      .eq('id', scheduleId)
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (selectError) {
      throw new Error(selectError.message);
    }

    if (!existing) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const { error } = await this.supabaseClient
      .from('user_schedules')
      .delete()
      .eq('id', scheduleId);

    if (error) {
      throw new Error(error.message);
    }

    this.addTraceStep('schedule_deleted', `Deleted schedule ${scheduleId}`);

    return {
      outcome: 'deleted',
      schedule_id: scheduleId,
      summary: 'Schedule deleted.',
      trace: this.getTrace(),
    };
  }
}
