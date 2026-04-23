import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Channel task and audit-log RLS policy coverage', () => {
  it('keeps tasks table principal-access policy for channel task read/write', () => {
    const sql = readFileSync(
      new URL('../../../../supabase/migrations/20260114000002_principal_driven_permissions.sql', import.meta.url),
      'utf8',
    );

    expect(sql).toContain('CREATE POLICY "Principal access for tasks" ON public.tasks');
    expect(sql).toContain('FOR ALL USING (public.has_principal_access(organization_id, user_id));');
  });

  it('keeps immutable audit-log policies for insert/select of delivery state updates', () => {
    const sql = readFileSync(
      new URL('../../../../supabase/migrations/20260118000001_make_audit_log_immutable.sql', import.meta.url),
      'utf8',
    );

    expect(sql).toContain('CREATE POLICY "Enable insert for organization members" ON public.agent_activity_log');
    expect(sql).toContain('CREATE POLICY "Enable select for organization members" ON public.agent_activity_log');
  });
});
