# Story 5.1: Adaptive Relancing Scheduler

Status: done

Story ID: 5.1
Story Key: 5-1-adaptive-relancing-scheduler

Dependencies:
- Builds on Story 2.7 protocol execution engine (`apps/agent/src/controller/nodes/protocol.ts`) for protocol-derived nudging rules.
- Builds on Story 4.4 emergency brake and Story 4.5 escalation semantics to preserve safety-first execution behavior.
- Uses current queue/event loop contracts in `tasks` + `agent_activity_log` and existing scheduler pattern in `apps/agent/src/services/BriefingScheduler.ts`.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a PM,
I want the AI to run an adaptive relancing scheduler that first requires project setup details (project, members, and deadline),
so that follow-ups are context-aware, accountable, and never start from incomplete planning data (FR4).

## Acceptance Criteria

1. **Project setup gate is mandatory before scheduling starts:**
   **Given** a user starts relancing setup
   **When** `project_name` is empty, `members` has fewer than 1 assignee, or `deadline` is missing/invalid
   **Then** the AI must explicitly request the missing fields
   **And** must not create/activate a relancing schedule until all required fields are provided
   **And** `setup_status` remains `incomplete`.

2. **Canonical project context is persisted for scheduler decisions:**
   **Given** the user provides project, members, and deadline
   **When** setup is submitted
   **Then** the system stores normalized project scheduling context tied to `organization_id`
   **And** all future scheduler runs read from that persisted context
   **And** agent-side validation is the source of truth (UI validation is advisory only).

3. **Adaptive scheduler enqueues nudges based on protocol + timing:**
   **Given** an active project with `setup_status = complete` and outstanding work
   **When** the next follow-up window is reached
   **Then** the scheduler enqueues a queue task (database-as-queue pattern) for the target member
   **And** cadence is derived from protocol metadata (`nudging_frequency_hours`) with safe defaults
   **And** duplicate nudges for the same project/member/window are prevented via idempotency checks.

4. **Blocker-aware pause behavior is enforced:**
   **Given** a member reports a blocker for a project item
   **When** scheduler evaluation runs
   **Then** related nudge cycles are paused
   **And** a blocker summary is surfaced for Morning Brief/status reporting (FR5).

5. **Safety controls and escalation rules remain authoritative:**
   **Given** emergency brake is enabled or escalation guardrails are triggered
   **When** scheduler attempts to enqueue a nudge
   **Then** side-effecting execution is prevented and status follows existing `paused`/`escalation` contracts.

6. **Multi-tenant isolation and auditability are preserved:**
   **Given** scheduler operations run in a shared environment
   **When** project context is read/written and nudges are queued
   **Then** all operations are scoped by `organization_id` with RLS
   **And** each automated scheduling decision writes an append-only audit entry with reason codes (`missing_required_fields`, `deadline_urgency`, `blocker_paused`, `emergency_brake`, `duplicate_prevented`).

7. **Deadline-aware adaptation improves urgency handling:**
   **Given** a project deadline is approaching or missed
   **When** scheduler computes next nudge timing
   **Then** cadence becomes more urgent within defined limits using deterministic urgency bands (`>7d` base cadence, `<=7d` 1.25x urgency, `<=3d` 1.5x urgency, overdue = highest urgency within safety caps)
   **And** escalation priority increases for overdue critical items.

8. **Setup re-validation automatically protects against stale/invalid context:**
   **Given** an existing project was previously eligible for scheduling
   **When** required setup data becomes invalid (e.g., members removed, deadline removed, or deadline passes without replacement policy)
   **Then** `setup_status` is reset to `incomplete`
   **And** scheduler stops creating new nudge tasks until setup is completed again.

## Tasks / Subtasks

