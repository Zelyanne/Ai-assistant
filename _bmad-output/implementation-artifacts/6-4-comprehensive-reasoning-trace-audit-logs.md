Status: done

Story ID: 6.4
Story Key: 6-4-comprehensive-reasoning-trace-audit-logs

Dependencies:
- Story 2.6: Immutable audit logging to `agent_activity_log`.
- Story 3.5: Reasoning Trace drawer + citations UI.
- Story 6.1: Command Center tasks and conversation/correlation linkage.
- Story 2.9: Channel router audit events + channel correlation.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an SME Leader,
I want a complete, immutable log of every autonomous action and its reasoning (with confidence and citations),
so that I can trust, audit, and debug what the assistant is doing on my behalf.

## Acceptance Criteria

1. **Every autonomous task produces an audit log entry (terminal states):**
   **Given** a `tasks` row is processed by the Agent Controller
   **When** the task reaches a terminal state (`done`, `error`, `escalation`, or `paused`)
   **Then** an immutable `agent_activity_log` row is inserted
   **And** `reasoning_trace` is stored as an ordered `ReasoningStep[]` (timestamps + step name + message)
   **And** `citations` is stored as an ordered `Citation[]`
   **And** the trace includes a terminal "Finalize" step.

2. **Audit log writes must succeed for system/background work (no profile dependency):**
   **Given** some tasks are created without a user profile context (`tasks.user_id` is null)
   **When** audit logging occurs (Agent Controller finalize, channel router, schedulers)
   **Then** audit log insertion still succeeds (no FK/UUID constraint prevents writes)
   **And** RLS still enforces org isolation.

3. **Audit interface exists and reads from `agent_activity_log` (not inferred from tasks):**
   **Given** an authenticated user in the Hub
   **When** they open the Audit interface
   **Then** they can browse `agent_activity_log` entries (newest-first)
   **And** filter at minimum by `action_taken`, `task_id`, and time range
   **And** selecting an entry renders the full trace timeline and citations with links.

4. **"No trace" is a normal state (no error UI):**
   **Given** a task has no corresponding `agent_activity_log` entries
   **When** the user opens a trace view for that task
   **Then** the UI renders a "No reasoning trace found" empty state (not an error state).

5. **Citations are complete, stable, and PII-safe:**
   **Given** a task has provenance context (thread id, command conversation/message, correlation id, channel message id)
   **When** audit logs are written
   **Then** citations include stable `source_type`/`source_id` pairs for that provenance
   **And** any free-form `description` content is PII-redacted via `PerimeterGuard` before persistence.

6. **Tests cover persistence + UI behavior:**
   **Given** this story is implemented
   **When** test suites run
   **Then** there are tests proving (a) audit log writes do not fail for background work, (b) audit UI list+detail render, and (c) realtime subscriptions are cleaned up.

## Tasks / Subtasks

- [x] 1) Fix `agent_activity_log` schema so audit writes cannot fail (AC: 1, 2)
  - [x] Add a Supabase migration to remove the hard dependency on `profiles` for `agent_activity_log.agent_id`.
  - [x] Recommended migration approach (pick one and document rationale in the PR):
    - [x] Option A (preferred): drop FK and change `agent_id` to `TEXT NOT NULL` so components can log as `agent-controller`, `channel-router`, etc.
    - [ ] Option B: keep `agent_id` as `UUID` but make it nullable; log `task.user_id` when present else null.
  - [x] Update `agent_activity_log.reasoning_trace` default to JSON array (`[]`) and `citations` default to JSON array (`[]`) to match `packages/shared` schemas.
  - [x] Regenerate or update shared DB types if this repo’s workflow expects committed types (`packages/shared/src/database.types.ts`).

