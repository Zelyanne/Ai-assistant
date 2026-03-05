# Story 4.1: Agency Tier Configuration & Perimeter Management

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an SME Leader,
I want to define which topics the AI can handle autonomously,
so that I can safely delegate routine requests (FR6, FR22).

## Acceptance Criteria

1. **Agency Perimeter Manager UI:** In `Settings -> Security & Autonomy`, a user can view a tiered list of topics grouped into `Public`, `Controlled`, and `Restricted`.
2. **Tier Board Interaction (BDD):** **Given** the Agency Perimeter interface, **When** I drag "Project Logistics" to the "Public" tier, **Then** the topic's tier is persisted to `agency_perimeters` for my organization.
3. **CRUD Topics:** A CEO can create a new topic, rename an existing topic, change its tier, and delete a topic (except the default `General` topic).
4. **Role Enforcement (CEO-only Writes):** Non-CEO users can read perimeters but cannot create/update/delete perimeters (writes are blocked by RLS and the UI renders read-only controls + a clear message).
5. **Data Integrity:** Topic names are trimmed; duplicates within the org are prevented (unique constraint surfaced as a friendly UI error).
6. **Default Topic Exists:** If the org has no `General` perimeter row, the UI auto-creates it as `Restricted` (or prompts the CEO to create it).
7. **No Regression:** Existing agent enforcement continues to function: `apps/agent` uses `tasks.topic` to look up the authorized tier; missing topics still default to `Restricted`.

## Tasks / Subtasks

- [x] **Database: lock down perimeter writes** (AC: 4, 5)
  - [x] Add a migration to replace the current `agency_perimeters` RLS policy (`Organization access for agency perimeters` is currently `FOR ALL` and too permissive) with:
    - [x] `SELECT`: organization members can read
    - [x] `INSERT/UPDATE/DELETE`: only CEO can write (`public.get_user_role() = 'CEO'`)
  - [x] Use `(select public.get_user_organization())` and `(select public.get_user_role())` in policy expressions to avoid per-row auth function re-evaluation (Supabase advisor `auth_rls_initplan`).
  - [x] Keep Realtime publication for `agency_perimeters` intact.

- [x] **Web: build Agency Perimeter Manager (tier board)** (AC: 1, 2, 3, 5, 6)
  - [x] Implement a 3-column "Tier Board" UI (Public / Controlled / Restricted) with drag-and-drop of topic cards.
  - [x] Load perimeters from `agency_perimeters` scoped by `organization_id`.
  - [x] Support create/rename/delete topic actions with optimistic UI + rollback on error.
  - [x] Enforce reserved topic `General` (cannot delete; always present).
  - [x] Handle RLS failures (403/401) by switching to read-only mode + messaging.

- [x] **Wire into Settings** (AC: 1)
  - [x] Integrate the new manager into `apps/web/src/components/SecurityPerimeterSettings.vue` (or replace it) while preserving the existing "Executive Calm" styling.

- [x] **Testing** (AC: 3, 4, 5)
  - [x] Unit tests (Vitest + Vue Test Utils) for:
    - [x] grouping/sorting topics by tier
    - [x] drag/drop tier change updates the right row
    - [x] duplicate-name error handling
    - [x] read-only behavior when write fails

## Dev Notes

- **Do not reinvent:** The agent already enforces tiers via `AgencyService.getTierForTopic()` and `PerimeterGuard.filter()`; this story is primarily UI + RLS hardening.
- **Tier lookup behavior:** `apps/agent/src/services/agency.ts` defaults missing topics to `Restricted`. This is a safety feature; do not change unless you also define a deterministic topic normalization strategy.
- **Topic matching is exact:** `AgencyService.getTierForTopic(orgId, topicName)` uses `.eq('topic_name', topicName)`. Ensure UI writes consistent topic strings (trim, preserve case policy intentionally).
- **Principal-driven permissions:** Roles live in `public.profiles.role` and helper `public.get_user_role()` already exists; use it in RLS.
- **Supabase MCP check (current state):** `public.agency_perimeters` exists with RLS enabled. Current policy is `Organization access for agency perimeters` with `cmd=ALL`, `qual=(organization_id = get_user_organization())`, roles=`public`, and the table is in `supabase_realtime` publication.
- **UX spec vs reality:** `_bmad-output/planning-artifacts/ux-design-specification.md` mentions MUI, but this repo is PrimeVue + Tailwind (see `apps/web/package.json` and Story 3.0). Do not introduce MUI.

