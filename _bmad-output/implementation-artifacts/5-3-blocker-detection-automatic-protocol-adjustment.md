# Story 5.3: Blocker Detection & Automatic Protocol Adjustment

Status: done

Story ID: 5.3
Story Key: 5-3-blocker-detection-automatic-protocol-adjustment

Dependencies:
- Builds on Story 5.1 relancing scheduler context, dispatch idempotency, and blocker pause primitives (`project_scheduling_contexts.blocker_active`, `project_nudge_dispatches.reason_code`, `RelancingScheduler`).
- Builds on Story 5.2 bidirectional inbound update parsing/persistence (`relancing.update`, `relancing_updates`, `relancing_update_events`) so blocker signals come from normalized member replies rather than ad-hoc keyword scraping.
- Must preserve Story 4.4/4.5 safety precedence and graph status semantics (`paused` / `escalation`) for all side-effecting execution paths.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a PM,
I want the AI to detect blocker reports and automatically adjust relancing protocol behavior,
so that active nudge cycles pause, adapt, and resume safely while PM-facing reporting surfaces blocker intelligence without manual intervention (FR5, FR19).

## Acceptance Criteria

1. **Normalized blocker signals drive scheduler state changes (not raw message heuristics):**
   **Given** an inbound `relancing.update` task is processed and classified with `intents` including `blocker_report`
   **When** persistence succeeds
   **Then** the linked `project_scheduling_contexts` row is updated with `blocker_active=true`, `blocker_summary`, and `blocker_reported_by` where available
   **And** the update is traceable via `relancing_update_events` and append-only audit entries.

2. **Automatic protocol adjustment is deterministic and bounded:**
   **Given** blocker reports are detected for a project/member cycle
   **When** adjustment rules are evaluated
   **Then** scheduler behavior is updated through explicit deterministic policy (for example via `scheduler_config` override fields)
   **And** changes are bounded by existing cadence limits and never bypass safety controls.

3. **Blocker pause behavior is enforced end-to-end:**
   **Given** `blocker_active=true` for a scheduling context
   **When** `RelancingScheduler` evaluates due windows
   **Then** nudge tasks are persisted as `paused` with blocker reason context
   **And** no active nudge side-effects are queued for that blocked cycle.

4. **Unblock/resume flow clears adjustment state safely:**
   **Given** a subsequent update indicates blocker resolution or valid progress continuation
   **When** unblock criteria are satisfied
   **Then** blocker state is cleared (`blocker_active=false`, summary reset/updated as defined)
   **And** next nudge timing is recalculated from protocol + urgency rules without duplicating dispatches.

5. **PM reporting receives blocker context from normalized relancing updates:**
   **Given** blocker and status updates are processed
   **When** dashboard and morning brief views are rendered
   **Then** blocker-related items are surfaced in blocker filters/cards and narrative context
   **And** source linkage remains traceable through existing metadata and citation flows.

6. **Safety and escalation guardrails remain authoritative:**
   **Given** emergency brake is enabled, ambiguity is detected, or perimeter/confidence guardrails trigger
   **When** blocker-adjustment logic would otherwise mutate execution state
   **Then** existing guardrail outcomes (`paused`/`escalation`) take precedence
   **And** no adjustment path bypasses graph-level control flow.

7. **Idempotency and multi-tenant boundaries are preserved:**
   **Given** duplicate inbound messages/retries or concurrent scheduler cycles
   **When** blocker adjustment and resume transitions run
   **Then** writes are idempotent and organization-scoped
   **And** duplicate events are recorded as non-destructive trace events.

8. **Regression coverage validates blocker-adjustment behavior:**
   **Given** the new blocker adjustment flow
   **When** test suites execute
   **Then** unit/integration coverage proves pause, adjustment, resume, idempotency, and reporting behavior
   **And** existing task status and queue contracts remain unchanged.

## Tasks / Subtasks

- [x] Implement blocker-to-context synchronization in relancing update processing (AC: 1, 3, 7)
  - [x] Ensure `relancing.update` execution path updates `project_scheduling_contexts.blocker_active/blocker_summary/blocker_reported_by` from normalized intents.
  - [x] Persist event-level trace entries in `relancing_update_events` and append audit reasons for blocker detected / duplicate prevented.
  - [x] Enforce organization-scoped writes and idempotency around `external_message_id` + `correlation_id` identity keys.

