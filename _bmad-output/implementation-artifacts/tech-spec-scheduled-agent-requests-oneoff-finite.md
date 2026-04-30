---
title: 'Scheduled Agent Requests: One-off + Finite Recurrence (Extend Cron Scheduler)'
slug: 'scheduled-agent-requests-oneoff-finite'
created: '2026-04-02T00:16:59Z'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'Supabase (Postgres + RLS + Realtime)'
  - 'Node.js + TypeScript'
  - 'LangGraph (LangChain)'
  - 'Vue 3 + TypeScript (existing schedules UI)'
  - 'Vitest (unit tests)'
  - 'Mistral (ChatMistralAI via LangChain)'
files_to_modify:
  - 'apps/agent/src/services/CronSchedulerService.ts'
  - 'apps/agent/src/services/ScheduledTaskLifecycle.ts'
  - 'apps/agent/src/controller/nodes/generalAgent.ts'
  - 'apps/agent/src/controller/graph.ts (perimeter + routing constraints)'
  - 'apps/agent/src/services/agency.ts (topic tier defaults)'
  - 'apps/agent/src/processors/ScheduleManageProcessor.ts (optional)'
  - 'apps/agent/src/services/scheduleParser.ts (optional)'
  - 'apps/web/src/components/schedules/ScheduleManager.vue (optional)'
  - 'apps/web/src/composables/useSchedules.ts (optional)'
  - 'supabase/migrations/* (schema extension for end conditions / remaining runs)'
  - 'packages/shared/src/database.types.ts (if we choose to type new columns)'
code_patterns:
  - 'Database-as-Queue: scheduler inserts rows into public.tasks (status=queued); realtime subscriber runs LangGraph.'
  - 'Scheduling: public.user_schedules + CronSchedulerService + user_schedule_dispatches idempotency windows.'
  - 'Scheduled lifecycle: finalizeTask -> syncScheduledTaskCompletion() updates next_run / last_run / failure_count.'
  - 'Domain routing: only supported domain_action values route to processors; schedule.execute is not registered.'
  - 'Audit logging: AuditLogger.flush() for schedule dispatch + task completion; agent_activity_log is immutable.'
  - 'Perimeter guard: background schedules depend on agency_perimeters via task.topic; missing tiers default to Restricted → escalation.'
test_patterns:
  - 'Vitest unit tests co-located with services/processors (*.spec.ts)'
  - 'Existing references: apps/agent/src/services/CronSchedulerService.spec.ts, apps/agent/src/services/ScheduledTaskLifecycle.spec.ts'
  - 'Supabase mocking pattern: chainable select().eq().lte() objects returning { data, error } (see CronSchedulerService.spec.ts)'
---

# Tech-Spec: Scheduled Agent Requests: One-off + Finite Recurrence (Extend Cron Scheduler)

**Created:** 2026-04-02T00:16:59Z

## Overview

### Problem Statement

We have recurring scheduling infrastructure (cron-based `user_schedules` polled by `CronSchedulerService`) but we do not have a clean way for users to create **agent-native scheduled requests** like:

- “In 2 hours, do X” (one-off)
- “Send a good morning text every Monday for 3 weeks” (finite recurrence)
- “Send a message/email every day at 16:00 until I tell you to stop” (indefinite recurrence)

…where:

- The request is **improved at schedule creation time** into canonical JSON by the **General Agent**.
- The request is stored with the schedule metadata.
- At the scheduled time, the request is dispatched into the normal agent execution pipeline.
- Finite schedules must stop automatically using **end conditions** (ex: `end_at`) and/or **remaining runs**.
- The system must NOT auto-delete schedules on exhaustion; it must mark them inactive (`is_active=false`) so history/audit remain available.

Important constraint: `schedule.execute` is referenced in UI/parser defaults but is **not** a supported `domain_action` in the Agent Graph/ProcessorRegistry, so scheduled execution must use a supported action.

### Solution