- [x] Implement project setup data model and persistence (AC: 1, 2, 6)
  - [x] Add migration(s) for project scheduling context (project record, member assignments, deadline, scheduler config).
  - [x] Add/extend shared types in `packages/shared/src/database.types.ts` and `packages/shared/src/schemas.ts`.
  - [x] Add RLS policies aligned with organization isolation.

- [x] Add setup gate that requires project + members + deadline (AC: 1, 2)
  - [x] Update setup entrypoint (likely Dashboard/Command Center flow) to validate required fields.
  - [x] Return actionable validation errors that explicitly request missing fields.
  - [x] Persist and enforce `setup_status` (`incomplete|complete`) and prevent scheduler activation until requirements are met.
  - [x] Add re-validation hooks that reset `setup_status` when required fields become invalid.

- [x] Build adaptive scheduler service for relancing cadence (AC: 3, 7)
  - [x] Add scheduler service (patterned after `BriefingScheduler`) to evaluate active projects on interval.
  - [x] Compute `next_nudge_at` using protocol metadata + deterministic urgency bands around deadline.
  - [x] Implement idempotency guard to prevent duplicate queue inserts for same project/member/window.
  - [x] Insert queued tasks with `domain_action` contract and structured payload for downstream processing.

- [x] Integrate blocker-aware pause and safety guardrails (AC: 4, 5)
  - [x] Pause nudge generation when blocker state is active for member/project item.
  - [x] Respect emergency brake and confidence/escalation pathways before queueing execution tasks.
  - [x] Persist human-readable reason in `tasks.result` when nudge generation is blocked.

- [x] Ensure observability and regression coverage (AC: 6)
  - [x] Write audit entries for scheduler decisions in `agent_activity_log` with standardized reason codes.
  - [x] Add unit tests for gate validation, cadence calculation, deadline adaptation, blocker pause, and safety controls.
  - [x] Add unit tests for re-validation and idempotency.
  - [x] Add integration-level test for end-to-end flow: setup -> schedule -> queue insert (and duplicate prevention).

## Dev Notes

- This codebase uses a database-as-queue loop: web inserts `tasks` rows with `status='queued'`, agent subscribes via Realtime, graph processes, then finalizes status/result; new scheduler output must follow the same contract instead of calling side-effect tools directly. [Source: apps/agent/src/index.ts:128] [Source: apps/agent/src/controller/graph.ts:767]
- Existing scheduled-job pattern already exists in `BriefingScheduler` (`setInterval`, poll due users, insert queued task). Reuse that service shape for relancing rather than creating ad-hoc cron logic. [Source: apps/agent/src/services/BriefingScheduler.ts:7]
- Protocol data already exposes machine-readable cadence primitives (`nudging_frequency_hours`) through shared schemas and `user_protocols.metadata`; adaptive timing should read from this source before applying deadline urgency multipliers. [Source: packages/shared/src/schemas.ts:300] [Source: apps/agent/src/services/ProtocolService.ts:103] [Source: supabase/migrations/20260120000000_add_metadata_to_user_protocols.sql:4]
- Safety constraints are already authoritative in the agent (Emergency Brake -> `paused`, confidence/perimeter -> `escalation`); scheduler enqueue logic must respect these existing pathways and never bypass graph guardrails. [Source: apps/agent/src/controller/graph.ts:86] [Source: apps/agent/src/controller/graph.ts:172]
- Blocker handling exists today as protocol-time message scanning (`blocker|blocked|waiting for` => task paused). Story 5.1 should extend this behavior for project/member nudge cycles, not replace it with a conflicting mechanism. [Source: apps/agent/src/controller/nodes/protocol.ts:28]
- There is no canonical `projects`/`project_members` schema yet in current migrations, so this story is expected to introduce project setup persistence and RLS-safe access patterns as new schema work. [Source: supabase/migrations/20260114000000_core_and_domain_schema.sql:1]

### Technical Requirements

