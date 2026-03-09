import { supabase } from './supabase.js';
import { SafetyControlsService } from './SafetyControlsService.js';
import { AuditLogger } from './AuditLogger.js';

const DEFAULT_CHECK_INTERVAL_MS = 60 * 1000;
const DEFAULT_NUDGING_FREQUENCY_HOURS = 24;
const MIN_CADENCE_HOURS = 1;
const MAX_CADENCE_HOURS = 72;

type SetupStatus = 'incomplete' | 'complete';
type UrgencyBand = 'base' | 'urgent_7d' | 'urgent_3d' | 'overdue';
type ReasonCode = 'missing_required_fields' | 'deadline_urgency' | 'blocker_paused' | 'emergency_brake' | 'duplicate_prevented';

type SchedulerContextRow = {
  id: string;
  organization_id: string;
  project_name: string;
  deadline: string | null;
  setup_status: SetupStatus;
  scheduler_config: Record<string, unknown> | null;
  next_nudge_at: string | null;
  last_nudge_at: string | null;
  blocker_active: boolean;
  blocker_summary: string | null;
};

type BlockerAdjustmentState = {
  active: boolean;
  reason_code?: string;
};

type SchedulerMemberRow = {
  id: string;
  project_context_id: string;
  organization_id: string;
  member_user_id: string | null;
  member_name: string;
  is_active: boolean;
};

type DispatchClaim = {
  id: string;
  claimed: boolean;
};

type WindowBounds = {
  start: Date;
  end: Date;
};

type RelancingSchedulerDeps = {
  now?: () => Date;
  checkIntervalMs?: number;
  supabaseClient?: {
    from: (table: string) => any;
  };
  safetyControlsService?: {
    isEmergencyBrakeEnabled: (organizationId: string) => Promise<boolean>;
  };
};

export function isValidFutureDeadline(deadline: string | null | undefined, now: Date, allowOverdue: boolean): boolean {
  if (!deadline) return false;
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return false;
  if (parsed.getTime() > now.getTime()) return true;
  return allowOverdue;
}

export function resolveUrgencyBand(deadline: string, now: Date): UrgencyBand {
  const deadlineDate = new Date(deadline);
  const deltaMs = deadlineDate.getTime() - now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (deltaMs < 0) return 'overdue';
  if (deltaMs <= 3 * dayMs) return 'urgent_3d';
  if (deltaMs <= 7 * dayMs) return 'urgent_7d';
  return 'base';
}

export function resolveCadenceHours(baseHours: number, urgencyBand: UrgencyBand): number {
  const multiplierByBand: Record<UrgencyBand, number> = {
    base: 1,
    urgent_7d: 1.25,
    urgent_3d: 1.5,
    overdue: 2,
  };

  const safeBase = Math.min(Math.max(baseHours, MIN_CADENCE_HOURS), MAX_CADENCE_HOURS);
  const adjusted = safeBase / multiplierByBand[urgencyBand];
  return Math.min(Math.max(adjusted, MIN_CADENCE_HOURS), MAX_CADENCE_HOURS);
}

export function deriveWindowBounds(now: Date, cadenceHours: number): WindowBounds {
  const windowMs = Math.max(1, Math.round(cadenceHours * 60 * 60 * 1000));
  const startMs = Math.floor(now.getTime() / windowMs) * windowMs;
  const start = new Date(startMs);
  const end = new Date(startMs + windowMs);
  return { start, end };
}

export function collectMissingSetupFields(
  input: {
    projectName: string;
    membersCount: number;
    deadline: string | null;
  },
  now: Date,
  allowOverdue: boolean,
): string[] {
  const missing: string[] = [];
  if (input.projectName.trim().length === 0) missing.push('project_name');
  if (input.membersCount < 1) missing.push('members');
  if (!isValidFutureDeadline(input.deadline, now, allowOverdue)) missing.push('deadline');
  return missing;
}