### Project Structure Notes

- Vue components live in `apps/web/src/components/` and are composed in `apps/web/src/views/Settings.vue`.
- Shared enums/types for tiers already exist in `packages/shared/src/schemas.ts` (`AgencyTierSchema`, `AgencyPerimeterSchema`). Reuse them.
- Supabase schema changes require updating generated types where applicable:
  - `packages/shared/src/database.types.ts`
  - `apps/web/src/services/supabase.d.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-4-Autonomous-Proxy-&-Actionable-Trust]
- [Source: _bmad-output/planning-artifacts/epics.md#Story-4.1-Agency-Tier-Configuration-&-Perimeter-Management]
- [Source: _bmad-output/planning-artifacts/prd.md#Functional-Requirements]
- [Source: _bmad-output/planning-artifacts/architecture.md#Core-Architectural-Decisions]
- [Source: supabase/migrations/20260118000000_agency_perimeters_and_escalation.sql]
- [Source: supabase/migrations/20260114000002_principal_driven_permissions.sql]
- [Source: apps/agent/src/services/agency.ts]
- [Source: apps/agent/src/controller/graph.ts]
- [Source: apps/agent/src/guards/PerimeterGuard.ts]
- [Source: apps/web/src/views/Settings.vue]
- [Source: apps/web/src/components/SecurityPerimeterSettings.vue]
- [PrimeVue PickList docs/example: https://primevue.org/picklist/]
- [PrimeVue DataTable editing docs: https://primevue.org/datatable/]
- [Drag-and-drop tier board inspiration (Vue): https://github.com/rbsgaridan/incoder-kanban]
- [Supabase RLS + security definer patterns: https://supabase.com/docs/guides/database/postgres/row-level-security]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.2 (Amelia / dev-story)

### Debug Log References

- Supabase migration applied: `lock_down_agency_perimeters_rls` (project: `eoaoiazhsmjbsjazffmx`)
- Context7 refs: Supabase RLS initplan guidance; PrimeVue list/drag patterns
- Octocode refs: `rbsgaridan/incoder-kanban` drag/drop patterns (`dataTransfer` + drop zones)
- Tests: `npx pnpm --filter @ai-assistant/shared exec -- vitest run --dir tests`
- Tests: `npx pnpm --filter @ai-assistant/agent test`
- Tests: `npx pnpm --filter @ai-assistant/web test`

### Completion Notes List

- 2026-02-17: Hardened `public.agency_perimeters` RLS: org-member `SELECT`; CEO-only `INSERT/UPDATE/DELETE`; initplan-safe `(SELECT ...)` wrappers.
- Built tier-board UI with HTML5 drag/drop + optimistic CRUD; reserved `General` enforcement + auto-create when missing.
- Integrated into Settings with CEO-only write controls + automatic read-only fallback on 401/403.
- Added migration assertion test to prevent policy regressions.
- Updated agent Vitest config/mocks to keep the full monorepo test run green.
- 2026-02-17 (CR fixes): strengthened RLS denial detection (`401/403/42501` + permission-denied messages), fixed settings save error handling, and added explicit `General` missing-path tests (CEO auto-create + non-CEO prompt).

### Review Scope Notes

- Current git workspace contains unrelated in-flight changes outside Story 4.1 scope; this story file list remains scoped to files modified for Story 4.1 implementation and review fixes.

### File List

- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/4-1-agency-tier-configuration-perimeter-management.md`
- `supabase/migrations/20260216000000_lock_down_agency_perimeters_rls.sql`
- `packages/shared/tests/agency-perimeters-rls.spec.ts`
- `apps/agent/vitest.config.ts`
- `apps/agent/vitest.setup.ts`
- `apps/agent/src/controller/graph.spec.ts`
- `apps/agent/src/controller/nodes/reasoning.spec.ts`
- `apps/agent/src/services/mcp.spec.ts`
- `apps/agent/src/services/mcp.integration.spec.ts`
- `apps/agent/src/services/mcp.error.spec.ts`
- `apps/web/src/components/SecurityPerimeterSettings.vue`
- `apps/web/src/components/security/AgencyPerimeterBoard.vue`
- `apps/web/src/components/security/AgencyPerimeterBoard.spec.ts`
