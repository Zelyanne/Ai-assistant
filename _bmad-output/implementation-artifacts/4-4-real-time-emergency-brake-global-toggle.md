# Story 4.4: Real-time "Emergency Brake" Global Toggle

Status: done

Story ID: 4.4
Story Key: 4-4-real-time-emergency-brake-global-toggle

Dependencies:
- Builds on Story 4.2 (autonomous execution via `thread.action`) and Story 3.0 app shell header slot (`apps/web/src/components/layout/AppHeader.vue`).
- Requires `task_status='paused'` already present in DB (migration exists) and agent graph updates (`apps/agent/src/controller/graph.ts`).

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a User,
I want an instant way to stop all autonomous AI actions,
so that I feel safe knowing I can intervene at any time (FR11).

## Acceptance Criteria

1. **Global brake state is stored per organization and is real-time:**
   **Given** a user belongs to an organization
   **When** they toggle the Emergency Brake
   **Then** the state is persisted in the database (per org)
   **And** all other logged-in clients for the same org see the new state within ~1s via Supabase Realtime.

2. **Brake ON halts proxy execution quickly (best effort <500ms):**
   **Given** the Emergency Brake is ON for an org
   **When** a new proxy-execution task is inserted (e.g., `thread.action`, `email.send`, `calendar.create`)
   **Then** the agent MUST NOT call any side-effecting MCP tool
   **And** the task MUST terminate quickly as `paused` (preferred) or `escalation` with `result.summary` explaining the brake is engaged.

3. **Brake OFF restores normal behavior:**
   **Given** the Emergency Brake is OFF
   **When** a proxy-execution task is inserted
   **Then** the agent proceeds with the normal execution rules (tier, confidence, approvals).

4. **UI clearly communicates the system mode and blocks risky actions:**
   **Given** the Emergency Brake is ON
   **When** the Dashboard renders
   **Then** the header shows a prominent "Brake Engaged" state
   **And** bulk "Automate" is disabled with a short explanation (tooltip or helper text).

5. **Permission safety rule (default):**
   - Any org member can turn the brake ON.
   - Only a CEO can turn the brake OFF.
   - Agent enforces the brake regardless of UI state.

6. **Audit trail:**
   **When** the brake is toggled
   **Then** the change is recorded with `updated_by` and `updated_at` in the brake table
   **And** the agent writes a lightweight audit entry to `agent_activity_log` when it pauses a task due to the brake.

## Tasks / Subtasks

- [x] DB: create `org_safety_controls` (or similar) table keyed by `organization_id` with `emergency_brake_enabled`, `updated_at`, `updated_by`.
- [x] DB: enable Realtime publication for that table.
- [x] DB: add RLS policies:
  - SELECT for org members
  - INSERT/UPDATE to set enabled=true for org members
  - UPDATE to set enabled=false for CEO only
- [x] Agent: add a cached `SafetyControlsService` that can answer `isEmergencyBrakeEnabled(orgId)`.
- [x] Agent: subscribe to Realtime changes on the controls table to update in-memory cache immediately.
- [x] Agent: add an early brake check in the graph (before any MCP/tool execution) to pause proxy tasks when the brake is on.
- [x] Web: implement an Emergency Brake toggle in `apps/web/src/components/layout/AppHeader.vue`:
  - shows OFF vs ON state
  - writes control row changes to DB
  - disables OFF toggle for non-CEO users
- [x] Web: disable bulk Automate in `apps/web/src/views/Dashboard.vue` when brake is engaged.
- [x] Tests: Vitest coverage for UI gating + agent brake behavior (unit-level).

## Dev Notes

- **Where to put the control:** The app already has an "Emergency Brake" UI placeholder button in `apps/web/src/components/layout/AppHeader.vue`.

- **Agent execution model:** The agent executes tasks on Supabase Realtime INSERT for `public.tasks` with `status=queued` (`apps/agent/src/index.ts`). A brake check must happen immediately when a task is received to prevent MCP side effects.

- **Task status:** `task_status` already includes `paused` and `protocol.ts` demonstrates updating tasks to `paused` (`apps/agent/src/controller/nodes/protocol.ts`). Use `paused` as the canonical brake outcome for blocked proxy tasks.

