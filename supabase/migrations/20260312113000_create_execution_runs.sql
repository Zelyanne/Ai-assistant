-- Migration: execution run ledger for planner-worker orchestration
-- Story: Planner-Orchestrated Google Workspace Capability Workers

CREATE TABLE IF NOT EXISTS public.execution_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL UNIQUE REFERENCES public.tasks(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'processing', 'completed', 'failed', 'escalated', 'blocked')),
    plan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ledger_markdown TEXT NOT NULL DEFAULT '',
    current_step_key TEXT,
    current_worker_type TEXT,
    tool_policy_version TEXT NOT NULL,
    idempotency_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT execution_runs_version_nonnegative CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS idx_execution_runs_org_status
    ON public.execution_runs (organization_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_runs_task
    ON public.execution_runs (task_id);

CREATE INDEX IF NOT EXISTS idx_execution_runs_org_updated
    ON public.execution_runs (organization_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_execution_runs_set_updated_at ON public.execution_runs;
CREATE TRIGGER trg_execution_runs_set_updated_at
    BEFORE UPDATE ON public.execution_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.execution_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "execution_runs_org_access" ON public.execution_runs;
CREATE POLICY "execution_runs_org_access" ON public.execution_runs
    FOR ALL
    TO authenticated
    USING (
        organization_id = public.get_user_organization()
        AND EXISTS (
            SELECT 1
            FROM public.tasks t
            WHERE t.id = execution_runs.task_id
              AND t.organization_id = execution_runs.organization_id
        )
    )
    WITH CHECK (
        organization_id = public.get_user_organization()
        AND EXISTS (
            SELECT 1
            FROM public.tasks t
            WHERE t.id = execution_runs.task_id
              AND t.organization_id = execution_runs.organization_id
        )
    );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'execution_runs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.execution_runs;
    END IF;
END $$;
