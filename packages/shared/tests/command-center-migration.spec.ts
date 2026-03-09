import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('Supabase migration: command center conversations', () => {
  it('creates conversation/message tables with org RLS and realtime publication', async () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const migrationPath = path.join(
      repoRoot,
      'supabase',
      'migrations',
      '20260309100000_create_command_center_conversations.sql',
    );

    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.command_conversations');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.command_messages');
    expect(sql).toContain("role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system'))");
    expect(sql).toContain('source_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL');
    expect(sql).toContain('correlation_id TEXT');
    expect(sql).toContain('thread_id TEXT');
    expect(sql).toContain('ALTER TABLE public.command_conversations ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE public.command_messages ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('CREATE POLICY "command_conversations_org_access"');
    expect(sql).toContain('CREATE POLICY "command_messages_org_access"');
    expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.command_conversations;');
    expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.command_messages;');
  });
});
