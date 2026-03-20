import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@ai-assistant/shared';
import type { ChannelRouterService } from '../services/channelRouter.js';
import { ScheduleManageProcessor } from './ScheduleManageProcessor.js';

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

function createTask(messageText: string): Task {
  return {
    id: crypto.randomUUID(),
    organization_id: '11111111-1111-4111-8111-111111111111',
    user_id: '22222222-2222-4222-8222-222222222222',
    domain_action: 'schedule.manage',
    status: 'queued',
    payload: {
      message_text: messageText,
      channel: 'telegram',
      external_message_id: 'ext-1',
      thread_id: 'thread-1',
      organization_id: '11111111-1111-4111-8111-111111111111',
    },
  };
}

describe('ScheduleManageProcessor', () => {
  let rows: ScheduleRow[];
  let enqueueOutbound: Pick<ChannelRouterService, 'enqueueOutbound'>['enqueueOutbound'];

  beforeEach(() => {
    rows = [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organization_id: '11111111-1111-4111-8111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        task_type: 'email.check',
        task_payload: {},
        cron_expression: '0 * * * *',
        timezone: 'UTC',
        is_active: true,
        next_run: '2026-03-20T11:00:00.000Z',
        last_run: null,
        failure_count: 0,
        last_error: null,
      },
    ];

    enqueueOutbound = vi.fn(async () => ({
      task_id: 'outbound-task-1',
      correlation_id: 'corr-1',
      message: {
        channel: 'telegram',
        organization_id: '11111111-1111-4111-8111-111111111111',
        external_message_id: 'outbound-ext-1',
        thread_id: 'thread-1',
        message_text: 'ok',
        channel_metadata: {},
      },
    })) as Pick<ChannelRouterService, 'enqueueOutbound'>['enqueueOutbound'];
  });

  function createMockSupabase() {
    return {
      from: (table: string) => {
        if (table !== 'user_schedules') {
          throw new Error(`Unhandled table: ${table}`);
        }

        return {
          select: () => {
            const filters: Record<string, unknown> = {};
            const chain = {
              eq: (column: string, value: unknown) => {
                filters[column] = value;
                return chain;
              },
              order: async () => ({
                data: rows.filter((row) =>
                  row.organization_id === filters.organization_id
                  && row.user_id === filters.user_id),
                error: null,
              }),
              maybeSingle: async () => {
                const found = rows.find((row) => row.id === filters.id);
                return { data: found ?? null, error: null };
              },
            };
            return chain;
          },
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const inserted: ScheduleRow = {
                  id: crypto.randomUUID(),
                  organization_id: String(payload.organization_id),
                  user_id: String(payload.user_id),
                  task_type: String(payload.task_type),
                  task_payload: (payload.task_payload as Record<string, unknown>) ?? {},
                  cron_expression: String(payload.cron_expression),
                  timezone: String(payload.timezone),
                  is_active: Boolean(payload.is_active),
                  next_run: String(payload.next_run),
                  last_run: null,
                  failure_count: 0,
                  last_error: null,
                };
                rows.push(inserted);
                return { data: inserted, error: null };
              },
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async (_column: string, id: string) => {
              rows = rows.map((row) => (row.id === id ? { ...row, ...payload } : row));
              return { error: null };
            },
          }),
          delete: () => ({
            eq: async (_column: string, id: string) => {
              rows = rows.filter((row) => row.id !== id);
              return { error: null };
            },
          }),
        };
      },
    };
  }

  it('lists schedules for the current user', async () => {
    const processor = new ScheduleManageProcessor({
      supabaseClient: createMockSupabase(),
      scheduleParser: {
        parse: vi.fn(async () => {
          throw new Error('not used');
        }),
      },
      channelRouterService: { enqueueOutbound },
    });

    const result = await processor.process(createTask('list my schedules'));

    expect(result.outcome).toBe('listed');
    expect(result.total).toBe(1);
  });

  it('creates a schedule from natural language', async () => {
    const parse = vi.fn(async () => ({
      cronExpression: '0 9 * * 1',
      timezone: 'UTC',
      taskType: 'reminder.send',
      taskPayload: { text: 'Check priorities' },
      confirmationMessage: 'Confirmed.',
      source: 'rules' as const,
    }));

    const processor = new ScheduleManageProcessor({
      supabaseClient: createMockSupabase(),
      scheduleParser: { parse },
      channelRouterService: { enqueueOutbound },
    });

    const result = await processor.process(createTask('confirm schedule remind me every monday at 9am'));

    expect(parse).toHaveBeenCalledOnce();
    expect(result.outcome).toBe('created');
    expect(rows).toHaveLength(2);
    expect(rows[1].task_type).toBe('reminder.send');
  });

  it('requests confirmation before creating a schedule from a messaging command', async () => {
    const parse = vi.fn(async () => ({
      cronExpression: '0 9 * * 1',
      timezone: 'UTC',
      taskType: 'reminder.send',
      taskPayload: { text: 'Check priorities' },
      confirmationMessage: 'Confirmed.',
      source: 'rules' as const,
    }));

    const processor = new ScheduleManageProcessor({
      supabaseClient: createMockSupabase(),
      scheduleParser: { parse },
      channelRouterService: { enqueueOutbound },
    });

    const result = await processor.process(createTask('create schedule remind me every monday at 9am'));

    expect(result.outcome).toBe('confirmation_requested');
    expect(rows).toHaveLength(1);
    expect(enqueueOutbound).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'telegram',
      thread_id: 'thread-1',
    }));
  });

  it('pauses and resumes an existing schedule', async () => {
    const processor = new ScheduleManageProcessor({
      supabaseClient: createMockSupabase(),
      scheduleParser: {
        parse: vi.fn(async () => {
          throw new Error('not used');
        }),
      },
      channelRouterService: { enqueueOutbound },
    });

    const paused = await processor.process(createTask('pause schedule aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
    expect(paused.outcome).toBe('paused');
    expect(rows[0].is_active).toBe(false);

    const resumed = await processor.process(createTask('resume schedule aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
    expect(resumed.outcome).toBe('resumed');
    expect(rows[0].is_active).toBe(true);
  });

  it('deletes an existing schedule', async () => {
    const processor = new ScheduleManageProcessor({
      supabaseClient: createMockSupabase(),
      scheduleParser: {
        parse: vi.fn(async () => {
          throw new Error('not used');
        }),
      },
      channelRouterService: { enqueueOutbound },
    });

    const result = await processor.process(createTask('delete schedule aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));

    expect(result.outcome).toBe('deleted');
    expect(rows).toHaveLength(0);
  });
});