- [x] Implement deterministic automatic protocol adjustment policy (AC: 2, 6, 7)
  - [x] Add explicit adjustment metadata/flags in scheduler config or equivalent canonical store (no implicit heuristics).
  - [x] Keep cadence math bounded by current scheduler limits and urgency bands.
  - [x] Add reason-code traceability for adjustment actions and ensure safety controls can short-circuit.

- [x] Implement unblock/resume transitions (AC: 4, 7)
  - [x] Define and implement unblock criteria from normalized relancing update intents/content.
  - [x] Clear blocker state and recompute `next_nudge_at` safely without creating duplicate dispatch slots.
  - [x] Preserve dispatch idempotency constraints during resume windows.

- [x] Integrate PM-facing blocker reporting continuity (AC: 5)
  - [x] Ensure morning brief aggregation and dashboard blocker filters consume normalized relancing blocker signals.
  - [x] Preserve source/citation integrity in UI-visible summaries.

- [x] Add regression and contract tests (AC: 1-8)
  - [x] Agent tests for blocker detection -> pause, adjustment policy application, unblock/resume, and duplicate suppression.
  - [x] Route/adapter tests for `relancing.update` inbound handling across Telegram/WhatsApp/Web.
  - [x] Web tests for blocker surfacing and filter behavior in Dashboard/OutcomeCard.

### Scope Boundaries

- In scope for 5.3:
  - Normalized blocker detection from `relancing.update` inputs.
  - Deterministic scheduler/protocol adjustment state updates.
  - Pause/resume transitions with idempotency and audit trails.
  - PM visibility of blocker state through existing Dashboard/Morning Brief pipelines.
- Out of scope for 5.3:
  - New communication channels or transport stacks.
  - Broad redesign of dashboard information architecture.
  - New status-report generation logic beyond blocker signal integration (belongs to Story 5.4).
  - New autonomous cadence models outside current bounded urgency/cadence rules.

### Delivery Priority

- P0 (must ship in first pass):
  - Blocker signal -> scheduling context synchronization.
  - End-to-end pause behavior and safe unblock/resume.
  - Duplicate-safe/idempotent transitions under retries and concurrent scheduler cycles.
- P1 (should ship next):
  - Deterministic protocol adjustment policy persistence and reason-code audit traceability.
  - Graph/processor routing hardening for `relancing.update` execution path.
- P2 (ship if capacity remains):
  - Dashboard/Morning Brief blocker UX polish and non-critical reporting refinements.

### Dev Execution Checklist (Ordered)

- [x] Step 1 - Lock contracts before logic
  - [x] Confirm/extend shared contracts for blocker-adjustment fields (`packages/shared/src/schemas.ts`, `packages/shared/src/database.types.ts`).
  - [x] If new reason codes or statuses are introduced, keep DB constraints + shared schema enums aligned in the same change set.

- [x] Step 2 - Implement normalized blocker update processing
  - [x] Complete `relancing.update` execution wiring in graph/registry so updates are not routed as unsupported actions.
  - [x] In update processing, upsert normalized update rows with deterministic idempotency (`onConflict`) and persist trace events (`ingested`, `duplicate_prevented`).
  - [x] Sync `project_scheduling_contexts` blocker fields from normalized intents (`blocker_active`, `blocker_summary`, `blocker_reported_by`).

- [x] Step 3 - Implement deterministic protocol/scheduler adjustment
  - [x] Persist explicit adjustment state (for example in `scheduler_config`) with reason-coded audit trace entries.
  - [x] Keep cadence windows within existing urgency bounds; never bypass emergency brake/perimeter/confidence outcomes.

- [x] Step 4 - Implement safe unblock/resume behavior
  - [x] Detect unblock signals from normalized updates and clear blocker state deterministically.
  - [x] Recompute `next_nudge_at` without violating dispatch idempotency constraints.

- [x] Step 5 - Surface blocker intelligence in PM views
  - [x] Ensure Dashboard blocker filters/cards consume normalized blocker state.
  - [x] Ensure Morning Brief narrative/actionable outputs include blocker context via existing metadata/citation flow.

