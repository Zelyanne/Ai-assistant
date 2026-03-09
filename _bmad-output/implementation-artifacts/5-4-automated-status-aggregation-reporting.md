# Story 5.4: Automated Status Aggregation & Reporting

Status: done

Story ID: 5.4
Story Key: 5-4-automated-status-aggregation-reporting

Dependencies:
- Builds on Story 5.1 scheduler context and urgency/blocker primitives (`project_scheduling_contexts`, `project_nudge_dispatches`, `RelancingScheduler`) for reliable project-state inputs.
- Builds on Story 5.2 normalized inbound update persistence (`relancing_updates`, `relancing_update_events`, `relancing.update`) as primary status-signal input.
- Builds on Story 5.3 blocker adjustment continuity so reports reflect paused/resumed cycles and active blocker context.
- Must preserve Story 4.4/4.5 safety precedence and graph status semantics (`paused` / `escalation`) for any report-generation path.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a PM,
I want the AI to draft my weekly status reports based on gathered data,
so that I can reclaim my Friday afternoons (FR19).

## Acceptance Criteria

1. **Reporting-period trigger generates a draft through the queue architecture:**
   **Given** a reporting period has ended (or a PM manually triggers generation)
   **When** the system starts status aggregation
   **Then** a task is queued and processed through existing task lifecycle semantics
   **And** the resulting draft is persisted for PM review.

2. **Status report uses normalized multi-source project signals:**
   **Given** relancing loops and workspace-derived context exist for the organization
   **When** aggregation runs for a reporting window
   **Then** the draft incorporates normalized relancing updates, blocker state, and recent brief/task outcomes
   **And** duplicate/retry inputs are handled idempotently.

3. **Draft structure is comprehensive and PM-usable:**
   **Given** report synthesis completes
   **When** the report is written
   **Then** it includes an executive narrative plus structured sections (wins, blockers/risks, commitments, next actions)
   **And** each section is readable without requiring manual data stitching.

4. **Critical action items are highlighted with priority signals:**
   **Given** blocker, overdue, or high-priority status signals are present
   **When** the draft is produced
   **Then** critical actions are explicitly highlighted for PM review
   **And** priority labels are consistent and deterministic.

5. **Traceability and citation integrity are preserved:**
   **Given** any assertion in the status draft
   **When** the PM inspects report metadata
   **Then** source linkage is preserved (task/update/thread references)
   **And** audit traces explain why critical actions were highlighted.

6. **Safety and escalation guardrails remain authoritative:**
   **Given** emergency brake is engaged, confidence is below threshold, ambiguity is detected, or perimeter review is required
   **When** report generation would proceed
   **Then** task status transitions to `paused` or `escalation` per existing contracts
   **And** no unsafe side-effect path bypasses graph control flow.

7. **Multi-tenant isolation and reporting idempotency are enforced:**
   **Given** concurrent org activity or duplicate generation requests
   **When** report rows are written
   **Then** all reads/writes remain organization-scoped under RLS
   **And** duplicate generation for the same reporting window is suppressed or safely upserted.

8. **PM-facing surfaces expose the generated draft and action highlights:**
   **Given** a report draft exists
   **When** Dashboard reporting surfaces load
   **Then** PM can view the latest draft and highlighted critical actions without manual DB inspection
   **And** existing Morning Brief and activity visibility remain intact.

9. **Regression coverage validates reporting behavior end to end:**
   **Given** the status-report feature is implemented
   **When** tests run
   **Then** coverage verifies aggregation, prioritization, idempotency, guardrails, and UI surfacing
   **And** existing queue/status contracts remain unchanged.

## Tasks / Subtasks

- [x] Implement persistence contract for report drafts (AC: 1, 2, 3, 5, 7)
  - [x] Add migration(s) for canonical status-report storage (for example `status_reports` with `organization_id`, period boundaries, narrative, structured sections, metadata/citations, idempotency key, timestamps).
  - [x] Add RLS and indexes for org-scoped access and period lookup.
  - [x] Update shared contracts in `packages/shared/src/schemas.ts` and `packages/shared/src/database.types.ts`.

