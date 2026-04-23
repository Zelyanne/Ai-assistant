import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGetUserSkillTool,
  createListUserSkillsTool,
  createSearchUserSkillsTool,
} from './userSkillsTools.js';
import { userSkillsService } from '../services/UserSkillsService.js';

const {
  mockFindRelevantSkills,
  mockListSkills,
  mockGetSkillByName,
} = vi.hoisted(() => ({
  mockFindRelevantSkills: vi.fn(),
  mockListSkills: vi.fn(),
  mockGetSkillByName: vi.fn(),
}));

vi.mock('../services/UserSkillsService.js', () => ({
  userSkillsService: {
    findRelevantSkills: mockFindRelevantSkills,
    listSkills: mockListSkills,
    getSkillByName: mockGetSkillByName,
  },
}));

describe('userSkillsTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindRelevantSkills.mockResolvedValue([]);
    mockListSkills.mockResolvedValue([]);
    mockGetSkillByName.mockResolvedValue(null);
  });

  it('returns empty results when no matching skills are found', async () => {
    const tool = createSearchUserSkillsTool({ organizationId: 'org-1', userId: 'user-1' });

    const raw = await tool.invoke({ query: 'cover letter', max_results: 5 });
    const parsed = JSON.parse(String(raw)) as {
      total: number;
      skills: unknown[];
    };

    expect(userSkillsService.findRelevantSkills).toHaveBeenCalledWith('org-1', 'user-1', {
      query: 'cover letter',
      maxResults: 5,
    });
    expect(parsed.total).toBe(0);
    expect(parsed.skills).toEqual([]);
  });

  it('throws a clear error when user scope is missing', async () => {
    const tool = createListUserSkillsTool({ organizationId: 'org-1', userId: null });

    await expect(tool.invoke({})).rejects.toThrow(
      'User-scoped skills require task.user_id. This task has no user context.',
    );
  });

  it('returns deterministic retrieval by skill name', async () => {
    mockGetSkillByName.mockResolvedValueOnce({
      id: 'skill-1',
      name: 'cover-letter-style',
      description: 'Career style',
      content_markdown: 'Use concise confident tone.',
      tags: ['cover-letter'],
      triggers: ['cover letter'],
      is_active: true,
      updated_at: '2026-03-31T00:00:00Z',
    });

    const tool = createGetUserSkillTool({ organizationId: 'org-1', userId: 'user-1' });
    const raw = await tool.invoke({ name: 'cover-letter-style' });
    const parsed = JSON.parse(String(raw)) as {
      found: boolean;
      skill: { name: string } | null;
    };

    expect(parsed.found).toBe(true);
    expect(parsed.skill?.name).toBe('cover-letter-style');
  });
});