- [x] Step 6 - Regression and release gates
  - [x] Add/extend unit tests for pause, adjustment, resume, duplicate suppression, and safety-precedence interactions.
  - [x] Add/extend webhook/router integration tests for `relancing.update` across Telegram/WhatsApp/Web.
  - [x] Add/extend web tests for blocker rendering/filter behavior.
  - [x] Run `pnpm -r test`, `pnpm -r build`, and `pnpm -r lint` and resolve failures before handoff.

### Definition of Done Checklist

- [x] AC 1-8 each have at least one explicit test assertion.
- [x] No new task status values or queue contract changes introduced.
- [x] Multi-tenant/RLS boundaries preserved for all new writes.
- [x] Duplicate inbound retries do not create duplicate blocker state transitions.
- [x] Story status can move to `review` with passing gates and updated artifact notes.

## Dev Notes

- `RelancingScheduler` already contains blocker-aware pause behavior (`blocker_active` gate, paused task persistence, reason-code audit), so Story 5.3 should extend this existing mechanism rather than inventing a parallel scheduler path. [Source: apps/agent/src/services/RelancingScheduler.ts:204] [Source: apps/agent/src/services/RelancingScheduler.ts:324]
- Channel webhook tests already expect explicit `domain_action='relancing.update'` pass-through routing, which creates a concrete inbound contract Story 5.3 can rely on. [Source: apps/agent/src/routes/webhooks/telegram.spec.ts:111] [Source: apps/agent/src/routes/webhooks/whatsapp.spec.ts:106]
- Shared schema and DB types already include normalized relancing update entities (`relancing_updates`, `relancing_update_events`, intents) and should remain the source of truth for processing contracts. [Source: packages/shared/src/schemas.ts:459] [Source: packages/shared/src/database.types.ts:561]
- Current processor registry/graph wiring includes `relancing.nudge` but not a `relancing.update` processor path in this branch; Story 5.3 should treat that execution wiring as a required integration checkpoint to avoid unsupported task failures. [Source: apps/agent/src/processors/ProcessorRegistry.ts:23] [Source: apps/agent/src/controller/graph.ts:1017]
- Dashboard already exposes blocker-oriented filtering and relancing setup UX, so Story 5.3 should integrate blocker adjustment signals into these existing surfaces instead of adding duplicate UI pathways. [Source: apps/web/src/views/Dashboard.vue:279] [Source: apps/web/src/views/Dashboard.vue:740]

### Developer Context Section

- Existing inbound normalization path (`ChannelRouterService.enqueueInbound`) already provides channel identity, correlation, and duplicate prevention scaffolding; blocker adjustment should consume this canonical envelope flow. [Source: apps/agent/src/services/channelRouter.ts:160]
- Existing relancing scheduler already writes dispatch claims (`project_nudge_dispatches`) and audit traces; adjustment logic should plug into this life cycle to preserve deterministic behavior and avoid race-condition drift. [Source: apps/agent/src/services/RelancingScheduler.ts:371] [Source: apps/agent/src/services/RelancingScheduler.ts:535]
- Existing protocol node has legacy blocker keyword scanning in task payload context; Story 5.3 should avoid relying on this as the primary blocker signal once normalized relancing updates are available. [Source: apps/agent/src/controller/nodes/protocol.ts:31]
- Existing morning brief processor derives blocker/risk lines from actionable item priority; blocker-adjustment outputs should integrate via existing metadata pathways rather than bespoke brief schemas. [Source: apps/agent/src/processors/MorningBriefProcessor.ts:293]

### Technical Requirements

- Use normalized relancing update entities (`intents`, `blocker_summary`, idempotency key) as authoritative blocker inputs; do not fall back to raw-text-only routing for primary blocker state transitions. [Source: packages/shared/src/schemas.ts:462] [Source: supabase/migrations/20260308000000_create_relancing_updates.sql:11]
- Update `project_scheduling_contexts` blocker fields and scheduler behavior from blocker events, preserving existing paused semantics and reason-code observability. [Source: supabase/migrations/20260307000000_create_relancing_scheduler_context.sql:20] [Source: apps/agent/src/services/RelancingScheduler.ts:204]
- Maintain idempotent dispatch/update semantics using existing unique dispatch constraints and relancing update idempotency keys. [Source: supabase/migrations/20260307000000_create_relancing_scheduler_context.sql:60] [Source: supabase/migrations/20260308000000_create_relancing_updates.sql:37]
- Ensure any newly introduced reason codes/adjustment statuses are propagated consistently across DB constraints, shared schemas, and processor results (no contract drift). [Source: supabase/migrations/20260307000000_create_relancing_scheduler_context.sql:50] [Source: packages/shared/src/schemas.ts:379]
- Keep task status values within existing enum (`queued|processing|done|error|escalation|paused`) for compatibility with graph finalization and dashboard rendering. [Source: packages/shared/src/schemas.ts:3] [Source: apps/agent/src/controller/graph.ts:853]

