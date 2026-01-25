# Story 1.4: Principal-Driven Permission System

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an Admin (CEO),
I want to assign roles (CEO, PM, Team Member) to my organization's users and restrict access to sensitive data,
so that I can ensure privacy and maintain the "Agency Perimeter" (FR23).

## Acceptance Criteria

1.  **RBAC Schema Hardening**:
    *   **New Migration**: Add `user_id` (UUID, references `profiles.id`) to `tasks`, `workspace_integrations`, `ingested_threads`, and `calendar_events`.
    *   **RLS Update**: Update Row Level Security (RLS) policies to implement "Principal-Driven" isolation:
        *   `CEO`: Can `SELECT`, `INSERT`, `UPDATE` any record in their `organization_id`.
        *   `PM / Team Member`: Can only `SELECT`, `INSERT`, `UPDATE` records where `user_id = auth.uid()` within their `organization_id`.
        *   `profiles`: Only users with `role = 'CEO'` can `UPDATE` the `role` column of other profiles in the same organization.
    *   **Helper Function**: Create a `public.get_user_role()` function to easily retrieve the current user's role in RLS policies.
2.  **Admin Hub UI (Vue 3 + PrimeVue)**:
    *   Implement an "Organization Management" view (`apps/web/src/views/AdminHub.vue`).
    *   **DataTable**: Show all users in the organization with columns for Name, Email, and Role.
    *   **Role Tag**: Use PrimeVue `Tag` component to display roles with state-colors (e.g., CEO: primary, PM: info, Team Member: secondary).
    *   **Role Management**: Allow CEOs to change user roles via a `Dropdown` in a `Dialog` or using PrimeVue's `DataTable` row editing mode.
3.  **Frontend Permission Guarding**:
    *   **Composable**: Create `apps/web/src/composables/usePermissions.ts` that provides reactive `isCEO`, `isPM`, and `isTeamMember` flags.
    *   **Route Guard**: Protect the `/admin` route; redirect non-CEOs to the dashboard with a "Permission Denied" toast.
4.  **End-to-End Type Safety**:
    *   Ensure the `UserRole` enum and `Profile` interface in `packages/shared` are updated and used correctly across `apps/web` and `apps/agent`.

## Tasks / Subtasks

- [x] **Database & Security (Supabase)**
    - [x] Create migration to add `user_id` to domain tables (`tasks`, `ingested_threads`, etc.).
    - [x] Create `public.get_user_role()` SQL function.
    - [x] Update RLS policies for `profiles`, `tasks`, `morning_briefs`, `user_protocols`, `ingested_threads`, and `calendar_events`.
- [x] **Shared Logic (`packages/shared`)**
    - [x] Update Zod schemas and TypeScript interfaces to include `user_id` and the `UserRole` enum.
- [x] **Frontend Infrastructure (`apps/web`)**
    - [x] Implement `usePermissions` compposable.
    - [x] Add route guard for `/admin` in `src/router/index.ts`.
- [x] **Admin Hub UI (`apps/web`)**
    - [x] Create `AdminHub.vue` page.
    - [x] Implement `DataTable` with row editing for role updates.
    - [x] Add "CEO Only" navigation item to the sidebar.
- [x] **Agent Controller Update (`apps/agent`)**
    - [x] Update `GoogleIngestionService` to include `user_id` when upserting threads and events (ensures RLS works).

## Dev Notes

- **RLS Performance**: Use `(SELECT public.get_user_role())` in policies to leverage subquery caching.
- **Agent Context**: The Agent Controller (Hetzner) uses the `service_role` key, which bypasses RLS. However, it MUST explicitly set the `user_id` when creating records so that the correct users can see them via their own RLS policies.
- **Security Check**: Verify that a "PM" cannot see the results of a "CEO" task by attempting a cross-user query in a Vitest test.

### Project Structure Notes

- **RLS Policies**: `supabase/migrations/`
- **Permissions Composable**: `apps/web/src/composables/usePermissions.ts`
- **Admin View**: `apps/web/src/views/AdminHub.vue`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security]
- [Source: _bmad-output/planning-artifacts/epics.md#FR23]
- [Supabase Docs: Custom Claims & RBAC](https://supabase.com/docs/guides/auth/custom-claims-and-role-based-access-control-rbac)
- [PrimeVue: DataTable Row Editing](https://primevue.org/datatable/#row_edit)

## Dev Agent Record

### Agent Model Used

Bob (Technical Scrum Master) - Ultimate Story Context Engine

### Completion Notes List

- Implemented Principal-Driven RLS policies using `user_id` column in domain tables.
- Created `public.get_user_role()` and `public.has_principal_access()` SQL functions for simplified and optimized policy logic.
- Updated `@ai-assistant/shared` with new Zod schemas and TypeScript interfaces for `Profile`, `Task`, `IngestedThread`, and `CalendarEvent`.
- Created `useUserStore` (Pinia) and `usePermissions` (Composable) in `apps/web` to handle user state and RBAC logic.
- Implemented `AdminHub.vue` with PrimeVue `DataTable` allowing CEOs to manage user roles within their organization.
- Integrated `vue-router` with a global navigation guard to protect the `/admin` route.
- Updated `GoogleIngestionService` and `tokenService` in `apps/agent` to support multi-tenant isolation by storing and using `user_id`.
- Verified changes with unit tests in `shared` and `agent` packages.
- **Reviewer Fixes:**
  - Added `apps/web/src/composables/usePermissions.spec.ts` to verify frontend permission logic (simulating Principal-Driven access constraints).
  - Fixed silent failure in `AdminHub.vue` by adding `Toast` notifications for role update success/error.
  - Fixed race condition in `GoogleIngestionService` by scoping `OAuth2` client to execution context.
  - Removed hardcoded role values in `AdminHub.vue` in favor of shared source of truth.

### File List

- `_bmad-output/implementation-artifacts/1-4-principal-driven-permission-system.md`
- `apps/web/src/composables/usePermissions.ts`
- `apps/web/src/composables/usePermissions.spec.ts`
- `apps/web/src/views/AdminHub.vue`
- `apps/web/src/views/Dashboard.vue`
- `apps/web/src/router/index.ts`
- `apps/web/src/stores/user.ts`
- `apps/web/src/main.ts`
- `apps/web/src/App.vue`
- `apps/agent/src/services/google.ts`
- `apps/agent/src/services/google.spec.ts`
- `apps/agent/src/services/tokenService.ts`
- `apps/agent/src/index.ts`
- `packages/shared/src/schemas.ts`
- `packages/shared/src/database.types.ts`
- `supabase/migrations/20260114000002_principal_driven_permissions.sql`
