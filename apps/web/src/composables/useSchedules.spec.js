import { describe, expect, it } from 'vitest';
import { computeNextRunFromCron } from './useSchedules.ts';

describe('computeNextRunFromCron', () => {
  it('computes the next hourly UTC run after the current minute', () => {
    const nextRun = computeNextRunFromCron('0 * * * *', 'UTC', new Date('2026-03-20T10:15:00.000Z'));
    expect(nextRun.toISOString()).toBe('2026-03-20T11:00:00.000Z');
  });

  it('computes the next daily run in a non-UTC timezone', () => {
    const nextRun = computeNextRunFromCron('0 9 * * *', 'America/New_York', new Date('2026-03-20T10:15:00.000Z'));
    expect(nextRun.toISOString()).toBe('2026-03-20T13:00:00.000Z');
  });
});
