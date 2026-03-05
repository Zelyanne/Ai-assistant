import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('Supabase migration: agency_perimeters RLS hardening', () => {
  it('locks down writes to CEO-only and uses initplan-safe select wrappers', async () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const migrationPath = path.join(
      repoRoot,
      'supabase',
      'migrations',
      '20260216000000_lock_down_agency_perimeters_rls.sql'
    );

    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain(
      'DROP POLICY IF EXISTS "Organization access for agency perimeters" ON public.agency_perimeters;'
    );

    expect(sql).toContain('CREATE POLICY "agency_perimeters_select_org_members"');
    expect(sql).toContain('FOR SELECT');
    expect(sql).toContain(
      'organization_id = (SELECT public.get_user_organization())'
    );

    expect(sql).toContain('CREATE POLICY "agency_perimeters_insert_ceo_only"');
    expect(sql).toContain('FOR INSERT');
    expect(sql).toContain(
      '(SELECT public.get_user_role()) = \'CEO\'::public.user_role'
    );

    expect(sql).toContain('CREATE POLICY "agency_perimeters_update_ceo_only"');
    expect(sql).toContain('FOR UPDATE');

    expect(sql).toContain('CREATE POLICY "agency_perimeters_delete_ceo_only"');
    expect(sql).toContain('FOR DELETE');
  });
});