### Architecture Compliance

- Preserve database-as-queue architecture boundaries: inbound routes enqueue tasks, graph/processors perform async state transitions, and UI reads persisted outcomes. [Source: _bmad-output/planning-artifacts/architecture.md:124]
- Keep guardrail order intact (Emergency Brake -> initialization -> protocol/perimeter -> routing) so blocker adjustment never bypasses safety precedence. [Source: apps/agent/src/controller/graph.ts:1027]
- Keep append-only audit discipline for scheduler and agent decisions; do not overwrite existing decision history. [Source: _bmad-output/planning-artifacts/architecture.md:104] [Source: apps/agent/src/services/RelancingScheduler.ts:546]
- Preserve multi-tenant RLS for all new/updated relancing tables and operations. [Source: supabase/migrations/20260308000000_create_relancing_updates.sql:77] [Source: supabase/migrations/20260307000000_create_relancing_scheduler_context.sql:77]

### Library & Framework Requirements

- Implement within existing stack: Node.js + TypeScript agent, Supabase queue/persistence, Vue/PrimeVue dashboard surfaces, shared Zod contracts. [Source: _bmad-output/project-context.md:19]
- Maintain compatibility with pinned runtime ranges unless a dedicated upgrade story is approved:
  - `@supabase/supabase-js` `^2.43.0`
  - `@langchain/langgraph` `^0.2.0`
  - `primevue` `^4.0.0`
  - `vue` `^3.5.0`. [Source: apps/agent/package.json:17] [Source: apps/agent/package.json:25] [Source: apps/web/package.json:20] [Source: apps/web/package.json:21]
- Latest ecosystem intelligence (awareness only, not auto-upgrade scope): `@supabase/supabase-js` `2.98.0`, `@langchain/langgraph` `1.2.1`, `primevue` `4.5.4`, `vue` `3.5.29`. [Source: octocode_packageSearch run on 2026-03-09]
- MCP documentation guardrails:
  - Supabase upsert contract should use explicit `onConflict` and lifecycle cleanup for realtime channels where needed.
  - LangGraph routing should continue using explicit node registration + conditional edges before compile.
  [Source: context7 /supabase/supabase-js queried 2026-03-09] [Source: context7 /websites/langchain-ai_github_io_langgraphjs queried 2026-03-09]

### File Structure Requirements

- Agent relancing update handling should be implemented in existing routing/processor lanes (`apps/agent/src/controller/graph.ts`, `apps/agent/src/processors/`, `apps/agent/src/services/`). [Source: apps/agent/src/controller/graph.ts:1025] [Source: apps/agent/src/processors/ProcessorRegistry.ts:12]
- Channel ingress adjustments must stay in existing adapters/routes/router (`apps/agent/src/channels/*`, `apps/agent/src/routes/webhooks/*`, `apps/agent/src/services/channelRouter.ts`). [Source: apps/agent/src/services/channelRouter.ts:151]
- Shared contracts must remain centralized in `packages/shared/src/schemas.ts` and `packages/shared/src/database.types.ts`. [Source: packages/shared/src/schemas.ts:459] [Source: packages/shared/src/database.types.ts:625]
- Schema/constraint changes must be delivered via timestamped SQL migrations in `supabase/migrations/` with RLS policies included. [Source: _bmad-output/planning-artifacts/architecture.md:114]
- PM-facing behavior updates should be implemented in existing dashboard/outcome surfaces (`apps/web/src/views/Dashboard.vue`, `apps/web/src/components/activity/OutcomeCard.vue`). [Source: apps/web/src/views/Dashboard.vue:733] [Source: apps/web/src/components/activity/OutcomeCard.vue:90]

### Testing Requirements

