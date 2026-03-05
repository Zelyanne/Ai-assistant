import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase.js';

type OrgId = string;

type SafetyControlsRow = {
  organization_id: string;
  emergency_brake_enabled: boolean;
};

type PostgresChangePayload = {
  eventType?: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: unknown;
  old?: unknown;
};

function isSafetyControlsRow(value: unknown): value is SafetyControlsRow {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.organization_id === 'string' && typeof v.emergency_brake_enabled === 'boolean';
}

export class SafetyControlsService {
  private static cache = new Map<OrgId, boolean>();
  private static channel: RealtimeChannel | null = null;
  private static subscribed = false;
  private static subscribePromise: Promise<void> | null = null;

  static async isEmergencyBrakeEnabled(organizationId: string): Promise<boolean> {
    const cached = this.cache.get(organizationId);
    if (typeof cached === 'boolean') return cached;

    await this.ensureRealtimeSubscription();
    const enabled = await this.fetchBrakeState(organizationId);
    this.cache.set(organizationId, enabled);
    return enabled;
  }

  static async shutdown(): Promise<void> {
    if (!this.channel) return;
    try {
      await this.channel.unsubscribe();
    } finally {
      supabase.removeChannel(this.channel);
      this.channel = null;
      this.subscribed = false;
      this.subscribePromise = null;
    }
  }

  static __dangerousResetForTests(): void {
    this.cache.clear();
    this.channel = null;
    this.subscribed = false;
    this.subscribePromise = null;
  }

  private static async fetchBrakeState(organizationId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('org_safety_controls')
        .select('emergency_brake_enabled')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (error) {
        console.error(`[SafetyControlsService] Failed to fetch org safety controls: ${error.message}`);
        return false;
      }

      return data?.emergency_brake_enabled === true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[SafetyControlsService] Unexpected fetch error: ${message}`);
      return false;
    }
  }

  private static async ensureRealtimeSubscription(): Promise<void> {
    if (this.subscribed) return;
    if (this.subscribePromise) return this.subscribePromise;

    this.subscribePromise = Promise.resolve().then(() => {
      if (this.subscribed) return;

      this.channel = supabase
        .channel('public:org_safety_controls')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'org_safety_controls' },
          (payload: PostgresChangePayload) => {
            this.applyRealtimeChange(payload);
          },
        )
        .subscribe();

      this.subscribed = true;
    });

    return this.subscribePromise;
  }

  private static applyRealtimeChange(payload: PostgresChangePayload): void {
    const eventType = payload.eventType;
    const row = (eventType === 'DELETE' ? payload.old : payload.new) ?? null;

    if (!isSafetyControlsRow(row)) return;

    if (eventType === 'DELETE') {
      this.cache.delete(row.organization_id);
      return;
    }

    this.cache.set(row.organization_id, row.emergency_brake_enabled);
  }
}
