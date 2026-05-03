import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResearchAgent } from './ResearchAgent.js';

const {
  mockRedactPII,
  mockHealthCheck,
  mockExecuteTool,
} = vi.hoisted(() => ({
  mockRedactPII: vi.fn<(value: string) => string>(),
  mockHealthCheck: vi.fn(),
  mockExecuteTool: vi.fn(),
}));

vi.mock('../guards/PerimeterGuard.js', () => ({
  PerimeterGuard: class {
    redactPII(value: string): string {
      return mockRedactPII(value);
    }
  },
}));

vi.mock('../services/searxngMcp.js', () => ({
  searxngMcpService: {
    healthCheck: mockHealthCheck,
    executeTool: mockExecuteTool,
  },
}));

describe('ResearchAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRedactPII.mockImplementation((value: string) => value.replace(/alexis@example\.com/gi, '[EMAIL_1]'));
    mockHealthCheck.mockResolvedValue({ healthy: true, status: 200, message: 'ok' });
    mockExecuteTool.mockResolvedValue({
      results: [
        {
          title: 'Source One',
          url: 'https://example.com/one',
          snippet: 'First snippet',
        },
        {
          title: 'Source Two',
          link: 'https://example.com/two',
          content: 'Second snippet',
        },
        {
          name: 'Source Three',
          href: 'https://example.com/three',
          description: 'Third snippet',
        },
      ],
    });
  });

  it('redacts PII before search and returns structured sources', async () => {
    const agent = new ResearchAgent();

    const report = await agent.run({
      query: 'find updates about alexis@example.com job market',
      time_range: 'month',
      safesearch: 1,
      language: 'en',
    });

    expect(mockExecuteTool).toHaveBeenCalledWith('search', {
      queries: ['find updates about [EMAIL_1] job market'],
      time_range: 'month',
      safesearch: 1,
      language: 'en',
    });
    expect(report.sources).toHaveLength(3);
    expect(report.summary).toContain('[EMAIL_1]');
    expect(report.summary).not.toContain('alexis@example.com');
  });

  it('does not leak mixed PII tokens into outbound search queries', async () => {
    mockRedactPII.mockImplementationOnce((value: string) => value
      .replace(/alexis@example\.com/gi, '[EMAIL_1]')
      .replace(/\+?1\s*\(?(?:415)\)?[-\s.]?555[-\s.]?1212/gi, '[PHONE_1]')
      .replace(/alexis/gi, '[NAME_1]'));

    const agent = new ResearchAgent();

    const report = await agent.run({
      query: 'find grants for Alexis (+1 415-555-1212) and alexis@example.com',
      language: 'en',
    });

    expect(mockExecuteTool).toHaveBeenCalledWith('search', {
      queries: ['find grants for [NAME_1] ([PHONE_1]) and [EMAIL_1]'],
      time_range: undefined,
      safesearch: undefined,
      language: 'en',
    });
    expect(report.summary).not.toContain('alexis@example.com');
    expect(report.summary).not.toContain('415');
  });

  it('extracts sources from MCP text JSON envelopes', async () => {
    mockExecuteTool.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            searches: [
              {
                query: 'ovni 2026 actualites',
                results: [
                  {
                    title: 'Source From MCP Text',
                    link: 'https://example.com/mcp-text',
                    snippet: 'Nested result snippet',
                  },
                ],
                success: true,
              },
            ],
          }),
        },
      ],
    });

    const agent = new ResearchAgent();
    const report = await agent.run({ query: 'ovni 2026 actualites', language: 'fr' });

    expect(report.sources).toEqual([
      expect.objectContaining({
        title: 'Source From MCP Text',
        url: 'https://example.com/mcp-text',
        snippet: 'Nested result snippet',
      }),
    ]);
  });

  it('throws a clear error when SearXNG MCP is unavailable', async () => {
    mockHealthCheck.mockResolvedValueOnce({
      healthy: false,
      status: 503,
      message: 'connection refused',
    });

    const agent = new ResearchAgent();

    await expect(agent.run({ query: 'latest AI safety papers' })).rejects.toThrow(
      'SearXNG MCP is unavailable: connection refused',
    );
  });

  it('blocks execution when query is empty after redaction', async () => {
    mockRedactPII.mockReturnValueOnce('   ');

    const agent = new ResearchAgent();

    await expect(agent.run({ query: 'alexis@example.com' })).rejects.toThrow(
      'Research query is empty after PII redaction.',
    );
  });
});