- [x] Add report-generation execution path in agent graph (AC: 1, 6)
  - [x] Introduce a dedicated `domain_action` (recommended `status.report`) for weekly draft generation.
  - [x] Wire processor registration + graph routing so generation cannot fail as unsupported action.
  - [x] Preserve existing guardrail order and status outcomes (`paused`/`escalation`).

- [x] Build aggregation + synthesis processor logic (AC: 2, 3, 4, 5, 7)
  - [x] Aggregate relancing updates by reporting window with deterministic grouping/prioritization.
  - [x] Merge blocker state and urgency signals from scheduling context and relevant task outcomes.
  - [x] Produce narrative + structured report sections and explicit critical-action list.
  - [x] Persist source linkage metadata and append audit entries for decision rationale.

- [x] Add scheduling/trigger integration for reporting period end (AC: 1, 7)
  - [x] Reuse existing scheduler pattern (interval monitor + queue insert) for report-period triggering.
  - [x] Enforce idempotency per organization/reporting-window.
  - [x] Support explicit manual trigger path from dashboard/command entrypoint.

- [x] Surface latest status report draft in PM UI (AC: 8)
  - [x] Extend Dashboard data loading to fetch latest report draft and highlighted actions.
  - [x] Render concise report preview and critical-action section aligned with existing visual language.
  - [x] Keep Morning Brief card behavior and activity feed unaffected.

- [x] Add regression and contract tests (AC: 1-9)
  - [x] Agent tests for aggregation correctness, critical-item prioritization, idempotent window handling, and guardrail precedence.
  - [x] Scheduler/trigger tests for period-end queueing and duplicate prevention.
  - [x] Web tests for report rendering and highlighted action visibility.
  - [x] Run `pnpm -r test`, `pnpm -r build`, and `pnpm -r lint` before handoff.

### Scope Boundaries

- In scope for 5.4:
  - Automated weekly draft generation from existing relancing/workspace-derived data.
  - Deterministic highlight logic for critical PM actions.
  - Persistent report artifact + Dashboard surfacing.
- Out of scope for 5.4:
  - New transport channels or new inbound adapters.
  - Replacing Morning Brief with a new briefing system.
  - New protocol optimization algorithms (belongs to FR27/Epic 6.5).
  - Cross-organization portfolio reporting beyond current org boundary.

## Dev Notes

- The existing queue contract is already operational: UI/schedulers insert `tasks` with `status='queued'`, agent processes via graph, then finalizes status/result. Reporting generation must reuse this pathway. [Source: `_bmad-output/planning-artifacts/architecture.md:103`] [Source: `apps/web/src/views/Dashboard.vue:412`]
- Morning Brief generation already demonstrates a production aggregation+synthesis pattern (data ingestion, LLM synthesis, `morning_briefs` persistence, audit insert). Story 5.4 should extend this pattern instead of introducing a second reporting engine. [Source: `apps/agent/src/processors/MorningBriefProcessor.ts:107`] [Source: `apps/agent/src/processors/MorningBriefProcessor.ts:307`] [Source: `apps/agent/src/processors/MorningBriefProcessor.ts:325`]
- Relancing update data is now normalized and idempotent, making it the authoritative source for team progress/blocker signals feeding status reports. [Source: `apps/agent/src/processors/RelancingUpdateProcessor.ts:203`] [Source: `supabase/migrations/20260308000000_create_relancing_updates.sql:37`]
- Existing dashboard already supports report-adjacent surfaces (Morning Brief card + blocker/risk filters + realtime task feed), so 5.4 should integrate there first. [Source: `apps/web/src/views/Dashboard.vue:733`] [Source: `apps/web/src/views/Dashboard.vue:1019`]

### Developer Context Section

