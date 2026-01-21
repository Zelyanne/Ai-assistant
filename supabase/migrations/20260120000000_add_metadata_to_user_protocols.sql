-- Migration: Add Metadata to User Protocols
-- Description: Adds a JSONB column to store machine-readable behavior parameters.

ALTER TABLE public.user_protocols ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
