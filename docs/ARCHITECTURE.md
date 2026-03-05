# Architecture Overview

## System Context

The platform is split into three runtime layers:

- `apps/web`: operator-facing UI for onboarding, controls, and task creation.
- `apps/agent`: backend process that listens for queued tasks and executes agent workflows.
- `supabase`: source of truth for auth, org data, tasks, and realtime event delivery.

Shared contracts live in `packages/shared`.

## Runtime Components

### Web App (`apps/web`)

- Vue 3 + Vite + Pinia + PrimeVue.
- Uses Supabase client access from `apps/web/src/services/supabase.ts`.
- Creates task records that drive asynchronous agent execution.

### Agent Service (`apps/agent`)

- Express API in `apps/agent/src/index.ts`.
- Subscribes to Supabase realtime inserts on `public.tasks` (`status=queued`).
- Invokes LangGraph controller (`apps/agent/src/controller/graph.ts`) to process domain actions.
- Handles OAuth/token flows and periodic ingestion/scheduling jobs.

### Shared Package (`packages/shared`)

- Zod schemas, DB types, and utility functions used across apps.
- Ensures consistent contracts between frontend and backend.

## Data and Control Flow

1. User action in `apps/web` inserts a queued task into `public.tasks`.
2. Supabase Realtime pushes an insert event to `apps/agent`.
3. Agent resolves the correct processor and executes workflow logic.
4. Results and status updates are persisted back to Supabase.
5. Web app reads task and domain tables to render updated state.

## Database Evolution

- All schema changes are migration-based under `supabase/migrations`.
- Migration set includes core schema, auth/onboarding fixes, and security hardening (RLS/perimeter controls).
- Shared tests in `packages/shared/tests` validate migration expectations and schema constraints.

## Observability

- Langfuse is the primary tracing backend when enabled.
- Legacy LangSmith flags exist for rollback compatibility.
- Task execution metadata includes task id, org id, and domain action for filtering.
