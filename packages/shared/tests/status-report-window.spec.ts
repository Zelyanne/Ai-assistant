import { describe, expect, it } from 'vitest';
import {
  buildStatusReportIdempotencyKey,
  buildStatusReportPayload,
  resolveStatusReportWindow,
} from '../src/statusReportWindow';

describe('status report window helpers', () => {
  it('anchors reporting windows to the latest completed Friday 17:00 UTC slot', () => {
    const { start, end } = resolveStatusReportWindow(new Date('2026-03-13T17:05:00.000Z'));

    expect(start.toISOString()).toBe('2026-03-06T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-13T17:00:00.000Z');
  });

  it('falls back to the previous reporting slot before Friday 17:00 UTC', () => {
    const { start, end } = resolveStatusReportWindow(new Date('2026-03-13T16:59:00.000Z'));

    expect(start.toISOString()).toBe('2026-02-27T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-06T17:00:00.000Z');
  });

  it('builds org-scoped payloads for manual trigger idempotency', () => {
    const payload = buildStatusReportPayload('org-1', new Date('2026-03-13T17:05:00.000Z'), {
      force: true,
      manualTrigger: true,
    });

    expect(payload).toEqual({
      report_period_start: '2026-03-06T17:00:00.000Z',
      report_period_end: '2026-03-13T17:00:00.000Z',
      idempotency_key: buildStatusReportIdempotencyKey(
        'org-1',
        new Date('2026-03-06T17:00:00.000Z'),
        new Date('2026-03-13T17:00:00.000Z'),
      ),
      force: true,
      manual_trigger: true,
    });
  });
});
