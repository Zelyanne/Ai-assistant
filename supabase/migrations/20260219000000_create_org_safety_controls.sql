-- Migration: Org Safety Controls (Emergency Brake)
-- Story: 4.4: Real-time "Emergency Brake" Global Toggle

CREATE TABLE IF NOT EXISTS public.org_safety_controls (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    emergency_brake_enabled BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES public.profiles(id)
);