- [x] 2) Standardize audit logging output shape (ReasoningStep[] + Citation[]) (AC: 1, 5)
  - [x] Ensure `AuditLogger.flush(...)` is the single canonical persistence method for audit logs. [Source: `apps/agent/src/services/AuditLogger.ts`]
  - [x] Remove or refactor any direct `agent_activity_log` inserts that store non-standard shapes (e.g., object blobs) so the UI can always treat `reasoning_trace` as an array. [Source: `apps/agent/src/processors/BaseProcessor.ts`]
  - [x] Ensure every log set includes at least:
    - [x] a stable task citation (`source_type='task'`, `source_id=task.id`) when `task.id` exists
    - [x] provenance citations when available: channel message id, correlation id, thread/conversation/message ids. [Source: `apps/agent/src/controller/graph.ts`] [Source: `apps/agent/src/processors/AssistantCommandProcessor.ts`]
  - [x] Add explicit PII-redaction before persisting trace/citation strings (use `PerimeterGuard.redactPII`). [Source: `apps/agent/src/guards/PerimeterGuard.ts`]

- [x] 3) Build an Audit Log UI surface in the Hub (AC: 3, 4)
  - [x] Add a new view (recommended) `apps/web/src/views/AuditLog.vue` and route + sidebar nav entry.
  - [x] Implement list + filters + pagination reading from `agent_activity_log` (newest-first). Use `.range(...)` paging and `.order('created_at', { ascending: false })`. [External Source: Context7 `/supabase/supabase-js`]
  - [x] Implement a detail Drawer that renders `reasoning_trace` via PrimeVue `Timeline`, and citations as external links.
  - [x] Update `apps/web/src/composables/useReasoningTrace.ts` to use `.maybeSingle()` and treat “0 rows” as empty state. [External Source: Context7 `/supabase/postgrest-js`]
  - [x] Subscribe to `agent_activity_log` inserts in the audit view for live updates; ensure cleanup on unmount (`unsubscribe` + `removeChannel`). [External Source: Context7 `/supabase/supabase-js`]

- [x] 4) Tests + regressions (AC: 6)
  - [x] Agent: unit/integration test that audit logging succeeds even when `tasks.user_id` is null.
  - [x] Agent: test that `reasoning_trace` persisted shape is an array of steps and `citations` is an array.
  - [x] Web: component test for Audit Log list rendering and selecting an entry shows a trace timeline.
  - [x] Web: test that trace drawer for a task with no logs shows empty state (no error).
  - [x] Web: test that realtime subscriptions are cleaned up on unmount.

## Dev Notes

- Do not reinvent trace infrastructure: the agent already accumulates `trace`/`citations` in graph state via reducers and flushes once in `finalizeTask`. Extend/standardize rather than duplicating. [Source: `apps/agent/src/controller/graph.ts`]
- `agent_activity_log` is append-only by policy; do not implement any UPDATE/DELETE flows. [Source: `supabase/migrations/20260118000001_make_audit_log_immutable.sql`]
- Avoid dependency upgrades in this story; stay on repo-pinned versions (`@supabase/supabase-js` `^2.43.0`, `primevue` `^4.0.0`, `@langchain/langgraph` `^0.2.0`). Latest versions can inform best practices only. [Source: `apps/web/package.json`] [Source: `apps/agent/package.json`]
- PrimeVue Drawer/Timeline are already used for the Reasoning Trace pane; reuse those patterns for audit details. [Source: `apps/web/src/components/activity/ReasoningTracePane.vue`] [External Source: Context7 `/websites/primevue`]

### Project Structure Notes

- Backend audit: keep all persistence in `apps/agent/src/services/AuditLogger.ts` and orchestration in `apps/agent/src/controller/graph.ts`.
- Web audit: place list/detail UI under `apps/web/src/views/` and shared fetching logic under `apps/web/src/composables/`.
- Database changes must be via new migration file under `supabase/migrations/` (do not edit old migrations). [Source: `_bmad-output/planning-artifacts/architecture.md#Data Architecture`]

### References