- `RelancingUpdateProcessor` already derives `status_update` and `blocker_report`, extracts dependency/help/ETA hints, and writes normalized update rows; report aggregation should consume these parsed fields directly. [Source: `apps/agent/src/processors/RelancingUpdateProcessor.ts:171`] [Source: `apps/agent/src/processors/RelancingUpdateProcessor.ts:218`]
- `RelancingScheduler` already computes urgency bands and persists `deadline_urgency` / `blocker_paused` outcomes with audit traces; these are ready-made priority signals for report highlighting. [Source: `apps/agent/src/services/RelancingScheduler.ts:181`] [Source: `apps/agent/src/services/RelancingScheduler.ts:281`] [Source: `apps/agent/src/services/RelancingScheduler.ts:541`]
- Inbound duplicate suppression already exists in channel routing (`organization_id + domain_action + channel + external_message_id`), reducing noise risk in downstream report windows. [Source: `apps/agent/src/services/channelRouter.ts:165`] [Source: `apps/agent/src/services/channelRouter.ts:178`]
- Graph finalization already merges `task.result` carefully and preserves trace/citations; report processor outputs should fit this existing result model. [Source: `apps/agent/src/controller/graph.ts:888`] [Source: `apps/agent/src/controller/graph.ts:925`]

### Technical Requirements

- Keep status-report generation in `domain.action` format (recommended `status.report`) to satisfy existing schema regex and routing conventions. [Source: `packages/shared/src/schemas.ts:27`]
- Preserve allowed task statuses only (`queued`, `processing`, `done`, `error`, `escalation`, `paused`); do not invent new status strings. [Source: `packages/shared/src/schemas.ts:3`]
- Use normalized relancing update fields (`intents`, `progress_summary`, `blocker_summary`, `dependency`, `requested_help`, `eta_hint`) as first-class aggregation inputs. [Source: `packages/shared/src/schemas.ts:462`]
- Reuse Morning Brief conventions for narrative + structured metadata and source IDs where appropriate; avoid unstructured free-text-only report blobs. [Source: `packages/shared/src/schemas.ts:323`] [Source: `apps/agent/src/processors/MorningBriefProcessor.ts:300`]
- Implement deterministic period idempotency (organization + period window key) so repeated triggers do not create duplicate logical reports.
- Write append-only audit decisions for generation and highlight rationale (for example: `report_generated`, `critical_items_highlighted`, `duplicate_prevented`, `report_escalated`).

### Architecture Compliance

- Preserve the database-as-queue event loop; no synchronous direct side effects from UI web handlers. [Source: `_bmad-output/planning-artifacts/architecture.md:124`]
- Keep shared-contract discipline: DB schema and Zod contracts live in `packages/shared`; avoid local duplicated interfaces in app-specific code. [Source: `_bmad-output/planning-artifacts/architecture.md:297`]
- Keep migrations-only schema evolution and strict `snake_case` naming for DB entities and policies. [Source: `_bmad-output/planning-artifacts/architecture.md:114`] [Source: `_bmad-output/planning-artifacts/architecture.md:153`]
- Preserve immutable audit behavior (`agent_activity_log` append-only). [Source: `_bmad-output/planning-artifacts/architecture.md:104`] [Source: `_bmad-output/planning-artifacts/architecture.md:207`]
- Maintain guardrail ordering in graph execution; report generation must not bypass emergency brake/perimeter/confidence logic. [Source: `apps/agent/src/controller/graph.ts:1027`]

### Library & Framework Requirements

- Implement using current stack only: Vue 3 + PrimeVue (web), Node/TypeScript + LangGraph (agent), Supabase (queue/realtime/persistence). [Source: `_bmad-output/planning-artifacts/architecture.md:65`] [Source: `_bmad-output/project-context.md:19`]
- Keep compatibility with pinned ranges in repo:
  - `@supabase/supabase-js` `^2.43.0`
  - `@langchain/langgraph` `^0.2.0`
  - `primevue` `^4.0.0`
  - `vue` `^3.5.0`. [Source: `apps/agent/package.json:17`] [Source: `apps/agent/package.json:25`] [Source: `apps/web/package.json:20`] [Source: `apps/web/package.json:21`]
