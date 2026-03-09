-- Migration: Normalized relancing updates + idempotency + trace events
-- Story: 5.2 Bidirectional Nudge Interface

DO $$
BEGIN
    CREATE TYPE public.relancing_update_intent AS ENUM ('status_update', 'blocker_report');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.relancing_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_context_id UUID NOT NULL REFERENCES public.project_scheduling_contexts(id) ON DELETE CASCADE,
    member_assignment_id UUID NOT NULL REFERENCES public.project_member_assignments(id) ON DELETE CASCADE,
    source_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    source_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

    channel TEXT NOT NULL CHECK (channel IN ('web', 'telegram', 'whatsapp')),
    external_message_id TEXT,
    thread_id TEXT,
    correlation_id TEXT,
    idempotency_key TEXT NOT NULL,

    message_text TEXT NOT NULL,
    intents public.relancing_update_intent[] NOT NULL,

    progress_summary TEXT,
    blocker_summary TEXT,
    dependency TEXT,
    requested_help TEXT,
    eta_hint TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT relancing_updates_idempotency UNIQUE (organization_id, idempotency_key),
    CONSTRAINT relancing_updates_idempotency_key_non_empty CHECK (length(btrim(idempotency_key)) > 0),
    CONSTRAINT relancing_updates_message_text_non_empty CHECK (length(btrim(message_text)) > 0),
    CONSTRAINT relancing_updates_identity_present CHECK (
        COALESCE(NULLIF(external_message_id, ''), NULLIF(correlation_id, '')) IS NOT NULL
    ),
    CONSTRAINT relancing_updates_intents_non_empty CHECK (cardinality(intents) >= 1)
);

CREATE TABLE IF NOT EXISTS public.relancing_update_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    relancing_update_id UUID REFERENCES public.relancing_updates(id) ON DELETE SET NULL,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,

    idempotency_key TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('ingested', 'duplicate_prevented')),
    channel TEXT NOT NULL CHECK (channel IN ('web', 'telegram', 'whatsapp')),
    external_message_id TEXT,
    correlation_id TEXT,

    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relancing_updates_org_created
    ON public.relancing_updates (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_relancing_updates_context_created
    ON public.relancing_updates (project_context_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_relancing_updates_member_created
    ON public.relancing_updates (member_assignment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_relancing_update_events_org_occurred
    ON public.relancing_update_events (organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_relancing_update_events_org_idempotency
    ON public.relancing_update_events (organization_id, idempotency_key, occurred_at DESC);

ALTER TABLE public.relancing_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relancing_update_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "relancing_updates_org_access" ON public.relancing_updates;
CREATE POLICY "relancing_updates_org_access" ON public.relancing_updates
    FOR ALL
    USING (organization_id = (SELECT public.get_user_organization()))
    WITH CHECK (organization_id = (SELECT public.get_user_organization()));

DROP POLICY IF EXISTS "relancing_update_events_org_access" ON public.relancing_update_events;
CREATE POLICY "relancing_update_events_org_access" ON public.relancing_update_events
    FOR ALL
    USING (organization_id = (SELECT public.get_user_organization()))
    WITH CHECK (organization_id = (SELECT public.get_user_organization()));
