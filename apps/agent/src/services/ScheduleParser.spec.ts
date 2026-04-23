import { describe, expect, it, vi } from 'vitest';
import { ScheduleParser } from './scheduleParser.js';

describe('ScheduleParser', () => {
  it('parses hourly cadence with inferred task type', async () => {
    const parser = new ScheduleParser();

    const parsed = await parser.parse('Check my emails every hour', {
      timezone: 'UTC',
    });

    expect(parsed.cronExpression).toBe('0 * * * *');
    expect(parsed.taskType).toBe('assistant.command');
    expect(parsed.source).toBe('rules');
    expect(parsed.taskPayload.command).toBe('Check my emails');
    expect(parsed.confirmationMessage).toContain('assistant.command');
  });

  it('parses weekly schedule with day and meridiem time', async () => {
    const parser = new ScheduleParser();

    const parsed = await parser.parse('Remind me every Monday at 9am');

    expect(parsed.cronExpression).toBe('0 9 * * 1');
    expect(parsed.taskType).toBe('assistant.command');
    expect(parsed.source).toBe('rules');
    expect(parsed.taskPayload.command).toBe('Remind me');
  });

  it('parses minute interval cadence', async () => {
    const parser = new ScheduleParser();

    const parsed = await parser.parse('Run every 15 minutes');

    expect(parsed.cronExpression).toBe('*/15 * * * *');
    expect(parsed.source).toBe('rules');
  });

  it('uses llm fallback for complex natural language', async () => {
    const llmParse = vi.fn(async () => ({
      cronExpression: '0 17 * * 5',
      taskType: 'report.send',
      taskPayload: { summary: 'Weekly report' },
      confirmationMessage: 'I will send your report every Friday at 17:00.',
    }));

    const parser = new ScheduleParser({ llmParse });

    const parsed = await parser.parse('Send a status report at the end of each business week in the afternoon');

    expect(llmParse).toHaveBeenCalledOnce();
    expect(parsed.cronExpression).toBe('0 17 * * 5');
    expect(parsed.taskType).toBe('assistant.command');
    expect(parsed.source).toBe('llm');
    expect(typeof parsed.taskPayload.command).toBe('string');
  });

  it('throws when no parsing strategy can resolve a cron expression', async () => {
    const parser = new ScheduleParser({
      llmParse: async () => null,
    });

    await expect(parser.parse('Do the thing sometime when it feels right')).rejects.toThrow(
      'Unable to parse schedule expression',
    );
  });
});
