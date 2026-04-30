import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WatchTopicService, type WatchTopicRow } from './WatchTopicService.js';
import { supabase } from './supabase.js';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('../config/index.js', () => ({
  config: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  },
}));

vi.mock('./supabase.js', () => ({
  supabase: {
    from: mocks.from,
  },
}));

interface MockState {
  rows: WatchTopicRow[];
  inserts: Record<string, unknown>[];
  updates: Record<string, unknown>[];
}

function row(overrides: Partial<WatchTopicRow>): WatchTopicRow {
  return {
    id: 'topic-1',
    organization_id: 'org-1',
    user_id: 'user-1',
    topic: 'APSEC',
    priority: 'Medium',
    keywords_array: ['APSEC'],
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function setupSupabaseMock(state: MockState): void {
  vi.mocked(supabase.from).mockImplementation(() => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      insert: vi.fn().mockImplementation((values: Record<string, unknown>) => {
        state.inserts.push(values);
        const inserted = row({
          id: 'topic-created',
          topic: String(values.topic),
          priority: values.priority === 'High' || values.priority === 'Low' ? values.priority : 'Medium',
          keywords_array: Array.isArray(values.keywords_array) ? values.keywords_array.filter((value): value is string => typeof value === 'string') : [],
        });
        return mutation(inserted);
      }),
      update: vi.fn().mockImplementation((values: Record<string, unknown>) => {
        state.updates.push(values);
        return mutation(row({
          ...state.rows[0],
          topic: typeof values.topic === 'string' ? values.topic : state.rows[0]?.topic,
          priority: values.priority === 'High' || values.priority === 'Medium' || values.priority === 'Low' ? values.priority : state.rows[0]?.priority,
          keywords_array: Array.isArray(values.keywords_array) ? values.keywords_array.filter((value): value is string => typeof value === 'string') : state.rows[0]?.keywords_array,
        }));
      }),
      then: (resolve: (value: { data: WatchTopicRow[]; error: null }) => unknown) => Promise.resolve(resolve({ data: state.rows, error: null })),
    };

    return query;
  });
}

function mutation(data: WatchTopicRow): Record<string, unknown> {
  return {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

describe('WatchTopicService', () => {
  let service: WatchTopicService;
  let state: MockState;

  beforeEach(() => {
    vi.clearAllMocks();
    state = { rows: [], inserts: [], updates: [] };
    setupSupabaseMock(state);
    service = new WatchTopicService();
  });

  it('prevents duplicates by reusing a case-insensitive topic match', async () => {
    state.rows = [row({ topic: 'APSEC' })];

    const result = await service.upsertTopic({
      organizationId: 'org-1',
      userId: 'user-1',
      topic: '  apsec  ',
    });

    expect(result.outcome).toBe('reused');
    expect(state.inserts).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it('creates a scoped topic when no duplicate exists', async () => {
    const result = await service.upsertTopic({
      organizationId: 'org-1',
      userId: 'user-1',
      topic: 'Investor updates',
      priority: 'High',
    });

    expect(result.outcome).toBe('created');
    expect(state.inserts[0]).toMatchObject({
      organization_id: 'org-1',
      user_id: 'user-1',
      topic: 'Investor updates',
      priority: 'High',
      keywords_array: ['Investor updates'],
    });
  });

  it('does not update a matching organization-wide topic for a user-scoped request', async () => {
    state.rows = [row({ id: 'global-topic', user_id: null, topic: 'APSEC' })];

    const result = await service.upsertTopic({
      organizationId: 'org-1',
      userId: 'user-1',
      topic: 'APSEC',
    });

    expect(result.outcome).toBe('created');
    expect(state.updates).toEqual([]);
    expect(state.inserts[0]).toMatchObject({
      user_id: 'user-1',
      topic: 'APSEC',
    });
  });

  it('updates a single similar user-scoped topic instead of creating a duplicate', async () => {
    state.rows = [row({ id: 'topic-1', user_id: 'user-1', topic: 'APSEC updates' })];

    const result = await service.upsertTopic({
      organizationId: 'org-1',
      userId: 'user-1',
      topic: 'APSEC',
      priority: 'High',
    });

    expect(result.outcome).toBe('updated');
    expect(state.inserts).toEqual([]);
    expect(state.updates[0]).toMatchObject({
      topic: 'APSEC',
      priority: 'High',
    });
  });
});
