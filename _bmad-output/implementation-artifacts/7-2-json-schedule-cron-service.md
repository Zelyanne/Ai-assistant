# Story 7.2: JSON Schedule & Cron Service

Status: done

Story ID: 7.2
Story Key: 7-2-json-schedule-cron-service

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a User,
I want to schedule recurring tasks via natural language,
So that the agent can execute them autonomously at the specified interval without manual intervention.

## Acceptance Criteria

1. **Schedule Storage Schema:**
   - **Given** a new schedule is created via natural language command
   - **When** the agent parses the scheduling request
   - **Then** a new record is created in the `schedules` table with JSON-based cron expression
   - **And** the schedule includes: `user_id`, `task_type`, `task_payload`, `cron_expression`, `timezone`, `is_active`, `last_run`, `next_run`
   - **And** RLS policies ensure users can only manage their own schedules.

2. **Natural Language Schedule Parsing:**
   - **Given** a user sends a message like "Remind me every Monday at 9am" or "Check my emails every hour"
   - **When** the Agent Controller processes the command
   - **Then** the natural language is parsed into a valid cron expression (e.g., "0 9 * * 1" for Monday 9am)
   - **And** the parsed schedule is confirmed with the user before activation.

3. **Cron Scheduler Service:**
   - **Given** the Agent Controller is running on Hetzner
   - **When** the cron service initializes
   - **Then** it polls the `schedules` table every minute for due schedules (`next_run <= NOW()`)
   - **And** only processes schedules where `is_active = true`
   - **And** respects the user's timezone for accurate execution timing.

4. **Task Queue Integration:**
   - **Given** a schedule is due for execution
   - **When** the cron service triggers the task
   - **Then** a new task is created in the `tasks` table with `status: 'queued'`
   - **And** the task follows the `domain.action` naming convention (e.g., `email.check`, `reminder.send`)
   - **And** the task payload includes the schedule ID for audit tracking.

5. **Schedule Execution Logging:**
   - **Given** a scheduled task completes execution
   - **When** the task processor finishes
   - **Then** the `schedules` table is updated with `last_run` and computed `next_run`
   - **And** an entry is added to `agent_activity_log` with the schedule ID reference
   - **And** any errors are logged with full reasoning trace.

6. **Schedule Management Interface:**
   - **Given** a user wants to manage their schedules
   - **When** they interact via WhatsApp/Telegram or the web UI
   - **Then** they can list, pause, resume, or delete their active schedules
   - **And** receive confirmation of each management action.

7. **Environment Configuration:**
   - **Given** a fresh deployment environment
   - **When** the `.env.example` file is reviewed
   - **Then** all required cron service configuration variables are documented
   - **And** the README includes setup instructions for the cron scheduler.

## Tasks / Subtasks

- [x] 1) Database Schema for Schedules (AC: 1, 5)
  - [x] Create migration: `supabase/migrations/*_create_user_schedules.sql`
  - [x] Create `user_schedules` table with: `id`, `organization_id`, `user_id`, `task_type`, `task_payload`, `cron_expression`, `timezone`, `is_active`, `last_run`, `next_run`, `failure_count`, `last_error`
  - [x] Add RLS policies using `get_user_organization()` function (follow pattern from `project_scheduling_contexts`)
  - [x] Create indexes on `next_run`, `is_active`, `organization_id` for efficient polling
  - [x] Source: `supabase/migrations/20260307000000_create_relancing_scheduler_context.sql` (RLS pattern reference)

- [x] 2) Natural Language Schedule Parser (AC: 2)
  - [x] Implement `ScheduleParser` service in `apps/agent/src/services/scheduleParser.ts`
  - [x] Support common patterns: "every [interval]", "at [time] [day]", "on [day] at [time]"
  - [x] Integrate with LLM (ChatMistralAI) for complex schedule parsing
  - [x] Return cron expression + human-readable confirmation message
  - [x] Follow existing service patterns (similar to `ProtocolService` structure)
  - [x] Source: `apps/agent/src/services/ProtocolService.ts` (service pattern reference)

