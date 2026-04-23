import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { researchAgent } from '../agents/ResearchAgent.js';

function toJsonString(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function classifyResearchError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('empty after pii redaction')) {
    return 'query_redacted_empty';
  }

  return 'research_unavailable';
}

export function createSearchWebResearchTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'search_web_research',
    description:
      'Run delegated web research via SearXNG MCP and return a structured brief with summary, findings, and sources.',
    schema: z.object({
      query: z.string().min(1),
      time_range: z.enum(['day', 'month', 'year']).optional(),
      safesearch: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
      language: z.string().min(2).max(8).optional(),
    }),
    func: async (input) => {
      try {
        const report = await researchAgent.run({
          query: input.query,
          time_range: input.time_range,
          safesearch: input.safesearch,
          language: input.language,
        });

        return toJsonString({
          ok: true,
          ...report,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const errorCode = classifyResearchError(message);

        return toJsonString({
          ok: false,
          summary:
            errorCode === 'query_redacted_empty'
              ? 'Research unavailable: your query was fully redacted for privacy. Please provide a safer query.'
              : 'Research unavailable: the web research service is currently unavailable. Please try again shortly.',
          key_findings: [],
          sources: [],
          error: errorCode,
        });
      }
    },
  });
}
