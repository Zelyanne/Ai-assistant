import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSearchWebResearchTool } from './researchTools.js';
import { researchAgent } from '../agents/ResearchAgent.js';

const { mockResearchRun } = vi.hoisted(() => ({
  mockResearchRun: vi.fn(),
}));

vi.mock('../agents/ResearchAgent.js', () => ({
  researchAgent: {
    run: mockResearchRun,
  },
}));

describe('search_web_research tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns structured success payload when research succeeds', async () => {
    mockResearchRun.mockResolvedValueOnce({
      summary: 'Research complete',
      key_findings: ['Finding 1'],
      sources: [
        {
          title: 'Source One',
          url: 'https://example.com/one',
          snippet: 'Snippet one',
        },
      ],
    });

    const tool = createSearchWebResearchTool();
    const raw = await tool.invoke({ query: 'latest TypeScript 5 features' });
    const parsed = JSON.parse(String(raw)) as {
      ok: boolean;
      summary: string;
      key_findings: string[];
      sources: Array<{ url: string }>;
    };

    expect(researchAgent.run).toHaveBeenCalledWith({
      query: 'latest TypeScript 5 features',
      time_range: undefined,
      safesearch: undefined,
      language: undefined,
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.summary).toBe('Research complete');
    expect(parsed.sources[0]?.url).toBe('https://example.com/one');
  });

  it('returns clear non-crashing error payload when research backend is unreachable', async () => {
    mockResearchRun.mockRejectedValueOnce(new Error('SearXNG MCP is unavailable: ECONNREFUSED'));

    const tool = createSearchWebResearchTool();
    const raw = await tool.invoke({ query: 'AI legislation updates' });
    const parsed = JSON.parse(String(raw)) as {
      ok: boolean;
      summary: string;
      key_findings: string[];
      sources: unknown[];
      error: string;
    };

    expect(parsed.ok).toBe(false);
    expect(parsed.summary).toContain('Research unavailable:');
    expect(parsed.summary).not.toContain('ECONNREFUSED');
    expect(parsed.error).toBe('research_unavailable');
    expect(parsed.key_findings).toEqual([]);
    expect(parsed.sources).toEqual([]);
  });

  it('returns a privacy-safe prompt when query becomes empty after redaction', async () => {
    mockResearchRun.mockRejectedValueOnce(new Error('Research query is empty after PII redaction.'));

    const tool = createSearchWebResearchTool();
    const raw = await tool.invoke({ query: 'my ssn and personal records' });
    const parsed = JSON.parse(String(raw)) as {
      ok: boolean;
      summary: string;
      error: string;
    };

    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe('query_redacted_empty');
    expect(parsed.summary).toContain('fully redacted for privacy');
  });
});
