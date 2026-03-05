-- Migration: Org Safety Controls to Realtime
-- Story: 4.4: Real-time "Emergency Brake" Global Toggle

ALTER PUBLICATION supabase_realtime ADD TABLE public.org_safety_controls;
