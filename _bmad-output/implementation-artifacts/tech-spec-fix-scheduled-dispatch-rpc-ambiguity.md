---
title: 'Fix scheduled dispatch RPC (claim_schedule_dispatch) ambiguous schedule_id'
slug: 'fix-scheduled-dispatch-rpc-ambiguity'
created: '2026-04-06T05:10:46Z'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'Supabase (Postgres + RLS + RPC via PostgREST)'
  - 'Node.js + TypeScript'
  - 'Vitest'
files_to_modify:
  - 'supabase/migrations/20260402000200_claim_schedule_dispatch_and_enqueue_task.sql'
  - 'supabase/migrations/20260406000100_fix_claim_schedule_dispatch_ambiguity.sql'
  - 'apps/agent/src/services/CronSchedulerService.spec.ts'
code_patterns:
  - 'CronSchedulerService polls public.user_schedules (is_active=true AND next_run<=now)'
  - 'Atomic dispatch via RPC public.claim_schedule_dispatch(schedule_id, dispatch_window_start, dispatch_window_end)'
  - 'Idempotency: public.user_schedule_dispatches unique(schedule_id, dispatch_window_start)'
  - 'DB-as-queue: enqueue by inserting public.tasks(status=queued); realtime subscriber executes'
  - 'Failure policy: failure_count++ and disable schedule at MAX_SCHEDULE_FAILURES (default 3)'
test_patterns:
  - 'Vitest unit tests in apps/agent/src/services/*.spec.ts'
  - 'Mock Supabase client pattern in CronSchedulerService.spec.ts (from().select().eq().lte() + rpc())'
---

# Tech-Spec: Fix scheduled dispatch RPC (claim_schedule_dispatch) ambiguous schedule_id

**Created:** 2026-04-06T05:10:46Z

## Overview

### Problem Statement

Scheduled agent requests can be created in `public.user_schedules`, but at run time they do not enqueue the corresponding `public.tasks` row. The scheduler attempts to dispatch via the Postgres RPC `public.claim_schedule_dispatch(...)`, but the schedule row accumulates failures and is deactivated.

In production data, the affected schedule shows:

- `public.user_schedules.last_error = "column reference \"schedule_id\" is ambiguous"`
- `failure_count` increments until the schedule is set `is_active=false`
- `public.user_schedule_dispatches` remains empty and no queued task is created

Result: the agent never receives the scheduled request later as intended.

### Solution

Patch the SQL implementation of `public.claim_schedule_dispatch(...)` to remove the ambiguous `schedule_id` reference by fully-qualifying and/or renaming variables/columns (avoid column/parameter name collisions). Ensure the RPC reliably inserts an idempotent dispatch window row and enqueues exactly one `public.tasks` row for each due window.

Add regression coverage so this class of SQL error is caught before deploy.

### Scope

**In Scope:**
- Fix `public.claim_schedule_dispatch(...)` so it does not error with ambiguous `schedule_id`.
- Ensure `CronSchedulerService` can successfully dispatch due schedules (one-off + finite recurrence) and enqueue tasks.
- Add/extend tests to cover the RPC call path and schedule error handling.

**Out of Scope:**
- Automatic re-enabling or retrying of schedules that were already deactivated by prior failures.
- Changes to schedule UX or schedule creation flows.

## Context for Development

### Codebase Patterns

