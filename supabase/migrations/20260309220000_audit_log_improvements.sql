-- Migration: Improve agent_activity_log for autonomous system logging
-- Description: Removes the rigid profile FK on agent_id to support background jobs 
-- and ensures JSONB defaults match expected array shapes.

-- 1. Drop the foreign key constraint on agent_id
ALTER TABLE public.agent_activity_log 
DROP CONSTRAINT IF EXISTS agent_activity_log_agent_id_fkey;

-- 2. Change agent_id from UUID to TEXT to allow string identifiers like 'agent-controller', 'channel-router'
ALTER TABLE public.agent_activity_log
ALTER COLUMN agent_id TYPE TEXT USING agent_id::TEXT;

-- 3. Update reasoning_trace to default to a JSON array instead of an object
ALTER TABLE public.agent_activity_log
ALTER COLUMN reasoning_trace SET DEFAULT '[]'::jsonb;

-- Note: citations is already DEFAULT '[]'::jsonb

-- 4. Recreate any views or dependents if necessary (none exist natively that break here)
