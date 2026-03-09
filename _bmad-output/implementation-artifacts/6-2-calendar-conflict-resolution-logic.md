# Story 6.2: Calendar Conflict Resolution Logic

Status: done

Story ID: 6.2
Story Key: 6-2-calendar-conflict-resolution-logic

Dependencies:
- Epic 2 foundation: `tasks` queue + agent graph routing + PerimeterGuard tier enforcement + Safety Controls (Emergency Brake) + immutable audit logging.
- Google Workspace integration configured for the org (`workspace_integrations.provider='google'`).
- Calendar ingestion available as a local cache (`calendar_events`), but conflict detection/resolution should treat the API as source of truth when correctness matters.

Scope notes (MVP):
- Detect a conflict as overlapping busy time on the user’s primary calendar; when attendee emails are available, optionally verify availability using Calendar FreeBusy.
- Resolve by proposing a deterministic plan (move/cancel/reschedule) with transparent reasoning and citations; only execute mutations when allowed by safety/perimeter gates.
- Preserve "Executive Calm" semantics: prefer minimal disruption, avoid churn, and escalate when ambiguous.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an SME Leader,
I want the assistant to detect and resolve calendar conflicts when scheduling or reconciling overlapping meetings,
so that my schedule stays coherent without manual back-and-forth.

## Acceptance Criteria

1. Given a `calendar.create` task with `startTime`/`endTime`, when the agent processes it, then it checks for conflicts against busy time on the user's primary calendar and identifies any overlapping events.
2. Given a detected conflict, when the agent plans a resolution, then it uses the user's active protocol rules ("Nudging Philosophy") to choose between (a) shifting the new event, (b) rescheduling a lower-priority existing event, or (c) escalating for human input when ambiguity/risk is high.
3. Given a safe and permitted resolution path (Emergency Brake off, perimeter checks passed, tools/scopes available), when the agent executes, then it applies the change via Google Calendar (create/update/patch/move) and records the impacted event IDs.
4. Given any resolution (executed or proposed), when the task completes, then the Reasoning Trace includes the rationale (e.g., "protected deep work" / "moved routine sync") and the result includes enough structured context (conflict window + proposed options) for the UI to render an Escalation Card.
5. Given any LLM reasoning involved in the plan, when prompts are constructed, then PII is redacted before sending to the model and recovered only for approved/tool execution paths.
6. Unit tests cover: (a) no-conflict scheduling succeeds, (b) conflict triggers escalation with options, (c) missing tools/permissions yields `setup_required`/escalation rather than silent failure.

## Tasks / Subtasks

- [x] Add conflict-aware execution path for `calendar.create` in the Agent Controller graph (AC: 1, 2, 4)
  - [x] Add a calendar conflict node (or equivalent pre-processor hook) that can access `active_protocol_rules` from state
  - [x] Route `calendar.create` through the conflict check before calling the existing processor
- [x] Implement conflict detection against calendar busy windows (AC: 1)
  - [x] Preferred: call Calendar FreeBusy for the relevant calendar/time range when tool support exists
  - [x] Fallback: query `calendar_events` cache for overlapping events and treat it as "best effort"
- [x] Implement a resolution planner that is protocol-aware and deterministic in output shape (AC: 2, 4, 5)
  - [x] Produce 1-3 alternative time options (and/or a reschedule/cancel proposal) with a recommended option
  - [x] Escalate when ambiguity is high, when the plan requires risky mutations, or when tool/scope is missing
- [x] Execute permitted resolutions via Google Calendar and persist outcome metadata (AC: 3, 4)
  - [x] Create new event when the chosen option is to shift the requested meeting
  - [x] If updating an existing event is selected, use patch/update semantics and honor notification settings where applicable
- [x] Add/extend tests for graph routing + conflict behaviors (AC: 6)
  - [x] Graph-level test: conflict -> task escalates and does not call `create_calendar_event`
  - [x] Graph-level test: no conflict -> calls `create_calendar_event`
  - [x] Graph-level test: tool missing/permission failure -> escalates with `setup_required`

## Dev Notes

- Pattern: Database-as-Queue. UI writes `tasks(status='queued')`; agent updates `processing` -> `done`/`error`/`escalation`/`paused`. [Source: `apps/agent/src/controller/graph.ts`]
- Safety gates: Emergency Brake must pause proxy actions; PerimeterGuard tier enforcement runs before execution; immutable audit log is flushed in finalize. [Source: `apps/agent/src/controller/graph.ts`]
- Current calendar execution: `calendar.create` directly calls MCP `create_calendar_event` without conflict checks. [Source: `apps/agent/src/processors/CalendarCreateProcessor.ts`]
- Calendar cache: `calendar_events` is populated via Google Calendar `events.list` ingestion with raw payload stored under `metadata.event_raw`. [Source: `apps/agent/src/services/google.ts`]
- Testing: add Vitest unit tests in `apps/agent/src/controller/graph.spec.ts` and/or a focused spec for conflict logic. Follow existing mocking patterns for Supabase + MCP. [Source: `apps/agent/src/controller/graph.spec.ts`]