Extend the existing cron scheduler system to support **one-off** and **finite recurrence** schedules that dispatch queued tasks (defaulting to `assistant.command`, but allowing other supported actions like `channel.send`).

- Provide a **General Agent tool** that accepts a natural-language scheduling request (any language), produces a strict JSON schedule plan (including an improved command prompt), and writes a `user_schedules` row.
- Store the improved prompt at creation time as `task_payload.command` (and also `command_text`/`message_text` for compatibility), so that when the scheduler dispatches, the resulting queued task executes “normally”.
  - Note: `generalAgentNode` reads `task.payload.command` as the user request for `assistant.command`.
- Support end conditions:
  - **Finite**: `remaining_runs` (decrement each dispatch) and/or `end_at`.
  - **Indefinite**: no end condition; user can pause/resume/delete via existing schedule management.
- When `remaining_runs` hits 0, set the schedule to **`is_active=false`** (keep row for audit/history).

### Scope

**In Scope:**
- One-off scheduling via General Agent tool (“in 2 hours”, “tomorrow at 17:00”, etc; language-agnostic).
- Finite recurring schedules (“every Monday for 3 weeks”, “every day for 10 times”) implemented via `remaining_runs` and/or `end_at`.
- Indefinite schedules (“every day at 16:00 until I tell you to stop”) supported via `is_active` toggle.
- Persisting improved request JSON + schedule metadata in `public.user_schedules.task_payload`.
- Dispatching via existing `CronSchedulerService` → `public.tasks` → Realtime subscriber → `graph.invoke(...)`.
- Ensuring one-off schedules deactivate after the first dispatch (scheduled occurrence), and finite schedules deactivate when exhausted, while keeping the row for audit.

**Out of Scope:**
- Adding a new processor for `schedule.execute` (we standardize on `assistant.command`).
- User confirmation/preview step before scheduling.
- Complex retry policy for one-off failures beyond existing task/schedule failure logging.

## Context for Development

### Codebase Patterns

- **DB-as-Queue scheduling + dispatch**:
  - `CronSchedulerService` polls `public.user_schedules` for due schedules (`is_active=true AND next_run<=now`) and inserts `public.tasks` with `status='queued'`.
  - Enqueued tasks include `topic='Schedule'`, `domain_action = schedule.task_type`, and a merged payload of `schedule.task_payload` + scheduled metadata (`scheduled`, `schedule_id`, `cron_expression`, `timezone`, `trigger_time`, dispatch ids).
  - `apps/agent/src/index.ts` subscribes to Supabase Realtime INSERTs on `public.tasks` (`status=queued`) and calls `processQueuedTask()`.
  - `processQueuedTask()` calls `graph.invoke(...)`.

- **Idempotent dispatch windows + catch-up**:
  - `user_schedule_dispatches` enforces uniqueness on `(schedule_id, dispatch_window_start)`.
  - `CronSchedulerService.processDueSchedule()` loops from `schedule.next_run` up to `now` and will queue one task per missed window (capped by `MAX_CATCH_UP_RUNS_PER_CYCLE`).
  - Scheduler intentionally does **not** mutate `user_schedules.next_run/last_run` at dispatch time; those are advanced after task completion.
  - With finite recurrence, dispatch DOES update `remaining_runs` / `run_count` (atomic with dispatch claim + enqueue).

- **Scheduled completion sync**:
  - `finalizeTask()` calls `syncScheduledTaskCompletion()` when `task.payload.scheduled===true`.
  - Completion sync computes next_run using `computeNextRunFromCron(cron, timezone, trigger_time)` and resets/increments failure counters (disables schedule at max failures).

- **Graph routing constraints**:
  - `assistant.command` routes directly to the `general_agent` node.
  - `schedule.execute` is referenced by defaults (UI/parser) but is not supported by `ProcessorRegistry` / graph routing.

- **Perimeter/Tier constraint for background schedules (important)**:
  - `checkPerimeter()` uses `AgencyService.getTierForTopic(task.topic)`.
  - `AgencyService` defaults to `Restricted` if no row exists in `public.agency_perimeters`.
  - Because scheduler inserts tasks with `topic='Schedule'`, background scheduled tasks will escalate and not execute unless the org has a perimeter configured for `Schedule` (or we change what topic scheduled tasks use).

