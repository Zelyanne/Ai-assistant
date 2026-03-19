import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_SHORT_TERM_MEMORY,
  EODMemoryAggregator,
  SHORT_TERM_MEMORY_FILENAME,
  WEEKLY_MEMORY_FILENAME,
} from './EODMemoryAggregator.js';

describe('EODMemoryAggregator', () => {
  let memoryRoot: string;
  const summarizeDailyMemoryWithLLM = vi.fn();

  beforeEach(async () => {
    memoryRoot = await mkdtemp(join(tmpdir(), 'eod-memory-'));
    summarizeDailyMemoryWithLLM.mockReset();
  });

  afterEach(async () => {
    await rm(memoryRoot, { recursive: true, force: true });
  });

  it('summarizes user-scoped short-term memory and formats a daily section', async () => {
    const service = new EODMemoryAggregator({
      memoryRoot,
      summarizeDailyMemoryWithLLM,
    });

    const organizationId = 'org-1';
    const userId = 'user-1';
    const userPath = join(memoryRoot, organizationId, userId);
    await mkdir(userPath, { recursive: true });
    await writeFile(
      join(userPath, SHORT_TERM_MEMORY_FILENAME),
      '# Short-Term Memory\n- Closed launch blocker\n- Confirmed vendor ETA\n',
      'utf8',
    );

    summarizeDailyMemoryWithLLM.mockResolvedValue('- Closed launch blocker\n- Confirmed vendor ETA');

    const summary = await service.summarizeDailyMemory(
      organizationId,
      userId,
      new Date('2026-03-19T00:00:00.000Z'),
    );

    expect(summary).toContain('## 2026-03-19');
    expect(summary).toContain('- Closed launch blocker');
    expect(summarizeDailyMemoryWithLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        userId,
        shortTermMemory: expect.stringContaining('Closed launch blocker'),
      }),
    );
  });

  it('appends generated summary to user weekly-memory markdown', async () => {
    const service = new EODMemoryAggregator({
      memoryRoot,
      summarizeDailyMemoryWithLLM,
    });

    const userPath = join(memoryRoot, 'org-1', 'user-1');
    await mkdir(userPath, { recursive: true });
    await writeFile(
      join(userPath, WEEKLY_MEMORY_FILENAME),
      '# Weekly Memory\n\n## 2026-03-18\n- Previous summary\n',
      'utf8',
    );

    const appended = await service.appendToWeeklyMemory(
      'org-1',
      'user-1',
      '## 2026-03-19\n- New EOD summary\n',
    );

    const weekly = await readFile(join(userPath, WEEKLY_MEMORY_FILENAME), 'utf8');
    expect(appended).toBe(true);
    expect(weekly).toContain('## 2026-03-18');
    expect(weekly).toContain('## 2026-03-19');
    expect(weekly).toContain('- New EOD summary');
  });

  it('resets user short-term memory after rotation', async () => {
    const service = new EODMemoryAggregator({
      memoryRoot,
      summarizeDailyMemoryWithLLM,
    });

    const userPath = join(memoryRoot, 'org-1', 'user-1');
    await mkdir(userPath, { recursive: true });
    await writeFile(
      join(userPath, SHORT_TERM_MEMORY_FILENAME),
      '# Short-Term Memory\n- Temporary content\n',
      'utf8',
    );

    await service.resetShortTermMemory('org-1', 'user-1');

    const shortTerm = await readFile(join(userPath, SHORT_TERM_MEMORY_FILENAME), 'utf8');
    expect(shortTerm).toBe(DEFAULT_SHORT_TERM_MEMORY);
  });

  it('keeps tenant and user memory isolated during full rotation flow', async () => {
    const service = new EODMemoryAggregator({
      memoryRoot,
      summarizeDailyMemoryWithLLM,
    });

    const userAPath = join(memoryRoot, 'org-a', 'user-a');
    const userBPath = join(memoryRoot, 'org-a', 'user-b');
    await mkdir(userAPath, { recursive: true });
    await mkdir(userBPath, { recursive: true });

    await writeFile(join(userAPath, SHORT_TERM_MEMORY_FILENAME), '# Short-Term Memory\n- Org A item\n', 'utf8');
    await writeFile(join(userAPath, WEEKLY_MEMORY_FILENAME), '# Weekly Memory\n', 'utf8');
    await writeFile(join(userBPath, SHORT_TERM_MEMORY_FILENAME), '# Short-Term Memory\n- Org B item\n', 'utf8');
    await writeFile(join(userBPath, WEEKLY_MEMORY_FILENAME), '# Weekly Memory\n\n- Keep untouched\n', 'utf8');

    summarizeDailyMemoryWithLLM.mockResolvedValue('- Org A summary');

    await service.rotateDailyMemory('org-a', 'user-a', new Date('2026-03-19T00:00:00.000Z'));

    const userAWeekly = await readFile(join(userAPath, WEEKLY_MEMORY_FILENAME), 'utf8');
    const userBWeekly = await readFile(join(userBPath, WEEKLY_MEMORY_FILENAME), 'utf8');
    const userBShortTerm = await readFile(join(userBPath, SHORT_TERM_MEMORY_FILENAME), 'utf8');

    expect(userAWeekly).toContain('Org A summary');
    expect(userBWeekly).toContain('Keep untouched');
    expect(userBShortTerm).toContain('Org B item');
  });

  it('skips empty memory and avoids duplicate same-day summaries', async () => {
    const service = new EODMemoryAggregator({
      memoryRoot,
      summarizeDailyMemoryWithLLM,
    });

    const userPath = join(memoryRoot, 'org-1', 'user-1');
    await mkdir(userPath, { recursive: true });
    await writeFile(join(userPath, SHORT_TERM_MEMORY_FILENAME), '# Short-Term Memory\n- Ship release\n', 'utf8');
    await writeFile(join(userPath, WEEKLY_MEMORY_FILENAME), '# Weekly Memory\n', 'utf8');

    summarizeDailyMemoryWithLLM.mockResolvedValue('- Ship release');

    const first = await service.rotateDailyMemory(
      'org-1',
      'user-1',
      new Date('2026-03-19T00:00:00.000Z'),
    );
    const second = await service.rotateDailyMemory(
      'org-1',
      'user-1',
      new Date('2026-03-19T00:00:00.000Z'),
    );
    const weekly = await readFile(join(userPath, WEEKLY_MEMORY_FILENAME), 'utf8');

    expect(first.status).toBe('rotated');
    expect(second.status).toBe('already_rotated');
    expect(weekly.match(/## 2026-03-19/g)).toHaveLength(1);
    expect(summarizeDailyMemoryWithLLM).toHaveBeenCalledTimes(1);
  });
});
