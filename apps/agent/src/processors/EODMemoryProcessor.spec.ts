import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Task } from '@ai-assistant/shared';
import {
  SHORT_TERM_MEMORY_FILENAME,
  WEEKLY_MEMORY_FILENAME,
} from '../services/EODMemoryAggregator.js';
import { MemoryService } from '../services/MemoryService.js';

const generateText = vi.fn();

vi.mock('../services/llm/factory.js', () => ({
  LLMProviderFactory: {
    getProvider: vi.fn(() => ({
      generateText,
    })),
  },
}));

const insertedAuditRows: Array<Record<string, unknown>> = [];
const organizationProfiles = new Map<string, Array<{ id: string }>>();

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'agent_activity_log') {
        return {
          insert: async (payload: Record<string, unknown>) => {
            insertedAuditRows.push(payload);
            return { error: null };
          },
        };
      }

      if (table === 'profiles') {
        return {
          select: () => ({
            eq: async (_column: string, organizationId: string) => ({
              data: organizationProfiles.get(organizationId) ?? [],
              error: null,
            }),
          }),
        };
      }

      throw new Error(`Unhandled table: ${table}`);
    }),
  },
}));

describe('EODMemoryProcessor', () => {
  let memoryRoot: string;

  beforeEach(async () => {
    memoryRoot = await mkdtemp(join(tmpdir(), 'eod-processor-'));
    insertedAuditRows.length = 0;
    organizationProfiles.clear();
    generateText.mockReset();
    generateText.mockResolvedValue({
      data: '- Closed launch blocker\n- Captured next commitments',
      model: 'mistral-small-latest',
      usage: {
        promptTokens: 10,
        completionTokens: 10,
        totalTokens: 20,
        latencyMs: 10,
      },
    });
  });

  afterEach(async () => {
    await rm(memoryRoot, { recursive: true, force: true });
  });

  it('rotates user-scoped memory for all profiles in an organization and logs audit data', async () => {
    const { EODMemoryProcessor } = await import('./EODMemoryProcessor.js');

    organizationProfiles.set('org-1', [{ id: 'user-1' }, { id: 'user-2' }]);

    const userOnePath = join(memoryRoot, 'org-1', 'user-1');
    const userTwoPath = join(memoryRoot, 'org-1', 'user-2');
    await mkdir(userOnePath, { recursive: true });
    await mkdir(userTwoPath, { recursive: true });

    await writeFile(
      join(userOnePath, SHORT_TERM_MEMORY_FILENAME),
      '# Short-Term Memory\n- Launch blocker closed\n- Follow-up pending\n',
      'utf8',
    );
    await writeFile(join(userOnePath, WEEKLY_MEMORY_FILENAME), '# Weekly Memory\n', 'utf8');
    await writeFile(join(userTwoPath, SHORT_TERM_MEMORY_FILENAME), '# Short-Term Memory\n', 'utf8');
    await writeFile(join(userTwoPath, WEEKLY_MEMORY_FILENAME), '# Weekly Memory\n', 'utf8');

    const processor = new EODMemoryProcessor({
      aggregatorOptions: {
        memoryService: new MemoryService({ memoryRoot }),
      },
    });

    const result = await processor.process({
      id: 'task-1',
      organization_id: 'org-1',
      user_id: null,
      domain_action: 'eod.memory.rotate',
      status: 'queued',
      payload: { eod_date: '2026-03-19' },
    } as Task);

    const weeklyMemory = await readFile(join(userOnePath, WEEKLY_MEMORY_FILENAME), 'utf8');
    const shortTermMemory = await readFile(join(userOnePath, SHORT_TERM_MEMORY_FILENAME), 'utf8');
    const skippedWeeklyMemory = await readFile(join(userTwoPath, WEEKLY_MEMORY_FILENAME), 'utf8');

    expect(result).toEqual(
      expect.objectContaining({
        outcome: 'rotated',
        eod_date: '2026-03-19',
        rotated_count: 1,
        skipped_count: 1,
      }),
    );
    expect(weeklyMemory).toContain('## 2026-03-19');
    expect(weeklyMemory).toContain('Closed launch blocker');
    expect(shortTermMemory).toBe('# Short-Term Memory\n');
    expect(skippedWeeklyMemory).toBe('# Weekly Memory\n');
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0]?.[0]).toContain('Organization ID: org-1');
    expect(generateText.mock.calls[0]?.[0]).toContain('User ID: user-1');
    expect(insertedAuditRows).toHaveLength(1);
    expect(insertedAuditRows[0].action_taken).toBe('eod_memory_rotation_completed');
  });
});
