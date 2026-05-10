-- Add finite-duration support for mail watch topics.
ALTER TABLE public.watch_topics
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_watch_topics_active_scope
  ON public.watch_topics (organization_id, user_id, expires_at);

COMMENT ON COLUMN public.watch_topics.expires_at IS
  'Optional expiration timestamp for finite-duration mail watch topics. NULL means active until manually changed.';
