const UUID_MATCH_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const UUID_TEST_REGEX = /^\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b$/i;

export interface FormattedMorningBriefNarrative {
  narrativeHtml: string;
  sourceIds: string[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function collapseInlineWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function splitBlocks(text: string): string[] {
  const normalized = normalizeNewlines(text);
  return normalized
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

function splitIntoSentences(text: string): string[] {
  const normalized = collapseInlineWhitespace(normalizeNewlines(text));
  if (!normalized) return [];

  const re = /[^.!?]+[.!?]+(?:\s+|$)/g;
  const sentences: string[] = [];
  let lastEnd = 0;
  let match: RegExpExecArray | null = null;

  while ((match = re.exec(normalized)) !== null) {
    sentences.push(match[0].trim());
    lastEnd = re.lastIndex;
  }

  if (lastEnd < normalized.length) {
    const tail = normalized.slice(lastEnd).trim();
    if (tail) sentences.push(tail);
  }

  if (sentences.length > 0) return sentences;
  return [normalized];
}

function chunkSentences(sentences: string[], maxPerChunk: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += maxPerChunk) {
    chunks.push(sentences.slice(i, i + maxPerChunk).join(' ').trim());
  }
  return chunks.filter(Boolean);
}

function parseSourceIdsFromText(text: string): string[] {
  const found = normalizeNewlines(text).match(UUID_MATCH_REGEX) ?? [];
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const raw of found) {
    const id = raw.toLowerCase();
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(id);
    }
  }

  return unique.slice(0, 50);
}

function normalizeSourceIdsFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const maybe = metadata as Record<string, unknown>;
  const raw = maybe['source_ids'];
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const unique: string[] = [];

  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const id = item.trim().toLowerCase();
    if (!UUID_TEST_REGEX.test(id)) {
      continue;
    }
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(id);
    }
    if (unique.length >= 50) break;
  }

  return unique;
}

function stripIdsFromNarrative(text: string): string {
  const normalized = normalizeNewlines(text);

  // Remove common wrappers first to avoid orphaned tokens.
  const withoutWrappers = normalized
    .replace(/\[\s*ID\s*:\s*/gi, '[')
    .replace(/\[\s*SOURCE_ID\s*:\s*/gi, '[')
    .replace(/SOURCE_ID\s*:\s*/gi, '')
    .replace(/\[\s*ID\s*\]/gi, '')
    .replace(/\[\s*\]/g, '');

  // Remove any remaining UUIDs.
  const withoutUuids = withoutWrappers.replace(UUID_MATCH_REGEX, '');

  // Clean up leftover punctuation/spacing and empty lines.
  return withoutUuids
    .split('\n')
    .map((line) => collapseInlineWhitespace(line.replace(/\s+([,.;:!?])/g, '$1')))
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
}

export function maskSourceId(id: string): string {
  const cleaned = String(id || '').trim();
  if (cleaned.length <= 8) return cleaned;
  return `${cleaned.slice(0, 8)}...`;
}

export function formatMorningBriefNarrative(summaryText: string, metadata?: unknown): FormattedMorningBriefNarrative {
  const rawText = String(summaryText || '');

  const fromMetadata = normalizeSourceIdsFromMetadata(metadata);
  const fromText = parseSourceIdsFromText(rawText);
  const sourceIds = (fromMetadata.length > 0 ? fromMetadata : fromText).slice(0, 50);

  const cleanedNarrative = stripIdsFromNarrative(rawText);
  const blocks = splitBlocks(cleanedNarrative);

  if (blocks.length === 0) {
    return { narrativeHtml: '', sourceIds };
  }

  let blufText = '';
  let bodyParagraphs: string[] = [];

  if (blocks.length === 1) {
    const sentences = splitIntoSentences(blocks[0]);
    blufText = sentences.slice(0, 2).join(' ').trim();
    const remainder = sentences.slice(2);
    bodyParagraphs = chunkSentences(remainder, 3);
  } else {
    const blufSentences = splitIntoSentences(blocks[0]);
    blufText = blufSentences.slice(0, 2).join(' ').trim();

    const bodyBlocks = blocks.slice(1);
    const paragraphs: string[] = [];
    for (const block of bodyBlocks) {
      const sentences = splitIntoSentences(block);
      paragraphs.push(...chunkSentences(sentences, 3));
    }
    bodyParagraphs = paragraphs;
  }

  const parts: string[] = [];
  if (blufText) {
    parts.push(`<div class="bluf-box">${escapeHtml(collapseInlineWhitespace(blufText))}</div>`);
  }

  for (const p of bodyParagraphs) {
    const cleaned = collapseInlineWhitespace(p);
    if (!cleaned) continue;
    parts.push(`<p>${escapeHtml(cleaned)}</p>`);
  }

  const narrativeHtml = parts.join('');
  const allowedHtmlPattern = /^(?:<div class="bluf-box">[^<]*<\/div>)?(?:<p>[^<]*<\/p>)*$/;
  const safeHtml = allowedHtmlPattern.test(narrativeHtml) ? narrativeHtml : `<p>${escapeHtml(cleanedNarrative)}</p>`;

  return {
    narrativeHtml: safeHtml,
    sourceIds,
  };
}
