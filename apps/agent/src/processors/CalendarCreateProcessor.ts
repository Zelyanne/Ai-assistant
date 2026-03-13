import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { Task } from '@ai-assistant/shared';
import { mcpService } from '../services/mcp.js';
import { PerimeterGuard } from '../guards/PerimeterGuard.js';

type ToolCandidate = { name?: string };

type CalendarMutationAction = 'create_requested' | 'reschedule_existing';

interface CalendarConflictResolution {
  action?: CalendarMutationAction;
  event_external_id?: string;
  newStartTime?: string;
  newEndTime?: string;
  sendUpdates?: 'all' | 'externalOnly' | 'none';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function extractToolNames(rawTools: unknown[]): string[] {
  return rawTools
    .map((tool) => {
      const candidate = tool as ToolCandidate;
      return typeof candidate.name === 'string' ? candidate.name : null;
    })
    .filter((name): name is string => Boolean(name && name.length > 0));
}

function findToolName(toolNames: string[], keywords: string[]): string | null {
  for (const toolName of toolNames) {
    const normalized = toolName.toLowerCase();
    if (keywords.every((keyword) => normalized.includes(keyword))) {
      return toolName;
    }
  }
  return null;
}

function getConflictResolution(payload: Record<string, unknown>): CalendarConflictResolution {
  const raw = asRecord(payload.conflict_resolution);
  return {
    action: raw?.action === 'reschedule_existing' ? 'reschedule_existing' : 'create_requested',
    event_external_id: typeof raw?.event_external_id === 'string' ? raw.event_external_id : undefined,
    newStartTime: typeof raw?.newStartTime === 'string' ? raw.newStartTime : undefined,
    newEndTime: typeof raw?.newEndTime === 'string' ? raw.newEndTime : undefined,
    sendUpdates: raw?.sendUpdates === 'all' || raw?.sendUpdates === 'externalOnly' || raw?.sendUpdates === 'none'
      ? raw.sendUpdates
      : undefined,
  };
}

function isPermissionOrScopeError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('permission')
    || lower.includes('forbidden')
    || lower.includes('unauthorized')
    || lower.includes('scope')
    || lower.includes('insufficient');
}

function setupRequired(prompt: string, details?: string): ProcessorResult {
  return {
    outcome: 'setup_required',
    prompt,
    details,
  };
}

function extractEventId(rawResult: unknown): string | null {
  const root = asRecord(rawResult);
  if (!root) {
    return null;
  }

  if (typeof root.id === 'string') {
    return root.id;
  }

  const structured = asRecord(root.structuredContent);
  if (structured && typeof structured.id === 'string') {
    return structured.id;
  }

  return null;
}

/**
 * Processor for calendar event creation using MCP.
 */
export class CalendarCreateProcessor extends BaseProcessor {
  constructor() {
    super();
  }