- Latest ecosystem awareness (no auto-upgrade in this story): `@supabase/supabase-js` `2.98.0`, `@langchain/langgraph` `1.2.1`, `primevue` `4.5.4`, `vue` `3.5.29`. [Source: `octocode_packageSearch` run 2026-03-09]
- MCP research guardrails to follow:
  - Supabase upsert patterns should use explicit `onConflict` and `.select()` when returning canonical persisted rows.
  - Realtime channel usage should cleanly `unsubscribe`/`removeChannel` in lifecycle cleanup.
  - LangGraph extensions should continue explicit node registration + conditional edge routing before `compile()`.
  [Source: `context7 /supabase/supabase-js` queried 2026-03-09] [Source: `context7 /websites/langchain-ai_github_io_langgraphjs` queried 2026-03-09]

### File Structure Requirements

- Add any new report persistence schema via timestamped SQL migration(s) under `supabase/migrations/`.
- Update shared contracts in:
  - `packages/shared/src/schemas.ts`
  - `packages/shared/src/database.types.ts`
- Agent implementation should stay within existing lanes:
  - `apps/agent/src/processors/` (new report processor)
  - `apps/agent/src/processors/ProcessorRegistry.ts` (registration)
  - `apps/agent/src/controller/graph.ts` (routing)
  - `apps/agent/src/services/` (scheduler/aggregation helpers)
- PM UI integration should extend existing dashboard path:
  - `apps/web/src/views/Dashboard.vue`
  - existing activity/report presentation utilities/components.
- Variance handling: architecture docs mention some legacy paths (`taskProcessor.ts`); current source-of-truth is `graph.ts` + `ProcessorRegistry` + service classes.

### Testing Requirements

- Agent processor tests:
  - aggregation window correctness
  - critical item priority mapping
  - idempotent period handling
  - guardrail escalation/paused precedence
- Scheduler/trigger tests:
  - period-end queue insertion
  - duplicate suppression for same organization/reporting window
- Web tests:
  - latest report draft fetch/render
  - critical action highlights visible in briefing workflow
  - no regressions to Morning Brief card and activity stream
- Shared contract tests:
  - schema validation for report payload/result structures
  - migration constraints/RLS checks
- Verification gates before handoff: `pnpm -r test`, `pnpm -r build`, `pnpm -r lint`. [Source: `package.json:7`] [Source: `package.json:8`]

### Previous Story Intelligence

- Story 5.1 established scheduler context, urgency bands, and dispatch idempotency; 5.4 should consume these signals rather than recomputing from scratch. [Source: `_bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md:61`]
- Story 5.2 established normalized inbound update contracts and dedupe behaviors; 5.4 should aggregate from those normalized rows. [Source: `_bmad-output/implementation-artifacts/5-2-bidirectional-nudge-interface.md:29`] [Source: `_bmad-output/implementation-artifacts/5-2-bidirectional-nudge-interface.md:65`]
- Story 5.3 explicitly marked status-report generation as out of scope there and reserved it for 5.4; this story is now the designated implementation slot for FR19 reporting output. [Source: `_bmad-output/implementation-artifacts/5-3-blocker-detection-automatic-protocol-adjustment.md:107`]

### Git Intelligence Summary

- Recent commits show strongest active patterns in channel routing, graph routing, shared schemas, and dashboard/test surfaces, which are exactly the integration points Story 5.4 should extend. [Source: `git log` 2026-03-09 `1bba016`]
- Safety/perimeter hardening landed recently in graph and dashboard paths; report generation should preserve these conventions rather than bypassing them. [Source: `git log` 2026-03-09 `720efb1`]
- Artifact-sync commits confirm `_bmad-output` remains canonical planning context and should be kept consistent with implementation handoff changes. [Source: `git log` 2026-03-09 `7d88123`]

