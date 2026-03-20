-- Migration: Add missing FK indexes for user schedules
-- Story: 7.2 JSON Schedule & Cron Service hardening

CREATE INDEX IF NOT EXISTS idx_user_schedules_user_id
    ON public.user_schedules (user_id);

CREATE INDEX IF NOT EXISTS idx_user_schedule_dispatches_organization_id
    ON public.user_schedule_dispatches (organization_id);

CREATE INDEX IF NOT EXISTS idx_user_schedule_dispatches_task_id
    ON public.user_schedule_dispatches (task_id)
    WHERE task_id IS NOT NULL;
