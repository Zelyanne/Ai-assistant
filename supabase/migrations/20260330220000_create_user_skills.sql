-- Migration: user-scoped skills for specialist personalization
-- Story: User Skills + Research Agent + 3-Step Checkpointing

CREATE TABLE IF NOT EXISTS public.user_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    content_markdown TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}'::text[],
    triggers TEXT[] NOT NULL DEFAULT '{}'::text[],
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT user_skills_unique_name_per_user UNIQUE (organization_id, user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_user_skills_org_user
    ON public.user_skills (organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_user_skills_tags_gin
    ON public.user_skills USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_user_skills_triggers_gin
    ON public.user_skills USING GIN (triggers);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_skills_set_updated_at ON public.user_skills;
CREATE TRIGGER trg_user_skills_set_updated_at
    BEFORE UPDATE ON public.user_skills
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_skills_principal_access" ON public.user_skills;
CREATE POLICY "user_skills_principal_access" ON public.user_skills
    FOR ALL
    USING (
        public.has_principal_access(organization_id, user_id)
    )
    WITH CHECK (
        public.has_principal_access(organization_id, user_id)
    );