### Latest Technical Information

- Supabase JS docs support deterministic upsert patterns using `upsert(..., { onConflict })` + `.select()` for canonical write/read behavior; this fits report-window idempotency writes.
- Supabase realtime docs reinforce explicit lifecycle cleanup (`unsubscribe`, `removeChannel`, `removeAllChannels`) to avoid stale subscriptions in dashboard/report listeners.
- LangGraph JS docs confirm current routing best practice remains explicit `addNode`, `addConditionalEdges`, and `compile()` pipeline for extension-safe action wiring.

### Project Context Reference

- Follow project hard rules: DB `snake_case`, TS `camelCase`, shared types from `packages/shared`, queue-first architecture. [Source: `_bmad-output/project-context.md:30`] [Source: `_bmad-output/project-context.md:33`] [Source: `_bmad-output/project-context.md:36`]
- Keep strict typing and explicit returns; avoid `any`. [Source: `_bmad-output/project-context.md:40`]
- Keep RLS boundaries and realtime cleanup discipline in UI hooks. [Source: `_bmad-output/project-context.md:50`] [Source: `_bmad-output/project-context.md:51`]
- Keep dependency scope tight; prefer existing internal utilities and established stack components. [Source: `_bmad-output/project-context.md:73`]

### Project Structure Notes

- Alignment: Story 5.4 maps cleanly to current monorepo boundaries (`apps/agent` generation logic, `packages/shared` contracts, `supabase/migrations` persistence, `apps/web` PM surfacing).
- Known variance: architecture artifact includes legacy path mentions; current executable reality is service classes + `ProcessorRegistry` + graph routing.
- Integration priority: reuse existing reporting/scheduler primitives and avoid introducing parallel queues, schema copies, or duplicate report engines.

### References

- `_bmad-output/planning-artifacts/epics.md` (Story 5.4 baseline and AC intent)
- `_bmad-output/planning-artifacts/prd.md` (FR19, FR4/FR5 context, audit/security NFRs)
- `_bmad-output/planning-artifacts/architecture.md` (queue architecture, shared contracts, RLS, migration rules)
- `_bmad-output/planning-artifacts/ux-design-specification.md` (autonomous data gathering and report UX expectations)
- `_bmad-output/project-context.md` (implementation guardrails and quality rules)
- `_bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md`
- `_bmad-output/implementation-artifacts/5-2-bidirectional-nudge-interface.md`
- `_bmad-output/implementation-artifacts/5-3-blocker-detection-automatic-protocol-adjustment.md`
- `apps/agent/src/processors/MorningBriefProcessor.ts`
- `apps/agent/src/processors/RelancingUpdateProcessor.ts`
- `apps/agent/src/services/RelancingScheduler.ts`
- `apps/agent/src/services/channelRouter.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/agent/src/processors/ProcessorRegistry.ts`
- `apps/agent/src/services/BriefingScheduler.ts`
- `apps/web/src/views/Dashboard.vue`
- `packages/shared/src/schemas.ts`
- `supabase/migrations/20260307000000_create_relancing_scheduler_context.sql`
- `supabase/migrations/20260308000000_create_relancing_updates.sql`

