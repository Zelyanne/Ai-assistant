-- Migration: dedicated user links for messaging channels
-- Story: Telegram user-initiated assistant access

CREATE TABLE IF NOT EXISTS public.messaging_channel_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('telegram')),
    external_user_id TEXT,
    external_thread_id TEXT,
    username TEXT,
    display_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked')),
    link_token_hash TEXT,
    link_token_expires_at TIMESTAMPTZ,
    linked_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT messaging_channel_links_token_when_pending CHECK (
        status <> 'pending'
        OR (link_token_hash IS NOT NULL AND link_token_expires_at IS NOT NULL)
    ),
    CONSTRAINT messaging_channel_links_external_when_active CHECK (
        status <> 'active'
        OR external_thread_id IS NOT NULL
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messaging_channel_links_active_thread
    ON public.messaging_channel_links (channel, external_thread_id)
    WHERE status = 'active' AND external_thread_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messaging_channel_links_active_user
    ON public.messaging_channel_links (organization_id, user_id, channel)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_messaging_channel_links_token_hash
    ON public.messaging_channel_links (link_token_hash)
    WHERE status = 'pending' AND link_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messaging_channel_links_org_user
    ON public.messaging_channel_links (organization_id, user_id, channel, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_messaging_channel_links_set_updated_at ON public.messaging_channel_links;
CREATE TRIGGER trg_messaging_channel_links_set_updated_at
    BEFORE UPDATE ON public.messaging_channel_links
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.messaging_channel_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messaging_channel_links_principal_access" ON public.messaging_channel_links;
CREATE POLICY "messaging_channel_links_principal_access" ON public.messaging_channel_links
    FOR ALL
    USING (
        public.has_principal_access(organization_id, user_id)
    )
    WITH CHECK (
        public.has_principal_access(organization_id, user_id)
    );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'messaging_channel_links'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messaging_channel_links;
    END IF;
END $$;
