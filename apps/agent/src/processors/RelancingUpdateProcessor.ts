import { z } from 'zod';
import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { ChannelSchema, type Json, type RelancingUpdateIntent, type Task } from '@ai-assistant/shared';
import { supabase } from '../services/supabase.js';
import { AuditLogger } from '../services/AuditLogger.js';
import { resolveCadenceHours, resolveUrgencyBand } from '../services/RelancingScheduler.js';

const DEFAULT_NUDGING_FREQUENCY_HOURS = 24;
const MIN_CADENCE_HOURS = 1;
const MAX_CADENCE_HOURS = 72;

function coerceJson(value: unknown): Json {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }

  if (typeof value === 'undefined') {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => coerceJson(item));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, Json | undefined> = {};
    for (const [k, v] of Object.entries(record)) {
      out[k] = coerceJson(v);
    }
    return out;
  }

  return String(value);
}

const RelancingInboundPayloadSchema = z.object({
  channel: ChannelSchema,
  external_message_id: z.string().min(1),
  thread_id: z.string().min(1),
  organization_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  project_context_id: z.string().uuid().optional(),
  member_assignment_id: z.string().uuid().optional(),
  message_text: z.string().optional(),
  correlation_id: z.string().optional(),
  channel_metadata: z.record(z.unknown()).optional(),
  raw_payload: z.record(z.unknown()).optional(),
});

function readOptionalUuid(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && z.string().uuid().safeParse(value).success ? value : undefined;
}

function parseIntents(text: string): RelancingUpdateIntent[] {
  const lower = text.toLowerCase();
  const intents: RelancingUpdateIntent[] = [];

  const blocker = /\b(blocked|blocker|stuck|waiting for|can't proceed|cannot proceed)\b/i.test(lower);
  if (blocker) {
    intents.push('blocker_report');
  }

  const status = /\b(status|progress|done|completed|complete|working on|in progress|finished|finish|wrapped up|shipped|started|starting|testing|reviewing|on track)\b/i.test(lower);
  if (status) {
    intents.push('status_update');
  }

  return intents;
}

function isAmbiguousReply(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (normalized.length < 8) {
    return true;
  }

  return /^(ok|okay|k|thanks|thank you|sounds good|will do|got it|noted|sure|yes|no|yep|nope|👍|roger)$/i.test(normalized);
}

function extractEtaHint(text: string): string | undefined {
  const eta = text.match(/\bETA\b\s*[:-]?\s*(.+)$/i);
  if (eta?.[1]) {
    return eta[1].trim();
  }

  const by = text.match(/\bby\b\s+([^.\n]+)$/i);
  if (by?.[1]) {
    return `by ${by[1].trim()}`;
  }

  return undefined;
}

function extractDependency(text: string): string | undefined {
  const match = text.match(/\b(waiting for|blocked on|depends on)\b\s+([^.\n]+)$/i);
  if (!match?.[2]) {
    return undefined;
  }

  return match[2].trim();
}

function extractRequestedHelp(text: string): string | undefined {
  const match = text.match(/\b(need help|help needed|can someone|could someone|please help)\b[^.\n]*/i);
  if (!match?.[0]) {
    return undefined;
  }

  return match[0].trim();
}

function blockerSummaryFromText(text: string): string {
  return text.replace(/^\s*(blocked|blocker|stuck)\s*[:-]?\s*/i, '').trim();
}

function clampCadenceHours(value: number): number {
  return Math.min(Math.max(value, MIN_CADENCE_HOURS), MAX_CADENCE_HOURS);
}

function resolveBaseCadenceHoursFromConfig(schedulerConfig: Record<string, unknown> | null | undefined): number {
  const override = schedulerConfig?.nudging_frequency_hours_override;
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return clampCadenceHours(override);
  }

  return DEFAULT_NUDGING_FREQUENCY_HOURS;
}

