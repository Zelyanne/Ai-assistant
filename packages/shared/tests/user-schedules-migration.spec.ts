import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('Supabase migration: user_schedules schema and RLS', () => {
  it('creates user_schedules with RLS policy and polling indexes', async () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const migrationPath = path.join(
      repoRoot,
      'supabase',
      'migrations',
      '20260320100000_create_user_schedules.sql',
    );

    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.user_schedules');
    expect(sql).toContain('cron_expression TEXT NOT NULL');
    expect(sql).toContain("timezone TEXT NOT NULL DEFAULT 'UTC'");
    expect(sql).toContain('failure_count INTEGER NOT NULL DEFAULT 0');
    expect(sql).toContain('last_error TEXT');

    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_user_schedules_next_run_active');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_user_schedules_org_user');

    expect(sql).toContain('ALTER TABLE public.user_schedules ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('CREATE POLICY "user_schedules_org_access" ON public.user_schedules');
    expect(sql).toContain('organization_id = (SELECT public.get_user_organization())');
    expect(sql).toContain('user_id = (SELECT auth.uid())');
    expect(sql).toContain('CREATE POLICY "user_schedule_dispatches_org_access" ON public.user_schedule_dispatches');
    expect(sql).toContain('FROM public.user_schedules schedules');
  });
});