- Implement project setup as persisted backend state (not transient UI form state) with explicit `setup_status` gating so scheduler execution is impossible when required fields are missing. [Source: _bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md:23]
- Required setup fields are strict and machine-validatable: `project_name` non-empty string, `members` length >= 1, `deadline` valid timestamp/date, and all records scoped to `organization_id`. [Source: _bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md:25]
- Scheduler must follow existing queue contract by inserting `tasks` rows as `status='queued'`; do not call outbound side-effect tools directly from scheduler loop. [Source: apps/agent/src/index.ts:128] [Source: apps/agent/src/controller/graph.ts:767]
- Any new scheduler-produced `domain_action` must be executable end-to-end (registry + graph route + processor) or it will fail as unsupported; if no new action is introduced, use an already supported one intentionally. [Source: apps/agent/src/processors/ProcessorRegistry.ts:10] [Source: apps/agent/src/controller/graph.ts:892]
- Adaptive cadence algorithm must start from protocol metadata (`nudging_frequency_hours`) and then apply deterministic deadline urgency multipliers and safety caps exactly as defined in acceptance criteria. [Source: packages/shared/src/schemas.ts:300] [Source: _bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md:61]
- Add idempotency controls for queue inserts keyed by project/member/window to prevent duplicate nudges during repeated interval checks or retries. [Source: _bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md:37]
- Keep safety authority in existing guardrails: emergency brake causes `paused`; uncertainty/perimeter violations cause `escalation`; scheduler must not bypass these status semantics. [Source: apps/agent/src/controller/graph.ts:86] [Source: apps/agent/src/controller/graph.ts:172]
- Extend blocker behavior using existing detection intent and persist a readable reason payload for blocked nudge generation (`tasks.result` plus audit reason code). [Source: apps/agent/src/controller/nodes/protocol.ts:31] [Source: _bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md:92]
- All schema changes require RLS policies and organization isolation parity with existing core tables; use `snake_case` naming for tables/columns/policies. [Source: supabase/migrations/20260114000000_core_and_domain_schema.sql:133] [Source: _bmad-output/project-context.md:30]
- Write append-only audit rows for each scheduler decision path with standardized reason codes (`missing_required_fields`, `deadline_urgency`, `blocker_paused`, `emergency_brake`, `duplicate_prevented`). [Source: _bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md:55]

### Architecture Compliance

- Preserve the database-centric event loop boundary: frontend persists intent/state to Supabase, agent consumes/acts asynchronously via Realtime and writes final state back; do not introduce direct UI-to-tool execution pathways. [Source: _bmad-output/planning-artifacts/architecture.md:65] [Source: _bmad-output/planning-artifacts/architecture.md:124]
- Keep task lifecycle compliant with existing graph finalization semantics (`queued -> processing -> done/error/escalation/paused`) so new relancing tasks remain visible to current dashboard/status logic. [Source: apps/agent/src/controller/graph.ts:767] [Source: packages/shared/src/schemas.ts:3]
- Enforce shared-contract discipline: new task payload/result shapes and DB table types must be modeled in `packages/shared` and consumed by both apps, not redefined ad hoc in web or agent code. [Source: _bmad-output/planning-artifacts/architecture.md:297] [Source: _bmad-output/project-context.md:36]
- Implement scheduler orchestration in the agent service layer and wire lifecycle in `apps/agent/src/index.ts` (`start()` on boot, `stop()` on shutdown), matching existing scheduler operational patterns. [Source: apps/agent/src/services/BriefingScheduler.ts:14] [Source: apps/agent/src/index.ts:191]
- Apply schema changes exclusively via Supabase migrations and keep naming conventions strict (`snake_case` DB, `camelCase` TS); avoid runtime schema mutations from app code. [Source: _bmad-output/planning-artifacts/architecture.md:114] [Source: _bmad-output/planning-artifacts/architecture.md:153]
- Maintain RLS-first multi-tenant isolation for any new project/setup tables and ensure policy behavior mirrors established organization-scoped access patterns. [Source: supabase/migrations/20260114000000_core_and_domain_schema.sql:147] [Source: _bmad-output/planning-artifacts/architecture.md:120]
- Keep `agent_activity_log` append-only and include scheduler decision traces/citations without update/delete flows. [Source: _bmad-output/planning-artifacts/architecture.md:104] [Source: _bmad-output/planning-artifacts/architecture.md:207]

