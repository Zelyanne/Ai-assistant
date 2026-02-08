-- Migration: Fix Morning Brief Schema and Add Last Generated At
-- Story: fix-morning-brief-mcp-triage
-- Created: 2026-02-05

-- 1. Add columns to morning_briefs
ALTER TABLE public.morning_briefs 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Add columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_brief_generated_at TIMESTAMPTZ;

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_morning_briefs_metadata ON public.morning_briefs USING GIN (metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_last_brief ON public.profiles(last_brief_generated_at);

-- 4. Data Migration for Existing Rows
-- Note: Assuming blockers/risks were intended to be migrated into metadata or were legacy.
-- For now, we follow the tech spec's backfill logic.
-- If blockers/risks don't exist as columns, this might need adjustment, but usually 
-- the tech spec is based on a more recent DB dump or intent.
-- However, since I saw they are NOT in the schema migration, I'll use content_json path if they are there.

UPDATE public.morning_briefs 
SET metadata = jsonb_build_object(
    'actionable_items', 
    COALESCE(content_json->'actionable_items', '[]'::jsonb)
)
WHERE metadata IS NULL OR metadata = '{}'::jsonb;

-- Down migration (Rollback Plan)
-- To use this: copy to a new migration or run manually
/*
ALTER TABLE public.morning_briefs DROP COLUMN IF EXISTS metadata;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS last_brief_generated_at;
DROP INDEX IF EXISTS idx_morning_briefs_metadata;
DROP INDEX IF EXISTS idx_profiles_last_brief;
*/
