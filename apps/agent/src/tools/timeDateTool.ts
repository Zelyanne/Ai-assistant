/**
 * Time/Date Utility Tool
 *
 * Pure utility functions for relative date parsing, timezone conversion,
 * and date formatting. Also exposes a LangChain DynamicStructuredTool
 * wrapper for agent invocation.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

// --- Pure Utility Functions ---

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const IANA_TIMEZONE_RE = /^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/;

/**
 * Validates that a string is a plausible IANA timezone identifier.
 */
function isValidTimezone(timezone: string): boolean {
  if (timezone.toUpperCase() === 'UTC') return true;
  return IANA_TIMEZONE_RE.test(timezone);
}

/**
 * Get the current date/time in the given IANA timezone.
 * Falls back to UTC if the timezone is invalid.
 */
function nowInTimezone(timezone: string): Date {
  if (!isValidTimezone(timezone)) {
    return new Date();
  }

  try {
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date());

    // en-CA gives YYYY-MM-DD, HH:MM:SS — parse it as a local-ish date
    return new Date(`${formatted}Z`);
  } catch {
    return new Date();
  }
}

/**
 * Parse a relative date expression into an ISO-8601 string.
 *
 * Supports: "tomorrow", "yesterday", "today", "next week", "last week",
 * "in N days", "in N weeks", "in N hours", "next Monday", "last Friday",
 * and explicit ISO dates (returned verbatim if valid).
 *
 * @param expression - e.g. "tomorrow", "in 3 days", "next Monday"
 * @param timezone - IANA timezone identifier (default: "UTC")
 * @returns ISO-8601 datetime string
 */
export function parseRelativeDate(expression: string, timezone: string = 'UTC'): string {
  const normalized = expression.trim().toLowerCase();
  const now = nowInTimezone(timezone);

  // Explicit ISO date passthrough
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)?$/.test(expression.trim())) {
    const parsed = new Date(expression.trim());
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  // Simple relative keywords
  if (normalized === 'now' || normalized === 'today') {
    return toISODateString(now);
  }

  if (normalized === 'tomorrow') {
    return toISODateString(addDays(now, 1));
  }

  if (normalized === 'yesterday') {
    return toISODateString(addDays(now, -1));
  }

  if (normalized === 'next week') {
    return toISODateString(addDays(now, 7));
  }

  if (normalized === 'last week') {
    return toISODateString(addDays(now, -7));
  }

  // in N days/weeks/hours
  const inMatch = normalized.match(/^in\s+(\d+)\s+(day|days|week|weeks|hour|hours)$/);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2].replace(/s$/, '');

    if (unit === 'day') {
      return toISODateString(addDays(now, amount));
    }
    if (unit === 'week') {
      return toISODateString(addDays(now, amount * 7));
    }
    if (unit === 'hour') {
      return new Date(now.getTime() + amount * 3600_000).toISOString();
    }
  }

  // next/last day-of-week (e.g., "next Monday", "last Friday")
  const dayNames: Record<string, number> = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4, thur: 4, thurs: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6,
  };

  const nextDayMatch = normalized.match(/^next\s+(\w+)$/);
  if (nextDayMatch) {
    const targetDay = dayNames[nextDayMatch[1]];
    if (targetDay !== undefined) {
      return toISODateString(findNextDayOfWeek(now, targetDay, 'forward'));
    }
  }

  const lastDayMatch = normalized.match(/^last\s+(\w+)$/);
  if (lastDayMatch) {
    const targetDay = dayNames[lastDayMatch[1]];
    if (targetDay !== undefined) {
      return toISODateString(findNextDayOfWeek(now, targetDay, 'backward'));
    }
  }

  // Fallback: try native Date parsing
  const nativeParsed = new Date(expression);
  if (!isNaN(nativeParsed.getTime())) {
    return nativeParsed.toISOString();
  }

  throw new Error(`Could not parse date expression: "${expression}"`);
}

/**
 * Format a date string into a human-readable format.
 *
 * @param dateStr - ISO-8601 date string
 * @param format - "iso" | "date" | "datetime" | "time" | "friendly"
 * @param timezone - IANA timezone for display
 * @returns Formatted date string
 */
