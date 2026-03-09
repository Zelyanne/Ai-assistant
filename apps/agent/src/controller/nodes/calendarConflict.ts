import { z } from 'zod';
import type { Json, Task } from '@ai-assistant/shared';
import type { AgentState } from '../graph.js';
import { AuditLogger } from '../../services/AuditLogger.js';
import { mcpService } from '../../services/mcp.js';
import { supabase } from '../../services/supabase.js';
import { PerimeterGuard } from '../../guards/PerimeterGuard.js';
import { buildEscalationPayload, CONFIDENCE_THRESHOLD } from '../escalation.js';
import { LLMProviderFactory } from '../../services/llm/factory.js';

type JsonRecord = Record<string, Json | undefined>;

interface ConflictOverlap {
  external_id: string;
  title: string;
  start_time: string;
  end_time: string;
}

interface ConflictOption {
  id: 'opt_1' | 'opt_2' | 'opt_3';
  label: string;
  action: 'shift_requested' | 'reschedule_existing' | 'escalate';
  startTime?: string;
  endTime?: string;
  event_external_id?: string;
  newStartTime?: string;
  newEndTime?: string;
  requires_write: boolean;
}

interface CalendarRequest {
  summary: string;
  startTime: string;
  endTime: string;
  description?: string;
  location?: string;
  attendees: string[];
}

interface BusyWindow {
  sourceId: string;
  start: string;
  end: string;
}

interface CalendarEventRow {
  external_id: string | null;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  metadata: unknown;
}

interface SupabaseArrayResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