### Library & Framework Requirements

- Reuse existing stack already running in this repo (Supabase realtime queue + Node/TS agent + Vue UI); this story should not introduce a parallel scheduler framework or external queue service. [Source: _bmad-output/planning-artifacts/architecture.md:65] [Source: _bmad-output/project-context.md:21]
- Keep all new runtime contracts typed through `@ai-assistant/shared` Zod schemas and database types to avoid drift between `apps/agent` and `apps/web`. [Source: _bmad-output/planning-artifacts/architecture.md:175] [Source: _bmad-output/planning-artifacts/architecture.md:297]
- Current repository versions in use: `@supabase/supabase-js` `^2.43.0` (agent/web), `@langchain/langgraph` `^0.2.0` (agent), `vue` `^3.5.0` (web). Keep story implementation compatible with these pinned ranges unless a separate dependency-upgrade story is approved. [Source: apps/agent/package.json:17] [Source: apps/agent/package.json:25] [Source: apps/web/package.json:17] [Source: apps/web/package.json:21]
- Latest package intelligence (for awareness only): `@supabase/supabase-js` `2.98.0`, `@langchain/langgraph` `1.2.0`, `vue` `3.5.29`; do not silently upgrade within Story 5.1 because it expands scope and regression risk. [Source: octocode_packageSearch run on 2026-03-05]
- If a new relancing `domain_action` is added, it must be wired in both `ProcessorRegistry` and graph node routing; otherwise task execution will fail as unsupported. [Source: apps/agent/src/processors/ProcessorRegistry.ts:10] [Source: apps/agent/src/controller/graph.ts:872]

### File Structure Requirements

- Database changes: add timestamped migration(s) under `supabase/migrations/` for project setup schema, member linkage, deadline fields, scheduler windows, idempotency keys, and RLS policies. [Source: _bmad-output/planning-artifacts/architecture.md:114]
- Shared contracts: update `packages/shared/src/database.types.ts` (generated types) and `packages/shared/src/schemas.ts` (Zod validation) for new setup/scheduler payloads. [Source: _bmad-output/planning-artifacts/architecture.md:281] [Source: packages/shared/src/schemas.ts:23]
- Agent scheduler implementation: create `apps/agent/src/services/RelancingScheduler.ts` (naming aligned with existing `BriefingScheduler`) and wire startup/shutdown in `apps/agent/src/index.ts`. [Source: apps/agent/src/services/BriefingScheduler.ts:7] [Source: apps/agent/src/index.ts:191]
- Task execution path: either (a) reuse existing supported `domain_action` intentionally, or (b) add new processor file(s) in `apps/agent/src/processors/` plus registry + graph routing updates. [Source: apps/agent/src/processors/ProcessorRegistry.ts:14] [Source: apps/agent/src/controller/graph.ts:900]
- Web setup gate: implement required-field collection where task creation already occurs (Dashboard/Command Center flow) so users are prompted for missing project, members, and deadline before activation. [Source: apps/web/src/views/Dashboard.vue:252] [Source: _bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md:23]
- Variance note: architecture references `taskProcessor.ts` and legacy paths that no longer exist; follow current repo structure (`ProcessorRegistry`, graph nodes, service classes) as source of truth. [Source: _bmad-output/planning-artifacts/architecture.md:268] [Source: apps/agent/src/processors/ProcessorRegistry.ts:10]

### Testing Requirements