- **Existing schedule creation paths (today)**:
  - Web UI (`ScheduleManager.vue` + `useSchedules.ts`) writes directly to `public.user_schedules`; it currently defaults `task_type` to `schedule.execute`.
  - `ScheduleManageProcessor` implements `schedule.manage` CRUD and uses `ScheduleParser` (rules + Mistral fallback) to derive `cron_expression`; it does not currently model finite recurrence ("for 3 weeks") or run counts.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/agent/src/services/CronSchedulerService.ts` | Poll due schedules, claim dispatch window, insert queued tasks |
| `apps/agent/src/services/CronSchedulerService.spec.ts` | Scheduler idempotency + catch-up tests |
| `apps/agent/src/services/ScheduledTaskLifecycle.ts` | Update schedule state on task completion |
| `apps/agent/src/services/ScheduledTaskLifecycle.spec.ts` | Completion sync tests |
| `apps/agent/src/services/taskSubscriber.ts` | Realtime task subscriber entrypoint (dispatch to graph) |
| `apps/agent/src/controller/graph.ts` | Domain routing rules; confirms `assistant.command` is the correct execution entrypoint |
| `apps/agent/src/controller/nodes/generalAgent.ts` | Primary assistant.command entrypoint; where we’ll register the scheduling tool |
| `apps/agent/src/services/agency.ts` | Agency tier lookup (defaults missing topics to Restricted) |
| `apps/agent/src/services/scheduleParser.ts` | NL schedule → cron (rules + Mistral fallback). Defaults task_type to schedule.execute today |
| `apps/agent/src/services/ScheduleParser.spec.ts` | Parser rules + llm fallback tests |
| `apps/agent/src/processors/ScheduleManageProcessor.ts` | schedule.manage CRUD + confirmation for messaging channels |
| `apps/agent/src/processors/ScheduleManageProcessor.spec.ts` | schedule.manage behavior tests |
| `apps/agent/src/processors/ChannelSendProcessor.ts` | Outbound message send + idempotency guard |
| `apps/agent/src/controller/nodes/gmailAgent.ts` | Gmail specialist node (calls MCP tools directly) |
| `apps/web/src/composables/useCommandCenter.ts` | Shows how web sets `payload.high_risk` for assistant.command |
| `supabase/migrations/20260320100000_create_user_schedules.sql` | Schedules tables + RLS + dispatch idempotency |

### Technical Decisions

- **Execution action:** default scheduled execution to `domain_action='assistant.command'`, but allow supported direct actions (e.g. `channel.send`) when the schedule payload is fully specified.
- **Prompt improvement timing:** improve at schedule creation time; store improved prompt in DB.
- **Finite schedule controls:** add `end_at` and `remaining_runs` (prefer explicit columns). Maintain `run_count` for audit.
- **One-off marker:** represent one-off as `remaining_runs=1` and deactivate when `remaining_runs` hits 0.
- **Perimeter topic requirement:** scheduled tasks MUST use a `topic` with a configured non-Restricted tier (otherwise they escalate). Options: ensure org has `agency_perimeters(topic_name='Schedule')`, or store per-schedule `topic` and propagate it.
- **Assistant command payload contract:** for `task_type='assistant.command'`, scheduled `task_payload` MUST include `command` (primary) and SHOULD also include `command_text` + `message_text` for compatibility.
- **High-risk / consent:** schedule creation is explicit user consent, so the scheduler tool MUST persist `confirmed=true`. For safety, scheduled `assistant.command` tasks SHOULD default to `high_risk=true` unless the tool can prove the action is read-only.
- **Time parsing:** General Agent scheduling tool interprets time expressions (any language) into `{ cron_expression, timezone, next_run }` and persists schedule metadata.

#### Critique-driven refinement

- **Atomic decrement (exactly-once):** `remaining_runs` decrement MUST be atomic with the dispatch idempotency claim AND task enqueue. Prefer a DB RPC that claims the window, enqueues the task, attaches `task_id`, and updates counters in a single transaction.
- **Supported task types:** Any schedule created by UI/parser/tools MUST map to a `task_type` that the agent graph supports (e.g. `assistant.command`, `channel.send`, `email.*`). Avoid `schedule.execute` and other unsupported values.
- **Deterministic perimeter config:** Avoid “magic” runtime insertion of agency perimeters inside the agent node. Prefer seeding `agency_perimeters(topic_name='Schedule')` via migration and onboarding RPC so scheduled tasks don’t escalate by default.
- **UI safety:** If UI supports `assistant.command`, it must collect a command string and persist `task_payload.command` (otherwise schedules will fail immediately).

#### Finite recurrence interpretation (deterministic)

- “**N times**” → `remaining_runs = N`.
- “**in X hours / at <datetime>**” (one-off) → `remaining_runs = 1`.
- “**every <cadence> for N weeks**” → compute `remaining_runs` from cadence:
  - weekly cadence (weekday specified) → `remaining_runs = N`
  - daily cadence → `remaining_runs = 7 * N`
  - for sub-daily cadences (hourly, every X minutes, complex cron): prefer `end_at = now + (N weeks)` and leave `remaining_runs = NULL`.
  - otherwise: set `end_at = now + (N weeks)` and leave `remaining_runs = NULL`.
- “**until <date/time>**” → set `end_at` (and prefer `remaining_runs = NULL`).
- If both `end_at` and `remaining_runs` exist, the schedule stops when **either** condition is met.

## Implementation Plan

### Tasks

- [x] Task 1: Extend `public.user_schedules` for finite recurrence
  - File: `supabase/migrations/20260402000100_add_user_schedule_run_limits.sql`
  - Action:
    - `ALTER TABLE public.user_schedules` add:
      - `remaining_runs INTEGER NULL` (NULL = indefinite)
      - `run_count INTEGER NOT NULL DEFAULT 0`
      - `end_at TIMESTAMPTZ NULL` (optional, supports “until <date>” later)
      - `topic TEXT NULL` (so each schedule can choose a perimeter topic; default to NULL)
    - Add constraints:
      - `remaining_runs IS NULL OR remaining_runs >= 0`
      - `run_count >= 0`
    - (Optional) add index for due finite schedules if needed later.
    - Update RLS `WITH CHECK` so non-service clients cannot set arbitrary topics or task types:
      - For authenticated users, allow only `topic IS NULL OR topic = 'Schedule'`.
      - For authenticated users, restrict `task_type` to an allowlist for v1: `assistant.command` and `channel.send`.
      - (Service role bypasses RLS and may support additional values in future.)
  - Notes: service-role scheduler bypasses RLS.

- [x] Task 2: Add atomic dispatch + enqueue RPC (idempotency + counters + task creation)
  - File: `supabase/migrations/20260402000200_claim_schedule_dispatch_and_enqueue_task.sql`
  - Action:
    - Create/replace a `public.claim_schedule_dispatch(...)` RPC that is **SECURITY DEFINER** and does, in one transaction:
      - AuthZ guard: only callable by `service_role` (explicit `auth.role()` check).
      - Explicit SQL grants:
        - `REVOKE ALL ON FUNCTION public.claim_schedule_dispatch(...) FROM PUBLIC, anon, authenticated;`
        - `GRANT EXECUTE ON FUNCTION public.claim_schedule_dispatch(...) TO service_role;`
      - Ensure `SET search_path = public`.
      - Lock the schedule row (`SELECT ... FOR UPDATE`) and validate schedule is active and not exhausted.
        - Use a conditional update to decrement `remaining_runs` only when `remaining_runs IS NULL OR remaining_runs > 0`.
        - If it cannot decrement, return `should_dispatch=false, reason='exhausted'` (do not rely on CHECK constraint errors).
      - `end_at` cutoff semantics for catch-up:
        - Apply the cutoff to the occurrence window, not to "now".
        - Treat an occurrence as eligible when `dispatch_window_start < end_at` (or `<=` — choose one and keep consistent).
        - If `dispatch_window_start` is past the cutoff, set `is_active=false` and return `should_dispatch=false, reason='ended'`.
      - Insert `user_schedule_dispatches` for `(schedule_id, dispatch_window_start)` (ON CONFLICT DO NOTHING).
      - If insert happened:
        - Insert the queued task into `public.tasks` using schedule fields:
          - `domain_action = user_schedules.task_type`
          - `topic = COALESCE(user_schedules.topic, 'Schedule')`
          - `payload = sanitized_task_payload || { scheduled metadata }`
            - Sanitize by removing/overriding forbidden keys from `task_payload`:
              - `scheduled`, `schedule_id`, `schedule_dispatch_id`, `cron_expression`, `timezone`, `trigger_time`, `topic`, `organization_id`, `user_id`, `status`
            - Always set/override scheduled metadata fields from the schedule + window.
            - Enforce invariants for `assistant.command` schedules:
              - Require non-empty `task_payload.command` (otherwise disable schedule + return `reason='invalid_payload'`).
              - Force `task_payload.confirmed=true`.
              - Default `task_payload.high_risk=true` when missing (unless we can prove read-only).
        - Attach `task_id` back onto `user_schedule_dispatches.task_id`.
        - Update schedule counters atomically:
          - `run_count = run_count + 1`
          - `remaining_runs = remaining_runs - 1` (only when not NULL)
          - If remaining hits 0 → `is_active=false`
      - Return a rich result such as:
        - `{ should_dispatch, reason, dispatch_id, task_id, remaining_runs_after, is_active_after }`
        - `reason` distinguishes: `already_claimed` vs `inactive` vs `exhausted` vs `ended`.
  - Notes:
    - This avoids “burned runs” (dispatch claimed/counters decremented but no queued task).
    - It also lets CronSchedulerService break early when exhausted/ended.

- [x] Task 3: Update CronSchedulerService to use enqueue RPC
  - File: `apps/agent/src/services/CronSchedulerService.ts`
  - Action:
    - Replace `claimDispatchWindow()` + manual `tasks.insert(...)` + `attachTaskToDispatch(...)` with a single `supabase.rpc('claim_schedule_dispatch', ...)` call.
    - Use returned `task_id` for audit logging when `should_dispatch=true`.
    - If `reason` is `exhausted`/`inactive`/`ended`, break the catch-up loop early for that schedule.
    - Keep catch-up cap and existing window computation (`computeNextRunFromCron`).
- [x] Task 4: Seed Schedule perimeter + onboarding (deterministic)
  - File: `supabase/migrations/20260402000300_seed_schedule_perimeter.sql`
  - Action:
    - Insert missing `agency_perimeters` rows for topic `Schedule` with tier `Controlled` for existing orgs (ON CONFLICT DO NOTHING).
    - Update `public.initialize_organization(...)` to also insert `agency_perimeters(topic_name='Schedule', tier='Controlled')` for the new org.
  - Notes: Background scheduled `assistant.command` tasks then won’t escalate by default.

- [x] Task 5: Fix Schedule UI defaults so created schedules actually execute
  - File: `apps/web/src/components/schedules/ScheduleManager.vue`
  - Action:
    - Change the default `task_type` from `schedule.execute` → `assistant.command`.
    - Add a required `command` input field in the create/edit form.
    - Persist `task_payload.command=<command>` and also `task_payload.command_text` + `task_payload.message_text`.
    - Persist `task_payload.confirmed=true` and default `task_payload.high_risk=true` (scheduled tasks are explicitly user-consented).
    - Add client-side validation for `task_type`:
      - Prefer a dropdown with allowed values: `assistant.command`, `channel.send`.
      - If a user types an unsupported `task_type`, block save and show a clear error.
  - Notes:
    - `schedule.execute` is not supported by the agent graph.
    - Without `task_payload.command`, scheduled `assistant.command` tasks will fail in `generalAgentNode` (“no user request”).

- [x] Task 6: Extend schedule creation paths to emit supported `task_type`
  - File: `apps/agent/src/services/scheduleParser.ts`
  - Action:
    - Ensure `taskType` is ALWAYS one of `ProcessorRegistry.getAllSupportedDomains()` (plus `assistant.command`).
      - If LLM/rules produce an unsupported `taskType`, coerce to `assistant.command`.
    - Replace current unsupported defaults:
      - `schedule.execute` → `assistant.command`
      - `reminder.send` → `assistant.command` (or `channel.send` only when channel context is available)
      - `email.check` / `calendar.check` / `report.send` → `assistant.command` (preferred) or an explicitly supported domain action.
    - Extend parse output to optionally include finite controls (`remaining_runs` and/or `end_at`) for phrases like “for 3 weeks”, “3 times”, etc.
    - Add strict cron validation (ranges: minute 0–59, hour 0–23, day 1–31, month 1–12, weekday 0–6) and reject invalid cron before persisting.
  - File: `supabase/migrations/20260402000400_pause_unsupported_user_schedules.sql` (recommended)
  - Action:
    - One-time cleanup to prevent repeated failures/catch-up floods:
      - Inactivate known-unsupported schedule task types by setting `is_active=false` and `last_error` (e.g. `schedule.execute`, `reminder.send`, `email.check`, `calendar.check`, `report.send`).
      - Backfill `task_payload.command` for existing `assistant.command` schedules when possible:
        - If `task_payload->>'command'` missing/blank and `command_text` exists, set `command = command_text`.
        - Else if `message_text` exists, set `command = message_text`.
      - Inactivate schedules that are invalid even after backfill:
        - `assistant.command` schedules with missing/blank `task_payload.command`.
        - Schedules with invalid timezone (not in `pg_timezone_names`).
        - Schedules with invalid cron format (not 5 fields, or fields out of range).
      - Normalize `topic` for client-created schedules (optional hardening): set `topic=NULL` or `topic='Schedule'`.
  - File: `apps/agent/src/processors/ScheduleManageProcessor.ts`
  - Action:
    - When creating a `channel.send` schedule from a messaging command, persist channel context in `task_payload` (at least `channel`, `thread_id`).
    - When creating an `assistant.command` schedule, persist `task_payload.command` (and `command_text`/`message_text`) so scheduled runs execute.
    - When schedule creation is confirmed (the schedule.manage confirmation flow), persist `task_payload.confirmed=true`.
    - For `assistant.command` schedules, default `task_payload.high_risk=true` unless the command is explicitly read-only.
    - Persist `remaining_runs`/`end_at` into the new schedule columns when the parser detects finite recurrence ("for 3 weeks").

- [x] Task 7: Add scheduling intent handler (“schedule request” tool)
  - Files:
    - `apps/agent/src/processors/AssistantCommandProcessor.ts` (scheduling intent detection + delegation)
    - `apps/agent/src/processors/ScheduleManageProcessor.ts` (schedule creation)
  - Action:
    - Detect scheduling intent (including one-off phrases like `in 2 hours` / `tomorrow`) and delegate to `schedule.manage`.
    - Create `public.user_schedules` rows with supported `task_type` (default `assistant.command`) and payload that will execute at run time:
      - `task_payload.command` (and also `command_text` / `message_text`)
      - `task_payload.confirmed=true` and `task_payload.high_risk=true`
    - Persist finite controls (`remaining_runs` / `end_at`) and `topic='Schedule'`.
    - Validate timezone (fallback to `UTC`) and rely on strict cron validation.
  - Notes: Schedule creation is treated as explicit user consent (no extra preview loop required).

- [ ] Task 8: (Optional but recommended) Regenerate Supabase TypeScript types after migrations
  - File: `packages/shared/src/database.types.ts`
  - Action: run type generation (Supabase MCP `generate_typescript_types`) and commit updated types.
  - Notes: Useful to avoid runtime shape drift when reading/writing new schedule columns.

- [x] Task 9: Tests
  - File: `apps/agent/src/services/CronSchedulerService.spec.ts`
  - Action: add cases for `remaining_runs` decrement + auto-deactivation + catch-up respecting run limits (mock RPC result).
  - File: `apps/agent/src/processors/ScheduleManageProcessor.spec.ts`
  - Action: update coverage for schedule creation payload + confirmation behavior.
  - File: `apps/agent/src/services/ScheduledTaskLifecycle.spec.ts`
  - Action: ensure completion sync does not reactivate inactive schedules.

### Acceptance Criteria

- [x] AC 1: Given a user asks “in 2 hours, do X”, when the assistant schedules it, then a `public.user_schedules` row is created with `task_type='assistant.command'`, `remaining_runs=1`, `is_active=true`, and `task_payload.command` is populated (and `command_text`/`message_text` are also populated).

- [x] AC 2: Given a user asks “send a good morning text every Monday for 3 weeks”, when the schedule is created, then `cron_expression` matches Mondays, `remaining_runs=3`, and `run_count=0`.

- [x] AC 3: Given a finite schedule is due and `remaining_runs=2`, when `CronSchedulerService` processes that dispatch window, then `claim_schedule_dispatch` returns `should_dispatch=true` **and** a `task_id`, exactly one `public.tasks` row is queued, `remaining_runs` becomes `1`, `run_count` becomes `1`, and subsequent cycles do not duplicate the same dispatch window.

- [x] AC 4: Given `remaining_runs=1`, when `claim_schedule_dispatch` succeeds for the final window, then `remaining_runs` becomes `0`, the schedule is set `is_active=false` (row kept for audit), and no further tasks are queued for that schedule.

- [x] AC 5: Given a user asks “send a message/email every day at 16:00 until I tell you to stop”, when the schedule is created, then `remaining_runs` is NULL and the schedule continues dispatching until paused/deleted.

- [x] AC 6: Given an org has no `agency_perimeters` row for topic `Schedule`, when the seed migration and onboarding RPC are applied, then `agency_perimeters(topic_name='Schedule', tier='Controlled')` exists and background scheduled tasks do not get stuck in `escalation` solely due to missing topic tier.

- [x] AC 7: Given a scheduled request is an outbound send, when the schedule is created, then scheduled task payload includes `confirmed=true` and `high_risk=true` so execution does not pause for confirmation at run time.

## Additional Context

### Dependencies

- Supabase migrations (extend `user_schedules`).
- Existing scheduler primitives: `CronSchedulerService`, `user_schedule_dispatches`, `computeNextRunFromCron`.
- General Agent node (adds a scheduling tool path).
- No new external dependencies required (use existing `Intl` timezone handling + existing Mistral client).

### Testing Strategy

- Unit tests (Vitest):
  - `CronSchedulerService` decrements `remaining_runs`, stops at 0, and remains idempotent per dispatch window.
  - Scheduling tool creates correct `user_schedules` rows (including topic + high-risk confirmation flags).
- Manual QA:
  - Create “every day at 16:00” schedule; verify task appears in `tasks` at the next tick.
  - Create “every Monday for 3 weeks”; verify it stops after 3 dispatches.

### Notes

- `schedule.execute` is not routed by the agent graph; any schedule that uses it will fail (`unsupported_domain`).
- Background scheduled `assistant.command` tasks are NOT treated as user-initiated commands → perimeter enforcement applies. Without a topic perimeter row, tasks default to Restricted and escalate.
- Automatic exhaustion uses `is_active=false` (audit/history). User-initiated deletes may still hard-delete schedules unless/until we introduce `deleted_at`.
- DST/timezones: `computeNextRunFromCron` uses `Intl.DateTimeFormat(timeZone=...)` and scans minute-by-minute; test at DST boundaries for “daily at 16:00” schedules.
