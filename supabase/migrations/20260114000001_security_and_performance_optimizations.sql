-- 1. Security Hardening: Set search_path for functions to prevent search path hijacking
ALTER FUNCTION public.get_user_organization() SET search_path = public;

-- 2. Performance Tuning: Add indexes for foreign keys to optimize joins and RLS lookups
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_organization_id ON public.tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_activity_log_organization_id ON public.agent_activity_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_activity_log_task_id ON public.agent_activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_user_protocols_organization_id ON public.user_protocols(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_protocols_user_id ON public.user_protocols(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_integrations_organization_id ON public.workspace_integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_organization_id ON public.calendar_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_ingested_threads_organization_id ON public.ingested_threads(organization_id);
CREATE INDEX IF NOT EXISTS idx_watch_topics_organization_id ON public.watch_topics(organization_id);
CREATE INDEX IF NOT EXISTS idx_morning_briefs_organization_id ON public.morning_briefs(organization_id);
CREATE INDEX IF NOT EXISTS idx_morning_briefs_user_id ON public.morning_briefs(user_id);

-- 3. RLS Optimization: Replace auth.uid() with (SELECT auth.uid()) for subquery caching
-- We drop and recreate policies to ensure they use the optimized subquery pattern.

-- Profiles Cleanup & Optimization
DROP POLICY IF EXISTS "Users can view own profile." ON public.profiles;
DROP POLICY IF EXISTS "profile_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "Users can see profiles in their organization" ON public.profiles;
CREATE POLICY "Users can see profiles in their organization" ON public.profiles
    FOR ALL USING (organization_id = (SELECT public.get_user_organization()));

-- Organizations
DROP POLICY IF EXISTS "Users can only see their own organization" ON public.organizations;
CREATE POLICY "Users can only see their own organization" ON public.organizations
    FOR SELECT USING (id = (SELECT public.get_user_organization()));

-- Tasks
DROP POLICY IF EXISTS "Organization access for tasks" ON public.tasks;
CREATE POLICY "Organization access for tasks" ON public.tasks
    FOR ALL USING (organization_id = (SELECT public.get_user_organization()));

-- Agent Logs
DROP POLICY IF EXISTS "Organization access for agent logs" ON public.agent_activity_log;
CREATE POLICY "Organization access for agent logs" ON public.agent_activity_log
    FOR ALL USING (organization_id = (SELECT public.get_user_organization()));

-- Protocols
DROP POLICY IF EXISTS "Organization access for protocols" ON public.user_protocols;
CREATE POLICY "Organization access for protocols" ON public.user_protocols
    FOR ALL USING (organization_id = (SELECT public.get_user_organization()));

-- Integrations
DROP POLICY IF EXISTS "Organization access for integrations" ON public.workspace_integrations;
CREATE POLICY "Organization access for integrations" ON public.workspace_integrations
    FOR ALL USING (organization_id = (SELECT public.get_user_organization()));

-- Calendar Events
DROP POLICY IF EXISTS "Organization access for calendar events" ON public.calendar_events;
CREATE POLICY "Organization access for calendar events" ON public.calendar_events
    FOR ALL USING (organization_id = (SELECT public.get_user_organization()));

-- Ingested Threads
DROP POLICY IF EXISTS "Organization access for ingested threads" ON public.ingested_threads;
CREATE POLICY "Organization access for ingested threads" ON public.ingested_threads
    FOR ALL USING (organization_id = (SELECT public.get_user_organization()));

-- Watch Topics
DROP POLICY IF EXISTS "Organization access for watch topics" ON public.watch_topics;
CREATE POLICY "Organization access for watch topics" ON public.watch_topics
    FOR ALL USING (organization_id = (SELECT public.get_user_organization()));

-- Morning Briefs
DROP POLICY IF EXISTS "Organization access for morning briefs" ON public.morning_briefs;
CREATE POLICY "Organization access for morning briefs" ON public.morning_briefs
    FOR ALL USING (organization_id = (SELECT public.get_user_organization()));

-- Credentials
DROP POLICY IF EXISTS "Self access for credentials" ON public.user_credentials;
DROP POLICY IF EXISTS "Users can manage their own credentials." ON public.user_credentials;
CREATE POLICY "Self access for credentials" ON public.user_credentials
    FOR ALL USING (user_id = (SELECT auth.uid()));
