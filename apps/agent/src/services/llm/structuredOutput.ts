import type {
  StructuredOutputFailureKind,
  StructuredOutputFailureMetadata,
  StructuredOutputResponseMetadata,
} from './types.js';

export interface StructuredOutputAttemptRecord {
  attemptNumber: number;
  usedRepairPrompt: boolean;
  rawContent?: string;
  failureKind?: StructuredOutputFailureKind;
}

export interface StructuredOutputAttemptState {
  attempts: StructuredOutputAttemptRecord[];
}

export class StructuredOutputError extends Error {
  readonly metadata: StructuredOutputFailureMetadata;

  constructor(metadata: StructuredOutputFailureMetadata) {
    super(metadata.message);
    this.name = 'StructuredOutputError';
    this.metadata = metadata;
  }
}

export function createStructuredOutputAttemptState(): StructuredOutputAttemptState {
  return { attempts: [] };
}

export function recordStructuredOutputAttempt(
  state: StructuredOutputAttemptState,
  attempt: StructuredOutputAttemptRecord,
): void {
  state.attempts.push(attempt);
}

export function buildStructuredOutputResponseMetadata(
  state: StructuredOutputAttemptState,
): StructuredOutputResponseMetadata {
  return {
    attempts: state.attempts.length,
    repaired: state.attempts.some((attempt) => attempt.usedRepairPrompt),
  };
}

export function stripMarkdownFences(content: string): string {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1].trim() : trimmed;
}

export function buildStrictJsonRetryPrompt(prompt: string): string {
  return [
    prompt.trim(),
    '',
    'RETRY INSTRUCTIONS:',
    '- Your previous response was not valid JSON.',
    '- Return ONLY valid JSON that matches the requested schema.',
    '- Do not include markdown fences, commentary, trailing commas, or extra prose.',
    '- Ensure all brackets, braces, quotes, and commas are syntactically valid.',
  ].join('\n');
}

export function buildStructuredOutputFailureMetadata(
  error: unknown,
  rawContent: string | undefined,
  attempts: number,
  exhausted: boolean,
): StructuredOutputFailureMetadata {
  const kind = classifyStructuredOutputFailureKind(error);
  const message = error instanceof Error ? error.message : String(error);

  return {
    kind,
    message,
    attempts,
    exhausted,
    rawContent,
  };
}

export function isStructuredOutputError(error: unknown): error is StructuredOutputError {
  return error instanceof StructuredOutputError;
}

function classifyStructuredOutputFailureKind(error: unknown): StructuredOutputFailureKind {
  if (error instanceof SyntaxError) {
    return 'json_parse_failure';
  }

  if (error instanceof Error && /empty or invalid content/i.test(error.message)) {
    return 'empty_content';
  }

  return 'json_parse_failure';
}
