import { supabase } from './supabase.js';
import {
  buildStatusReportIdempotencyKey,
  resolveStatusReportWindow,
  STATUS_REPORT_TRIGGER_DAY_UTC,
  STATUS_REPORT_TRIGGER_TIME_UTC,
} from '@ai-assistant/shared';

const DEFAULT_CHECK_INTERVAL_MS = 60 * 1000;

type StatusReportSchedulerDeps = {
  now?: () => Date;
  checkIntervalMs?: number;
  supabaseClient?: {
    from: (table: string) => any;
  };
};

export const resolveWeeklyReportingWindow = resolveStatusReportWindow;
export { buildStatusReportIdempotencyKey };

function utcTimeLabel(date: Date): string {
  return date.toISOString().slice(11, 16);
}

export class StatusReportScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly now: () => Date;
  private readonly checkIntervalMs: number;
  private readonly supabaseClient: {
    from: (table: string) => any;
  };
  private lastTriggerSlot: string | null = null;

  constructor(deps: StatusReportSchedulerDeps = {}) {
    this.now = deps.now ?? (() => new Date());
    this.checkIntervalMs = deps.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.supabaseClient = deps.supabaseClient ?? supabase;
  }

  start(): void {
    console.log('[StatusReportScheduler] Starting status report monitor...');
    this.intervalId = setInterval(() => {
      void this.checkAndTriggerReports();
    }, this.checkIntervalMs);
    void this.checkAndTriggerReports();
  }

  stop(): void {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  async checkAndTriggerReports(): Promise<void> {
    const now = this.now();
    if (now.getUTCDay() !== STATUS_REPORT_TRIGGER_DAY_UTC) return;
    if (utcTimeLabel(now) !== STATUS_REPORT_TRIGGER_TIME_UTC) return;

    const triggerSlot = now.toISOString().slice(0, 16);
    if (this.lastTriggerSlot === triggerSlot) return;
    this.lastTriggerSlot = triggerSlot;

    const { start, end } = resolveWeeklyReportingWindow(now);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const { data: organizations, error: organizationsError } = await this.supabaseClient
      .from('organizations')
      .select('id');

    if (organizationsError) {
      console.error('[StatusReportScheduler] Failed to load organizations:', organizationsError.message);
      return;
    }

    const rows = (organizations ?? []) as Array<{ id: string }>;

    for (const org of rows) {
      const idempotencyKey = buildStatusReportIdempotencyKey(org.id, start, end);

      const existingTaskRes = await this.supabaseClient
        .from('tasks')
        .select('id')
        .eq('organization_id', org.id)
        .eq('domain_action', 'status.report')
        .contains('payload', { idempotency_key: idempotencyKey })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingTaskRes.error) {
        console.error(
          `[StatusReportScheduler] Failed idempotency check for org ${org.id}: ${existingTaskRes.error.message}`,
        );
        continue;
      }

      if (existingTaskRes.data?.id) {
        continue;
      }

      const { error: insertError } = await this.supabaseClient.from('tasks').insert({
        organization_id: org.id,
        user_id: null,
        domain_action: 'status.report',
        topic: 'Relancing',
        status: 'queued',
        payload: {
          report_period_start: startIso,
          report_period_end: endIso,
          idempotency_key: idempotencyKey,
          scheduled: true,
        },
      });

      if (insertError) {
        console.error(`[StatusReportScheduler] Failed to queue status.report for org ${org.id}: ${insertError.message}`);
      }
    }
  }
}

export const statusReportScheduler = new StatusReportScheduler();