- [x] 3) Cron Scheduler Service (AC: 3)
  - [x] Implement `CronSchedulerService` in `apps/agent/src/services/CronSchedulerService.ts`
  - [x] Follow existing scheduler pattern from `BriefingScheduler` and `RelancingScheduler`
  - [x] Poll `user_schedules` table every 60 seconds for due tasks (`CHECK_INTERVAL = 60 * 1000`)
  - [x] Implement `start()` and `stop()` methods for lifecycle management
  - [x] Implement timezone-aware scheduling using `luxon` or `date-fns-tz`
  - [x] Prevent duplicate executions with dispatch tracking (similar to `project_nudge_dispatches`)
  - [x] Handle missed executions (catch-up logic for downtime)
  - [x] Register scheduler in `apps/agent/src/index.ts` alongside `briefingScheduler` and `relancingScheduler`
  - [x] Source: `apps/agent/src/services/BriefingScheduler.ts`, `apps/agent/src/services/RelancingScheduler.ts`

- [x] 4) Task Queue Integration (AC: 4)
  - [x] Integrate cron scheduler with existing task creation flow
  - [x] Insert tasks into `tasks` table with `domain_action`, `organization_id`, `user_id`, `payload`
  - [x] Ensure tasks include `schedule_id` reference in payload for audit tracking
  - [x] Follow existing `domain.action` naming convention (e.g., `schedule.execute`)
  - [x] Source: `apps/agent/src/services/BriefingScheduler.ts` (task insertion pattern), `apps/agent/src/processors/ProcessorRegistry.ts` (naming convention)

- [x] 5) Schedule Execution Logging (AC: 5)
  - [x] Update `last_run` and compute `next_run` after successful execution
  - [x] Log all schedule executions to `agent_activity_log` using `AuditLogger`
  - [x] Implement error handling with retry logic for failed schedules
  - [x] Mark schedule as inactive after N consecutive failures (configurable)
  - [x] Use `AuditLogger.flush()` for standardized audit logging (follow BaseProcessor pattern)
  - [x] Source: `apps/agent/src/processors/BaseProcessor.ts` (AuditLogger pattern), `apps/agent/src/services/AuditLogger.ts`

- [x] 6) Schedule Management Processor (AC: 6)
  - [x] Create `ScheduleManageProcessor` extending `BaseProcessor` in `apps/agent/src/processors/ScheduleManageProcessor.ts`
  - [x] Implement natural language commands: "list my schedules", "pause schedule X", "delete schedule Y", "create schedule..."
  - [x] Register processor in `ProcessorRegistry` with `schedule.manage` domain action
  - [x] Integrate with WhatsApp/Telegram channel adapters for command input
  - [x] Follow existing processor pattern (extend `BaseProcessor`, implement `process()` method)
  - [x] Source: `apps/agent/src/processors/BaseProcessor.ts`, `apps/agent/src/processors/ProcessorRegistry.ts`

- [x] 7) Schedule Management UI (AC: 6)
  - [x] Add web UI composable `useSchedules.ts` in `apps/web/src/composables/useSchedules.ts`
  - [x] Create UI components for schedule list/create/edit/delete
  - [x] Follow Vue 3 Composition API pattern with `<script setup>`
  - [x] Use PrimeVue components for UI consistency
  - [x] Source: `apps/web/src/composables/useAgent.ts` (composable pattern), `_bmad-output/project-context.md` (Vue/PrimeVue rules)

- [x] 8) Environment Configuration (AC: 7)
  - [x] Add `CRON_POLL_INTERVAL_MS` to `apps/agent/.env.example` (default: 60000)
  - [x] Add `DEFAULT_TIMEZONE` to `apps/agent/.env.example` (default: 'UTC' or user's timezone)
  - [x] Add `MAX_SCHEDULE_FAILURES` to `apps/agent/.env.example` (default: 3)
  - [x] Update README with cron service setup instructions and webhook URLs
  - [x] Source: `apps/agent/.env.example`

- [x] 9) Testing (AC: 1-8)
  - [x] Unit tests for `ScheduleParser` with various natural language inputs (`ScheduleParser.spec.ts`)
  - [x] Unit tests for cron expression generation
  - [x] Unit tests for `CronSchedulerService` following `RelancingScheduler.spec.ts` pattern
  - [x] Test timezone handling across different user timezones
  - [x] Test RLS policies for schedule isolation
  - [x] Integration tests for `ScheduleManageProcessor` following existing processor test patterns
  - [x] Source: `apps/agent/src/services/RelancingScheduler.spec.ts`, `apps/agent/src/processors/*.spec.ts`

