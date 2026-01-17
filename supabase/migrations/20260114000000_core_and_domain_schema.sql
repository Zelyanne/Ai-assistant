-- Migration: Core Foundation & Domain Schema
-- Story: 1.2: Database-as-Queue Schema & RLS Policies

-- 1. Enums
CREATE TYPE public.task_status AS ENUM ('queued', 'processing', 'done', 'error');
CREATE TYPE public.user_role AS ENUM ('CEO', 'PM', 'Team Member');

-- 2. Tables
CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id),
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    role public.user_role DEFAULT 'Team Member',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    domain_action TEXT NOT NULL, -- e.g., 'email.ingest'
    status public.task_status NOT NULL DEFAULT 'queued',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    agent_id UUID NOT NULL REFERENCES public.profiles(id), -- Linked to user who owns the agent session or the agent identity
    action_taken TEXT NOT NULL,
    reasoning_trace JSONB NOT NULL DEFAULT '{}'::jsonb,
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_protocols (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.workspace_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- e.g., 'google'
    encrypted_creds JSONB NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'idle',
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL, -- Google Event ID
    title TEXT,
    description TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    location TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id, external_id)
);

CREATE TABLE public.ingested_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL, -- Gmail Thread ID
    subject TEXT, -- Missing in initial slop
    category TEXT,
    priority_score FLOAT,
    summary TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id, external_id)
);

CREATE TABLE public.watch_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    topic_name TEXT NOT NULL,
    keywords_array TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.morning_briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    brief_date DATE NOT NULL DEFAULT CURRENT_DATE,
    content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- For OAuth tokens (if needed separately from integrations)
CREATE TABLE public.user_credentials (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Security Definer for RLS
CREATE OR REPLACE FUNCTION public.get_user_organization()
RETURNS UUID AS $$
    SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 4. RLS Policies
-- Enable RLS on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingested_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.morning_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;

-- Organization Isolation Policies
CREATE POLICY "Users can only see their own organization" ON public.organizations
    FOR SELECT USING (id = public.get_user_organization());

CREATE POLICY "Users can see profiles in their organization" ON public.profiles
    FOR ALL USING (organization_id = public.get_user_organization());

CREATE POLICY "Organization access for tasks" ON public.tasks
    FOR ALL USING (organization_id = public.get_user_organization());

CREATE POLICY "Organization access for agent logs" ON public.agent_activity_log
    FOR ALL USING (organization_id = public.get_user_organization());

CREATE POLICY "Organization access for protocols" ON public.user_protocols
    FOR ALL USING (organization_id = public.get_user_organization());

CREATE POLICY "Organization access for integrations" ON public.workspace_integrations
    FOR ALL USING (organization_id = public.get_user_organization());

CREATE POLICY "Organization access for calendar events" ON public.calendar_events
    FOR ALL USING (organization_id = public.get_user_organization());

CREATE POLICY "Organization access for ingested threads" ON public.ingested_threads
    FOR ALL USING (organization_id = public.get_user_organization());

CREATE POLICY "Organization access for watch topics" ON public.watch_topics
    FOR ALL USING (organization_id = public.get_user_organization());

CREATE POLICY "Organization access for morning briefs" ON public.morning_briefs
    FOR ALL USING (organization_id = public.get_user_organization());

CREATE POLICY "Self access for credentials" ON public.user_credentials
    FOR ALL USING (user_id = auth.uid());

-- 5. Realtime Configuration
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.morning_briefs;