export function formatDateTime(
  dateStr: string,
  format: string = 'iso',
  timezone: string = 'UTC',
): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string: "${dateStr}"`);
  }

  if (!isValidTimezone(timezone)) {
    timezone = 'UTC';
  }

  switch (format) {
    case 'iso':
      return date.toISOString();

    case 'date':
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);

    case 'time':
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(date);

    case 'datetime':
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(date);

    case 'friendly':
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(date);

    default:
      return date.toISOString();
  }
}

/**
 * Get the current time as an ISO string with timezone info.
 */
export function getCurrentTime(timezone: string = 'UTC'): string {
  return nowInTimezone(timezone).toISOString();
}

// --- Date Validation (Task 21) ---

export interface DateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const MAX_FUTURE_DAYS = 365;
const MAX_PAST_DAYS = 1;

/**
 * Validate a date string for safety and format compliance.
 *
 * @param dateStr - ISO-8601 date string
 * @returns Validation result with errors and warnings
 */
export function validateDate(dateStr: string): DateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    errors.push(`Invalid date format: "${dateStr}". Expected ISO-8601.`);
    return { valid: false, errors, warnings };
  }

  // Ensure ISO-8601 compliance
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)?$/.test(dateStr)) {
    warnings.push('Date format may not be strict ISO-8601.');
  }

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = diffMs / DAY_MS;

  if (diffDays > MAX_FUTURE_DAYS) {
    errors.push(`Date is more than ${MAX_FUTURE_DAYS} days in the future.`);
  }

  if (diffDays < -MAX_PAST_DAYS) {
    errors.push(`Date is more than ${MAX_PAST_DAYS} days in the past.`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate an IANA timezone string.
 */
export function validateTimezone(timezone: string): DateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isValidTimezone(timezone)) {
    errors.push(`Invalid IANA timezone: "${timezone}".`);
    return { valid: false, errors, warnings };
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    errors.push(`Timezone "${timezone}" is not recognized by this runtime.`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// --- Internal Helpers ---

function toISODateString(date: Date): string {
  return date.toISOString().split('T')[0] ?? date.toISOString();
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function findNextDayOfWeek(from: Date, targetDay: number, direction: 'forward' | 'backward'): Date {
  const current = new Date(from);
  const currentDay = current.getDay();
  let diff = targetDay - currentDay;

  if (direction === 'forward') {
    if (diff <= 0) diff += 7;
  } else {
    if (diff >= 0) diff -= 7;
  }

  return new Date(current.getTime() + diff * DAY_MS);
}

// --- LangChain Tool Wrappers ---

/**
 * Creates a DynamicStructuredTool for parsing relative dates.
 * Can be injected into any LangChain agent's tool set.
 */
export function createDateParserTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'parse_relative_date',
    description: [
      'Convert a human-readable date expression into an ISO-8601 date string.',
      'Use this when a user says things like "tomorrow", "next Monday", "in 3 days".',
      'Input: { expression: string, timezone?: string }',
      'Output: ISO-8601 date string.',
    ].join(' '),
    schema: z.object({
      expression: z.string().describe('The date expression to parse (e.g. "tomorrow", "next week", "in 3 days")'),
      timezone: z.string().default('UTC').describe('IANA timezone (e.g. "America/New_York", "Europe/Paris")'),
    }),
    func: async ({ expression, timezone }) => {
      try {
        const result = parseRelativeDate(expression, timezone);
        const validation = validateDate(result);
        if (!validation.valid) {
          return JSON.stringify({
            error: validation.errors.join('; '),
            date: result,
            human_readable: `Parsed "${expression}" as ${result}`,
          });
        }
        return JSON.stringify({
          date: result,
          human_readable: `Parsed "${expression}" as ${formatDateTime(result, 'friendly', timezone)}`,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ error: message });
      }
    },
  });
}

/**
 * Creates a DynamicStructuredTool for getting current time.
 */
export function createCurrentTimeTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_current_time',
    description: [
      'Get the current date and time in a specific timezone.',
      'Use this to answer "what time is it?" or to anchor relative calculations.',
      'Input: { timezone?: string, format?: string }',
      'Output: JSON with date, time, and formatted strings.',
    ].join(' '),
    schema: z.object({
      timezone: z.string().default('UTC').describe('IANA timezone (e.g. "America/New_York")'),
      format: z.enum(['iso', 'date', 'datetime', 'time', 'friendly']).default('friendly').describe('Output format'),
    }),
    func: async ({ timezone, format }) => {
      const now = nowInTimezone(timezone);
      return JSON.stringify({
        iso: now.toISOString(),
        formatted: formatDateTime(now.toISOString(), format, timezone),
        date: formatDateTime(now.toISOString(), 'date', timezone),
        time: formatDateTime(now.toISOString(), 'time', timezone),
        timezone,
      });
    },
  });
}

/**
 * Creates a DynamicStructuredTool for formatting dates.
 */
export function createDateFormatTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'format_date',
    description: [
      'Format an ISO-8601 date string into a human-readable format.',
      'Input: { date: string, format?: string, timezone?: string }',
      'Output: Formatted date string.',
    ].join(' '),
    schema: z.object({
      date: z.string().describe('ISO-8601 date string to format'),
      format: z.enum(['iso', 'date', 'datetime', 'time', 'friendly']).default('friendly').describe('Output format'),
      timezone: z.string().default('UTC').describe('IANA timezone for display'),
    }),
    func: async ({ date, format, timezone }) => {
      try {
        return formatDateTime(date, format, timezone);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ error: message });
      }
    },
  });
}

/**
 * Returns all time/date tools as an array for injection into an agent.
 */
export function getTimeDateTools(): DynamicStructuredTool[] {
  return [
    createDateParserTool(),
    createCurrentTimeTool(),
    createDateFormatTool(),
  ];
}
