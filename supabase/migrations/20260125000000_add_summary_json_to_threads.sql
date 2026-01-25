-- Migration to add summary_json to ingested_threads
-- Generated to sync local environment with production state found during AI review

ALTER TABLE public.ingested_threads 
ADD COLUMN IF NOT EXISTS summary_json JSONB DEFAULT NULL;

COMMENT ON COLUMN public.ingested_threads.summary_json IS 'Structured summary containing context, decisions, and action items.';
