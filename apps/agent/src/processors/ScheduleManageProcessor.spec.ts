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
        task_type: 'assistant.command',
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
                  remaining_runs: typeof payload.remaining_runs === 'number' ? payload.remaining_runs : null,
                  run_count: typeof payload.run_count === 'number' ? payload.run_count : 0,
                  end_at: typeof payload.end_at === 'string' ? payload.end_at : null,
                  topic: typeof payload.topic === 'string' ? payload.topic : null,
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
      taskType: 'assistant.command',
      taskPayload: { command: 'Check priorities', command_text: 'Check priorities', message_text: 'Check priorities' },
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
    expect(rows[1].task_type).toBe('assistant.command');
  });

  it('preserves messaging context for scheduled channel sends', async () => {
    const parse = vi.fn(async () => ({
      cronExpression: '0 9 * * 1',
      timezone: 'UTC',
      taskType: 'assistant.command',
      taskPayload: {
        command: 'send a good morning text',
        command_text: 'send a good morning text',
        message_text: 'send a good morning text',
      },
      confirmationMessage: 'Confirmed.',
      source: 'rules' as const,
    }));

    const processor = new ScheduleManageProcessor({
      supabaseClient: createMockSupabase(),
      scheduleParser: { parse },
      channelRouterService: { enqueueOutbound },
    });

    const result = await processor.process(createTask('confirm schedule send a good morning text every monday at 9am for 3 weeks'));

    expect(result.outcome).toBe('created');
    expect(rows).toHaveLength(2);
    expect(rows[1].task_type).toBe('channel.send');
    expect(rows[1].task_payload).toMatchObject({
      channel: 'telegram',
      thread_id: 'thread-1',
      message_text: 'good morning',
      confirmed: true,
      high_risk: true,
    });
    expect(rows[1].remaining_runs).toBe(3);
    expect(rows[1].topic).toBe('Schedule');
  });

  it('strips one-off offset phrases from the stored command payload', async () => {
    const processor = new ScheduleManageProcessor({
      now: () => new Date('2026-03-20T10:00:00.000Z'),
      supabaseClient: createMockSupabase(),
      scheduleParser: {
        parse: vi.fn(async () => {
          throw new Error('not used');
        }),
      },
      channelRouterService: { enqueueOutbound },
    });

    const task: Task = {
      ...createTask('confirm schedule please in 2 hours remind me to send the update'),
      payload: {
        ...createTask('confirm schedule please in 2 hours remind me to send the update').payload,
        channel: 'web',
      },
    };

    const result = await processor.process(task);

    expect(result.outcome).toBe('created');
    expect(rows).toHaveLength(2);
    expect(rows[1].task_type).toBe('assistant.command');
    expect(rows[1].task_payload.command).toBe('please remind me to send the update');
    expect(String(rows[1].task_payload.command)).not.toContain('in 2 hours');
    expect(rows[1].remaining_runs).toBe(1);
  });

  it('creates a schedule directly from run_at_iso even when command has no scheduling keywords', async () => {
    const parse = vi.fn(async () => {
      throw new Error('not used');
    });

    const processor = new ScheduleManageProcessor({
      now: () => new Date('2026-03-20T10:00:00.000Z'),
      supabaseClient: createMockSupabase(),
      scheduleParser: { parse },
      channelRouterService: { enqueueOutbound },
    });

    const task: Task = {
      ...createTask('envoie un mail a othily.g@gmail.com'),
      payload: {
        ...createTask('envoie un mail a othily.g@gmail.com').payload,
        channel: 'web',
        confirmed: true,
        run_at_iso: '2026-03-20T10:10:00.000Z',
      },
    };

    const result = await processor.process(task);

    expect(result.outcome).toBe('created');
    expect(parse).not.toHaveBeenCalled();
    expect(rows).toHaveLength(2);
    expect(rows[1].task_type).toBe('assistant.command');
    expect(rows[1].next_run).toBe('2026-03-20T10:10:00.000Z');
    expect(rows[1].remaining_runs).toBe(1);
  });

  it('strips French one-off timing words when run_at_iso is provided', async () => {
    const parse = vi.fn(async () => {
      throw new Error('not used');
    });

    const processor = new ScheduleManageProcessor({
      now: () => new Date('2026-03-20T10:00:00.000Z'),
      supabaseClient: createMockSupabase(),
      scheduleParser: { parse },
      channelRouterService: { enqueueOutbound },
    });

    const task: Task = {
      ...createTask('dans 10 min envoie un mail a othily.g@gmail.com'),
      payload: {
        ...createTask('dans 10 min envoie un mail a othily.g@gmail.com').payload,
        channel: 'web',
        confirmed: true,
        run_at_iso: '2026-03-20T10:10:00.000Z',
      },
    };

    const result = await processor.process(task);

    expect(result.outcome).toBe('created');
    expect(parse).not.toHaveBeenCalled();
    expect(rows[1].task_payload.command).toBe('envoie un mail a othily.g@gmail.com');
    expect(String(rows[1].task_payload.command)).not.toContain('dans 10 min');
  });

  it('requests confirmation before creating a schedule from a messaging command', async () => {
    const parse = vi.fn(async () => ({
      cronExpression: '0 9 * * 1',
      timezone: 'UTC',
      taskType: 'assistant.command',
      taskPayload: { command: 'Check priorities', command_text: 'Check priorities', message_text: 'Check priorities' },
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
