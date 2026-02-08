-- Fix for RLS permissions on organizations table during onboarding
-- This migration ensures that authenticated users can insert into the organizations table
-- which is required for the onboarding flow where users create their first organization.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE tablename = 'organizations'
        AND policyname = 'Enable insert for authenticated users only'
    ) THEN
        CREATE POLICY "Enable insert for authenticated users only"
        ON "public"."organizations"
        AS PERMISSIVE
        FOR INSERT
        TO "authenticated"
        WITH CHECK (true);
    END IF;
END
$$;