- Extend scheduler tests for blocker detection-driven pause and resume transitions, adjustment policy application, and duplicate prevention. [Source: apps/agent/src/services/RelancingScheduler.spec.ts:278]
- Extend graph routing tests to cover relancing blocker-adjustment execution paths and unsupported-domain regression checks. [Source: apps/agent/src/controller/graph.spec.ts:190] [Source: apps/agent/src/controller/graph.spec.ts:293]
- Extend channel route tests for explicit `relancing.update` ingress and duplicate-safe behavior. [Source: apps/agent/src/routes/webhooks/telegram.spec.ts:111] [Source: apps/agent/src/routes/webhooks/whatsapp.spec.ts:106] [Source: apps/agent/src/services/channelRouter.spec.ts:145]
- Extend web tests for blocker filter/render continuity and relancing setup + blocker surfacing outcomes. [Source: apps/web/src/views/Dashboard.spec.ts:628] [Source: apps/web/src/components/activity/OutcomeCard.spec.ts:34]
- Before implementation sign-off, run repository verification gates: `pnpm -r test`, `pnpm -r build`, and `pnpm -r lint`. [Source: package.json:7] [Source: package.json:8]

### Previous Story Intelligence

- Story 5.1 already introduced blocker pause primitives and scheduler audit reason codes; Story 5.3 should extend this foundation rather than duplicating scheduler logic. [Source: _bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md:44] [Source: _bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md:92]
- Story 5.2 explicitly scoped itself to reply intake + normalized update extraction and deferred policy auto-adjustment to Story 5.3; this story is the designated place to implement deterministic adjustment behavior. [Source: _bmad-output/implementation-artifacts/5-2-bidirectional-nudge-interface.md:100]
- Story 5.2 also established normalized relancing update contract expectations (`status_update` / `blocker_report`) that Story 5.3 should consume directly. [Source: _bmad-output/implementation-artifacts/5-2-bidirectional-nudge-interface.md:29]

### Git Intelligence Summary

- Recent commit history shows strong activity in channel routing, graph routing, shared schemas, and webhook test surfaces, matching Story 5.3 integration points. [Source: git log 2026-03-09 `1bba016`]
- Safety-controls + dashboard wiring were recently hardened, so blocker-adjustment work should preserve those conventions and regression patterns. [Source: git log 2026-03-09 `720efb1`]
- Artifact sync commits indicate `_bmad-output` remains the canonical planning/context source for implementation handoff consistency. [Source: git log 2026-03-09 `7d88123`]

### Latest Technical Information

- Supabase JS docs via MCP confirm `upsert(..., { onConflict })` + `.select()` patterns for deterministic insert-or-update behavior and explicit realtime subscription cleanup via `unsubscribe/removeChannel`. [Source: context7 /supabase/supabase-js queried 2026-03-09]
- LangGraph JS docs via MCP reinforce explicit node registration, `addConditionalEdges`, and compiled graph workflow as the preferred extension model for new action routes. [Source: context7 /websites/langchain-ai_github_io_langgraphjs queried 2026-03-09]
- Practical implication: Story 5.3 should keep graph extensions deterministic and avoid introducing ad-hoc routing logic outside the existing `StateGraph` definition.

### Project Context Reference

- Follow critical project rules: DB `snake_case`, TS `camelCase`, shared contracts from `packages/shared`, queue-first async architecture, and strict RLS boundaries. [Source: _bmad-output/project-context.md:30]
- Keep comments minimal, explicit typing strict, and avoid dependency sprawl unless explicitly approved. [Source: _bmad-output/project-context.md:40] [Source: _bmad-output/project-context.md:73]
- Maintain test discipline and mocked external integrations in unit suites. [Source: _bmad-output/project-context.md:55]

### Project Structure Notes

- Alignment: Story 5.3 maps cleanly to existing layers (`apps/agent` processing/orchestration, `packages/shared` contracts, `supabase/migrations` persistence, `apps/web` blocker visualization).
- Variance to watch: existing architecture docs still reference some legacy processor paths; current source of truth is `graph.ts` + `ProcessorRegistry` + service classes.
- Integration priority: preserve current queue and task status contracts while adding blocker-adjustment behavior.

### References