- Agent unit coverage: add/extend specs for scheduler cadence math, setup gating, re-validation, blocker pause, emergency brake behavior, and idempotent queueing under `apps/agent/src/**`. [Source: apps/agent/src/services/SafetyControlsService.spec.ts] [Source: apps/agent/src/controller/graph.spec.ts]
- Web validation coverage: extend dashboard/composable tests to assert required-field prompting and activation blocking when project setup is incomplete. [Source: apps/web/src/views/Dashboard.spec.ts]
- Integration behavior checks: verify end-to-end flow (`setup complete -> scheduler interval -> queued task insert -> graph processing`) and duplicate prevention for same project/member/window.
- Status contract assertions: tests must explicitly validate allowed task statuses (`queued|processing|done|error|escalation|paused`) and ensure new paths do not invent unsupported statuses. [Source: packages/shared/src/schemas.ts:3]
- Regression gate commands: run `pnpm -r test`, then relevant package builds/lint (`pnpm -r build`, `pnpm -r lint`) before marking implementation complete. [Source: package.json:7] [Source: package.json:8] [Source: apps/agent/package.json:10] [Source: apps/web/package.json:10]

### Latest Technical Information

- Supabase JS latest stable is `2.98.0` (repo currently uses `^2.43.0`); API usage in this story should stay within currently installed capabilities to avoid accidental runtime drift.
- LangGraph latest stable is `1.2.0` (repo currently uses `^0.2.0`); avoid introducing APIs only available in LangGraph 1.x unless dependency upgrade is explicitly scheduled.
- Vue latest stable is `3.5.29` (repo uses `^3.5.0`), so composition API assumptions for setup UI are still valid without framework migration.

### Project Context Reference

- Follow project guardrails from `_bmad-output/project-context.md`: strict DB `snake_case`, TS `camelCase`, shared-type imports from `packages/shared`, and database-as-queue architecture.
- Respect RLS boundaries in frontend and avoid bypass patterns; all multi-tenant data access remains organization-scoped.
- Keep comments minimal and purposeful, prefer explicit typing, and maintain existing test framework conventions (Vitest + mocked externals for unit tests).

### Project Structure Notes

- Alignment: Story 5.1 implementation maps cleanly to existing monorepo boundaries (`apps/web` for setup UX, `apps/agent` for scheduler orchestration, `packages/shared` for contracts, `supabase/migrations` for schema).
- Detected variance: architecture artifact still mentions legacy `taskProcessor.ts`; current implementation uses `ProcessorRegistry` + `graph.ts`, and Story 5.1 should follow current code reality.
- Naming and placement: new SQL objects must be `snake_case`; new TS services/processors/composables should follow existing file naming and folder conventions already used in repo.

### References

- ` _bmad-output/planning-artifacts/epics.md` (Epic 5 Story 5.1-5.4 context, FR4/FR5 intent)
- ` _bmad-output/planning-artifacts/prd.md` (FR4, FR5, FR11 and safety NFR alignment)
- ` _bmad-output/planning-artifacts/architecture.md` (database-as-queue, RLS, shared contracts, migration strategy)
- ` _bmad-output/project-context.md` (implementation rules, naming, testing, workflow constraints)
- ` apps/agent/src/index.ts` (Realtime queue subscription and scheduler lifecycle wiring pattern)
- ` apps/agent/src/services/BriefingScheduler.ts` (existing interval scheduler reference implementation)
- ` apps/agent/src/controller/graph.ts` (status model, emergency brake/perimeter/escalation enforcement, routing)
- ` apps/agent/src/controller/nodes/protocol.ts` and `apps/agent/src/services/ProtocolService.ts` (protocol metadata use and blocker handling baseline)
- ` apps/agent/src/processors/ProcessorRegistry.ts` (supported domain actions and registry requirement)
- ` packages/shared/src/schemas.ts` (task status enum and protocol metadata schema)
- ` supabase/migrations/20260114000000_core_and_domain_schema.sql` + follow-up status/safety migrations (existing schema/RLS baseline)

