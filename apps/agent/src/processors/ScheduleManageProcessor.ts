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
  is_active: boolean;
  next_run: string;
  last_run: string | null;
  failure_count: number;
  last_error: string | null;
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
  return /\b(create\s+schedule|schedule\s+this|every\b|daily\b|weekly\b|monthly\b)\b/.test(messageText);
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
    const confirmed = payload.confirmed === true || isConfirmedCreateCommand(messageText);
    const normalizedCommandText = confirmed ? stripConfirmationPrefix(messageText) : messageText;
    const organizationId = task.organization_id;
    const userId = task.user_id;

    if (!organizationId || !userId) {
      throw new Error('schedule.manage requires organization_id and user_id');
    }

    const normalized = normalizedCommandText.toLowerCase();
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

    if (isCreateCommand(normalized)) {
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
    const parsed = await this.scheduleParser.parse(messageText, timezone ? { timezone } : undefined);

    if (!confirmed) {
      this.addTraceStep('schedule_confirmation_requested', `Requested confirmation for cron ${parsed.cronExpression}`);

      return {
        outcome: 'confirmation_requested',
        confirmation_message: `${parsed.confirmationMessage} Reply with: confirm schedule ${messageText}`,
        summary: 'Schedule confirmation requested.',
        trace: this.getTrace(),
      };
    }

    const nextRun = computeNextRunFromCron(parsed.cronExpression, parsed.timezone, this.now());

    const { data, error } = await this.supabaseClient
      .from('user_schedules')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        task_type: parsed.taskType,
        task_payload: parsed.taskPayload,
        cron_expression: parsed.cronExpression,
        timezone: parsed.timezone,
        is_active: true,
        next_run: nextRun.toISOString(),
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
