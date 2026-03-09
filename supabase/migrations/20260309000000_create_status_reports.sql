-- Migration: Automated status report persistence with idempotency and traceable sections
-- Story: 5.4 Automated Status Aggregation & Reporting

CREATE TABLE IF NOT EXISTS public.status_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    source_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,

    report_period_start TIMESTAMPTZ NOT NULL,
    report_period_end TIMESTAMPTZ NOT NULL,
    idempotency_key TEXT NOT NULL,

    narrative TEXT NOT NULL,
    wins JSONB NOT NULL DEFAULT '[]'::jsonb,
    blockers_risks JSONB NOT NULL DEFAULT '[]'::jsonb,
    commitments JSONB NOT NULL DEFAULT '[]'::jsonb,
    next_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    critical_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT status_reports_idempotency UNIQUE (organization_id, idempotency_key),
    CONSTRAINT status_reports_period_unique UNIQUE (organization_id, report_period_start, report_period_end),
    CONSTRAINT status_reports_idempotency_key_non_empty CHECK (length(btrim(idempotency_key)) > 0),
    CONSTRAINT status_reports_period_order CHECK (report_period_end > report_period_start)
);

CREATE INDEX IF NOT EXISTS idx_status_reports_org_period_end
    ON public.status_reports (organization_id, report_period_end DESC);

CREATE INDEX IF NOT EXISTS idx_status_reports_org_idempotency
    ON public.status_reports (organization_id, idempotency_key);

ALTER TABLE public.status_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "status_reports_org_access" ON public.status_reports;
CREATE POLICY "status_reports_org_access" ON public.status_reports
    FOR ALL
    USING (organization_id = (SELECT public.get_user_organization()))
    WITH CHECK (organization_id = (SELECT public.get_user_organization()));