### Implementation Guidance

- Conflict overlap rule (single events): consider a conflict when `requestedStart < existingEnd && requestedEnd > existingStart`.
- Filter out non-blocking events: ignore items where `metadata.event_raw.transparency === 'transparent'`; treat all-day (`start.date`) events as busy for the full day.
- Prefer API correctness: if a FreeBusy tool is available, use it as source of truth; otherwise treat DB cache results as best-effort and escalate if confidence is low.
- MCP tool names are not guaranteed; discover availability via `mcpService.getLangChainTools(orgId)` and degrade safely when a required mutation tool (patch/update/move) is missing.
- Escalation payload shape should be deterministic so the Hub can render options:

```json
{
  "escalation": true,
  "reason": "Calendar conflict detected",
  "prompt": "Pick an option to resolve this conflict.",
  "conflict": {
    "requested": { "summary": "...", "startTime": "...", "endTime": "..." },
    "overlaps": [
      { "external_id": "...", "title": "...", "start_time": "...", "end_time": "..." }
    ],
    "options": [
      { "id": "opt_1", "label": "Move requested meeting", "startTime": "...", "endTime": "...", "requires_write": false },
      { "id": "opt_2", "label": "Reschedule existing meeting", "event_external_id": "...", "newStartTime": "...", "newEndTime": "...", "requires_write": true }
    ],
    "recommended_option_id": "opt_1"
  }
}
```

### Project Structure Notes

- Keep domain actions in `domain.action` form (e.g., `calendar.create`) and route via `apps/agent/src/controller/graph.ts`.
- Prefer reusable shared contracts in `packages/shared/src/schemas.ts` if introducing new structured payload/result fields (avoid local-only types).
- Avoid bypassing existing safety systems; conflict resolution must integrate with escalation payload conventions (`buildEscalationPayload`) so the Hub can render it.

### References

- Story definition & baseline AC: `_bmad-output/planning-artifacts/epics.md` (Story 6.2)
- Product requirement: `_bmad-output/planning-artifacts/prd.md` (FR13)
- Agent orchestration, safety, escalation payloads: `apps/agent/src/controller/graph.ts`, `apps/agent/src/controller/escalation.ts`, `apps/agent/src/controller/nodes/escalate.ts`
- Current calendar create processor: `apps/agent/src/processors/CalendarCreateProcessor.ts`
- Calendar events cache schema: `supabase/migrations/20260114000000_core_and_domain_schema.sql`, `packages/shared/src/database.types.ts`
- Google Calendar FreeBusy API: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- Google Calendar Events patch/update: https://developers.google.com/workspace/calendar/api/v3/reference/events/patch , https://developers.google.com/workspace/calendar/api/v3/reference/events/update
- OAuth scopes reference (Calendar): https://developers.google.com/identity/protocols/oauth2/scopes#calendar

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- `pnpm --filter @ai-assistant/agent test -- src/controller/graph.spec.ts src/processors/CalendarCreateProcessor.spec.ts`
- `pnpm --filter @ai-assistant/agent lint`

### Completion Notes List

- Added `calendar_conflict` node and graph routing so `calendar.create` always evaluates conflict state before processor execution.
- Implemented Google MCP tool discovery (`mcpService.getLangChainTools`) for FreeBusy + mutation tools, with graceful degradation when tools/scopes are unavailable.
- Added conflict planner output (`conflict` window, options, recommended option) and escalation payload integration for deterministic UI rendering.
- Extended `CalendarCreateProcessor` to support setup-required escalation, permission/scope handling, impacted event IDs, and patch/update path for existing-event reschedules.
- Added and updated Vitest coverage for graph conflict routing and processor setup-required/reschedule behavior.

### File List

- `apps/agent/src/controller/graph.ts`
- `apps/agent/src/controller/graph.spec.ts`
- `apps/agent/src/controller/nodes/calendarConflict.ts`
- `apps/agent/src/processors/CalendarCreateProcessor.ts`
- `apps/agent/src/processors/CalendarCreateProcessor.spec.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/6-2-calendar-conflict-resolution-logic.md`

### Change Log

- 2026-03-09: Implemented Story 6.2 conflict-aware calendar scheduling with MCP tool-based conflict detection/resolution, setup-required escalation behavior, and graph/processor test coverage.