function isResumeSignal(text: string): boolean {
  return /\b(unblocked|resolved|fixed|issue resolved|no longer blocked|progressing|completed|done|moving forward|back on track)\b/i.test(text);
}

export type RelancingUpdateOutcome =
  | {
      outcome: 'setup_required';
      prompt: string;
    }
  | {
      outcome: 'ambiguity_escalated';
      prompt: string;
      summary: string;
    }
  | {
      outcome: 'duplicate_prevented';
      idempotency_key: string;
      summary: string;
    }
  | {
      outcome: 'applied';
      relancing_update_id: string;
      idempotency_key: string;
      project_context_id: string;
      member_assignment_id: string;
      intents: RelancingUpdateIntent[];
      progress_summary?: string;
      blocker_summary?: string;
      dependency?: string;
      requested_help?: string;
      eta_hint?: string;
      blocker_paused: boolean;
      blocker_resumed?: boolean;
      summary: string;
    };

export class RelancingUpdateProcessor extends BaseProcessor {
  private async flushAudit(task: Task, actionTaken: string, citations: Array<ReturnType<typeof AuditLogger.createCitation>> = []): Promise<void> {
    await AuditLogger.flush(
      task.organization_id,
      task.id ?? null,
      task.user_id ?? 'system',
      actionTaken,
      this.getTrace(),
      citations,
    );
  }

