-- Migration: Make agent_activity_log immutable
-- Story: 2.6: Immutable Audit Logging to Agent Activity Log

-- Drop existing generic policy
DROP POLICY IF EXISTS "Organization access for agent logs" ON public.agent_activity_log;

-- Create INSERT policy (Users/Agents can insert logs for their org)
CREATE POLICY "Enable insert for organization members" ON public.agent_activity_log
    FOR INSERT WITH CHECK (organization_id = public.get_user_organization());

-- Create SELECT policy (Users can view logs for their org)
CREATE POLICY "Enable select for organization members" ON public.agent_activity_log
    FOR SELECT USING (organization_id = public.get_user_organization());

-- No UPDATE or DELETE policies created = Implicit Denial (Immutability)