- **Realtime subscription pattern (Supabase JS, Context7):** use `.channel(...).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: '<controls>' }, cb).subscribe()` and cleanup with `removeChannel`.

- **PrimeVue UI (Context7):** use `ToggleSwitch` with `v-model` for the global toggle; use `Button` with `:loading` and `aria-label` for accessibility; tooltip via `v-tooltip` is already available.

- **Latency target (<500ms):** treat this as "time to prevent new side effects" rather than hard-canceling in-flight LLM/MCP calls. In-flight cancellation is best-effort unless the codebase adds AbortSignal support.

### Project Structure Notes

- UI entrypoint: `apps/web/src/components/layout/AppHeader.vue`
- Dashboard bulk actions: `apps/web/src/views/Dashboard.vue`
- Agent event loop: `apps/agent/src/index.ts`
- Agent graph: `apps/agent/src/controller/graph.ts`
- DB migrations: `supabase/migrations/*.sql`

### References

- `_bmad-output/planning-artifacts/prd.md` (NFR6 Emergency Brake)
- `_bmad-output/planning-artifacts/epics.md` (Story 4.4 definition)
- Context7: Supabase Realtime `postgres_changes` subscription patterns
- Context7: PrimeVue `ToggleSwitch`, Tooltip and Button accessibility patterns

## Dev Agent Record

### Agent Model Used

openai/gpt-5.2

### Debug Log References

### Completion Notes List

- Implemented initial `public.org_safety_controls` table migration for per-org Emergency Brake state.
- Added migration unit test to assert table + required columns exist.
- Enabled Supabase Realtime for `public.org_safety_controls` via publication migration + test.
- Added RLS policies for org safety controls (members can enable brake; only CEO can disable).
- Added `SafetyControlsService` (cached + Realtime-backed) for `isEmergencyBrakeEnabled(orgId)`.
- Implemented Supabase Realtime `postgres_changes` subscription inside `SafetyControlsService` to keep cache current.
- Tests: `npx pnpm --filter @ai-assistant/shared test`, `npx pnpm -r test`.
- Agent: added early Emergency Brake check in `apps/agent/src/controller/graph.ts` (pauses proxy tasks before any MCP/tool execution).
- Web: replaced header placeholder with PrimeVue `ToggleSwitch` bound to `public.org_safety_controls` with CEO-only disable for turning OFF.
- Tests: `npx pnpm --filter @ai-assistant/agent test`, `npx pnpm --filter @ai-assistant/web test`, `npx pnpm -r test`.
- Web: disabled bulk "Automate" while brake is engaged and added inline helper text.
- Tests: added UI gating coverage in `apps/web/src/components/layout/AppHeader.spec.ts` and `apps/web/src/views/Dashboard.spec.ts`.

### File List

- supabase/migrations/20260219000000_create_org_safety_controls.sql
- supabase/migrations/20260219000001_org_safety_controls_realtime.sql
- supabase/migrations/20260219000002_org_safety_controls_rls.sql
- packages/shared/tests/org-safety-controls-migration.spec.ts
- packages/shared/tests/org-safety-controls-realtime-migration.spec.ts
- packages/shared/tests/org-safety-controls-rls-migration.spec.ts
- packages/shared/src/database.types.ts
- apps/agent/src/services/SafetyControlsService.ts
- apps/agent/src/services/SafetyControlsService.spec.ts
- apps/agent/src/controller/graph.ts
- apps/agent/src/controller/graph.spec.ts
- apps/web/src/composables/useSafetyControls.ts
- apps/web/src/components/layout/AppHeader.vue
- apps/web/src/components/layout/AppHeader.spec.ts
- apps/web/src/views/Dashboard.vue
- apps/web/src/views/Dashboard.spec.ts
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/4-4-real-time-emergency-brake-global-toggle.md

## Change Log

- 2026-02-21: Added per-org Emergency Brake persistence + Realtime + RLS; enforced brake in agent graph; implemented header toggle + disabled bulk Automate; added unit tests.
- 2026-02-21: Code review passed (Alexis). Status updated to 'done'. All safety controls verified.