  async process(task: Task): Promise<ProcessorResult> {
    this.clearTrace();
    const parsed = RelancingInboundPayloadSchema.parse(task.payload);
    const messageText = (parsed.message_text ?? '').trim();
    const userId = typeof task.user_id === 'string' ? task.user_id : (parsed.user_id ?? null);

    this.addTraceStep('relancing_update_received', `Received ${parsed.channel} relancing update`, 1);

    if (!userId) {
      this.addTraceStep('setup_required', 'No user_id available for member/project linkage', 0);
      const result: RelancingUpdateOutcome = {
        outcome: 'setup_required',
        prompt: 'setup_required: this channel reply is not linked to a known project/member. Complete relancing setup (and ensure the channel is associated to your user) then retry.',
      };
      await this.flushAudit(task, 'relancing_update: setup_required');
      return result;
    }

    if (!messageText) {
      this.addTraceStep('setup_required', 'Inbound relancing update was empty', 0);
      const result: RelancingUpdateOutcome = {
        outcome: 'setup_required',
        prompt: 'setup_required: empty update message. Reply with a status update or blocker report to continue.',
      };
      await this.flushAudit(task, 'relancing_update: setup_required');
      return result;
    }

    const explicitProjectContextId = parsed.project_context_id
      ?? readOptionalUuid(parsed.channel_metadata, 'project_context_id')
      ?? readOptionalUuid(parsed.raw_payload, 'project_context_id');
    const explicitMemberAssignmentId = parsed.member_assignment_id
      ?? readOptionalUuid(parsed.channel_metadata, 'member_assignment_id')
      ?? readOptionalUuid(parsed.raw_payload, 'member_assignment_id');

    let assignmentsQuery = supabase
      .from('project_member_assignments')
      .select('id, project_context_id, member_user_id')
      .eq('organization_id', task.organization_id)
      .eq('is_active', true);

    if (explicitMemberAssignmentId) {
      assignmentsQuery = assignmentsQuery.eq('id', explicitMemberAssignmentId).eq('member_user_id', userId);
    } else {
      assignmentsQuery = assignmentsQuery.eq('member_user_id', userId);
      if (explicitProjectContextId) {
        assignmentsQuery = assignmentsQuery.eq('project_context_id', explicitProjectContextId);
      }
    }

    const { data: assignments, error: assignmentsError } = await assignmentsQuery;

    if (assignmentsError) {
      throw new Error(assignmentsError.message);
    }

    if (!assignments || assignments.length === 0) {
      this.addTraceStep('setup_required', 'No active project_member_assignments row matched this user', 0);
      const result: RelancingUpdateOutcome = {
        outcome: 'setup_required',
        prompt: 'setup_required: no active relancing assignment found for this member. Complete relancing setup before sending updates.',
      };
      await this.flushAudit(task, 'relancing_update: setup_required');
      return result;
    }

    let resolvedAssignments = assignments as Array<{ id: string; project_context_id: string; member_user_id: string | null }>;

    if (resolvedAssignments.length > 1 && (parsed.correlation_id || parsed.thread_id)) {
      let linkageMatch: { member_assignment_id: string; project_context_id: string } | null = null;

      if (parsed.correlation_id) {
        const { data: correlationMatch } = await supabase
          .from('relancing_updates')
          .select('member_assignment_id, project_context_id')
          .eq('organization_id', task.organization_id)
          .eq('source_user_id', userId)
          .eq('correlation_id', parsed.correlation_id)
          .order('created_at', { ascending: false })
          .limit(1);

        linkageMatch = (correlationMatch?.[0] as { member_assignment_id: string; project_context_id: string } | undefined) ?? null;
      }

      if (!linkageMatch && parsed.thread_id) {
        const { data: threadMatch } = await supabase
          .from('relancing_updates')
          .select('member_assignment_id, project_context_id')
          .eq('organization_id', task.organization_id)
          .eq('source_user_id', userId)
          .eq('thread_id', parsed.thread_id)
          .order('created_at', { ascending: false })
          .limit(1);

        linkageMatch = (threadMatch?.[0] as { member_assignment_id: string; project_context_id: string } | undefined) ?? null;
      }

      if (linkageMatch) {
        resolvedAssignments = resolvedAssignments.filter((assignment) => assignment.id === linkageMatch?.member_assignment_id);
        this.addTraceStep('assignment_resolved', 'Resolved relancing assignment from prior normalized linkage', 0.9);
      }
    }

    if (resolvedAssignments.length > 1) {
      this.addTraceStep('setup_required', 'Multiple active project_member_assignments rows matched this user', 0);
      const result: RelancingUpdateOutcome = {
        outcome: 'setup_required',
        prompt: 'setup_required: multiple active relancing assignments found; include a specific project/member context or reply from the existing relancing thread so the update can be linked safely.',
      };
      await this.flushAudit(task, 'relancing_update: setup_required');
      return result;
    }

    const memberAssignment = resolvedAssignments[0] as { id: string; project_context_id: string };

    const { data: context, error: contextError } = await supabase
      .from('project_scheduling_contexts')
      .select('id, setup_status, project_name, deadline, scheduler_config, blocker_active')
      .eq('organization_id', task.organization_id)
      .eq('id', memberAssignment.project_context_id)
      .single();

    if (contextError || !context) {
      this.addTraceStep('setup_required', 'Project scheduling context was missing for assignment', 0);
      const result: RelancingUpdateOutcome = {
        outcome: 'setup_required',
        prompt: 'setup_required: project setup context is missing. Re-run relancing setup before sending updates.',
      };
      await this.flushAudit(task, 'relancing_update: setup_required');
      return result;
    }

    if (context.setup_status !== 'complete') {
      this.addTraceStep('setup_required', 'Project scheduling context is not marked complete', 0);
      const result: RelancingUpdateOutcome = {
        outcome: 'setup_required',
        prompt: 'setup_required: project setup is incomplete. Provide missing project name, members, and deadline before applying updates.',
      };
      await this.flushAudit(task, 'relancing_update: setup_required');
      return result;
    }

    const intents = parseIntents(messageText);
    if (intents.length === 0) {
      const prompt = isAmbiguousReply(messageText)
        ? 'ambiguity_escalated: the reply is too brief or ambiguous to apply safely. Ask the teammate for a clearer status update or blocker report.'
        : 'ambiguity_escalated: could not parse a relancing update intent from this message. Ask the teammate for a clearer status update or blocker report.';
      this.addTraceStep('ambiguity_escalated', 'Inbound relancing update could not be classified safely', 0);
      const result: RelancingUpdateOutcome = {
        outcome: 'ambiguity_escalated',
        prompt,
        summary: 'Relancing reply escalated for clarification before applying updates.',
      };
      await this.flushAudit(task, 'relancing_update: ambiguity_escalated');
      return result;
    }

    this.addTraceStep('intent_parsed', `Parsed intents: ${intents.join(', ')}`, 0.88);

    const dependency = extractDependency(messageText);
    const requestedHelp = extractRequestedHelp(messageText);
    const etaHint = extractEtaHint(messageText);

    const blocker = intents.includes('blocker_report');
    const status = intents.includes('status_update');

    const blockerSummary = blocker ? blockerSummaryFromText(messageText) : undefined;
    const progressSummary = status ? messageText : undefined;

    const idempotencyKey = `${parsed.channel}:${parsed.external_message_id || parsed.correlation_id || 'unknown'}`;
    this.addTraceStep('idempotency_key_derived', `Derived idempotency key ${idempotencyKey}`, 1);

    const { data: updateRow, error: updateError } = await supabase
      .from('relancing_updates')
      .insert({
        organization_id: task.organization_id,
        project_context_id: memberAssignment.project_context_id,
        member_assignment_id: memberAssignment.id,
        source_task_id: task.id ?? null,
        source_user_id: userId,
        channel: parsed.channel,
        external_message_id: parsed.external_message_id,
        thread_id: parsed.thread_id,
        correlation_id: parsed.correlation_id ?? null,
        idempotency_key: idempotencyKey,
        message_text: messageText,
        intents,
        progress_summary: progressSummary ?? null,
        blocker_summary: blockerSummary ?? null,
        dependency: dependency ?? null,
        requested_help: requestedHelp ?? null,
        eta_hint: etaHint ?? null,
      })
      .select('id')
      .single();

    if (updateError) {
      if (updateError.code === '23505') {
        await supabase
          .from('relancing_update_events')
          .insert({
            organization_id: task.organization_id,
            relancing_update_id: null,
            task_id: task.id ?? null,
            idempotency_key: idempotencyKey,
            event_type: 'duplicate_prevented',
            channel: parsed.channel,
            external_message_id: parsed.external_message_id,
            correlation_id: parsed.correlation_id ?? null,
            raw_payload: coerceJson(parsed.raw_payload ?? {}),
          });

        this.addTraceStep('duplicate_prevented', 'Duplicate relancing update detected; no state changes applied', 1);

        const result: RelancingUpdateOutcome = {
          outcome: 'duplicate_prevented',
          idempotency_key: idempotencyKey,
          summary: 'duplicate_prevented: relancing update already ingested; no changes applied.',
        };
        await this.flushAudit(task, 'relancing_update: duplicate_prevented');
        return result;
      }

      throw new Error(updateError.message);
    }

    const persistedUpdateId = (updateRow as { id: string }).id;

    const { error: ingestedEventError } = await supabase
      .from('relancing_update_events')
      .insert({
        organization_id: task.organization_id,
        relancing_update_id: persistedUpdateId,
        task_id: task.id ?? null,
        idempotency_key: idempotencyKey,
        event_type: 'ingested',
        channel: parsed.channel,
        external_message_id: parsed.external_message_id,
        correlation_id: parsed.correlation_id ?? null,
        raw_payload: coerceJson(parsed.raw_payload ?? {}),
      });

    if (ingestedEventError) {
      throw new Error(ingestedEventError.message);
    }

    this.addTraceStep('inbound_status_update', 'Persisted inbound relancing update ingestion event', 1);

    const contextSchedulerConfig =
      context.scheduler_config && typeof context.scheduler_config === 'object'
        ? (context.scheduler_config as Record<string, unknown>)
        : {};
    const baseCadenceHours = resolveBaseCadenceHoursFromConfig(contextSchedulerConfig);
    const deadline = typeof context.deadline === 'string' ? context.deadline : null;
    const urgencyBand = deadline ? resolveUrgencyBand(deadline, new Date()) : 'base';
    const resumeCadenceHours = resolveCadenceHours(baseCadenceHours, urgencyBand);
    const nowIso = new Date().toISOString();
    const resumeSignal = status && !blocker && isResumeSignal(messageText);
    const shouldResume = context.blocker_active === true && resumeSignal;

    if (blocker) {
      this.addTraceStep('blocker_detected', 'Parsed blocker_report intent from inbound update', 0.95);
      const { error: blockerError } = await supabase
        .from('project_scheduling_contexts')
        .update({
          blocker_active: true,
          blocker_summary: blockerSummary ?? messageText,
          blocker_reported_by: userId,
          scheduler_config: {
            ...contextSchedulerConfig,
            blocker_adjustment: {
              active: true,
              reason_code: 'blocker_paused',
              source_update_id: persistedUpdateId,
              applied_at: nowIso,
              resume_cadence_hours: resumeCadenceHours,
              urgency_band: urgencyBand,
            },
          },
          updated_at: nowIso,
        })
        .eq('organization_id', task.organization_id)
        .eq('id', memberAssignment.project_context_id);

      if (blockerError) {
        throw new Error(blockerError.message);
      }

      this.addTraceStep('blocker_paused', 'Paused relancing cycle by setting blocker_active on project context', 1);
    }

    if (!blocker && shouldResume) {
      this.addTraceStep('blocker_resume_detected', 'Detected unblock/progress signal and resumed relancing cycle', 0.92);
      const nextNudgeAt = new Date(Date.now() + Math.round(resumeCadenceHours * 60 * 60 * 1000)).toISOString();

      const { error: resumeError } = await supabase
        .from('project_scheduling_contexts')
        .update({
          blocker_active: false,
          blocker_summary: null,
          blocker_reported_by: null,
          next_nudge_at: nextNudgeAt,
          scheduler_config: {
            ...contextSchedulerConfig,
            blocker_adjustment: {
              active: false,
              reason_code: 'status_resume',
              source_update_id: persistedUpdateId,
              resumed_at: nowIso,
              resume_cadence_hours: resumeCadenceHours,
              urgency_band: urgencyBand,
            },
          },
          updated_at: nowIso,
        })
        .eq('organization_id', task.organization_id)
        .eq('id', memberAssignment.project_context_id);

      if (resumeError) {
        throw new Error(resumeError.message);
      }

      this.addTraceStep('blocker_resumed', `Cleared blocker state and scheduled next nudge at ${nextNudgeAt}`, 1);
    }

    const projectName = typeof context.project_name === 'string' ? context.project_name : 'Unknown project';
    const summary = blocker
      ? `Blocker recorded and relancing cycle paused for "${projectName}".`
      : shouldResume
        ? `Relancing update resumed the cycle for "${projectName}".`
        : `Relancing status update recorded for "${projectName}".`;

    const result: RelancingUpdateOutcome = {
      outcome: 'applied',
      relancing_update_id: (updateRow as { id: string }).id,
      idempotency_key: idempotencyKey,
      project_context_id: memberAssignment.project_context_id,
      member_assignment_id: memberAssignment.id,
      intents,
      progress_summary: progressSummary,
      blocker_summary: blockerSummary,
      dependency,
      requested_help: requestedHelp,
      eta_hint: etaHint,
      blocker_paused: blocker,
      blocker_resumed: !blocker && shouldResume,
      summary,
    };

    await this.flushAudit(task, blocker ? 'relancing_update: blocker_paused' : shouldResume ? 'relancing_update: blocker_resumed' : 'relancing_update: inbound_status_update', [
      AuditLogger.createCitation('relancing_update', (updateRow as { id: string }).id, summary),
    ]);

    return result;
  }
}