### Completion Status

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implementation complete, review remediation applied, and story is marked `done`.

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- `pnpm --filter @ai-assistant/shared test`
- `pnpm --filter @ai-assistant/agent test`
- `pnpm --filter @ai-assistant/web test`
- `pnpm -r test`
- `pnpm -r build`
- `pnpm -r lint`
- `pnpm --filter @ai-assistant/shared exec vitest run tests/status-report-window.spec.ts tests/schemas.spec.ts tests/status-reports-migration.spec.ts`
- `pnpm --filter @ai-assistant/agent exec vitest run src/services/StatusReportScheduler.spec.ts src/processors/StatusReportProcessor.spec.ts src/controller/graph.spec.ts`
- `pnpm --filter @ai-assistant/web exec vitest run src/views/Dashboard.spec.ts`
- `pnpm --filter @ai-assistant/shared build`
- `pnpm --filter @ai-assistant/agent build`
- `pnpm --filter @ai-assistant/web build`
- `pnpm exec eslint apps/agent/src/processors/StatusReportProcessor.ts apps/agent/src/services/StatusReportScheduler.ts apps/agent/src/processors/StatusReportProcessor.spec.ts apps/web/src/views/Dashboard.vue apps/web/src/views/Dashboard.spec.ts packages/shared/src/statusReportWindow.ts packages/shared/src/index.ts packages/shared/tests/status-report-window.spec.ts`

### Completion Notes List

- Added migration `supabase/migrations/20260309000000_create_status_reports.sql` for canonical status-report draft persistence with org-scoped RLS, reporting-window indexes, and idempotency protection.
- Extended shared contracts for status reports in `packages/shared/src/schemas.ts` and `packages/shared/src/database.types.ts`, plus shared coverage in `packages/shared/tests/schemas.spec.ts` and `packages/shared/tests/status-reports-migration.spec.ts`.
- Implemented `status.report` execution path with `StatusReportProcessor`, registry wiring, and graph routing so status-report generation is processed through existing queue/guardrail semantics.
- Added `StatusReportScheduler` with period-end queue inserts and duplicate suppression, then integrated scheduler lifecycle startup/shutdown in `apps/agent/src/index.ts`.
- Added dashboard manual trigger flow for `status.report`, plus latest-report fetch/realtime surfacing and critical-action preview in `apps/web/src/views/Dashboard.vue`.
- Added regression coverage for processor behavior, scheduler duplicate prevention, graph guardrail contracts, and dashboard rendering for status-report draft visibility.
- Validation gate completed successfully: `pnpm -r test`, `pnpm -r build`, and `pnpm -r lint` all passed.
- Code review remediation: unified manual + scheduled status-report windows/idempotency with shared helpers so duplicate weekly drafts collapse onto the same logical reporting slot.
- Code review remediation: expanded status-report citations/audit rationale to include task, project-context, thread, and channel-message references plus per-highlight audit steps.
- Code review remediation: extended Dashboard status-report preview to render wins, blockers/risks, commitments, and next actions alongside critical actions.
- Code review remediation: added focused regression coverage for shared report-window helpers and manual dashboard trigger payload generation.

### File List

- `supabase/migrations/20260309000000_create_status_reports.sql`
- `packages/shared/src/schemas.ts`
- `packages/shared/src/database.types.ts`
- `packages/shared/tests/schemas.spec.ts`
- `packages/shared/tests/status-reports-migration.spec.ts`
- `apps/agent/src/processors/StatusReportProcessor.ts`
- `apps/agent/src/processors/StatusReportProcessor.spec.ts`
- `apps/agent/src/processors/ProcessorRegistry.ts`
- `apps/agent/src/controller/graph.ts`
- `apps/agent/src/controller/graph.spec.ts`
- `apps/agent/src/services/StatusReportScheduler.ts`
- `apps/agent/src/services/StatusReportScheduler.spec.ts`
- `apps/agent/src/index.ts`
- `apps/web/src/views/Dashboard.vue`
- `apps/web/src/views/Dashboard.spec.ts`
- `apps/web/src/views/Dashboard.spec.js`
- `packages/shared/src/index.ts`
- `packages/shared/src/statusReportWindow.ts`
- `packages/shared/tests/status-report-window.spec.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/5-4-automated-status-aggregation-reporting.md`

## Change Log

- 2026-03-09: Implemented Story 5.4 end-to-end, ran full test/build/lint validation, and advanced status to `review`.
- 2026-03-09: Applied code-review fixes for deterministic report-window idempotency, richer source traceability, comprehensive dashboard report sections, and focused regression coverage; advanced status to `done`.
