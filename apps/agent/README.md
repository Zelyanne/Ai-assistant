# AI Assistant Agent

Backend worker and API service for the AI Assistant platform.

## Responsibilities

- Exposes operational endpoints such as `GET /health` and OAuth/token routes.
- Subscribes to Supabase Realtime on `public.tasks` for `status=queued` inserts.
- Executes the LangGraph workflow for each queued task.
- Runs Google ingestion jobs and briefing scheduling loops.

Main entrypoint: `apps/agent/src/index.ts`.

## Local Development

```bash
pnpm --filter @ai-assistant/agent dev
```

Useful commands:

- `pnpm --filter @ai-assistant/agent build`
- `pnpm --filter @ai-assistant/agent test`
- `pnpm --filter @ai-assistant/agent lint`

## Environment

Use `apps/agent/.env.example` as a template and create `apps/agent/.env` locally.

Required groups:

- Supabase: URL + service role key
- LLM provider keys and default model
- Google OAuth client values
- 32-character `ENCRYPTION_SECRET_PROJECT_GOOGLE_ASSITANT`
- Optional tracing controls (Langfuse, legacy LangSmith)
- Scheduler controls such as `EOD_TRIGGER_TIME_UTC_PROJECT_GOOGLE_ASSITANT` (UTC `HH:MM`, default `23:00`) and optional per-org overrides via `EOD_TRIGGER_TIME_BY_ORG_JSON_PROJECT_GOOGLE_ASSITANT`

## Observability

- Primary tracing path is Langfuse (`ENABLE_LANGFUSE_TRACING_PROJECT_GOOGLE_ASSITANT=true`).
- Legacy LangSmith flags remain for rollback compatibility.
- Task execution metadata includes task/org/action context for filtering.

## Schedule Cron Runbook

The user schedule cron loop starts with the agent process and polls on `CRON_POLL_INTERVAL_MS_PROJECT_GOOGLE_ASSITANT`.

### Production checks

- Confirm boot logs include `[CronSchedulerService] Starting cron scheduler monitor...`.
- Confirm env values are present in deployment: `CRON_POLL_INTERVAL_MS_PROJECT_GOOGLE_ASSITANT`, `DEFAULT_TIMEZONE_PROJECT_GOOGLE_ASSITANT`, `MAX_SCHEDULE_FAILURES_PROJECT_GOOGLE_ASSITANT`.
- Validate queueing by checking fresh `tasks` rows with `payload.schedule_id` for due schedules.

### Poll interval monitoring

- Baseline query for active due schedules (run periodically in Supabase SQL editor):

```sql
select count(*) as due_active_schedules
from public.user_schedules
where is_active = true
  and next_run <= now();
```

- If this value keeps growing across multiple polling windows, the scheduler is lagging.

### Failure alerting via `agent_activity_log`

- Alert trigger query (last 15 minutes):

```sql
select created_at, organization_id, action_taken, reasoning_trace
from public.agent_activity_log
where action_taken in (
  'schedule_execution_failed',
  'schedule_execution_disabled_after_failures'
)
  and created_at >= now() - interval '15 minutes'
order by created_at desc;
```

- Recommended alert policy:
  - Warning: `schedule_execution_failed` >= 5 in 15 minutes (per organization).
  - Critical: any `schedule_execution_disabled_after_failures` event.

### Incident steps

1. Check latest `agent_activity_log` schedule failure rows and extract `schedule.id` from reasoning trace.
2. Inspect corresponding `user_schedules` row (`failure_count`, `last_error`, `is_active`, `next_run`).
3. Fix downstream cause (tool availability, task payload, credentials), then reactivate schedule if disabled.
4. Verify recovery by confirming new queued task + next successful audit dispatch event.