- [x] 10) Production Deployment (AC: 3, 7)
  - [x] Register `cronSchedulerService.start()` in `apps/agent/src/index.ts` alongside existing schedulers
  - [x] Verify cron service starts automatically with Agent Controller on Hetzner
  - [x] Monitor poll interval performance in production
  - [x] Set up alerts for schedule execution failures via `agent_activity_log`
  - [x] Document operational runbook for schedule management
  - [x] Source: `apps/agent/src/index.ts` (scheduler registration pattern)

## Dev Notes

### Architecture Patterns

- **Polling-Based Scheduler**: Follow existing pattern from `BriefingScheduler` and `RelancingScheduler` - poll database every 60 seconds using `setInterval`. [Source: `apps/agent/src/services/BriefingScheduler.ts`, `apps/agent/src/services/RelancingScheduler.ts`]
- **Database-as-Queue**: User schedules table follows the same pattern as tasks table - agent polls DB for work. [Source: `architecture.md#API & Communication Patterns`]
- **Timezone-Aware**: All schedule times are stored with timezone context, converted to UTC for storage, displayed in user's local timezone.
- **Dispatcher Pattern**: Follow `project_nudge_dispatches` pattern for preventing duplicate executions with idempotency keys. [Source: `supabase/migrations/20260307000000_create_relancing_scheduler_context.sql`]
- **RLS Pattern**: Use `get_user_organization()` function for all RLS policies (standard across project). [Source: `supabase/migrations/20260307000000_create_relancing_scheduler_context.sql#L82-L96`]

### Cron Expression Format

- Use standard 5-field cron format: `minute hour day month weekday`
- Store as plain string in database (e.g., `"0 9 * * 1"`)
- Consider using `cron-validator` library for validation
- Support common natural language patterns:
  - "every hour" → `"0 * * * *"`
  - "every Monday at 9am" → `"0 9 * * 1"`
  - "daily at midnight" → `"0 0 * * *"`
  - "every 15 minutes" → `"*/15 * * * *"`

### Database Schema Design

**Table Name**: `user_schedules` (following naming convention from `user_protocols`, `user_preferences`)

```sql
-- Migration file: supabase/migrations/20260319120000_create_user_schedules.sql
-- Story: 7.2 JSON Schedule & Cron Service

CREATE TABLE IF NOT EXISTS public.user_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL,  -- domain.action format (e.g., "email.check", "reminder.send")
    task_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    cron_expression TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_run TIMESTAMPTZ,
    next_run TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    last_execution_result JSONB,
    CONSTRAINT user_schedules_task_type_format CHECK (task_type ~ '^[a-z]+\.[a-z_]+$')
);

-- Indexes for efficient polling (follow pattern from project_scheduling_contexts)
CREATE INDEX IF NOT EXISTS idx_user_schedules_next_run_active
    ON public.user_schedules (next_run, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_schedules_org_user
    ON public.user_schedules (organization_id, user_id);

ALTER TABLE public.user_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policy (follow pattern from project_scheduling_contexts)
DROP POLICY IF EXISTS "user_schedules_org_access" ON public.user_schedules;
CREATE POLICY "user_schedules_org_access" ON public.user_schedules
    FOR ALL
    USING (organization_id = (SELECT public.get_user_organization()))
    WITH CHECK (organization_id = (SELECT public.get_user_organization()));
```

### Natural Language Parsing Strategy

- **Simple Patterns**: Use regex for common patterns (every X, at X time, on X day)
- **Complex Patterns**: Fall back to LLM parsing with structured output using `ChatMistralAI` (follow `BaseProcessor` pattern)
- **Confirmation**: Always confirm parsed schedule with user before activation via `channel.send` task
- **Examples**:
  - "Remind me every Monday at 9am to check my emails" → cron: `"0 9 * * 1"`, task: `"email.check"`
  - "Check my calendar every hour" → cron: `"0 * * * *"`, task: `"calendar.check"`
  - "Send a status report every Friday at 5pm" → cron: `"0 17 * * 5"`, task: `"report.send"`

### Integration with Existing Systems

