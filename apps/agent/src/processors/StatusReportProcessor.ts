import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import {
  buildStatusReportIdempotencyKey,
  type Citation,
  resolveStatusReportWindow,
  StatusReportPayloadSchema,
  type Task,
  type TaskStatus,
} from '@ai-assistant/shared';
import { supabase } from '../services/supabase.js';
import { AuditLogger } from '../services/AuditLogger.js';

const MAX_SECTION_ITEMS = 8;
const MAX_CRITICAL_ITEMS = 8;

type StatusReportPriority = 'high' | 'medium' | 'low';

type StatusReportSectionItem = {
  title: string;
  detail: string;
  source_type?: string;
  source_id?: string;
};

type StatusReportCriticalAction = {
  title: string;
  action_required: string;
  priority: StatusReportPriority;
  rationale: string;
  source_type?: string;
  source_id?: string;
};

type RelancingUpdateRow = {
  id: string;
  intents: string[];
  progress_summary: string | null;
  blocker_summary: string | null;
  dependency: string | null;
  requested_help: string | null;
  eta_hint: string | null;
  message_text: string;
  thread_id: string | null;
  external_message_id: string | null;
  created_at: string;
};

type ProjectContextRow = {
  id: string;
  project_name: string;
  blocker_active: boolean;
  blocker_summary: string | null;
  deadline: string | null;
};

type TaskOutcomeRow = {
  id: string;
  domain_action: string;
  status: TaskStatus;
  result: unknown;
  created_at: string;
};

type ExistingReportRow = {
  id: string;
  narrative: string;
  critical_actions: unknown;
};

type MorningBriefRow = {
  id: string;
  generated_at: string;
  summary_text: string;
};

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function resolveWindow(task: Task): { start: Date; end: Date; idempotencyKey: string; force: boolean } {
  const payload = asRecord(task.payload);
  const parsed = StatusReportPayloadSchema.parse(payload);
  const resolvedWindow = parsed.report_period_end && parsed.report_period_start
    ? {
        start: new Date(parsed.report_period_start),
        end: new Date(parsed.report_period_end),
      }
    : resolveStatusReportWindow(new Date());

  const start = resolvedWindow.start;
  const end = resolvedWindow.end;
  const derivedKey = buildStatusReportIdempotencyKey(task.organization_id, start, end);
  const idempotencyKey = parsed.idempotency_key?.trim().length ? parsed.idempotency_key.trim() : derivedKey;

  return {
    start,
    end,
    idempotencyKey,
    force: parsed.force === true,
  };
}

