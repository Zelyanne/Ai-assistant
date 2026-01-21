-- 1. Update watch_topics table to match Story 3.2 requirements
ALTER TABLE public.watch_topics 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS priority TEXT CHECK (priority IN ('High', 'Medium', 'Low')) DEFAULT 'Medium';

-- Rename topic_name to topic if it exists
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='watch_topics' AND column_name='topic_name') THEN
    ALTER TABLE public.watch_topics RENAME COLUMN topic_name TO topic;
  END IF;
END $$;

-- 2. Update RLS for watch_topics
DROP POLICY IF EXISTS "Organization access for watch topics" ON public.watch_topics;
DROP POLICY IF EXISTS "Users can manage their own watch topics" ON public.watch_topics;

CREATE POLICY "Users can manage their own watch topics"
    ON public.watch_topics
    FOR ALL
    USING (user_id = auth.uid() OR organization_id = public.get_user_organization());

-- 3. Update ingested_threads table
ALTER TABLE public.ingested_threads
ADD COLUMN IF NOT EXISTS subject TEXT,
ADD COLUMN IF NOT EXISTS classification JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS is_highlighted BOOLEAN DEFAULT false;

-- Adjust priority_score to be INTEGER as per story (was FLOAT in initial migration)
ALTER TABLE public.ingested_threads 
ALTER COLUMN priority_score TYPE INTEGER USING COALESCE(priority_score::integer, 0);

-- 4. Add index for performance on unclassified threads
CREATE INDEX IF NOT EXISTS idx_ingested_threads_classification_is_empty 
ON public.ingested_threads ((classification = '{}'::jsonb));