- **Scheduling dispatch loop:** `CronSchedulerService.runCycle()` polls `public.user_schedules` for `is_active=true` and `next_run<=now`, then `processDueSchedule()` loops (catch-up) window-by-window.
- **Atomic dispatch:** `processDueSchedule()` calls `supabase.rpc('claim_schedule_dispatch', { schedule_id, dispatch_window_start, dispatch_window_end })`.
- **Idempotency:** dispatch windows are de-duped by `public.user_schedule_dispatches` unique `(schedule_id, dispatch_window_start)`.
- **DB-as-Queue:** successful dispatch enqueues by inserting `public.tasks` with `status='queued'`; Realtime subscriber later executes the task.
- **Failure handling:** any `rpcError` triggers `recordFailure()` which increments `failure_count`, persists `last_error`, and disables the schedule when `failure_count >= MAX_SCHEDULE_FAILURES` (default `3`).
- **Observed production evidence:** the failing schedule produced `agent_activity_log.action_taken` entries `schedule_execution_failed` (x2) then `schedule_execution_disabled_after_failures` with message `column reference "schedule_id" is ambiguous`.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/agent/src/services/CronSchedulerService.ts` | Poll due schedules; calls `supabase.rpc('claim_schedule_dispatch', ...)` |
| `apps/agent/src/services/CronSchedulerService.spec.ts` | Scheduler tests + Supabase RPC mocking pattern |
| `apps/agent/src/index.ts` | Starts `cronSchedulerService.start()` alongside other schedulers |
| `supabase/migrations/20260402000200_claim_schedule_dispatch_and_enqueue_task.sql` | Defines `public.claim_schedule_dispatch(...)` |
| `supabase/migrations/20260320100000_create_user_schedules.sql` | Base schedule tables (`user_schedules`, `user_schedule_dispatches`) |

### Technical Decisions

- **Root cause hypothesis (DB):** `public.claim_schedule_dispatch(...)` uses `ON CONFLICT (schedule_id, dispatch_window_start)` while also having PL/pgSQL parameters named `schedule_id` / `dispatch_window_start`. Postgres treats this as an ambiguous reference (column vs PL/pgSQL variable) and errors at runtime.
- **DB fix approach:** keep the RPC signature (so Node doesn’t need argument changes) and update the insert to use `ON CONFLICT ON CONSTRAINT user_schedule_dispatches_idempotency DO NOTHING` to avoid naming collisions.
- Fix is applied at the database layer (new SQL migration that replaces the function), not by adding workarounds in Node.
- No backfill/auto-reenable of previously disabled schedules (scope A).

## Implementation Plan

### Tasks

- [ ] Task 1: Confirm production symptom + reproduce failure path (no code changes)
  - File: *N/A (Supabase DB inspection)*
  - Action:
    - Verify the affected schedule is due/past due and has `last_error` set to the ambiguity message.
    - Verify there are **no** rows in `public.user_schedule_dispatches` for that `schedule_id`.
    - Verify there are **no** `public.tasks` rows with `payload.schedule_id = <schedule_id>`.
    - Pull the live function body via `pg_get_functiondef('public.claim_schedule_dispatch(uuid,timestamptz,timestamptz)'::regprocedure)`.
  - Notes: Confirms the failure is in the RPC, not the Node poller.

  - Status: Pending (requires direct DB access / staging)

- [x] Task 2: Patch `public.claim_schedule_dispatch(...)` to remove ambiguous references
  - File: `supabase/migrations/20260406000100_fix_claim_schedule_dispatch_ambiguity.sql`
  - Action:
    - Create a new migration that **CREATE OR REPLACE**s `public.claim_schedule_dispatch(...)`.
    - Fix the `INSERT INTO public.user_schedule_dispatches ... ON CONFLICT ...` clause by using:
      - `ON CONFLICT ON CONSTRAINT user_schedule_dispatches_idempotency DO NOTHING`
      - (and keep `RETURNING id INTO claimed_dispatch_id` behavior)
    - Avoid introducing new parameter/column name collisions; keep the function signature unchanged so Node can keep passing `{ schedule_id, dispatch_window_start, dispatch_window_end }`.
    - Ensure grants/privileges remain restricted to `service_role`.
  - Notes:
    - The current migration file `supabase/migrations/20260402000200_claim_schedule_dispatch_and_enqueue_task.sql` can stay as historical record; this new migration supersedes it in prod.

- [x] Task 3: Add a regression unit test for RPC error handling + disable-after-3-failures
  - File: `apps/agent/src/services/CronSchedulerService.spec.ts`
  - Action:
    - Add a test that simulates `supabase.rpc('claim_schedule_dispatch', ...)` returning `{ error: { message: 'column reference "schedule_id" is ambiguous' } }`.
    - Assert `CronSchedulerService` calls `recordFailure()` semantics:
      - `failure_count` increments
      - `last_error` is persisted with the rpc error message
      - schedule is disabled when `failure_count` reaches `maxFailures` (default 3)
    - Keep the test fully unit-level using the existing mocked supabase client pattern.
  - Notes: This prevents silent regressions even though the root fix is in SQL.

- [ ] Task 4: Validate end-to-end in staging (or local with Supabase) after migration
  - File: *N/A (runtime validation)*
  - Action:
    - Create a one-off `assistant.command` schedule due within the next minute.
    - Run the agent controller with the cron scheduler enabled.
    - Confirm:
      - `public.user_schedule_dispatches` row is created for the due window.
      - `public.tasks` row is enqueued with `status='queued'` and scheduled metadata (`schedule_id`, `trigger_time`, etc.).
      - The queued task is picked up and processed by the task subscriber pipeline.
  - Notes: Keep this as a manual validation step (scope A; no backfill).

  - Status: Pending (manual validation)

### Acceptance Criteria

- [ ] AC 1: Given a due schedule in `public.user_schedules`, when `CronSchedulerService` processes it, then `public.claim_schedule_dispatch(...)` returns `should_dispatch=true` with a non-null `dispatch_id` and `task_id`, and exactly one `public.tasks` row is inserted with `payload.scheduled=true` and `payload.schedule_id=<schedule_id>`.
- [ ] AC 2: Given the same `(schedule_id, dispatch_window_start)` is processed twice, when the second attempt runs, then no duplicate task is inserted and the RPC returns `should_dispatch=false` with `reason='already_claimed'`.
- [ ] AC 3: Given the pre-fix ambiguity scenario, when `public.claim_schedule_dispatch(...)` executes the dispatch insert, then it does **not** raise `column reference "schedule_id" is ambiguous`.
- [x] AC 4: Given `claim_schedule_dispatch` returns an error to the Node client, when `CronSchedulerService` receives `rpcError.message`, then it persists `user_schedules.last_error` and increments `failure_count`, and disables the schedule when the count reaches `MAX_SCHEDULE_FAILURES`.

## Additional Context

### Dependencies

- Supabase database migrations (SQL) must be applied to the target environment.
- Agent controller must be running with `cronSchedulerService.start()` enabled (it is started in `apps/agent/src/index.ts`).

### Testing Strategy

- **Unit:** Extend `apps/agent/src/services/CronSchedulerService.spec.ts` to cover the RPC error message path and disable-after-3-failures behavior.
- **Manual/Integration:** After applying the SQL migration, create a one-off schedule and confirm a task is enqueued and executed end-to-end.

### Notes

- Observed failing production schedule id: `41ddc19b-b97f-46c1-b31a-ddb3a9d13665`.
- Root cause is in the DB function, not in the scheduler loop: `CronSchedulerService` is running (audit entries exist at 19:10/19:11/19:12 UTC), but the RPC fails before any dispatch/task row is created.
- Scope A: previously disabled schedules remain inactive; users must recreate/resume manually if desired.

## Review Notes

- Adversarial review completed
- Findings: 16 total, 4 fixed, 12 skipped
- Resolution approach: auto-fix
