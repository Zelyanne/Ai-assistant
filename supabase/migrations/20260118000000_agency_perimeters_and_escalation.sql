-- Migration: Agency Perimeters and Escalation Status
-- Story: 2.4: PerimeterGuard PII Filtering & Agency Tier Enforcement

-- 1. Add 'escalation' to task_status enum
-- Note: ALTER TYPE ... ADD VALUE cannot be executed in a transaction block in some Postgres versions,
-- but Supabase usually handles this. If it fails, we might need to use separate statements.
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'escalation';

-- 1b. Add 'topic' to tasks table (MISSED IN INITIAL MIGRATION)
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS topic TEXT;

-- 2. Create agency_tier enum
DO $$ BEGIN
    CREATE TYPE public.agency_tier AS ENUM ('Public', 'Controlled', 'Restricted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Create agency_perimeters table
CREATE TABLE IF NOT EXISTS public.agency_perimeters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    topic_name TEXT NOT NULL,
    tier public.agency_tier NOT NULL DEFAULT 'Restricted',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id, topic_name)
);

-- 4. Enable RLS
ALTER TABLE public.agency_perimeters ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DO $$ BEGIN
    CREATE POLICY "Organization access for agency perimeters" ON public.agency_perimeters
        FOR ALL USING (organization_id = public.get_user_organization());
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 6. Add to Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.agency_perimeters;
