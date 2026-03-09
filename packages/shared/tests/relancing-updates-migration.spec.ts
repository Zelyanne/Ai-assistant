import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('Supabase migration: relancing_updates', () => {
  it('creates relancing_updates and relancing_update_events with org-scoped RLS', async () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const migrationPath = path.join(
      repoRoot,
      'supabase',
      'migrations',
      '20260308000000_create_relancing_updates.sql'
    );

    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain("CREATE TYPE public.relancing_update_intent");

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.relancing_updates');
    expect(sql).toContain('organization_id UUID');
    expect(sql).toContain('project_context_id UUID');
    expect(sql).toContain('member_assignment_id UUID');
    expect(sql).toContain('idempotency_key TEXT NOT NULL');
    expect(sql).toContain('intents public.relancing_update_intent[] NOT NULL');
    expect(sql).toContain('CONSTRAINT relancing_updates_idempotency UNIQUE');
    expect(sql).toContain('ALTER TABLE public.relancing_updates ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('CREATE POLICY "relancing_updates_org_access"');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.relancing_update_events');
    expect(sql).toContain('event_type TEXT NOT NULL');
    expect(sql).toContain('raw_payload JSONB');
    expect(sql).toContain('ALTER TABLE public.relancing_update_events ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('CREATE POLICY "relancing_update_events_org_access"');
  });
});