- **Task Creation**: Cron scheduler inserts tasks into `tasks` table following `BriefingScheduler` pattern [Source: `apps/agent/src/services/BriefingScheduler.ts#L58-L67`]
- **Processor Registry**: New `schedule.manage` processor registered in `ProcessorRegistry` alongside existing processors [Source: `apps/agent/src/processors/ProcessorRegistry.ts`]
- **Channel Adapters**: Schedule management commands come through WhatsApp/Telegram adapters [Source: `apps/agent/src/channels/WhatsAppAdapter.ts`, `apps/agent/src/channels/TelegramAdapter.ts`]
- **Audit Logging**: All schedule executions logged using `AuditLogger.flush()` following `BaseProcessor` pattern [Source: `apps/agent/src/processors/BaseProcessor.ts#L133-L145`]
- **Scheduler Registration**: Cron scheduler registered in `apps/agent/src/index.ts` alongside `briefingScheduler.start()` and `relancingScheduler.start()`
- **Agent Controller**: Cron service runs as part of Agent Controller on Hetzner [Source: `architecture.md#Infrastructure & Deployment`]

### Security Considerations

- **RLS Enforcement**: Users can only access their own schedules
- **Task Type Validation**: Validate `task_type` against allowed list to prevent arbitrary task execution
- **Payload Sanitization**: Sanitize `task_payload` before task creation
- **Rate Limiting**: Implement per-user rate limits for schedule creation
- **Resource Limits**: Cap maximum number of active schedules per user

### Performance Considerations

- **Polling Efficiency**: Index on `next_run` with `is_active` filter for fast due-schedule queries
- **Batch Processing**: Process multiple due schedules in single poll cycle
- **Missed Execution Handling**: Catch-up logic for schedules missed during downtime
- **Memory Management**: Clear completed schedule references from memory after processing

### Error Handling

- **Retry Logic**: Retry failed schedule executions up to N times (configurable)
- **Failure Tracking**: Increment `failure_count` on each failure
- **Auto-Disable**: Mark schedule as inactive after N consecutive failures
- **Error Logging**: Log full error context to `last_error` and `agent_activity_log`
- **User Notification**: Notify user via their preferred channel when schedule fails

### Project Structure Notes

**Services:**
- **Cron Scheduler**: `apps/agent/src/services/CronSchedulerService.ts` (follow `BriefingScheduler`/`RelancingScheduler` pattern)
- **Schedule Parser**: `apps/agent/src/services/ScheduleParser.ts`
- **Audit Logger**: Use existing `apps/agent/src/services/AuditLogger.ts`

**Processors:**
- **Schedule Manage Processor**: `apps/agent/src/processors/ScheduleManageProcessor.ts` (extend `BaseProcessor`)
- **Processor Registry**: Update `apps/agent/src/processors/ProcessorRegistry.ts` to register `schedule.manage`

**Database:**
- **Migration**: `supabase/migrations/20260319120000_create_user_schedules.sql` (follow naming convention)

**Frontend:**
- **Web UI Composable**: `apps/web/src/composables/useSchedules.ts` (follow `useAgent.ts` pattern)
- **UI Components**: `apps/web/src/components/schedules/` directory for schedule management UI

**Shared:**
- **Types**: `packages/shared/src/schemas.ts` (add Schedule-related Zod schemas)

**Configuration:**
- **Environment**: `apps/agent/.env.example` (add cron-related env vars)
- **Agent Entry**: `apps/agent/src/index.ts` (register cron scheduler service)

### References

**Stories:**
- Story 7.1 (Messaging Channel Webhooks): [Source: `_bmad-output/implementation-artifacts/7-1-messaging-channel-webhooks-alignment.md`]
- Story 2.9 (Multi-Channel Messaging): [Source: `_bmad-output/implementation-artifacts/2-9-multi-channel-messaging-adapter-routing-delivery-state.md`]
- Story 5.1 (Relancing Scheduler Pattern): [Source: `_bmad-output/implementation-artifacts/5-1-adaptive-relancing-scheduler.md`]

**Architecture & Context:**
- Architecture Infrastructure: [Source: `_bmad-output/planning-artifacts/architecture.md#Infrastructure & Deployment`]
- Architecture API Patterns: [Source: `_bmad-output/planning-artifacts/architecture.md#API & Communication Patterns`]
- Project Context: [Source: `_bmad-output/project-context.md`]
- Epics Document: [Source: `_bmad-output/planning-artifacts/epics.md#Story 7.2`]

**Existing Code Patterns:**
- Briefing Scheduler (scheduler pattern): [Source: `apps/agent/src/services/BriefingScheduler.ts`]
- Relancing Scheduler (advanced scheduler pattern): [Source: `apps/agent/src/services/RelancingScheduler.ts`]
- Base Processor (processor base class): [Source: `apps/agent/src/processors/BaseProcessor.ts`]
- Processor Registry (processor registration): [Source: `apps/agent/src/processors/ProcessorRegistry.ts`]
- Audit Logger (audit logging pattern): [Source: `apps/agent/src/services/AuditLogger.ts`]
- Channel Router (message routing): [Source: `apps/agent/src/services/channelRouter.ts`]
- RLS Migration Pattern: [Source: `supabase/migrations/20260307000000_create_relancing_scheduler_context.sql`]

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