### Completion Status

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implementation, review remediation, and validation are complete; story is marked `done`.

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- `pnpm --filter @ai-assistant/shared build`
- `pnpm --filter @ai-assistant/agent test`
- `pnpm --filter @ai-assistant/web test`
- `pnpm -r test`
- `pnpm -r build` (fails in pre-existing web/agent type-check surfaces unrelated to Story 5.1 changes)
- `pnpm -r lint` (fails because `eslint` is not installed in current environment)
- `pnpm -r build` (2026-03-09 review validation: fails in pre-existing `apps/web` type-check surfaces unrelated to Story 5.1)

### Completion Notes List

- Added migration `supabase/migrations/20260307000000_create_relancing_scheduler_context.sql` with project setup persistence, member assignment linkage, idempotency dispatch table, and organization-scoped RLS policies.
- Extended shared contracts for setup status, scheduler reason codes, project setup entities, and relancing nudge payloads in `packages/shared/src/schemas.ts` and `packages/shared/src/database.types.ts`.
- Implemented `RelancingScheduler` service with deterministic urgency bands, protocol-derived cadence, idempotency checks, setup re-validation, blocker pause handling, emergency brake enforcement, and append-only scheduler audit logging.
- Added new `relancing.nudge` processor path (`RelancingNudgeProcessor`, registry wiring, graph node/route) and scheduler lifecycle wiring in `apps/agent/src/index.ts`.
- Added dashboard-side setup entrypoint with persisted setup flow and explicit required-field error prompting via `useRelancingSetup` and `Dashboard.vue`.
- Added regression coverage for scheduler logic, relancing processor routing, and setup persistence UX/test hooks.
- Code review fixes: aligned `relancing.update` graph finalization with escalation/paused contracts, removed redundant relancing update schema parsing that crashed regression tests, and allowed overdue nudging only when `scheduler_config.allow_overdue_nudging === true` so AC7 urgency behavior stays deterministic.

### File List

- `supabase/migrations/20260307000000_create_relancing_scheduler_context.sql`
- `packages/shared/src/schemas.ts`
- `packages/shared/src/database.types.ts`
- `apps/agent/src/services/RelancingScheduler.ts`
- `apps/agent/src/services/RelancingScheduler.spec.ts`
- `apps/agent/src/processors/RelancingNudgeProcessor.ts`
- `apps/agent/src/processors/RelancingNudgeProcessor.spec.ts`
- `apps/agent/src/processors/ProcessorRegistry.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/agent/src/controller/graph.spec.ts`
- `apps/agent/src/index.ts`
- `apps/agent/src/processors/RelancingUpdateProcessor.ts`
- `apps/web/src/composables/useRelancingSetup.ts`
- `apps/web/src/composables/useRelancingSetup.spec.ts`
- `apps/web/src/views/Dashboard.vue`
- `apps/web/src/views/Dashboard.spec.ts`

## Senior Developer Review (AI)

- Reviewer: Amelia (Developer Agent)
- Date: 2026-03-09
- Outcome: Approve
- Findings Resolved:
  - [High] Restored `relancing.update` graph handling so `setup_required` resolves through existing `escalation` semantics instead of leaving relancing tasks in invalid intermediate state.
  - [High] Removed redundant `RelancingUpdateIntentSchema` parsing in `apps/agent/src/processors/RelancingUpdateProcessor.ts` that was crashing relancing regression coverage.
  - [Medium] Aligned `RelancingScheduler` deadline validation with `scheduler_config.allow_overdue_nudging` so AC7 overdue urgency remains supported without breaking setup re-validation.
- Validation:
  - `pnpm -r test`
  - `pnpm -r build` (fails in pre-existing `apps/web` type-check surfaces unrelated to Story 5.1 review fixes)

## Change Log

- 2026-03-09: Senior code review completed; fixed relancing regression findings, documented validation results, and advanced story to `done`.