- `_bmad-output/planning-artifacts/epics.md` (Story 5.3 baseline objective and AC)
- `_bmad-output/planning-artifacts/prd.md` (FR5 and FR19 context)
- `_bmad-output/planning-artifacts/architecture.md` (queue architecture, RLS, shared-contract rules)
- `_bmad-output/project-context.md` (implementation and quality guardrails)
- `_bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md` (scheduler and blocker continuity)
- `_bmad-output/implementation-artifacts/5-2-bidirectional-nudge-interface.md` (normalized update contract + deferred auto-adjustment)
- `apps/agent/src/services/RelancingScheduler.ts` and `apps/agent/src/services/RelancingScheduler.spec.ts`
- `apps/agent/src/services/channelRouter.ts`, `apps/agent/src/routes/webhooks/telegram.ts`, `apps/agent/src/routes/webhooks/whatsapp.ts`
- `apps/agent/src/controller/graph.ts`, `apps/agent/src/processors/ProcessorRegistry.ts`
- `packages/shared/src/schemas.ts`, `packages/shared/src/database.types.ts`
- `supabase/migrations/20260307000000_create_relancing_scheduler_context.sql`
- `supabase/migrations/20260308000000_create_relancing_updates.sql`
- `apps/web/src/views/Dashboard.vue`, `apps/web/src/components/activity/OutcomeCard.vue`

### Completion Status

- Implementation complete with blocker pause/adjust/resume behavior wired through normalized `relancing.update` processing.
- Regression tests added/updated for processor, scheduler, and dashboard blocker/resume surfacing.
- Full monorepo gates passed: `pnpm -r test`, `pnpm -r build`, and `pnpm -r lint` (lint completed with non-blocking warnings only).

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- `git log --oneline -5`
- `git log -5 --name-only --pretty=format:'--- %h %s'`
- `octocode_packageSearch` (latest package intelligence snapshot)
- `context7_query-docs` for `/supabase/supabase-js` and `/websites/langchain-ai_github_io_langgraphjs`

### Completion Notes List

- Added deterministic blocker adjustment metadata (`scheduler_config.blocker_adjustment`) during blocker pause and status resume transitions.
- Updated relancing update event persistence to link `ingested` events with `relancing_update_id` for traceability.
- Added unblock/resume flow that clears blocker state and recalculates `next_nudge_at` using bounded cadence + urgency.
- Extended scheduler behavior/tests to honor explicit blocker-adjustment policy flags and preserve blocked-cycle pausing.
- Extended dashboard mapping/tests to surface resume context via relancing update topic chips.
- Verified changes with package test/build runs and targeted lint checks.
- Review remediation: relancing updates now reuse prior normalized linkage when a member has multiple active assignments, reducing false `setup_required` escalations.
- Review remediation: blocker resume now requires an explicit unblock/resume signal instead of any generic status chatter.
- Review remediation: dashboard blocker filtering now keys off normalized relancing blocker signals, with utility coverage added for blocker/risk classification.
- Review follow-up closed: `pnpm --filter @ai-assistant/web build` now passes after dashboard status-report fixes.
- Final verification: `pnpm -r test`, `pnpm -r build`, and `pnpm -r lint` all completed successfully; lint reported warnings only in existing Vue surfaces.

### File List

- `_bmad-output/implementation-artifacts/5-3-blocker-detection-automatic-protocol-adjustment.md`
- `apps/agent/src/channels/WebChatAdapter.spec.ts`
- `apps/agent/src/processors/RelancingUpdateProcessor.ts`
- `apps/agent/src/processors/RelancingUpdateProcessor.spec.ts`
- `apps/agent/src/services/RelancingScheduler.ts`
- `apps/agent/src/services/RelancingScheduler.spec.ts`
- `apps/agent/src/processors/MorningBriefProcessor.ts`
- `apps/agent/src/processors/MorningBriefProcessor.spec.ts`
- `apps/agent/src/processors/ProcessorRegistry.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/agent/src/controller/graph.spec.ts`
- `apps/agent/src/routes/webhooks/telegram.spec.ts`
- `apps/agent/src/routes/webhooks/whatsapp.spec.ts`
- `apps/web/src/views/Dashboard.vue`
- `apps/web/src/views/Dashboard.spec.ts`
- `apps/web/src/utils/dashboardFilters.ts`
- `apps/web/src/utils/dashboardFilters.spec.ts`
