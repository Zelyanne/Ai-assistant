# Story 1.2: Database-as-Queue Schema & RLS Policies

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a System Architect,
I want a secure PostgreSQL schema that includes the "Database-as-Queue" engine AND the core domain entities for email ingestion and morning briefs,
so that the UI and Agent can communicate securely with strict multi-tenant isolation across the entire feature set.

## Acceptance Criteria

1. **Foundation Schema Definition**: The following core tables are implemented with strict multi-tenant isolation:
   - `organizations`: Root tenant entity.
   - `profiles`: User-to-organization mapping with roles (CEO, PM, Team Member).
   - `tasks`: The "Database-as-Queue" engine supporting `domain.action` naming.
   - `agent_activity_log`: Immutable audit log for AI reasoning, traces, and source citations.
   - `user_protocols`: Storage for leadership "nudging" philosophies (Markdown).
2. **Domain Schema Definition (Ingestion & Triage)**:
   - `workspace_integrations`: Stores encrypted OAuth tokens and sync status (Google Workspace).
   - `ingested_threads`: Stores metadata for Gmail threads (Subject, External ID, Semantic Category).
   - `watch_topics`: User-defined keywords and topics for semantic classification.
   - `morning_briefs`: Stores the generated card-based summaries, "Silent Wins," and "Escalations."
3. **Naming Conventions**: All tables, columns, and indexes follow the strict `snake_case` requirement.
4. **Multi-tenant Isolation**: Row Level Security (RLS) is enabled on ALL tables. No query should ever return data outside the current user's `organization_id`.
5. **Security Definers**: Use `security definer` functions for complex RLS checks (e.g., checking a user's role/org) to prevent recursive policy errors and optimize performance.
6. **Realtime Configuration**: `tasks`, `agent_activity_log`, and `morning_briefs` are added to the `supabase_realtime` publication for instant UI updates.

## Tasks / Subtasks

- [x] **Core Foundation Schema** (AC: 1, 3)
  - [x] Create `organizations` and `profiles` tables.
  - [x] Implement `get_user_organization()` security definer function.
  - [x] Create `tasks` table with `status` enum (`queued`, `processing`, `done`, `error`).
- [x] **Email & Morning Brief Schema** (AC: 2, 3)
  - [x] Create `workspace_integrations` (fields: `org_id`, `provider`, `encrypted_creds`, `sync_status`).
  - [x] Create `ingested_threads` (fields: `org_id`, `external_id`, `category`, `priority_score`, `summary`).
  - [x] Create `watch_topics` (fields: `org_id`, `topic_name`, `keywords_array`).
  - [x] Create `morning_briefs` (fields: `org_id`, `user_id`, `brief_date`, `content_json`, `is_read`).
- [x] **Audit & Transparency** (AC: 1, 6)
  - [x] Create `agent_activity_log` with `reasoning_trace` (JSONB) and `citations` (JSONB).
  - [x] Enable Realtime for `tasks`, `agent_activity_log`, and `morning_briefs`.
- [x] **RLS & Multi-tenancy** (AC: 4, 5)
  - [x] Enable RLS on all tables.
  - [x] Apply `organization_id` policies using the shared security definer.
  - [x] Verify `service_role` (Agent) access for background processing.
- [x] **Shared Type Export** (AC: 3)
  - [x] Generate database types into `packages/shared/src/database.types.ts`.
  - [x] Verify Zod schemas in `packages/shared/src/schemas.ts` cover the new domain entities.

## Dev Notes

### Technical Requirements
- **PostgreSQL**: 15+
- **Security**: "Principal-Driven" permissions—some tables (like `organizations`) should be `owner`-only for updates.
- **Agent Hook**: The Agent Controller will primarily watch the `tasks` table but will write to `ingested_threads` and `morning_briefs`.

### Architecture Compliance
- ** snake_case**: Mandatory for all DB entities.
- **Isolation**: RLS is the primary security perimeter. Never trust the frontend `organization_id` in a `WHERE` clause without a corresponding RLS policy.

### References
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 1 & 2]
- [Supabase Multi-tenant Best Practices](https://supabase.com/docs/guides/auth/row-level-security#multi-tenant-applications)

## Dev Agent Record

### Agent Model Used

Amelia (Developer Agent)

### Completion Notes List

- Implemented core foundation schema with `organizations`, `profiles`, and `tasks` tables.
- Implemented `private.get_user_organization()` security definer function for RLS.
- Implemented domain schema for email ingestion and morning briefs (`workspace_integrations`, `ingested_threads`, `watch_topics`, `morning_briefs`, `user_protocols`).
- Implemented `agent_activity_log` for audit trails.
- Configured Realtime for `tasks`, `agent_activity_log`, and `morning_briefs`.
- Enabled RLS on all tables with strict multi-tenant isolation policies.
- Generated TypeScript types from Supabase and updated `packages/shared/src/database.types.ts`.
- Updated Zod schemas in `packages/shared/src/schemas.ts` to reflect the new domain model and multi-tenancy.

### File List

- `_bmad-output/implementation-artifacts/1-2-database-as-queue-schema-rls-policies.md`
- `supabase/migrations/20260114000000_core_and_domain_schema.sql`
- `packages/shared/src/database.types.ts`
- `packages/shared/src/schemas.ts`
- `packages/shared/tests/schemas.spec.ts`

### Change Log

- [2026-01-14] Implemented core schema, RLS, and Realtime.
- [2026-01-14] Code Review Fixes:
    - Added `subject` column to `ingested_threads`.
    - Added foreign key constraint for `agent_activity_log.agent_id` to `profiles.id`.
    - Implemented missing SQL migration source of truth.
    - Implemented unit tests for Zod schemas in `packages/shared/tests/schemas.spec.ts`.
    - Fixed Zod schema to include `UserCredentialsSchema` and update `IngestedThreadSchema`.
    - Verified all tests passing via Vitest.
