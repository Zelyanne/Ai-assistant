import { config } from '../config/index.js';
import { supabase } from './supabase.js';

const DEFAULT_CHECK_INTERVAL_MS = 60 * 1000;
const DEFAULT_EOD_TRIGGER_TIME_UTC = '23:00';
const EOD_DOMAIN_ACTION = 'eod.memory.rotate';

type EODSchedulerDeps = {
  now?: () => Date;
  checkIntervalMs?: number;
  triggerTimeUtc?: string;
  organizationTriggerTimeOverrides?: Record<string, string>;
  supabaseClient?: {
    from: (table: string) => any;
  };
};

function utcTimeLabel(date: Date): string {
  return date.toISOString().slice(11, 16);
}

function isValidUtcTimeLabel(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export class EODScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly now: () => Date;
  private readonly checkIntervalMs: number;
  private readonly supabaseClient: {
    from: (table: string) => any;
  };
  private readonly defaultTriggerTimeUtc: string;
  private readonly organizationTriggerTimeOverrides: Record<string, string>;
  private readonly lastTriggerSlotByOrganization: Map<string, string> = new Map();
  private readonly lastRunByOrganization: Map<string, string> = new Map();

  constructor(deps: EODSchedulerDeps = {}) {
    this.now = deps.now ?? (() => new Date());
    this.checkIntervalMs = deps.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.supabaseClient = deps.supabaseClient ?? supabase;

    const configuredTrigger =
      deps.triggerTimeUtc ?? config.EOD_TRIGGER_TIME_UTC ?? DEFAULT_EOD_TRIGGER_TIME_UTC;
    this.defaultTriggerTimeUtc = isValidUtcTimeLabel(configuredTrigger)
      ? configuredTrigger
      : DEFAULT_EOD_TRIGGER_TIME_UTC;

    const configuredOverrides =
      deps.organizationTriggerTimeOverrides ?? config.EOD_TRIGGER_TIME_BY_ORG_JSON ?? {};
    this.organizationTriggerTimeOverrides = Object.fromEntries(
      Object.entries(configuredOverrides).filter(([, value]) => isValidUtcTimeLabel(value)),
    );
  }

  private getTriggerTimeForOrganization(organizationId: string): string {
    return this.organizationTriggerTimeOverrides[organizationId] ?? this.defaultTriggerTimeUtc;
  }

  start(): void {
    console.log('[EODScheduler] Starting EOD memory rotation monitor...');
    this.intervalId = setInterval(() => {
      void this.checkAndTriggerEOD();
    }, this.checkIntervalMs);
    void this.checkAndTriggerEOD();
  }

  stop(): void {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  async checkAndTriggerEOD(): Promise<void> {
    const now = this.now();
    const currentHhMm = utcTimeLabel(now);
    const triggerSlot = now.toISOString().slice(0, 16);
    const eodDate = now.toISOString().slice(0, 10);

    const { data: organizations, error: organizationsError } = await this.supabaseClient
      .from('organizations')
      .select('id');

    if (organizationsError) {
      console.error('[EODScheduler] Failed to load organizations:', organizationsError.message);
      return;
    }

    const rows = (organizations ?? []) as Array<{ id: string }>;

    for (const org of rows) {
      const organizationTriggerTime = this.getTriggerTimeForOrganization(org.id);

      if (currentHhMm !== organizationTriggerTime) {
        continue;
      }

      if (this.lastTriggerSlotByOrganization.get(org.id) === triggerSlot) {
        continue;
      }
      this.lastTriggerSlotByOrganization.set(org.id, triggerSlot);

      if (this.lastRunByOrganization.get(org.id) === eodDate) {
        continue;
      }

      const existingTaskRes = await this.supabaseClient
        .from('tasks')
        .select('id')
        .eq('organization_id', org.id)
        .eq('domain_action', EOD_DOMAIN_ACTION)
        .contains('payload', { eod_date: eodDate })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingTaskRes.error) {
        console.error(
          `[EODScheduler] Failed idempotency check for org ${org.id}: ${existingTaskRes.error.message}`,
        );
        continue;
      }

      if (existingTaskRes.data?.id) {
        this.lastRunByOrganization.set(org.id, eodDate);
        continue;
      }

      const { error: insertError } = await this.supabaseClient.from('tasks').insert({
        organization_id: org.id,
        user_id: null,
        domain_action: EOD_DOMAIN_ACTION,
        topic: 'Memory',
        status: 'queued',
        payload: {
          eod_date: eodDate,
          trigger_time_utc: organizationTriggerTime,
          scheduled: true,
        },
      });

      if (insertError) {
        console.error(`[EODScheduler] Failed to queue EOD task for org ${org.id}: ${insertError.message}`);
        continue;
      }

      this.lastRunByOrganization.set(org.id, eodDate);
    }
  }
}

export const EOD_TRIGGER_TIME_UTC = config.EOD_TRIGGER_TIME_UTC ?? DEFAULT_EOD_TRIGGER_TIME_UTC;
export const EOD_TRIGGER_TIME_BY_ORG = config.EOD_TRIGGER_TIME_BY_ORG_JSON ?? {};
export const eodScheduler = new EODScheduler();