const PlannerOutputSchema = z
  .object({
    recommended_option_id: z.enum(['opt_1', 'opt_2', 'opt_3']).optional(),
    rationale: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    ambiguity_detected: z.boolean().optional(),
  })
  .passthrough();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseDateTime(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateOnly(value: string): Date | null {
  return parseDateTime(`${value}T00:00:00.000Z`);
}

function toIso(value: Date): string {
  return value.toISOString();
}

function overlapExists(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && endA > startB;
}

function buildToolNameMatcher(toolNames: string[]) {
  return (keywords: string[]): string | null => {
    for (const name of toolNames) {
      const normalized = name.toLowerCase();
      if (keywords.every((keyword) => normalized.includes(keyword))) {
        return name;
      }
    }
    return null;
  };
}

function extractToolNames(rawTools: unknown[]): string[] {
  return rawTools
    .map((tool) => {
      const candidate = asRecord(tool);
      const name = candidate?.name;
      return typeof name === 'string' ? name : null;
    })
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
}

function parseCalendarRequest(payload: Record<string, unknown>): CalendarRequest | null {
  const summary = typeof payload.summary === 'string' ? payload.summary.trim() : '';
  const startTime = typeof payload.startTime === 'string' ? payload.startTime.trim() : '';
  const endTime = typeof payload.endTime === 'string' ? payload.endTime.trim() : '';

  if (!summary || !startTime || !endTime) {
    return null;
  }

  const attendeesRaw = payload.attendees;
  const attendees = Array.isArray(attendeesRaw)
    ? attendeesRaw.filter((item): item is string => typeof item === 'string' && item.includes('@'))
    : [];

  return {
    summary,
    startTime,
    endTime,
    description: typeof payload.description === 'string' ? payload.description : undefined,
    location: typeof payload.location === 'string' ? payload.location : undefined,
    attendees,
  };
}

function parseToolResponseObject(rawResult: unknown): Record<string, unknown> | null {
  const top = asRecord(rawResult);
  if (!top) {
    return null;
  }

  const structured = asRecord(top.structuredContent);
  if (structured) {
    return structured;
  }

  const toolResult = asRecord(top.toolResult);
  if (toolResult) {
    return toolResult;
  }

  if (Array.isArray(top.content)) {
    for (const entry of top.content) {
      const item = asRecord(entry);
      const text = item && typeof item.text === 'string' ? item.text : null;
      if (!text) continue;
      try {
        const parsed = JSON.parse(text) as unknown;
        const parsedRecord = asRecord(parsed);
        if (parsedRecord) {
          return parsedRecord;
        }
      } catch {
        // Continue with other entries.
      }
    }
  }

  return top;
}

function parseBusyWindowsFromFreeBusy(rawResult: unknown): BusyWindow[] {
  const parsed = parseToolResponseObject(rawResult);
  if (!parsed) {
    return [];
  }

  const calendars = asRecord(parsed.calendars);
  if (!calendars) {
    return [];
  }

  const windows: BusyWindow[] = [];
  for (const [calendarId, value] of Object.entries(calendars)) {
    const calendarRecord = asRecord(value);
    if (!calendarRecord || !Array.isArray(calendarRecord.busy)) {
      continue;
    }

    for (const slot of calendarRecord.busy) {
      const slotRecord = asRecord(slot);
      const start = slotRecord && typeof slotRecord.start === 'string' ? slotRecord.start : null;
      const end = slotRecord && typeof slotRecord.end === 'string' ? slotRecord.end : null;
      if (!start || !end) continue;

      windows.push({ sourceId: calendarId, start, end });
    }
  }

  return windows;
}

function parseEventWindow(row: CalendarEventRow): { start: Date; end: Date; transparent: boolean } | null {
  const metadata = asRecord(row.metadata);
  const eventRaw = metadata ? asRecord(metadata.event_raw) : null;

  const transparency = typeof eventRaw?.transparency === 'string' && eventRaw.transparency.toLowerCase() === 'transparent';

  const rawStart = asRecord(eventRaw?.start);
  const rawEnd = asRecord(eventRaw?.end);

  const startDateTime = typeof rawStart?.dateTime === 'string' ? parseDateTime(rawStart.dateTime) : null;
  const endDateTime = typeof rawEnd?.dateTime === 'string' ? parseDateTime(rawEnd.dateTime) : null;

  if (startDateTime && endDateTime) {
    return { start: startDateTime, end: endDateTime, transparent: transparency };
  }

  const startDate = typeof rawStart?.date === 'string' ? parseDateOnly(rawStart.date) : null;
  const endDate = typeof rawEnd?.date === 'string' ? parseDateOnly(rawEnd.date) : null;
  if (startDate && endDate) {
    return { start: startDate, end: endDate, transparent: transparency };
  }

  const fallbackStart = typeof row.start_time === 'string'
    ? (row.start_time.includes('T') ? parseDateTime(row.start_time) : parseDateOnly(row.start_time))
    : null;
  const fallbackEnd = typeof row.end_time === 'string'
    ? (row.end_time.includes('T') ? parseDateTime(row.end_time) : parseDateOnly(row.end_time))
    : null;

  if (!fallbackStart || !fallbackEnd) {
    return null;
  }

  return {
    start: fallbackStart,
    end: fallbackEnd,
    transparent: transparency,
  };
}

function buildOptions(request: CalendarRequest, overlaps: ConflictOverlap[]): ConflictOption[] {
  const requestStart = parseDateTime(request.startTime);
  const requestEnd = parseDateTime(request.endTime);
  if (!requestStart || !requestEnd) {
    return [];
  }

  const durationMs = Math.max(15 * 60 * 1000, requestEnd.getTime() - requestStart.getTime());

  const latestOverlapEnd = overlaps
    .map((overlap) => parseDateTime(overlap.end_time))
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? requestEnd;

  const shiftedStart = new Date(Math.max(requestEnd.getTime(), latestOverlapEnd.getTime()));
  const shiftedEnd = new Date(shiftedStart.getTime() + durationMs);

  const firstOverlap = overlaps[0];
  const firstOverlapStart = firstOverlap ? parseDateTime(firstOverlap.start_time) : null;
  const firstOverlapEnd = firstOverlap ? parseDateTime(firstOverlap.end_time) : null;

  const existingDuration = firstOverlapStart && firstOverlapEnd
    ? Math.max(15 * 60 * 1000, firstOverlapEnd.getTime() - firstOverlapStart.getTime())
    : durationMs;

  const rescheduledStart = new Date(requestEnd.getTime());
  const rescheduledEnd = new Date(rescheduledStart.getTime() + existingDuration);

  return [
    {
      id: 'opt_1',
      label: 'Move requested meeting',
      action: 'shift_requested',
      startTime: toIso(shiftedStart),
      endTime: toIso(shiftedEnd),
      requires_write: false,
    },
    {
      id: 'opt_2',
      label: 'Reschedule existing meeting',
      action: 'reschedule_existing',
      event_external_id: firstOverlap?.external_id,
      newStartTime: toIso(rescheduledStart),
      newEndTime: toIso(rescheduledEnd),
      requires_write: true,
    },
    {
      id: 'opt_3',
      label: 'Escalate for human input',
      action: 'escalate',
      requires_write: false,
    },
  ];
}

function recommendedByRules(activeProtocolRules: string | undefined, overlaps: ConflictOverlap[]): ConflictOption['id'] {
  const rules = (activeProtocolRules ?? '').toLowerCase();
  const overlapTitles = overlaps.map((overlap) => overlap.title.toLowerCase());
  const hasDeepWorkOverlap = overlapTitles.some((title) => title.includes('deep work') || title.includes('focus block'));

  if (hasDeepWorkOverlap || rules.includes('deep work') || rules.includes('minimal disruption') || rules.includes('avoid churn')) {
    return 'opt_1';
  }

  if (rules.includes('move routine sync') || rules.includes('reschedule lower-priority') || rules.includes('routine sync')) {
    return 'opt_2';
  }

  if (overlaps.length > 2) {
    return 'opt_3';
  }

  return 'opt_1';
}

async function recommendedByLlm(
  request: CalendarRequest,
  overlaps: ConflictOverlap[],
  options: ConflictOption[],
  activeProtocolRules: string | undefined,
): Promise<{ recommended: ConflictOption['id'] | null; rationale: string | null }> {
  const guard = new PerimeterGuard();
  const provider = LLMProviderFactory.getProvider();

  const prompt = [
    'Choose one calendar conflict resolution option for an executive assistant.',
    'Use protocol rules first, then minimize disruption.',
    'Return JSON with optional fields: recommended_option_id (opt_1|opt_2|opt_3), rationale, confidence, ambiguity_detected.',
    '',
    `Requested meeting: ${guard.redactPII(JSON.stringify(request))}`,
    `Conflicts: ${guard.redactPII(JSON.stringify(overlaps))}`,
    `Options: ${guard.redactPII(JSON.stringify(options))}`,
    `Protocol rules: ${guard.redactPII(activeProtocolRules ?? 'none')}`,
  ].join('\n');

  try {
    const response = await provider.generateStructured(prompt, PlannerOutputSchema);
    const parsed = PlannerOutputSchema.parse(response.data);
    return {
      recommended: parsed.recommended_option_id ?? null,
      rationale: typeof parsed.rationale === 'string' && parsed.rationale.length > 0
        ? guard.recoverPII(parsed.rationale)
        : null,
    };
  } catch {
    return { recommended: null, rationale: null };
  }
}

function buildConflictJson(
  request: CalendarRequest,
  overlaps: ConflictOverlap[],
  options: ConflictOption[],
  recommendedOptionId: ConflictOption['id'],
): Json {
  return {
    requested: {
      summary: request.summary,
      startTime: request.startTime,
      endTime: request.endTime,
    },
    overlaps,
    options,
    recommended_option_id: recommendedOptionId,
  } as unknown as Json;
}

async function detectConflictsViaFreeBusy(
  organizationId: string,
  toolName: string,
  request: CalendarRequest,
): Promise<ConflictOverlap[]> {
  const freeBusyArgs: Record<string, unknown> = {
    timeMin: request.startTime,
    timeMax: request.endTime,
    items: [{ id: 'primary' }],
  };

  if (request.attendees.length > 0) {
    freeBusyArgs.items = [{ id: 'primary' }, ...request.attendees.map((email) => ({ id: email }))];
  }

  const rawResult = await mcpService.executeTool(organizationId, toolName, freeBusyArgs);
  const requestStart = parseDateTime(request.startTime);
  const requestEnd = parseDateTime(request.endTime);
  if (!requestStart || !requestEnd) {
    return [];
  }

  const windows = parseBusyWindowsFromFreeBusy(rawResult);

  return windows
    .map((window, index) => {
      const start = parseDateTime(window.start);
      const end = parseDateTime(window.end);
      if (!start || !end || !overlapExists(requestStart, requestEnd, start, end)) {
        return null;
      }

      const sourceLabel = window.sourceId === 'primary' ? 'Primary calendar busy block' : `Attendee busy block (${window.sourceId})`;

      return {
        external_id: `freebusy-${window.sourceId}-${index}`,
        title: sourceLabel,
        start_time: toIso(start),
        end_time: toIso(end),
      } satisfies ConflictOverlap;
    })
    .filter((item): item is ConflictOverlap => Boolean(item));
}

async function detectConflictsFromCache(
  organizationId: string,
  request: CalendarRequest,
): Promise<ConflictOverlap[]> {
  const requestStart = parseDateTime(request.startTime);
  const requestEnd = parseDateTime(request.endTime);
  if (!requestStart || !requestEnd) {
    return [];
  }

  const result = await supabase
    .from('calendar_events')
    .select('external_id, title, start_time, end_time, metadata')
    .eq('organization_id', organizationId) as unknown as SupabaseArrayResult<CalendarEventRow>;

  if (result.error || !result.data) {
    return [];
  }

  return result.data
    .map((row) => {
      const window = parseEventWindow(row);
      if (!window || window.transparent || !overlapExists(requestStart, requestEnd, window.start, window.end)) {
        return null;
      }

      return {
        external_id: row.external_id ?? 'unknown-event-id',
        title: row.title ?? 'Busy event',
        start_time: toIso(window.start),
        end_time: toIso(window.end),
      } satisfies ConflictOverlap;
    })
    .filter((item): item is ConflictOverlap => Boolean(item));
}

function withTaskPayload(task: Task, payloadPatch: JsonRecord): Task {
  const currentPayload = asRecord(task.payload) ?? {};
  const nextPayload = {
    ...currentPayload,
    ...payloadPatch,
  };

  return {
    ...task,
    payload: nextPayload,
  };
}

export async function calendarConflictNode(state: AgentState): Promise<Partial<AgentState>> {
  if (state.error) {
    return {};
  }

  const task = state.task;
  const payload = asRecord(task.payload) ?? {};

  const payloadConfidenceRaw = payload.confidence_score ?? payload.confidence;
  const payloadConfidence = typeof payloadConfidenceRaw === 'number' && Number.isFinite(payloadConfidenceRaw)
    ? payloadConfidenceRaw
    : undefined;
  const payloadAmbiguity = payload.ambiguity_detected === true;

  if ((typeof payloadConfidence === 'number' && payloadConfidence < CONFIDENCE_THRESHOLD) || payloadAmbiguity) {
    return {
      trace: [AuditLogger.createStep('Calendar Conflict Check', 'Skipped: confidence gate pending', {
        confidence_score: payloadConfidence,
        confidence_threshold: CONFIDENCE_THRESHOLD,
        ambiguity_detected: payloadAmbiguity,
      })],
    };
  }

  const request = parseCalendarRequest(payload);

  if (!request) {
    const reason = 'Missing required calendar fields: summary, startTime, or endTime';
    return {
      error: reason,
      trace: [AuditLogger.createStep('Calendar Conflict Check', `Skipped: ${reason}`)],
    };
  }

  const start = parseDateTime(request.startTime);
  const end = parseDateTime(request.endTime);
  if (!start || !end || start >= end) {
    const reason = 'Invalid calendar window: startTime/endTime must be valid RFC3339 timestamps';
    return {
      task: {
        ...task,
        status: 'escalation',
        result: buildEscalationPayload({
          reason,
          prompt: 'Please provide a valid meeting start/end time and retry.',
          confidenceScore: 0,
          trigger: 'ambiguity_detected',
        }),
      },
      error: reason,
      trace: [AuditLogger.createStep('Calendar Conflict Check', `Escalated: ${reason}`, {
        confidence_score: 0,
        confidence_threshold: CONFIDENCE_THRESHOLD,
        ambiguity_detected: true,
        escalation_trigger: 'ambiguity_detected',
      })],
    };
  }

  const tools = await mcpService.getLangChainTools(task.organization_id);
  const toolNames = extractToolNames(tools as unknown[]);
  const findTool = buildToolNameMatcher(toolNames);

  const freeBusyTool = findTool(['free', 'busy']) ?? findTool(['freebusy']) ?? null;
  const createTool = findTool(['create', 'calendar', 'event']) ?? null;
  const patchTool = findTool(['patch', 'calendar', 'event']) ?? findTool(['update', 'calendar', 'event']) ?? null;

  let overlaps: ConflictOverlap[] = [];
  let confidenceScore = 1;
  let source = 'freebusy';

  if (freeBusyTool) {
    try {
      overlaps = await detectConflictsViaFreeBusy(task.organization_id, freeBusyTool, request);
    } catch {
      overlaps = [];
    }
  }

  if (!freeBusyTool || overlaps.length === 0) {
    const cacheOverlaps = await detectConflictsFromCache(task.organization_id, request);
    if (cacheOverlaps.length > 0) {
      overlaps = cacheOverlaps;
      confidenceScore = freeBusyTool ? 0.85 : 0.65;
      source = 'calendar_events_cache';
    }
  }

  if (overlaps.length === 0) {
    const nextTask = withTaskPayload(task, {
      conflict_detection: {
        source,
        overlaps_found: 0,
      } as Json,
    });

    return {
      task: nextTask,
      trace: [AuditLogger.createStep('Calendar Conflict Check', 'No conflicts detected', {
        confidence_score: confidenceScore,
        confidence_threshold: CONFIDENCE_THRESHOLD,
        ambiguity_detected: false,
        input_summary: `source=${source}`,
      })],
    };
  }

  const options = buildOptions(request, overlaps);
  const llmRecommendation = await recommendedByLlm(request, overlaps, options, state.active_protocol_rules);
  const recommendedOptionId = llmRecommendation.recommended ?? recommendedByRules(state.active_protocol_rules, overlaps);
  const conflictJson = buildConflictJson(request, overlaps, options, recommendedOptionId);

  const selectedOptionIdRaw = payload.conflict_option_id;
  const selectedOptionId = typeof selectedOptionIdRaw === 'string' ? selectedOptionIdRaw : null;
  const autoResolve = payload.auto_resolve === true;
  const selectedOption = options.find((option) => option.id === selectedOptionId) ?? null;

  const missingWriteTool = selectedOption?.action === 'reschedule_existing' && !patchTool;
  const missingCreateTool = selectedOption?.action === 'shift_requested' && !createTool;
  const cannotResolve = missingWriteTool || missingCreateTool;

  if (!autoResolve || !selectedOption || selectedOption.action === 'escalate' || cannotResolve) {
    const setupReason = cannotResolve
      ? 'setup_required: Google Calendar mutation tool is missing for the selected conflict resolution path.'
      : 'Calendar conflict detected';

    const setupPrompt = cannotResolve
      ? 'Connect Google Calendar write scopes/tools, or choose a non-mutating option.'
      : 'Pick an option to resolve this conflict.';

    const escalationResult = buildEscalationPayload({
      reason: setupReason,
      prompt: setupPrompt,
      confidenceScore,
      trigger: cannotResolve ? 'approval_guardrail' : 'ambiguity_detected',
      extra: {
        conflict: conflictJson,
      },
    });

    const rationale = llmRecommendation.rationale ?? (recommendedOptionId === 'opt_1'
      ? 'protected deep work by shifting the incoming meeting'
      : recommendedOptionId === 'opt_2'
        ? 'moved a routine sync to preserve the requested slot'
        : 'multiple overlaps detected; human confirmation required');

    return {
      task: {
        ...task,
        status: 'escalation',
        result: escalationResult,
      },
      error: setupReason,
      trace: [AuditLogger.createStep('Calendar Conflict Check', `Escalated: ${setupReason}`, {
        confidence_score: confidenceScore,
        confidence_threshold: CONFIDENCE_THRESHOLD,
        ambiguity_detected: true,
        escalation_trigger: cannotResolve ? 'approval_guardrail' : 'ambiguity_detected',
        output_summary: rationale,
      })],
    };
  }

  const payloadPatch: JsonRecord = {
    conflict_detection: {
      source,
      overlaps_found: overlaps.length,
      recommended_option_id: recommendedOptionId,
      rationale: llmRecommendation.rationale ?? undefined,
    } as Json,
    conflict_resolution: {
      selected_option_id: selectedOption.id,
      action: selectedOption.action,
      event_external_id: selectedOption.event_external_id,
      newStartTime: selectedOption.newStartTime,
      newEndTime: selectedOption.newEndTime,
      conflict_window: conflictJson,
    } as Json,
  };

  if (selectedOption.action === 'shift_requested' && selectedOption.startTime && selectedOption.endTime) {
    payloadPatch.startTime = selectedOption.startTime;
    payloadPatch.endTime = selectedOption.endTime;
  }

  const nextTask = withTaskPayload(task, payloadPatch);
  const summary = selectedOption.action === 'shift_requested'
    ? 'resolved by shifting requested meeting'
    : 'resolved by rescheduling existing meeting';

  return {
    task: nextTask,
    trace: [AuditLogger.createStep('Calendar Conflict Check', `Planned: ${summary}`, {
      confidence_score: confidenceScore,
      confidence_threshold: CONFIDENCE_THRESHOLD,
      ambiguity_detected: false,
      output_summary: llmRecommendation.rationale ?? summary,
    })],
  };
}
