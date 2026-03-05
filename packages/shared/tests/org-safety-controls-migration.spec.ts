import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('Supabase migration: org_safety_controls', () => {
  it('creates org_safety_controls table with emergency brake fields', async () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const migrationPath = path.join(
      repoRoot,
      'supabase',
      'migrations',
      '20260219000000_create_org_safety_controls.sql'
    );

    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.org_safety_controls');
    expect(sql).toContain('organization_id UUID');
    expect(sql).toContain('emergency_brake_enabled BOOLEAN');
    expect(sql).toContain('updated_at TIMESTAMPTZ');
    expect(sql).toContain('updated_by UUID');
  });
});