function toPriorityRank(priority: StatusReportPriority): number {
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  return 1;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function extractTaskSummary(task: TaskOutcomeRow): string {
  const result = asRecord(task.result);
  const summary = result.summary;
  if (typeof summary === 'string' && summary.trim().length > 0) {
    return truncate(summary.trim(), 220);
  }

  return `${task.domain_action} completed with status ${task.status}.`;
}

function extractCriticalActions(input: {
  relancingUpdates: RelancingUpdateRow[];
  blockerContexts: ProjectContextRow[];
  taskOutcomes: TaskOutcomeRow[];
}): StatusReportCriticalAction[] {
  const actions: StatusReportCriticalAction[] = [];

  for (const update of input.relancingUpdates) {
    const intents = update.intents;
    if (intents.includes('blocker_report')) {
      actions.push({
        title: 'Blocker requires PM intervention',
        action_required: truncate(update.blocker_summary || update.message_text, 180),
        priority: 'high',
        rationale: 'Derived from blocker_report relancing intent.',
        source_type: 'relancing_update',
        source_id: update.id,
      });
      continue;
    }

    if (typeof update.requested_help === 'string' && update.requested_help.trim().length > 0) {
      actions.push({
        title: 'Team requested direct support',
        action_required: truncate(update.requested_help.trim(), 180),
        priority: 'medium',
        rationale: 'Explicit help request captured in relancing update.',
        source_type: 'relancing_update',
        source_id: update.id,
      });
    } else if (typeof update.dependency === 'string' && update.dependency.trim().length > 0) {
      actions.push({
        title: 'Dependency follow-up required',
        action_required: truncate(`Resolve dependency: ${update.dependency.trim()}`, 180),
        priority: 'medium',
        rationale: 'Dependency risk detected in relancing update.',
        source_type: 'relancing_update',
        source_id: update.id,
      });
    }
  }

  for (const context of input.blockerContexts) {
    if (!context.blocker_active) continue;
    actions.push({
      title: `Active blocker on ${context.project_name}`,
      action_required: truncate(context.blocker_summary || 'Review blocker details and unblock execution.', 180),
      priority: 'high',
      rationale: 'Project context is currently marked blocker_active.',
      source_type: 'project_context',
      source_id: context.id,
    });
  }

  for (const task of input.taskOutcomes) {
    if (task.status !== 'escalation' && task.status !== 'paused') continue;

    actions.push({
      title: `${task.domain_action} requires review`,
      action_required: truncate(extractTaskSummary(task), 180),
      priority: task.status === 'paused' ? 'medium' : 'high',
      rationale: `Task reached ${task.status} state in reporting window.`,
      source_type: 'task',
      source_id: task.id,
    });
  }

  const deduped = new Map<string, StatusReportCriticalAction>();
  for (const action of actions) {
    const key = `${action.title}|${action.action_required}|${action.priority}`;
    if (!deduped.has(key)) {
      deduped.set(key, action);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => toPriorityRank(b.priority) - toPriorityRank(a.priority))
    .slice(0, MAX_CRITICAL_ITEMS);
}

function buildNarrative(input: {
  startIso: string;
  endIso: string;
  winsCount: number;
  blockersCount: number;
  criticalCount: number;
  latestBriefSummary: string | null;
}): string {
  const bluf = `Weekly status window ${input.startIso.slice(0, 10)} to ${input.endIso.slice(0, 10)}: ${input.winsCount} wins, ${input.blockersCount} blocker/risk signals, and ${input.criticalCount} critical follow-ups.`;

  const detail = input.blockersCount > 0
    ? 'Blockers and escalation signals are concentrated around active relancing updates and paused/escalated tasks; PM review is required on highlighted actions.'
    : 'No active blockers detected; focus remains on commitment follow-through and next action sequencing.';

  const briefLine = input.latestBriefSummary
    ? `Morning brief context indicates: ${truncate(input.latestBriefSummary, 220)}`
    : 'No morning brief context was available inside this reporting window.';

  return [bluf, '', detail, briefLine].join('\n');
}

export class StatusReportProcessor extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    this.clearTrace();

    const { start, end, idempotencyKey, force } = resolveWindow(task);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    this.addTraceStep('status_report_window', `Resolved reporting window ${startIso} -> ${endIso}`, 1);

    const existingResponse = await (supabase as any)
      .from('status_reports')
      .select('id, narrative, critical_actions')
      .eq('organization_id', task.organization_id)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingResponse.error) {
      throw new Error(existingResponse.error.message);
    }

    const existingReport = (existingResponse.data ?? null) as ExistingReportRow | null;
    if (existingReport && !force) {
      const duplicateStep = AuditLogger.createStep('Status Report', 'duplicate_prevented for reporting window', {
        output_summary: `idempotency_key=${idempotencyKey}`,
      });

      await AuditLogger.flush(
        task.organization_id,
        task.id ?? null,
        task.user_id ?? 'status-report-processor',
        'status_report: duplicate_prevented',
        [duplicateStep],
        [],
      );

      return {
        outcome: 'duplicate_prevented',
        report_id: existingReport.id,
        idempotency_key: idempotencyKey,
        summary: 'duplicate_prevented: status report already exists for this reporting window.',
      };
    }

    const [updatesRes, contextsRes, tasksRes, briefRes] = await Promise.all([
      supabase
        .from('relancing_updates')
        .select('id, intents, progress_summary, blocker_summary, dependency, requested_help, eta_hint, message_text, thread_id, external_message_id, created_at')
        .eq('organization_id', task.organization_id)
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('project_scheduling_contexts')
        .select('id, project_name, blocker_active, blocker_summary, deadline')
        .eq('organization_id', task.organization_id)
        .eq('setup_status', 'complete'),
      supabase
        .from('tasks')
        .select('id, domain_action, status, result, created_at')
        .eq('organization_id', task.organization_id)
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('morning_briefs')
        .select('id, generated_at, summary_text')
        .eq('organization_id', task.organization_id)
        .gte('generated_at', startIso)
        .lte('generated_at', endIso)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (updatesRes.error) throw new Error(updatesRes.error.message);
    if (contextsRes.error) throw new Error(contextsRes.error.message);
    if (tasksRes.error) throw new Error(tasksRes.error.message);
    if (briefRes.error && briefRes.error.code !== 'PGRST116') throw new Error(briefRes.error.message);

    const relancingUpdates = (updatesRes.data ?? []) as RelancingUpdateRow[];
    const contexts = (contextsRes.data ?? []) as ProjectContextRow[];
    const taskOutcomes = (tasksRes.data ?? []) as TaskOutcomeRow[];
    const latestBrief = (briefRes.data ?? null) as MorningBriefRow | null;

    this.addTraceStep(
      'status_report_sources',
      `Loaded ${relancingUpdates.length} relancing updates, ${contexts.length} project contexts, ${taskOutcomes.length} tasks`,
      0.98,
    );

    const wins: StatusReportSectionItem[] = relancingUpdates
      .filter((update) => update.intents.includes('status_update'))
      .map((update) => ({
        title: 'Team progress update',
        detail: truncate(update.progress_summary || update.message_text, 220),
        source_type: 'relancing_update',
        source_id: update.id,
      }))
      .slice(0, MAX_SECTION_ITEMS);

    const blockersRisksFromUpdates: StatusReportSectionItem[] = relancingUpdates
      .filter((update) => update.intents.includes('blocker_report'))
      .map((update) => ({
        title: 'Reported blocker',
        detail: truncate(update.blocker_summary || update.message_text, 220),
        source_type: 'relancing_update',
        source_id: update.id,
      }));

    const blockersRisksFromContexts: StatusReportSectionItem[] = contexts
      .filter((context) => context.blocker_active)
      .map((context) => ({
        title: `Active blocker in ${context.project_name}`,
        detail: truncate(context.blocker_summary || 'Blocker is active and requires PM attention.', 220),
        source_type: 'project_context',
        source_id: context.id,
      }));

    const blockersRisks = [...blockersRisksFromUpdates, ...blockersRisksFromContexts].slice(0, MAX_SECTION_ITEMS);

    const commitments: StatusReportSectionItem[] = taskOutcomes
      .filter((taskOutcome) => taskOutcome.status === 'done')
      .slice(0, MAX_SECTION_ITEMS)
      .map((taskOutcome) => ({
        title: `${taskOutcome.domain_action} outcome`,
        detail: extractTaskSummary(taskOutcome),
        source_type: 'task',
        source_id: taskOutcome.id,
      }));

    const nextActions: StatusReportSectionItem[] = relancingUpdates
      .reduce<StatusReportSectionItem[]>((acc, update) => {
        if (typeof update.requested_help === 'string' && update.requested_help.trim().length > 0) {
          acc.push({
            title: 'Team help request',
            detail: truncate(update.requested_help.trim(), 220),
            source_type: 'relancing_update',
            source_id: update.id,
          });
          return acc;
        }

        if (typeof update.dependency === 'string' && update.dependency.trim().length > 0) {
          acc.push({
            title: 'Dependency follow-up',
            detail: truncate(`Resolve dependency: ${update.dependency.trim()}`, 220),
            source_type: 'relancing_update',
            source_id: update.id,
          });
        }

        return acc;
      }, [])
      .slice(0, MAX_SECTION_ITEMS);

    const criticalActions = extractCriticalActions({
      relancingUpdates,
      blockerContexts: contexts,
      taskOutcomes,
    });

    const sourceLinks: Citation[] = [];
    const sourceLinkKeys = new Set<string>();
    const sourceIds = new Set<string>();

    const addSourceLink = (sourceType: string, sourceId: string | null | undefined, description: string): void => {
      if (!sourceId) return;
      sourceIds.add(sourceId);
      const key = `${sourceType}:${sourceId}`;
      if (sourceLinkKeys.has(key)) return;
      sourceLinkKeys.add(key);
      sourceLinks.push(AuditLogger.createCitation(sourceType, sourceId, description));
    };

    for (const update of relancingUpdates.slice(0, 40)) {
      addSourceLink('relancing_update', update.id, 'Relancing update used in report synthesis');
      addSourceLink('thread', update.thread_id, 'Thread linked to relancing update evidence');
      addSourceLink('channel_message', update.external_message_id, 'Inbound channel message linked to relancing evidence');
    }

    for (const context of contexts) {
      addSourceLink('project_context', context.id, 'Project scheduling context used in report synthesis');
    }

    for (const taskOutcome of taskOutcomes) {
      addSourceLink('task', taskOutcome.id, 'Task outcome used in report synthesis');
    }

    if (latestBrief?.id) {
      addSourceLink('morning_brief', latestBrief.id, 'Morning brief context used in report narrative');
    }

    const narrative = buildNarrative({
      startIso,
      endIso,
      winsCount: wins.length,
      blockersCount: blockersRisks.length,
      criticalCount: criticalActions.length,
      latestBriefSummary: latestBrief?.summary_text ?? null,
    });

    const reportRecord = {
      organization_id: task.organization_id,
      source_task_id: task.id ?? null,
      report_period_start: startIso,
      report_period_end: endIso,
      idempotency_key: idempotencyKey,
      narrative,
      wins,
      blockers_risks: blockersRisks,
      commitments,
      next_actions: nextActions,
      critical_actions: criticalActions,
      metadata: {
        source_ids: Array.from(sourceIds),
        source_links: sourceLinks,
        generated_by: 'status-report-processor',
        window_key: `${startIso}|${endIso}`,
      },
    };

    const upsertRes = await (supabase as any)
      .from('status_reports')
      .upsert(reportRecord, { onConflict: 'organization_id,idempotency_key' })
      .select('id')
      .single();

    if (upsertRes.error || !upsertRes.data?.id) {
      throw new Error(upsertRes.error?.message || 'Failed to persist status report');
    }

    this.addTraceStep('status_report_generated', `Generated status report ${upsertRes.data.id}`, 0.95);
    this.addTraceStep('critical_items_highlighted', `Highlighted ${criticalActions.length} critical actions`, 0.95);

    const auditSteps = [
      AuditLogger.createStep('Status Report', 'report_generated', {
        output_summary: `report_id=${upsertRes.data.id}`,
      }),
      AuditLogger.createStep('Status Report', 'critical_items_highlighted', {
        output_summary: `critical_actions=${criticalActions.length}`,
      }),
      ...criticalActions.map((action) => AuditLogger.createStep('Status Report Highlight', action.title, {
        output_summary: `${action.priority}: ${action.rationale}${action.source_type && action.source_id ? ` [${action.source_type}:${action.source_id}]` : ''}`,
      })),
    ];

    await AuditLogger.flush(
      task.organization_id,
      task.id ?? null,
      task.user_id ?? 'status-report-processor',
      criticalActions.length > 0 ? 'status_report: critical_items_highlighted' : 'status_report: report_generated',
      auditSteps,
      sourceLinks.slice(0, 20),
    );

    return {
      outcome: 'generated',
      report_id: upsertRes.data.id,
      idempotency_key: idempotencyKey,
      report_period_start: startIso,
      report_period_end: endIso,
      summary: `Status report generated with ${criticalActions.length} highlighted critical actions.`,
      narrative,
      wins,
      blockers_risks: blockersRisks,
      commitments,
      next_actions: nextActions,
      critical_actions: criticalActions,
      trace: this.getTrace(),
      citations: sourceLinks,
    };
  }
}
