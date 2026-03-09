const REPORT_WINDOW_DAYS = 7;
const REPORT_TRIGGER_DAY_UTC = 5;
const REPORT_TRIGGER_HOUR_UTC = 17;
const REPORT_TRIGGER_MINUTE_UTC = 0;

function resolveLatestReportingSlot(reference: Date): Date {
  const slot = new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate(),
      REPORT_TRIGGER_HOUR_UTC,
      REPORT_TRIGGER_MINUTE_UTC,
      0,
      0,
    ),
  );

  const daysSinceTriggerDay = (reference.getUTCDay() - REPORT_TRIGGER_DAY_UTC + 7) % 7;
  slot.setUTCDate(slot.getUTCDate() - daysSinceTriggerDay);

  if (reference.getTime() < slot.getTime()) {
    slot.setUTCDate(slot.getUTCDate() - REPORT_WINDOW_DAYS);
  }

  return slot;
}

export function resolveStatusReportWindow(reference: Date): { start: Date; end: Date } {
  const end = resolveLatestReportingSlot(reference);
  const start = new Date(end.getTime() - REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { start, end };
}

export function buildStatusReportIdempotencyKey(organizationId: string, start: Date, end: Date): string {
  return `status-report:${organizationId}:${start.toISOString().slice(0, 10)}:${end.toISOString().slice(0, 10)}`;
}

export function buildStatusReportPayload(
  organizationId: string,
  reference: Date,
  options: {
    force?: boolean;
    manualTrigger?: boolean;
  } = {},
): {
  report_period_start: string;
  report_period_end: string;
  idempotency_key: string;
  force?: boolean;
  manual_trigger?: boolean;
} {
  const { start, end } = resolveStatusReportWindow(reference);

  return {
    report_period_start: start.toISOString(),
    report_period_end: end.toISOString(),
    idempotency_key: buildStatusReportIdempotencyKey(organizationId, start, end),
    ...(options.force ? { force: true } : {}),
    ...(options.manualTrigger ? { manual_trigger: true } : {}),
  };
}

export const STATUS_REPORT_WINDOW_DAYS = REPORT_WINDOW_DAYS;
export const STATUS_REPORT_TRIGGER_DAY_LABEL_UTC = 'Friday';
export const STATUS_REPORT_TRIGGER_DAY_UTC = REPORT_TRIGGER_DAY_UTC;
export const STATUS_REPORT_TRIGGER_TIME_UTC = '17:00';
