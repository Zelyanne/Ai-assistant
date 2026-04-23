-- Migration: Add finite recurrence controls to user_schedules
-- Story: Scheduled Agent Requests: One-off + Finite Recurrence
-- Created: 2026-04-02

ALTER TABLE public.user_schedules
  ADD COLUMN IF NOT EXISTS remaining_runs INTEGER NULL,
  ADD COLUMN IF NOT EXISTS run_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS topic TEXT NULL;

DO $$ BEGIN
  ALTER TABLE public.user_schedules
    ADD CONSTRAINT user_schedules_remaining_runs_nonnegative
      CHECK (remaining_runs IS NULL OR remaining_runs >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.user_schedules
    ADD CONSTRAINT user_schedules_run_count_nonnegative
      CHECK (run_count >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Harden client-side schedule creation/update:
-- - Limit topic to NULL or 'Schedule'
-- - Limit supported task types to an allowlist (service_role bypasses RLS)
DROP POLICY IF EXISTS "user_schedules_org_access" ON public.user_schedules;
CREATE POLICY "user_schedules_org_access" ON public.user_schedules
  FOR ALL
  USING (
    organization_id = (SELECT public.get_user_organization())
    AND user_id = (SELECT auth.uid())
  )
  WITH CHECK (
    organization_id = (SELECT public.get_user_organization())
    AND user_id = (SELECT auth.uid())
    AND (topic IS NULL OR topic = 'Schedule')
    AND (task_type IN ('assistant.command', 'channel.send'))
  );