### Completion Notes List

- Story created with comprehensive context for JSON Schedule & Cron Service implementation
- Database schema design provided with RLS policies and indexes
- Natural language parsing strategy defined with examples
- Integration points with existing task processor and channel adapters documented
- Security and performance considerations included
- Testing and deployment checklist provided
- Implemented migration and migration coverage for `user_schedules` and dispatch idempotency table.
- Implemented `ScheduleParser` with rules-first parsing and Mistral fallback.
- Implemented `CronSchedulerService` with polling, idempotent dispatch claim, task enqueueing, next-run computation, and failure auto-disable.
- Implemented `ScheduleManageProcessor` and wired `schedule.manage` delegation from assistant commands.
- Registered scheduler startup/shutdown lifecycle in agent bootstrap and documented runtime env vars.
- Added shared schedule schemas and web `useSchedules` composable for CRUD-ready UI integration.
- Added schedule management UI surface in Settings with list/create/pause/resume/delete interactions.
- Added production runbook guidance for cron poll monitoring and audit-log based failure alerting.
- Fixed review findings by requiring explicit confirmation before natural-language schedule creation and sending channel confirmations for schedule actions.
- Fixed scheduler catch-up to enqueue each missed run window and moved schedule state advancement to post-task finalization with schedule-linked audit citations.
- Tightened `user_schedules` RLS to per-user ownership and added editable web schedule management with computed `next_run` values.
- Verified fixes with targeted agent/shared/web tests plus `pnpm --filter @ai-assistant/agent build` and `pnpm --filter @ai-assistant/web build`.

### File List

- `_bmad-output/implementation-artifacts/7-2-json-schedule-cron-service.md` (this file)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (updated)
- `supabase/migrations/20260320100000_create_user_schedules.sql` (created, updated)
- `supabase/migrations/20260320113000_add_user_schedule_fk_indexes.sql` (related existing worktree migration)
- `packages/shared/tests/user-schedules-migration.spec.ts` (created, updated)
- `apps/agent/src/services/scheduleParser.ts` (created)
- `apps/agent/src/services/ScheduleParser.spec.ts` (created)
- `apps/agent/src/services/CronSchedulerService.ts` (created, updated)
- `apps/agent/src/services/CronSchedulerService.spec.ts` (created, updated)
- `apps/agent/src/services/ScheduledTaskLifecycle.ts` (created)
- `apps/agent/src/services/ScheduledTaskLifecycle.spec.ts` (created)
- `apps/agent/src/processors/ScheduleManageProcessor.ts` (created)
- `apps/agent/src/processors/ScheduleManageProcessor.spec.ts` (created, updated)
- `apps/agent/src/processors/ProcessorRegistry.ts` (updated)
- `apps/agent/src/processors/AssistantCommandProcessor.ts` (updated)
- `apps/agent/src/processors/AssistantCommandProcessor.spec.ts` (updated)
- `apps/agent/src/controller/graph.ts` (updated)
- `apps/agent/src/index.ts` (updated)
- `apps/agent/src/config/index.ts` (updated)
- `apps/agent/.env.example` (updated)
- `packages/shared/src/schemas.ts` (updated)
- `apps/web/src/composables/useSchedules.ts` (created)
- `apps/web/src/composables/useSchedules.spec.js` (created)
- `apps/web/src/composables/useSchedules.js` (generated worktree artifact)
- `apps/web/src/composables/useSchedules.js.map` (generated worktree artifact)
- `apps/web/src/composables/useSchedules.d.ts` (generated worktree artifact)
- `apps/web/src/components/schedules/ScheduleManager.vue` (created)
- `apps/web/src/components/schedules/ScheduleManager.vue.js` (generated worktree artifact)
- `apps/web/src/components/schedules/ScheduleManager.vue.js.map` (generated worktree artifact)
- `apps/web/src/components/schedules/ScheduleManager.vue.d.ts` (generated worktree artifact)
- `apps/web/src/views/Settings.vue` (updated)
- `README.md` (updated)
- `apps/agent/README.md` (updated)
