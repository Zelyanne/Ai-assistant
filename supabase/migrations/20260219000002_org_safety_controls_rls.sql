-- Migration: Org Safety Controls RLS
-- Story: 4.4: Real-time "Emergency Brake" Global Toggle

ALTER TABLE public.org_safety_controls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_safety_controls_select_org_members" ON public.org_safety_controls;
DROP POLICY IF EXISTS "org_safety_controls_insert_org_members_enable_true" ON public.org_safety_controls;
DROP POLICY IF EXISTS "org_safety_controls_update_org_members_enable_true" ON public.org_safety_controls;
DROP POLICY IF EXISTS "org_safety_controls_update_ceo_disable_false" ON public.org_safety_controls;

-- Org members can read current brake state.
CREATE POLICY "org_safety_controls_select_org_members" ON public.org_safety_controls
    FOR SELECT
    USING (organization_id = (SELECT public.get_user_organization()));

-- Any org member can engage the brake (enable=true).
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

-- Only CEO can disengage the brake (enable=false).
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
