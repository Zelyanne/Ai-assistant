-- Migration: User schedules and cron dispatch tracking
-- Story: 7.2 JSON Schedule & Cron Service

CREATE TABLE IF NOT EXISTS public.user_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL,
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
    CONSTRAINT user_schedules_task_type_format CHECK (task_type ~ '^[a-z]+\.[a-z_]+$')
);

CREATE TABLE IF NOT EXISTS public.user_schedule_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    schedule_id UUID NOT NULL REFERENCES public.user_schedules(id) ON DELETE CASCADE,
    dispatch_window_start TIMESTAMPTZ NOT NULL,
    dispatch_window_end TIMESTAMPTZ NOT NULL,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_schedule_dispatches_idempotency UNIQUE (schedule_id, dispatch_window_start)
);

CREATE INDEX IF NOT EXISTS idx_user_schedules_next_run_active
    ON public.user_schedules (next_run)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_schedules_active
    ON public.user_schedules (is_active);

CREATE INDEX IF NOT EXISTS idx_user_schedules_org_user
    ON public.user_schedules (organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_user_schedule_dispatches_schedule_window
    ON public.user_schedule_dispatches (schedule_id, dispatch_window_start);

ALTER TABLE public.user_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_schedule_dispatches ENABLE ROW LEVEL SECURITY;

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
    );

DROP POLICY IF EXISTS "user_schedule_dispatches_org_access" ON public.user_schedule_dispatches;
CREATE POLICY "user_schedule_dispatches_org_access" ON public.user_schedule_dispatches
    FOR ALL
    USING (
        organization_id = (SELECT public.get_user_organization())
        AND EXISTS (
            SELECT 1
            FROM public.user_schedules schedules
            WHERE schedules.id = schedule_id
              AND schedules.organization_id = (SELECT public.get_user_organization())
              AND schedules.user_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        organization_id = (SELECT public.get_user_organization())
        AND EXISTS (
            SELECT 1
            FROM public.user_schedules schedules
            WHERE schedules.id = schedule_id
              AND schedules.organization_id = (SELECT public.get_user_organization())
              AND schedules.user_id = (SELECT auth.uid())
        )
    );
