-- Migration: Principal-Driven Permission System
-- Story: 1.4: Principal-Driven Permission System

-- 1. Helper Function for Role Retrieval
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 2. Schema Updates: Add user_id to domain tables
ALTER TABLE public.tasks ADD COLUMN user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_integrations ADD COLUMN user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.calendar_events ADD COLUMN user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.ingested_threads ADD COLUMN user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add indexes for the new user_id columns
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_integrations_user_id ON public.workspace_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON public.calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_ingested_threads_user_id ON public.ingested_threads(user_id);

-- 3. RLS Policy Updates

-- Profiles: Only CEOs can update roles
DROP POLICY IF EXISTS "Users can see profiles in their organization" ON public.profiles;
CREATE POLICY "Users can see profiles in their organization" ON public.profiles
    FOR SELECT USING (organization_id = (SELECT public.get_user_organization()));

CREATE POLICY "CEOs can update roles" ON public.profiles
    FOR UPDATE
    USING (
        organization_id = (SELECT public.get_user_organization()) 
        AND (SELECT public.get_user_role()) = 'CEO'::public.user_role
    )
    WITH CHECK (
        organization_id = (SELECT public.get_user_organization()) 
        AND (SELECT public.get_user_role()) = 'CEO'::public.user_role
    );

-- Helper function for Principal-Driven access
-- Returns true if user is CEO of the organization OR if user is the owner (user_id match)
CREATE OR REPLACE FUNCTION public.has_principal_access(org_id UUID, item_user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT (
        (SELECT public.get_user_organization()) = org_id
        AND (
            (SELECT public.get_user_role()) = 'CEO'::public.user_role
            OR auth.uid() = item_user_id
        )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Update Policies for Domain Tables

-- Tasks
DROP POLICY IF EXISTS "Organization access for tasks" ON public.tasks;
CREATE POLICY "Principal access for tasks" ON public.tasks
    FOR ALL USING (public.has_principal_access(organization_id, user_id));

-- Workspace Integrations
DROP POLICY IF EXISTS "Organization access for integrations" ON public.workspace_integrations;
CREATE POLICY "Principal access for integrations" ON public.workspace_integrations
    FOR ALL USING (public.has_principal_access(organization_id, user_id));

-- Calendar Events
DROP POLICY IF EXISTS "Organization access for calendar events" ON public.calendar_events;
CREATE POLICY "Principal access for calendar events" ON public.calendar_events
    FOR ALL USING (public.has_principal_access(organization_id, user_id));

-- Ingested Threads
DROP POLICY IF EXISTS "Organization access for ingested threads" ON public.ingested_threads;
CREATE POLICY "Principal access for ingested threads" ON public.ingested_threads
    FOR ALL USING (public.has_principal_access(organization_id, user_id));

-- User Protocols
DROP POLICY IF EXISTS "Organization access for protocols" ON public.user_protocols;
CREATE POLICY "Principal access for protocols" ON public.user_protocols
    FOR ALL USING (public.has_principal_access(organization_id, user_id));

-- Morning Briefs
DROP POLICY IF EXISTS "Organization access for morning briefs" ON public.morning_briefs;
CREATE POLICY "Principal access for morning briefs" ON public.morning_briefs
    FOR ALL USING (public.has_principal_access(organization_id, user_id));
