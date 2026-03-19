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
- 32-character `ENCRYPTION_SECRET`
- Optional tracing controls (Langfuse, legacy LangSmith)
- Scheduler controls such as `EOD_TRIGGER_TIME_UTC` (UTC `HH:MM`, default `23:00`) and optional per-org overrides via `EOD_TRIGGER_TIME_BY_ORG_JSON`

## Observability

- Primary tracing path is Langfuse (`ENABLE_LANGFUSE_TRACING=true`).
- Legacy LangSmith flags remain for rollback compatibility.
- Task execution metadata includes task/org/action context for filtering.
