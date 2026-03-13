-- Migration: Reconcile missing runtime tables on drifted environments
-- Purpose: Create runtime tables that are present in the repo and active code paths,
-- even when migration history has diverged from the local folder.

-- Shared updated_at trigger helper used by command center and execution runs.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Emergency brake storage
CREATE TABLE IF NOT EXISTS public.org_safety_controls (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    emergency_brake_enabled BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.org_safety_controls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_safety_controls_select_org_members" ON public.org_safety_controls;
DROP POLICY IF EXISTS "org_safety_controls_insert_org_members_enable_true" ON public.org_safety_controls;
DROP POLICY IF EXISTS "org_safety_controls_update_org_members_enable_true" ON public.org_safety_controls;
DROP POLICY IF EXISTS "org_safety_controls_update_ceo_disable_false" ON public.org_safety_controls;

CREATE POLICY "org_safety_controls_select_org_members" ON public.org_safety_controls
    FOR SELECT
    USING (organization_id = (SELECT public.get_user_organization()));

CREATE POLICY "org_safety_controls_insert_org_members_enable_true" ON public.org_safety_controls
    FOR INSERT
    WITH CHECK (
        organization_id = (SELECT public.get_user_organization())
        AND emergency_brake_enabled = true
        AND updated_by = auth.uid()
    );

CREATE POLICY "org_safety_controls_update_org_members_enable_true" ON public.org_safety_controls
    FOR UPDATE
    USING (organization_id = (SELECT public.get_user_organization()))
    WITH CHECK (
        organization_id = (SELECT public.get_user_organization())
        AND emergency_brake_enabled = true
        AND updated_by = auth.uid()
    );

CREATE POLICY "org_safety_controls_update_ceo_disable_false" ON public.org_safety_controls
    FOR UPDATE
    USING (
        organization_id = (SELECT public.get_user_organization())
        AND (SELECT public.get_user_role()) = 'CEO'::public.user_role
    )
    WITH CHECK (
        organization_id = (SELECT public.get_user_organization())
        AND emergency_brake_enabled = false
        AND updated_by = auth.uid()
        AND (SELECT public.get_user_role()) = 'CEO'::public.user_role
    );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'org_safety_controls'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.org_safety_controls;
    END IF;
END $$;

-- Automated status reports
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

DROP TRIGGER IF EXISTS trg_status_reports_set_updated_at ON public.status_reports;
CREATE TRIGGER trg_status_reports_set_updated_at
    BEFORE UPDATE ON public.status_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.status_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "status_reports_org_access" ON public.status_reports;
CREATE POLICY "status_reports_org_access" ON public.status_reports
    FOR ALL
    USING (organization_id = (SELECT public.get_user_organization()))
    WITH CHECK (organization_id = (SELECT public.get_user_organization()));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'status_reports'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.status_reports;
    END IF;
END $$;

-- Command Center persistence
CREATE TABLE IF NOT EXISTS public.command_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT,
    channel TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'telegram', 'whatsapp')),
    external_thread_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.command_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.command_conversations(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    state TEXT CHECK (state IN ('intent_preview', 'queued', 'processing', 'done', 'error', 'escalation', 'paused')),
    source_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    channel TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'telegram', 'whatsapp')),
    correlation_id TEXT,
    thread_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT command_messages_content_non_empty CHECK (length(btrim(content)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_command_conversations_org_updated
    ON public.command_conversations (organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_command_conversations_org_created_by
    ON public.command_conversations (organization_id, created_by, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_command_messages_conversation_created
    ON public.command_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_command_messages_org_created
    ON public.command_messages (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_command_messages_org_task
    ON public.command_messages (organization_id, source_task_id);

DROP TRIGGER IF EXISTS trg_command_conversations_set_updated_at ON public.command_conversations;
CREATE TRIGGER trg_command_conversations_set_updated_at
    BEFORE UPDATE ON public.command_conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_command_messages_set_updated_at ON public.command_messages;
CREATE TRIGGER trg_command_messages_set_updated_at
    BEFORE UPDATE ON public.command_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.touch_command_conversation_updated_at()
RETURNS trigger AS $$
BEGIN
    UPDATE public.command_conversations
        SET updated_at = now()
        WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_command_conversation_updated_at ON public.command_messages;
CREATE TRIGGER trg_touch_command_conversation_updated_at
    AFTER INSERT OR UPDATE ON public.command_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_command_conversation_updated_at();

ALTER TABLE public.command_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.command_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "command_conversations_org_access" ON public.command_conversations;
CREATE POLICY "command_conversations_org_access" ON public.command_conversations
    FOR ALL
    USING (
        public.has_principal_access(organization_id, created_by)
    )
    WITH CHECK (
        public.has_principal_access(organization_id, created_by)
    );

DROP POLICY IF EXISTS "command_messages_org_access" ON public.command_messages;
CREATE POLICY "command_messages_org_access" ON public.command_messages
    FOR ALL
    USING (
        organization_id = public.get_user_organization()
        AND EXISTS (
            SELECT 1
            FROM public.command_conversations c
            WHERE c.id = command_messages.conversation_id
              AND c.organization_id = command_messages.organization_id
              AND public.has_principal_access(c.organization_id, c.created_by)
        )
    )
    WITH CHECK (
        organization_id = public.get_user_organization()
        AND EXISTS (
            SELECT 1
            FROM public.command_conversations c
            WHERE c.id = command_messages.conversation_id
              AND c.organization_id = command_messages.organization_id
              AND public.has_principal_access(c.organization_id, c.created_by)
        )
    );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'command_conversations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.command_conversations;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'command_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.command_messages;
    END IF;
END $$;
