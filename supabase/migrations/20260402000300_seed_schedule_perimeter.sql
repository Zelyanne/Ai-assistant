-- Migration: Seed Schedule topic perimeter (Controlled)
-- Story: Scheduled Agent Requests: One-off + Finite Recurrence
-- Created: 2026-04-02

-- Ensure background scheduled tasks (topic='Schedule') do not escalate by default.
INSERT INTO public.agency_perimeters (organization_id, topic_name, tier)
SELECT id, 'Schedule', 'Controlled'::public.agency_tier
FROM public.organizations
ON CONFLICT (organization_id, topic_name) DO NOTHING;

-- Also seed on new org onboarding.
CREATE OR REPLACE FUNCTION public.initialize_organization(org_name TEXT, user_role public.user_role)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_org public.organizations;
    existing_org_id UUID;
BEGIN
    -- 1. Prevent multiple initializations (SEC-01, SEC-02, RACE-01)
    SELECT organization_id INTO existing_org_id FROM public.profiles WHERE id = auth.uid();
    IF existing_org_id IS NOT NULL THEN
        RAISE EXCEPTION 'User is already associated with an organization';
    END IF;

    -- 2. Validate role - only allow CEO or Simple User during onboarding
    IF user_role NOT IN ('CEO', 'Simple User') THEN
        RAISE EXCEPTION 'Invalid initial role: %', user_role;
    END IF;

    -- 3. Create the organization
    INSERT INTO public.organizations (name)
    VALUES (org_name)
    RETURNING * INTO new_org;

    -- 3b. Seed perimeter topic for schedules
    INSERT INTO public.agency_perimeters (organization_id, topic_name, tier)
    VALUES (new_org.id, 'Schedule', 'Controlled'::public.agency_tier)
    ON CONFLICT (organization_id, topic_name) DO NOTHING;

    -- 4. Update the profile
    UPDATE public.profiles
    SET organization_id = new_org.id,
        role = user_role
    WHERE id = auth.uid();

    -- 5. Update auth metadata to include organization_id
    -- This ensures that components relying on auth.user.user_metadata
    -- have access to the organization ID.
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('organization_id', new_org.id)
    WHERE id = auth.uid();

    RETURN new_org;
END;
$$;
