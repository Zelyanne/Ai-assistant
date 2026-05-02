import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createListWatchTopicsTool, createManageWatchTopicTool } from './watchTopicTools.js';
import { watchTopicService } from '../services/WatchTopicService.js';

const mocks = vi.hoisted(() => ({
  upsertTopic: vi.fn(),
  createTopic: vi.fn(),
  updateTopic: vi.fn(),
  listTopics: vi.fn(),
}));

vi.mock('../services/WatchTopicService.js', () => ({
  watchTopicService: {
    upsertTopic: mocks.upsertTopic,
    createTopic: mocks.createTopic,
    updateTopic: mocks.updateTopic,
    listTopics: mocks.listTopics,
  },
}));

describe('watchTopicTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsertTopic.mockResolvedValue({
      outcome: 'created',
      confirmation_message: 'Watch topic created: APSEC (High priority).',
      topic: {
        id: 'topic-1',
        topic: 'APSEC',
        priority: 'High',
        keywords_array: ['APSEC'],
        user_id: 'user-1',
        updated_at: '2026-04-01T00:00:00Z',
      },
    });
    mocks.listTopics.mockResolvedValue([]);
  });

  it('invokes manage_watch_topic with organization and user scope', async () => {
    const tool = createManageWatchTopicTool({ organizationId: 'org-1', userId: 'user-1' });

    const raw = await tool.invoke({ action: 'upsert', topic: 'APSEC', priority: 'High' });
    const parsed = JSON.parse(String(raw)) as { outcome: string; confirmation_message: string };

    expect(watchTopicService.upsertTopic).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      topic: 'APSEC',
      priority: 'High',
      keywords: undefined,
    });
    expect(parsed.outcome).toBe('created');
    expect(parsed.confirmation_message).toContain('APSEC');
  });

  it('lists scoped watch topics', async () => {
    mocks.listTopics.mockResolvedValueOnce([
      {
        id: 'topic-1',
        topic: 'Investor updates',
        priority: 'Medium',
        keywords_array: ['Investor updates'],
        user_id: 'user-1',
        updated_at: '2026-04-01T00:00:00Z',
      },
    ]);

    const tool = createListWatchTopicsTool({ organizationId: 'org-1', userId: 'user-1' });
    const raw = await tool.invoke({});
    const parsed = JSON.parse(String(raw)) as { total: number; topics: Array<{ topic: string }> };

    expect(watchTopicService.listTopics).toHaveBeenCalledWith('org-1', 'user-1');
    expect(parsed.total).toBe(1);
    expect(parsed.topics[0]?.topic).toBe('Investor updates');
  });
});
