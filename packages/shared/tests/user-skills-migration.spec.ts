import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('Supabase migration: user_skills schema and RLS', () => {
  it('creates user_skills with principal-scoped RLS and indexes', async () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const migrationPath = path.join(
      repoRoot,
      'supabase',
      'migrations',
      '20260330220000_create_user_skills.sql',
    );

    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.user_skills');
    expect(sql).toContain('CONSTRAINT user_skills_unique_name_per_user UNIQUE (organization_id, user_id, name)');
    expect(sql).toContain("tags TEXT[] NOT NULL DEFAULT '{}'::text[]");
    expect(sql).toContain("triggers TEXT[] NOT NULL DEFAULT '{}'::text[]");

    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_user_skills_org_user');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_user_skills_tags_gin');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_user_skills_triggers_gin');

    expect(sql).toContain('ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('CREATE POLICY "user_skills_principal_access" ON public.user_skills');
    expect(sql).toContain('public.has_principal_access(organization_id, user_id)');
  });
});
