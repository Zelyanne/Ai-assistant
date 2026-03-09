import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('Supabase migration: status_reports', () => {
  it('creates status_reports with org-scoped RLS and idempotency guarantees', async () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const migrationPath = path.join(
      repoRoot,
      'supabase',
      'migrations',
      '20260309000000_create_status_reports.sql',
    );

    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.status_reports');
    expect(sql).toContain('organization_id UUID NOT NULL');
    expect(sql).toContain('report_period_start TIMESTAMPTZ NOT NULL');
    expect(sql).toContain('report_period_end TIMESTAMPTZ NOT NULL');
    expect(sql).toContain('idempotency_key TEXT NOT NULL');
    expect(sql).toContain("wins JSONB NOT NULL DEFAULT '[]'::jsonb");
    expect(sql).toContain("critical_actions JSONB NOT NULL DEFAULT '[]'::jsonb");
    expect(sql).toContain('CONSTRAINT status_reports_idempotency UNIQUE');
    expect(sql).toContain('ALTER TABLE public.status_reports ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('CREATE POLICY "status_reports_org_access"');
  });
});
