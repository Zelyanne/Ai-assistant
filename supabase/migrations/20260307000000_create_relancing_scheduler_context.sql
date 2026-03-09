-- Migration: Relancing project setup and adaptive scheduler persistence
-- Story: 5.1 Adaptive Relancing Scheduler

DO $$
BEGIN
    CREATE TYPE public.project_setup_status AS ENUM ('incomplete', 'complete');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.project_scheduling_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_name TEXT NOT NULL DEFAULT '',
    deadline TIMESTAMPTZ,
    setup_status public.project_setup_status NOT NULL DEFAULT 'incomplete',
    scheduler_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    next_nudge_at TIMESTAMPTZ,
    last_nudge_at TIMESTAMPTZ,
    blocker_active BOOLEAN NOT NULL DEFAULT false,
    blocker_summary TEXT,
    blocker_reported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT project_scheduling_contexts_project_name_non_empty CHECK (setup_status = 'incomplete' OR length(btrim(project_name)) > 0),
    CONSTRAINT project_scheduling_contexts_deadline_required CHECK (setup_status = 'incomplete' OR deadline IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.project_member_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_context_id UUID NOT NULL REFERENCES public.project_scheduling_contexts(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    member_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    member_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT project_member_assignments_member_name_non_empty CHECK (length(btrim(member_name)) > 0),
    CONSTRAINT project_member_assignments_unique_member UNIQUE (project_context_id, member_name)
);

CREATE TABLE IF NOT EXISTS public.project_nudge_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_context_id UUID NOT NULL REFERENCES public.project_scheduling_contexts(id) ON DELETE CASCADE,
    member_assignment_id UUID NOT NULL REFERENCES public.project_member_assignments(id) ON DELETE CASCADE,
    nudge_window_start TIMESTAMPTZ NOT NULL,
    nudge_window_end TIMESTAMPTZ NOT NULL,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    reason_code TEXT NOT NULL CHECK (
        reason_code IN (
            'missing_required_fields',
            'deadline_urgency',
            'blocker_paused',
            'emergency_brake',
            'duplicate_prevented'
        )
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT project_nudge_dispatches_idempotency UNIQUE (
        organization_id,
        project_context_id,
        member_assignment_id,
        nudge_window_start
    )
);

CREATE INDEX IF NOT EXISTS idx_project_scheduling_contexts_org_status_next
    ON public.project_scheduling_contexts (organization_id, setup_status, next_nudge_at);

CREATE INDEX IF NOT EXISTS idx_project_member_assignments_context_active
    ON public.project_member_assignments (project_context_id, is_active);

CREATE INDEX IF NOT EXISTS idx_project_nudge_dispatches_org_created
    ON public.project_nudge_dispatches (organization_id, created_at DESC);

ALTER TABLE public.project_scheduling_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_member_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_nudge_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_scheduling_contexts_org_access" ON public.project_scheduling_contexts;
CREATE POLICY "project_scheduling_contexts_org_access" ON public.project_scheduling_contexts
    FOR ALL
    USING (organization_id = (SELECT public.get_user_organization()))
    WITH CHECK (organization_id = (SELECT public.get_user_organization()));

DROP POLICY IF EXISTS "project_member_assignments_org_access" ON public.project_member_assignments;
CREATE POLICY "project_member_assignments_org_access" ON public.project_member_assignments
    FOR ALL
    USING (organization_id = (SELECT public.get_user_organization()))
    WITH CHECK (organization_id = (SELECT public.get_user_organization()));

DROP POLICY IF EXISTS "project_nudge_dispatches_org_access" ON public.project_nudge_dispatches;
CREATE POLICY "project_nudge_dispatches_org_access" ON public.project_nudge_dispatches
    FOR ALL
    USING (organization_id = (SELECT public.get_user_organization()))
    WITH CHECK (organization_id = (SELECT public.get_user_organization()));
