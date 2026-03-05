-- Migration: Lock down agency_perimeters RLS policies
-- Story: 4.1: Agency Tier Configuration & Perimeter Management

-- Replace the initial permissive policy (FOR ALL) with:
-- - SELECT: organization members can read
-- - INSERT/UPDATE/DELETE: only CEO can write
--
-- Performance: wrap auth-related functions in SELECT to avoid per-row re-evaluation
-- (Supabase linter: auth_rls_initplan).

DROP POLICY IF EXISTS "Organization access for agency perimeters" ON public.agency_perimeters;

DROP POLICY IF EXISTS "agency_perimeters_select_org_members" ON public.agency_perimeters;
CREATE POLICY "agency_perimeters_select_org_members" ON public.agency_perimeters
  FOR SELECT
  USING (organization_id = (SELECT public.get_user_organization()));

DROP POLICY IF EXISTS "agency_perimeters_insert_ceo_only" ON public.agency_perimeters;
CREATE POLICY "agency_perimeters_insert_ceo_only" ON public.agency_perimeters
  FOR INSERT
  WITH CHECK (
    organization_id = (SELECT public.get_user_organization())
    AND (SELECT public.get_user_role()) = 'CEO'::public.user_role
  );

DROP POLICY IF EXISTS "agency_perimeters_update_ceo_only" ON public.agency_perimeters;
CREATE POLICY "agency_perimeters_update_ceo_only" ON public.agency_perimeters
  FOR UPDATE
  USING (
    organization_id = (SELECT public.get_user_organization())
    AND (SELECT public.get_user_role()) = 'CEO'::public.user_role
  )
  WITH CHECK (
    organization_id = (SELECT public.get_user_organization())
    AND (SELECT public.get_user_role()) = 'CEO'::public.user_role
  );

DROP POLICY IF EXISTS "agency_perimeters_delete_ceo_only" ON public.agency_perimeters;
CREATE POLICY "agency_perimeters_delete_ceo_only" ON public.agency_perimeters
  FOR DELETE
  USING (
    organization_id = (SELECT public.get_user_organization())
    AND (SELECT public.get_user_role()) = 'CEO'::public.user_role
  );