- Story acceptance baseline (Epic 6 / Story 6.4): [Source: `_bmad-output/planning-artifacts/epics.md#Story 6.4`]
- PRD transparency requirements (FR25/FR26) and NFR "100% of autonomous actions include logs": [Source: `_bmad-output/planning-artifacts/prd.md#Transparency & Audit`]
- Audit strategy + DB-as-queue: [Source: `_bmad-output/planning-artifacts/architecture.md#Core Architectural Decisions`]
- Current audit flush + state reducers: [Source: `apps/agent/src/controller/graph.ts`]
- Audit logger helper: [Source: `apps/agent/src/services/AuditLogger.ts`]
- Current trace viewer: [Source: `apps/web/src/components/activity/ReasoningTracePane.vue`]
- Trace fetcher (needs maybeSingle): [Source: `apps/web/src/composables/useReasoningTrace.ts`]
- Supabase query + realtime patterns: [External Source: Context7 `/supabase/supabase-js`] [External Source: Context7 `/supabase/postgrest-js`]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.2

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Standardized reasoning trace across all processors and services.
- Refactored all direct DB inserts to use `AuditLogger.flush()` for PII safety and consistency.

### File List

- `_bmad-output/implementation-artifacts/6-4-comprehensive-reasoning-trace-audit-logs.md`
- `apps/agent/src/services/AuditLogger.ts`
- `apps/agent/src/processors/BaseProcessor.ts`
- `apps/agent/src/processors/ThreadSummarizer.ts`
- `apps/agent/src/processors/MorningBriefProcessor.ts`
- `apps/agent/src/processors/EmailTriageProcessor.ts`
- `apps/agent/src/services/RelancingScheduler.ts`
- `apps/agent/src/services/mcp.ts`
- `apps/web/src/views/AuditLog.vue`
- `apps/web/src/composables/useReasoningTrace.ts`
- `apps/web/src/router/index.ts`
- `apps/web/src/components/layout/AppSidebar.vue`
- `supabase/migrations/20260309220000_audit_log_improvements.sql`

### Implementation Plan

1. Created migration `20260309220000_audit_log_improvements.sql` to drop the foreign key constraint on `agent_id` from `profiles` allowing background execution logging, and changed `agent_id` to TEXT.
2. Updated `AuditLogger.ts` to type the data securely as JSONB shapes natively to match the table format and always insert the task citation as the first item when available.
3. Created a comprehensive Web UI `AuditLog.vue` inside `apps/web/src/views/` containing:
   - Pagination, filters (by Action Type and Task ID), table view with explicit indicators of action outcomes.
   - An integrated `ReasoningTracePane` PrimeVue Drawer for looking up individual item histories.
   - Realtime table population via Supabase channels to dynamically display executed tasks to users.
4. Setup routing in `apps/web/src/router/index.ts` and sidebar navigation links in `AppSidebar.vue`.
5. Fixed strict array defaults for reasoning traces and updated logic around `.maybeSingle()` inside composables `useReasoningTrace.ts` to allow graceful display of "no results found" UI logic.
6. Expanded `AuditLogger.spec.ts` with tests to prove the stringly-typed agent ID mapping works, and `AuditLog.spec.ts` & `useReasoningTrace.spec.ts` to cover Vue components properly.
7. **Post-Review Refactoring**: Standardized all system components (`BaseProcessor`, `ThreadSummarizer`, `MorningBriefProcessor`, `EmailTriageProcessor`, `RelancingScheduler`, `mcpService`) to use `AuditLogger.flush()`, ensuring all reasoning traces are valid `ReasoningStep[]` arrays and all PII is redacted.

### Completion Notes

✅ Successfully implemented Story 6.4 Comprehensive Reasoning Trace & Audit Logs.
The UI now fully displays system activity including agent outcomes in realtime. Background executions from things like the Channel Router and Agents can now log directly to `agent_activity_log` with standard payload shapes without running into Foreign Key Constraint failures. Tests are green and the codebase has been thoroughly checked. Standardized all system logging to use the centralized `AuditLogger`.