  async process(task: Task): Promise<ProcessorResult> {
    console.log(`[CalendarCreateProcessor][${task.id}] Processing calendar.create...`);

    const payload = asRecord(task.payload) ?? {};
    const summary = typeof payload.summary === 'string' ? payload.summary : null;
    const description = typeof payload.description === 'string' ? payload.description : undefined;
    const startTime = typeof payload.startTime === 'string' ? payload.startTime : null;
    const endTime = typeof payload.endTime === 'string' ? payload.endTime : null;
    const location = typeof payload.location === 'string' ? payload.location : undefined;
    const conflictResolution = getConflictResolution(payload);

    const [freebusyResolution, createResolution, patchResolution, updateResolution] = await Promise.all([
      mcpService.resolveToolName(task.organization_id, 'query_calendar_freebusy'),
      mcpService.resolveToolName(task.organization_id, 'create_calendar_event'),
      mcpService.resolveToolName(task.organization_id, 'patch_calendar_event'),
      mcpService.resolveToolName(task.organization_id, 'update_calendar_event'),
    ]);

    const freebusyTool = freebusyResolution.resolvedTool;
    const createTool = createResolution.resolvedTool;
    const patchTool = patchResolution.resolvedTool;
    const updateTool = updateResolution.resolvedTool;

    if (conflictResolution.action === 'reschedule_existing') {
      const eventExternalId = conflictResolution.event_external_id;
      const newStartTime = conflictResolution.newStartTime;
      const newEndTime = conflictResolution.newEndTime;

      if (!eventExternalId || !newStartTime || !newEndTime) {
        return setupRequired('setup_required: selected reschedule option is missing event/timing details.');
      }

      const mutationTool = patchTool ?? updateTool;
      if (!mutationTool) {
        return setupRequired('setup_required: Google Calendar patch/update tool is unavailable for conflict resolution.');
      }

      try {
        const mutationResult = mutationTool === 'manage_event'
          ? await mcpService.executeWorkerTool(task.organization_id, 'calendar', 'patch_calendar_event', {
              action: 'update',
              calendar_id: 'primary',
              event_id: eventExternalId,
              start_time: newStartTime,
              end_time: newEndTime,
            })
          : await mcpService.executeWorkerTool(task.organization_id, 'calendar', 'patch_calendar_event', {
              calendarId: 'primary',
              calendar_id: 'primary',
              eventId: eventExternalId,
              event_id: eventExternalId,
              sendUpdates: conflictResolution.sendUpdates ?? 'all',
              send_updates: conflictResolution.sendUpdates ?? 'all',
              event: {
                start: { dateTime: newStartTime },
                end: { dateTime: newEndTime },
              },
              body: {
                start: { dateTime: newStartTime },
                end: { dateTime: newEndTime },
              },
            });

        return {
          message: 'Calendar conflict resolved by updating existing event via MCP',
          summary: 'Calendar conflict resolved by updating existing event via MCP',
          task_id: task.id,
          domain_action: task.domain_action,
          impacted_event_ids: [eventExternalId],
          resolution_action: 'reschedule_existing',
          tool_name: mutationResult.toolName,
          result: mutationResult.result,
        };
      } catch (error: unknown) {
        const guard = new PerimeterGuard();
        const message = error instanceof Error ? error.message : String(error);
        const safeMessage = guard.redactPII(message);

        if (isPermissionOrScopeError(safeMessage)) {
          return setupRequired(
            'setup_required: Google Calendar update permissions/scopes are missing for this organization.',
            safeMessage,
          );
        }

        throw error;
      }
    }

    if (!summary || !startTime || !endTime) {
      throw new Error('Missing required calendar fields: summary, startTime, or endTime');
    }

    if (!createTool) {
      return setupRequired('setup_required: Google Calendar create tool is unavailable for this organization.');
    }

    if (freebusyTool && (task.payload as any)?.conflict_detection?.overlaps_found === undefined) {
      const { result: freebusyResult } = await mcpService.executeWorkerTool(
        task.organization_id,
        'calendar',
        'query_calendar_freebusy',
        freebusyTool === 'query_freebusy'
          ? {
              time_min: startTime,
              time_max: endTime,
              calendar_ids: ['primary'],
            }
          : {
              calendarId: 'primary',
              calendar_id: 'primary',
              timeMin: startTime,
              timeMax: endTime,
            },
      );

      const calendars = asRecord(asRecord(freebusyResult)?.calendars);
      const primary = asRecord(calendars?.primary);
      const busy = primary?.busy;

      if (Array.isArray(busy) && busy.length > 0) {
        return {
          outcome: 'conflict_detected',
          prompt: 'Calendar conflict detected. Please confirm how to proceed.',
          conflict: {
            overlaps: busy,
            requested: {
              startTime,
              endTime,
              summary,
            },
          },
        };
      }
    }

    try {
      const created = createTool === 'manage_event'
        ? await mcpService.executeWorkerTool(task.organization_id, 'calendar', 'create_calendar_event', {
            action: 'create',
            calendar_id: 'primary',
            summary,
            description,
            start_time: startTime,
            end_time: endTime,
            location,
          })
        : await mcpService.executeWorkerTool(task.organization_id, 'calendar', 'create_calendar_event', {
            calendarId: 'primary',
            calendar_id: 'primary',
            event: {
              summary,
              description,
              start: { dateTime: startTime },
              end: { dateTime: endTime },
              location,
            },
          });

      const result = created.result;

      const createdEventId = extractEventId(result);
      const impactedEventIds = createdEventId ? [createdEventId] : [];

      return {
        message: 'Calendar event created successfully via MCP',
        summary: 'Calendar event created successfully via MCP',
        task_id: task.id,
        domain_action: task.domain_action,
        impacted_event_ids: impactedEventIds,
        resolution_action: 'create_requested',
        tool_name: created.toolName,
        result,
      };
    } catch (error: unknown) {
      const guard = new PerimeterGuard();
      const message = error instanceof Error ? error.message : String(error);
      const safeMessage = guard.redactPII(message);

      if (isPermissionOrScopeError(safeMessage)) {
        return setupRequired(
          'setup_required: Google Calendar permissions/scopes are missing for calendar.create.',
          safeMessage,
        );
      }

      throw error;
    }
  }
}