export class RelancingScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly now: () => Date;
  private readonly checkIntervalMs: number;
  private readonly supabaseClient: {
    from: (table: string) => any;
  };
  private readonly safetyControlsService: {
    isEmergencyBrakeEnabled: (organizationId: string) => Promise<boolean>;
  };

  constructor(deps: RelancingSchedulerDeps = {}) {
    this.now = deps.now ?? (() => new Date());
    this.checkIntervalMs = deps.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.supabaseClient = deps.supabaseClient ?? supabase;
    this.safetyControlsService = deps.safetyControlsService ?? SafetyControlsService;
  }

  start(): void {
    console.log('[RelancingScheduler] Starting adaptive relancing scheduler...');
    this.intervalId = setInterval(() => {
      void this.runCycle();
    }, this.checkIntervalMs);
    void this.runCycle();
  }

  stop(): void {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  async runCycle(): Promise<void> {
    const now = this.now();

    try {
      const contexts = await this.loadActiveContexts();
      if (contexts.length === 0) return;

      for (const context of contexts) {
        await this.evaluateContext(context, now);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[RelancingScheduler] Failed run cycle: ${message}`);
    }
  }

  private async evaluateContext(context: SchedulerContextRow, now: Date): Promise<void> {
    const members = await this.loadActiveMembers(context.id);

    const allowOverdue = (context.scheduler_config ?? {}).allow_overdue_nudging === true;
    const missing = collectMissingSetupFields(
      {
        projectName: context.project_name,
        membersCount: members.length,
        deadline: context.deadline,
      },
      now,
      allowOverdue,
    );

    if (missing.length > 0) {
      await this.markSetupIncomplete(context.id, now);
      await this.writeAuditDecision(context.organization_id, null, 'missing_required_fields', {
        project_context_id: context.id,
        missing_fields: missing,
      });
      return;
    }

    const deadline = context.deadline as string;
    const baseCadence = await this.resolveBaseCadenceHours(context.organization_id, context.scheduler_config ?? {});
    const urgencyBand = resolveUrgencyBand(deadline, now);
    const cadenceHours = resolveCadenceHours(baseCadence, urgencyBand);

    if (!this.isDue(context.next_nudge_at, now)) return;

    const windowBounds = deriveWindowBounds(now, cadenceHours);

    const emergencyBrakeEnabled = await this.safetyControlsService.isEmergencyBrakeEnabled(context.organization_id);
    if (emergencyBrakeEnabled) {
      await this.handleBlockedContext({
        context,
        members,
        now,
        reasonCode: 'emergency_brake',
        summary: 'Nudge generation blocked because the Emergency Brake is engaged.',
        urgencyBand,
        cadenceHours,
        windowBounds,
        adjustment: { active: false },
      });
      await this.scheduleNextWindow(context.id, now, cadenceHours, false);
      return;
    }

    const adjustment = this.readBlockerAdjustmentState(context.scheduler_config ?? {});
    const blockerPaused = context.blocker_active || adjustment.active;

    if (blockerPaused) {
      const adjustmentReason = adjustment.reason_code ? ` (${adjustment.reason_code})` : '';
      const summary = context.blocker_summary?.trim().length
        ? `Nudge generation blocked due to active blocker: ${context.blocker_summary}${adjustmentReason}`
        : `Nudge generation blocked due to active blocker state${adjustmentReason}.`;

      await this.handleBlockedContext({
        context,
        members,
        now,
        reasonCode: 'blocker_paused',
        summary,
        urgencyBand,
        cadenceHours,
        windowBounds,
        adjustment,
      });
      await this.scheduleNextWindow(context.id, now, cadenceHours, false);
      return;
    }

    let queuedAny = false;

    for (const member of members) {
      const claim = await this.claimDispatchSlot({
        organizationId: context.organization_id,
        contextId: context.id,
        memberAssignmentId: member.id,
        windowBounds,
        reasonCode: 'deadline_urgency',
      });

      if (!claim.claimed) {
        await this.writeAuditDecision(context.organization_id, null, 'duplicate_prevented', {
          project_context_id: context.id,
          member_assignment_id: member.id,
          nudge_window_start: windowBounds.start.toISOString(),
        });
        continue;
      }

      const escalationPriority = urgencyBand === 'overdue' ? 'high' : 'normal';
      const payload = {
        project_context_id: context.id,
        member_assignment_id: member.id,
        project_name: context.project_name,
        member_name: member.member_name,
        member_user_id: member.member_user_id,
        deadline,
        urgency_band: urgencyBand,
        cadence_hours: cadenceHours,
        nudge_window_start: windowBounds.start.toISOString(),
        nudge_window_end: windowBounds.end.toISOString(),
        reason_code: 'deadline_urgency',
        escalation_priority: escalationPriority,
      };

      const { data: taskRow, error: taskError } = await this.supabaseClient
        .from('tasks')
        .insert({
          organization_id: context.organization_id,
          user_id: member.member_user_id,
          domain_action: 'relancing.nudge',
          topic: 'Relancing',
          status: 'queued',
          payload,
        })
        .select('id')
        .single();

      if (taskError) {
        console.error(
          `[RelancingScheduler] Failed to queue nudge task for context ${context.id} member ${member.id}: ${taskError.message}`,
        );
        continue;
      }

      queuedAny = true;
      await this.attachTaskToDispatch(claim.id, taskRow?.id ?? null);
      await this.writeAuditDecision(context.organization_id, taskRow?.id ?? null, 'deadline_urgency', {
        project_context_id: context.id,
        member_assignment_id: member.id,
        urgency_band: urgencyBand,
        cadence_hours: cadenceHours,
        escalation_priority: escalationPriority,
      });
    }

    await this.scheduleNextWindow(context.id, now, cadenceHours, queuedAny);
  }

  private async handleBlockedContext(input: {
    context: SchedulerContextRow;
    members: SchedulerMemberRow[];
    now: Date;
    reasonCode: Extract<ReasonCode, 'blocker_paused' | 'emergency_brake'>;
    summary: string;
    urgencyBand: UrgencyBand;
    cadenceHours: number;
    windowBounds: WindowBounds;
    adjustment: BlockerAdjustmentState;
  }): Promise<void> {
    const { context, members, reasonCode, summary, urgencyBand, cadenceHours, windowBounds, adjustment } = input;

    for (const member of members) {
      const claim = await this.claimDispatchSlot({
        organizationId: context.organization_id,
        contextId: context.id,
        memberAssignmentId: member.id,
        windowBounds,
        reasonCode,
      });

      if (!claim.claimed) {
        await this.writeAuditDecision(context.organization_id, null, 'duplicate_prevented', {
          project_context_id: context.id,
          member_assignment_id: member.id,
          nudge_window_start: windowBounds.start.toISOString(),
          reason_code: reasonCode,
          blocker_adjustment: adjustment,
        });
        continue;
      }

      const { data: taskRow, error: taskError } = await this.supabaseClient
        .from('tasks')
        .insert({
          organization_id: context.organization_id,
          user_id: member.member_user_id,
          domain_action: 'relancing.nudge',
          topic: 'Relancing',
          status: 'paused',
          payload: {
            project_context_id: context.id,
            member_assignment_id: member.id,
            project_name: context.project_name,
            member_name: member.member_name,
            member_user_id: member.member_user_id,
            deadline: context.deadline,
            urgency_band: urgencyBand,
            cadence_hours: cadenceHours,
            nudge_window_start: windowBounds.start.toISOString(),
            nudge_window_end: windowBounds.end.toISOString(),
            reason_code: reasonCode,
            blocked: true,
          },
          result: {
            summary,
            reason_code: reasonCode,
            blocked: true,
          },
        })
        .select('id')
        .single();

      if (taskError) {
        console.error(
          `[RelancingScheduler] Failed to persist paused nudge task for context ${context.id} member ${member.id}: ${taskError.message}`,
        );
        continue;
      }

      await this.attachTaskToDispatch(claim.id, taskRow?.id ?? null);
      await this.writeAuditDecision(context.organization_id, taskRow?.id ?? null, reasonCode, {
        project_context_id: context.id,
        member_assignment_id: member.id,
        summary,
        blocker_adjustment: adjustment,
      });
    }
  }

  private readBlockerAdjustmentState(schedulerConfig: Record<string, unknown>): BlockerAdjustmentState {
    const rawAdjustment = schedulerConfig.blocker_adjustment;
    if (!rawAdjustment || typeof rawAdjustment !== 'object') {
      return { active: false };
    }

    const adjustment = rawAdjustment as Record<string, unknown>;
    const active = adjustment.active === true;
    const reasonCode = typeof adjustment.reason_code === 'string' ? adjustment.reason_code : undefined;

    return {
      active,
      reason_code: reasonCode,
    };
  }

  private async claimDispatchSlot(input: {
    organizationId: string;
    contextId: string;
    memberAssignmentId: string;
    windowBounds: WindowBounds;
    reasonCode: Exclude<ReasonCode, 'duplicate_prevented' | 'missing_required_fields'>;
  }): Promise<DispatchClaim> {
    const { organizationId, contextId, memberAssignmentId, windowBounds, reasonCode } = input;
    const nudgeWindowStart = windowBounds.start.toISOString();

    const { data: existingRow, error: existingError } = await this.supabaseClient
      .from('project_nudge_dispatches')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('project_context_id', contextId)
      .eq('member_assignment_id', memberAssignmentId)
      .eq('nudge_window_start', nudgeWindowStart)
      .maybeSingle();

    if (existingError) {
      console.error('[RelancingScheduler] Failed dispatch idempotency check:', existingError.message);
      return { id: '', claimed: false };
    }

    if (existingRow?.id) {
      return { id: existingRow.id, claimed: false };
    }

    const { data: inserted, error: insertError } = await this.supabaseClient
      .from('project_nudge_dispatches')
      .insert({
        organization_id: organizationId,
        project_context_id: contextId,
        member_assignment_id: memberAssignmentId,
        nudge_window_start: nudgeWindowStart,
        nudge_window_end: windowBounds.end.toISOString(),
        reason_code: reasonCode,
      })
      .select('id')
      .single();

    if (insertError || !inserted?.id) {
      console.error('[RelancingScheduler] Failed to claim dispatch slot:', insertError?.message ?? 'Missing dispatch id');
      return { id: '', claimed: false };
    }

    return { id: inserted.id, claimed: true };
  }

  private async attachTaskToDispatch(dispatchId: string, taskId: string | null): Promise<void> {
    if (!dispatchId || !taskId) return;

    const { error } = await this.supabaseClient
      .from('project_nudge_dispatches')
      .update({ task_id: taskId })
      .eq('id', dispatchId);

    if (error) {
      console.error(`[RelancingScheduler] Failed to link task ${taskId} to dispatch ${dispatchId}: ${error.message}`);
    }
  }

  private async markSetupIncomplete(contextId: string, now: Date): Promise<void> {
    const { error } = await this.supabaseClient
      .from('project_scheduling_contexts')
      .update({
        setup_status: 'incomplete',
        next_nudge_at: null,
        updated_at: now.toISOString(),
      })
      .eq('id', contextId);

    if (error) {
      console.error(`[RelancingScheduler] Failed to reset setup_status for context ${contextId}: ${error.message}`);
    }
  }

  private async scheduleNextWindow(contextId: string, now: Date, cadenceHours: number, queuedAny: boolean): Promise<void> {
    const nextNudgeAt = new Date(now.getTime() + Math.round(cadenceHours * 60 * 60 * 1000));
    const updatePayload: Record<string, string | null> = {
      next_nudge_at: nextNudgeAt.toISOString(),
      updated_at: now.toISOString(),
    };

    if (queuedAny) {
      updatePayload.last_nudge_at = now.toISOString();
    }

    const { error } = await this.supabaseClient
      .from('project_scheduling_contexts')
      .update(updatePayload)
      .eq('id', contextId);

    if (error) {
      console.error(`[RelancingScheduler] Failed to update next nudge window for context ${contextId}: ${error.message}`);
    }
  }

  private async loadActiveContexts(): Promise<SchedulerContextRow[]> {
    const { data, error } = await this.supabaseClient
      .from('project_scheduling_contexts')
      .select('*')
      .eq('setup_status', 'complete');

    if (error) {
      console.error(`[RelancingScheduler] Failed to load project contexts: ${error.message}`);
      return [];
    }

    return (data ?? []) as SchedulerContextRow[];
  }

  private async loadActiveMembers(contextId: string): Promise<SchedulerMemberRow[]> {
    const { data, error } = await this.supabaseClient
      .from('project_member_assignments')
      .select('*')
      .eq('project_context_id', contextId)
      .eq('is_active', true);

    if (error) {
      console.error(`[RelancingScheduler] Failed to load project members for ${contextId}: ${error.message}`);
      return [];
    }

    return (data ?? []) as SchedulerMemberRow[];
  }

  private async resolveBaseCadenceHours(
    organizationId: string,
    schedulerConfig: Record<string, unknown>,
  ): Promise<number> {
    const overrideValue = schedulerConfig.nudging_frequency_hours_override;
    if (typeof overrideValue === 'number' && Number.isFinite(overrideValue) && overrideValue > 0) {
      return overrideValue;
    }

    const { data, error } = await this.supabaseClient
      .from('user_protocols')
      .select('metadata')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error(`[RelancingScheduler] Failed to load protocol metadata for org ${organizationId}: ${error.message}`);
      return DEFAULT_NUDGING_FREQUENCY_HOURS;
    }

    const metadata = data?.[0]?.metadata as Record<string, unknown> | undefined;
    const cadenceValue = metadata?.nudging_frequency_hours;
    if (typeof cadenceValue === 'number' && Number.isFinite(cadenceValue) && cadenceValue > 0) {
      return cadenceValue;
    }

    return DEFAULT_NUDGING_FREQUENCY_HOURS;
  }

  private isDue(nextNudgeAt: string | null, now: Date): boolean {
    if (!nextNudgeAt) return true;
    const parsed = new Date(nextNudgeAt);
    if (Number.isNaN(parsed.getTime())) return true;
    return parsed.getTime() <= now.getTime();
  }

  private async writeAuditDecision(
    organizationId: string,
    taskId: string | null,
    reasonCode: ReasonCode,
    details: Record<string, unknown>,
  ): Promise<void> {
    const step = AuditLogger.createStep('Relancing Scheduler', `Decision: ${reasonCode}`, {
      input_summary: `reason_code=${reasonCode}`,
      output_summary: JSON.stringify(details),
    });

    const { error } = await this.supabaseClient.from('agent_activity_log').insert({
      organization_id: organizationId,
      task_id: taskId,
      agent_id: 'relancing-scheduler',
      action_taken: 'relancing_scheduler_decision',
      reasoning_trace: [step],
      citations: [],
    });

    if (error) {
      console.error(`[RelancingScheduler] Failed to write audit decision ${reasonCode}: ${error.message}`);
    }
  }
}

export const relancingScheduler = new RelancingScheduler();
