-- Migration: Automation event watchers
-- Purpose: Let users define lightweight event triggers that queue assistant.command prompts.

CREATE TABLE IF NOT EXISTS public.automation_watchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    match_text TEXT NOT NULL,
    prompt_template TEXT NOT NULL,
    skill_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT automation_watchers_source_format CHECK (source = '*' OR source ~ '^[a-z0-9_.:-]+$')
);

CREATE INDEX IF NOT EXISTS idx_automation_watchers_active_scope
    ON public.automation_watchers (organization_id, user_id, source)
    WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_automation_watchers_set_updated_at ON public.automation_watchers;
CREATE TRIGGER trg_automation_watchers_set_updated_at
    BEFORE UPDATE ON public.automation_watchers
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.automation_watchers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_watchers_org_access" ON public.automation_watchers;
CREATE POLICY "automation_watchers_org_access" ON public.automation_watchers
    FOR ALL
    USING (
        organization_id = (SELECT public.get_user_organization())
        AND (user_id = (SELECT auth.uid()) OR user_id IS NULL)
    )
    WITH CHECK (
        organization_id = (SELECT public.get_user_organization())
        AND (user_id = (SELECT auth.uid()) OR user_id IS NULL)
    );

COMMENT ON TABLE public.automation_watchers IS
    'User-configured event watchers. Matching events queue assistant.command tasks with trigger context.';
