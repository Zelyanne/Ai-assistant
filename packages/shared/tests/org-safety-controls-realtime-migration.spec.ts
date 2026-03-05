import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('Supabase migration: org_safety_controls Realtime', () => {
  it('adds org_safety_controls to supabase_realtime publication', async () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const migrationPath = path.join(
      repoRoot,
      'supabase',
      'migrations',
      '20260219000001_org_safety_controls_realtime.sql'
    );

    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.org_safety_controls;');
  });
});
