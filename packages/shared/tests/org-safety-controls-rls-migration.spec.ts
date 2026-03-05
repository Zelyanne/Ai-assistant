import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('Supabase migration: org_safety_controls RLS', () => {
  it('restricts emergency brake updates (ON by members, OFF by CEO)', async () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const migrationPath = path.join(
      repoRoot,
      'supabase',
      'migrations',
      '20260219000002_org_safety_controls_rls.sql'
    );

    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('ALTER TABLE public.org_safety_controls ENABLE ROW LEVEL SECURITY;');

    expect(sql).toContain('CREATE POLICY "org_safety_controls_select_org_members"');
    expect(sql).toContain('FOR SELECT');
    expect(sql).toContain('organization_id = (SELECT public.get_user_organization())');

    expect(sql).toContain('CREATE POLICY "org_safety_controls_insert_org_members_enable_true"');
    expect(sql).toContain('FOR INSERT');
    expect(sql).toContain('emergency_brake_enabled = true');
    expect(sql).toContain('updated_by = auth.uid()');

    expect(sql).toContain('CREATE POLICY "org_safety_controls_update_org_members_enable_true"');
    expect(sql).toContain('FOR UPDATE');

    expect(sql).toContain('CREATE POLICY "org_safety_controls_update_ceo_disable_false"');
    expect(sql).toContain('emergency_brake_enabled = false');
    expect(sql).toContain("(SELECT public.get_user_role()) = 'CEO'::public.user_role");
  });
});
