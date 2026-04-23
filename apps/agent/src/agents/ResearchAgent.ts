import { z } from 'zod';
import { PerimeterGuard } from '../guards/PerimeterGuard.js';
import { searxngMcpService } from '../services/searxngMcp.js';

export const ResearchReportSchema = z.object({
  summary: z.string(),
  key_findings: z.array(z.string()),
  sources: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      snippet: z.string().optional(),
    }),
  ),
});

export type ResearchReport = z.infer<typeof ResearchReportSchema>;

export interface ResearchQueryInput {
  query: string;
  time_range?: 'day' | 'month' | 'year';
  safesearch?: 0 | 1 | 2;
  language?: string;
}

interface ParsedSource {
  title: string;
  url: string;
  snippet?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function maybeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractSourcesFromUnknown(input: unknown): ParsedSource[] {
  const out: ParsedSource[] = [];

  const visit = (value: unknown, depth: number): void => {
    if (depth > 6 || value === null || typeof value === 'undefined') {
      return;
    }

    if (typeof value === 'string') {
      const maybeJson = maybeParseJson(value);
      if (maybeJson !== value) {
        visit(maybeJson, depth + 1);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry, depth + 1);
      }
      return;
    }

    const record = asRecord(value);
    const url = asString(record.url) ?? asString(record.link) ?? asString(record.href);
    const title = asString(record.title) ?? asString(record.name) ?? asString(record.source);
    const snippet =
      asString(record.snippet) ?? asString(record.content) ?? asString(record.description);

    if (url && /^https?:\/\//i.test(url)) {
      out.push({
        title: title ?? 'Untitled source',
        url,
        snippet: snippet ?? undefined,
      });
    }

    for (const child of Object.values(record)) {
      visit(child, depth + 1);
    }
  };

  visit(input, 0);

  const deduped = new Map<string, ParsedSource>();
  for (const source of out) {
    if (!deduped.has(source.url)) {
      deduped.set(source.url, source);
    }
  }

  return Array.from(deduped.values());
}

function compactSnippet(snippet: string | undefined): string | undefined {
  if (!snippet) {
    return undefined;
  }

  const compact = snippet.replace(/\s+/g, ' ').trim();
  if (compact.length <= 220) {
    return compact;
  }

  return `${compact.slice(0, 217)}...`;
}

export class ResearchAgent {
  private readonly guard = new PerimeterGuard();

  async run(input: ResearchQueryInput): Promise<ResearchReport> {
    const redactedQuery = this.guard.redactPII(input.query ?? '').trim();
    if (!redactedQuery) {
      throw new Error('Research query is empty after PII redaction.');
    }

    const health = await searxngMcpService.healthCheck();
    if (!health.healthy) {
      throw new Error(`SearXNG MCP is unavailable: ${health.message}`);
    }

    const rawResult = await searxngMcpService.executeTool('search', {
      queries: [redactedQuery],
      time_range: input.time_range,
      safesearch: input.safesearch,
      language: input.language,
    });

    const allSources = extractSourcesFromUnknown(rawResult)
      .map((source) => ({
        ...source,
        snippet: compactSnippet(source.snippet),
      }))
      .slice(0, 12);

    const summary = allSources.length > 0
      ? `Research completed for "${redactedQuery}" using ${allSources.length} source${allSources.length === 1 ? '' : 's'}.`
      : `Research completed for "${redactedQuery}" but no sources were returned.`;

    const keyFindings = allSources.slice(0, 5).map((source, index) => {
      const prefix = `${index + 1}. ${source.title}`;
      return source.snippet ? `${prefix}: ${source.snippet}` : prefix;
    });

    return ResearchReportSchema.parse({
      summary,
      key_findings: keyFindings,
      sources: allSources,
    });
  }
}

export const researchAgent = new ResearchAgent();
