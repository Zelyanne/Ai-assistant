# Story 2.4: PerimeterGuard PII Filtering & Agency Tier Enforcement

Status: done

## Story

As a Privacy Officer,
I want all data to pass through PerimeterGuard before being sent to external LLMs,
so that PII is redacted and agency tier boundaries are enforced.

## Acceptance Criteria

1. [x] **Agency Tier Enforcement**: The system checks the task's topic against the `agency_perimeters` table.
2. [x] **Escalation Logic**: If the topic tier is lower than the required tier (e.g., 'Restricted' for a 'Public' autonomous action), the task status is set to `escalation`.
3. [x] **PII Redaction**: All task payloads are passed through `PerimeterGuard` for redaction before reaching downstream processors.
4. [x] **Audit Logging**: Escalations and redaction events are logged to `agent_activity_log` with reasoning traces.
5. [x] **Database Schema**: `agency_perimeters` table created with RLS and added to Supabase Realtime.

## Tasks / Subtasks

- [x] **Database Migration**
  - [x] Create `agency_perimeters` table and `agency_tier` enum.
  - [x] Add `escalation` to `task_status` enum.
- [x] **Shared Schema Updates**
  - [x] Update `Task` schema to include `topic`.
  - [x] Add `AgencyPerimeter` and `AgencyTier` schemas.
- [x] **PerimeterGuard Enhancement**
  - [x] Implement `filter` method for joint PII redaction and tier check.
- [x] **Graph Integration**
  - [x] Add `check_perimeter` node to LangGraph.
  - [x] Update task state with redacted payload.
  - [x] Implement escalation routing.
- [x] **Testing**
  - [x] Unit tests for tier enforcement logic.
  - [x] Integration tests for graph routing and escalation.

## Dev Notes

### Technical Stack
- **Database**: PostgreSQL (Supabase)
- **Framework**: LangGraph
- **Validation**: Zod

### Architecture Compliance
- **RLS**: Organization-level isolation enforced on `agency_perimeters`.
- **Realtime**: `agency_perimeters` changes are broadcast.
- **Patterns**: Follows `domain.action` routing and immutable audit logging.

### References
- [Source: apps/agent/src/guards/PerimeterGuard.ts]
- [Source: apps/agent/src/controller/graph.ts]
- [Source: supabase/migrations/20260118000000_agency_perimeters_and_escalation.sql]

## Dev Agent Record

### Agent Model Used
Antigravity (Claude 3.5 Sonnet)

### Completion Notes List
- Implemented `AgencyService` for centralized tier lookups.
- Enhanced `PerimeterGuard` to handle both security (redaction) and policy (tiers).
- Redacted payload is now passed to all processors, ensuring zero-trust by default.
- ✅ All 34 tests passing across agent package.
- **Code Review Fix (AI):** Added missing `topic` column to tasks table in migration `20260118000000`.
- **Code Review Fix (AI):** Synced `database.types.ts` with schema changes.
