import { beforeEach, describe, expect, it, vi } from 'vitest';

type SkillRow = {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  description: string | null;
  content_markdown: string;
  tags: string[];
  triggers: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type QueryState = {
  filters: Array<[keyof SkillRow | string, unknown]>;
};

const rows: SkillRow[] = [];
let nextListError: { message: string } | null = null;
let nextSingleError: { message: string } | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function matchesFilters(row: SkillRow, filters: QueryState['filters']): boolean {
  return filters.every(([key, value]) => (row as Record<string, unknown>)[key] === value);
}

function createQuery() {
  const state: QueryState = {
    filters: [],
  };

  const api = {
    select: vi.fn(() => api),
    eq: vi.fn((key: keyof SkillRow | string, value: unknown) => {
      state.filters.push([key, value]);
      return api;
    }),
    order: vi.fn(() => api),
    maybeSingle: vi.fn(async () => {
      if (nextSingleError) {
        const error = nextSingleError;
        nextSingleError = null;
        return { data: null, error };
      }

      const filtered = rows.filter((row) => matchesFilters(row, state.filters));
      return { data: filtered[0] ? clone(filtered[0]) : null, error: null };
    }),
    then: (resolve: (value: { data: SkillRow[] | null; error: { message: string } | null }) => unknown) => {
      if (nextListError) {
        const error = nextListError;
        nextListError = null;
        return Promise.resolve({ data: null, error }).then(resolve);
      }

      const filtered = rows
        .filter((row) => matchesFilters(row, state.filters))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return Promise.resolve({ data: clone(filtered), error: null }).then(resolve);
    },
  };

  return api;
}

vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn(() => createQuery()),
  },
}));

describe('UserSkillsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows.length = 0;
    nextListError = null;
    nextSingleError = null;
  });

  it('listSkills is scoped by organization_id + user_id', async () => {
    rows.push(
      {
        id: 'skill-a1',
        organization_id: 'org-1',
        user_id: 'user-a',
        name: 'cover-letter-style',
        description: null,
        content_markdown: 'A',
        tags: ['cover-letter'],
        triggers: ['cover letter'],
        is_active: true,
        created_at: '2026-03-31T00:00:00Z',
        updated_at: '2026-03-31T00:00:02Z',
      },
      {
        id: 'skill-b1',
        organization_id: 'org-1',
        user_id: 'user-b',
        name: 'resume-style',
        description: null,
        content_markdown: 'B',
        tags: ['resume'],
        triggers: ['resume'],
        is_active: true,
        created_at: '2026-03-31T00:00:00Z',
        updated_at: '2026-03-31T00:00:03Z',
      },
      {
        id: 'skill-a2',
        organization_id: 'org-1',
        user_id: 'user-a',
        name: 'email-tone',
        description: null,
        content_markdown: 'C',
        tags: ['email'],
        triggers: ['email'],
        is_active: true,
        created_at: '2026-03-31T00:00:00Z',
        updated_at: '2026-03-31T00:00:01Z',
      },
    );

    const { UserSkillsService } = await import('./UserSkillsService.js');
    const service = new UserSkillsService();
    const result = await service.listSkills('org-1', 'user-a');

    expect(result).toHaveLength(2);
    expect(result.map((skill) => skill.user_id)).toEqual(['user-a', 'user-a']);
    expect(result.map((skill) => skill.name)).toEqual(['cover-letter-style', 'email-tone']);
  });

  it('findRelevantSkills returns only active matching skills', async () => {
    rows.push(
      {
        id: 'skill-1',
        organization_id: 'org-1',
        user_id: 'user-a',
        name: 'cover-letter-style',
        description: 'Career application writing style',
        content_markdown: 'Use concise and confident language.',
        tags: ['cover-letter', 'career'],
        triggers: ['cover letter', 'job application'],
        is_active: true,
        created_at: '2026-03-31T00:00:00Z',
        updated_at: '2026-03-31T00:00:03Z',
      },
      {
        id: 'skill-2',
        organization_id: 'org-1',
        user_id: 'user-a',
        name: 'old-cover-letter-style',
        description: 'Legacy style',
        content_markdown: 'Old style',
        tags: ['cover-letter'],
        triggers: ['cover letter'],
        is_active: false,
        created_at: '2026-03-31T00:00:00Z',
        updated_at: '2026-03-31T00:00:04Z',
      },
    );

    const { UserSkillsService } = await import('./UserSkillsService.js');
    const service = new UserSkillsService();

    const result = await service.findRelevantSkills('org-1', 'user-a', {
      query: 'cover letter',
      maxResults: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('cover-letter-style');
  });

  it('throws when organization or user scope is missing', async () => {
    const { UserSkillsService } = await import('./UserSkillsService.js');
    const service = new UserSkillsService();

    await expect(service.listSkills('org-1', '')).rejects.toThrow(
      'organizationId and userId are required for user skills access.',
    );
  });

  it('surfaces list query errors from datastore', async () => {
    nextListError = { message: 'connection timeout' };

    const { UserSkillsService } = await import('./UserSkillsService.js');
    const service = new UserSkillsService();

    await expect(service.listSkills('org-1', 'user-a')).rejects.toThrow(
      'Failed to list user skills: connection timeout',
    );
  });

  it('surfaces get-by-name query errors from datastore', async () => {
    nextSingleError = { message: 'read failed' };

    const { UserSkillsService } = await import('./UserSkillsService.js');
    const service = new UserSkillsService();

    await expect(service.getSkillByName('org-1', 'user-a', 'cover-letter-style')).rejects.toThrow(
      'Failed to fetch user skill: read failed',
    );
  });
});
