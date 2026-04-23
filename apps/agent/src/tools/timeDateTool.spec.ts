/**
 * Unit Tests for Time/Date Utility Tool
 *
 * Tests relative date parsing, timezone conversion, date formatting,
 * and validation.
 *
 * Task 15: Unit Tests for Time/Date Tool
 * Task 21: Date Validation Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseRelativeDate,
  formatDateTime,
  getCurrentTime,
  validateDate,
  validateTimezone,
  createDateParserTool,
  createCurrentTimeTool,
  createDateFormatTool,
  getTimeDateTools,
} from '../tools/timeDateTool.js';

describe('parseRelativeDate', () => {
  it('should parse "tomorrow" correctly', () => {
    const result = parseRelativeDate('tomorrow');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(result).toContain(tomorrow.toISOString().split('T')[0]);
  });

  it('should parse "yesterday" correctly', () => {
    const result = parseRelativeDate('yesterday');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(result).toContain(yesterday.toISOString().split('T')[0]);
  });

  it('should parse "today" correctly', () => {
    const result = parseRelativeDate('today');
    const today = new Date().toISOString().split('T')[0];
    expect(result).toContain(today);
  });

  it('should parse "next week" correctly', () => {
    const result = parseRelativeDate('next week');
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    expect(result).toContain(nextWeek.toISOString().split('T')[0]);
  });

  it('should parse "last week" correctly', () => {
    const result = parseRelativeDate('last week');
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    expect(result).toContain(lastWeek.toISOString().split('T')[0]);
  });

  it('should parse "in 3 days" correctly', () => {
    const result = parseRelativeDate('in 3 days');
    const in3Days = new Date();
    in3Days.setDate(in3Days.getDate() + 3);
    expect(result).toContain(in3Days.toISOString().split('T')[0]);
  });

  it('should parse "in 2 weeks" correctly', () => {
    const result = parseRelativeDate('in 2 weeks');
    const in2Weeks = new Date();
    in2Weeks.setDate(in2Weeks.getDate() + 14);
    expect(result).toContain(in2Weeks.toISOString().split('T')[0]);
  });

  it('should parse "in 1 hour" correctly', () => {
    const result = parseRelativeDate('in 1 hour');
    const parsed = new Date(result);

    // Should be ~1 hour from now (within 10 seconds of tolerance for test execution)
    const now = new Date();
    const expectedMin = new Date(now.getTime() + 3600_000 - 10_000);
    const expectedMax = new Date(now.getTime() + 3600_000 + 10_000);
    expect(parsed.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
    expect(parsed.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
  });

  it('should parse "next Monday" correctly', () => {
    const result = parseRelativeDate('next Monday');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}/);
    const parsed = new Date(result);
    expect(parsed.getDay()).toBe(1); // Monday = 1
  });

  it('should parse "last Friday" correctly', () => {
    const result = parseRelativeDate('last Friday');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}/);
    const parsed = new Date(result);
    expect(parsed.getDay()).toBe(5); // Friday = 5
  });

  it('should parse explicit ISO dates as-is', () => {
    const isoDate = '2026-06-15T10:00:00Z';
    const result = parseRelativeDate(isoDate);
    expect(result).toBe('2026-06-15T10:00:00.000Z');
  });

  it('should parse date-only ISO strings', () => {
    const result = parseRelativeDate('2026-06-15');
    expect(result).toBe('2026-06-15T00:00:00.000Z');
  });

  it('should handle "now"', () => {
    const result = parseRelativeDate('now');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('should be case insensitive', () => {
    const result1 = parseRelativeDate('TOMORROW');
    const result2 = parseRelativeDate('Tomorrow');
    const result3 = parseRelativeDate('tomorrow');
    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  it('should throw for unparseable input', () => {
    expect(() => parseRelativeDate('foobar baz qux')).toThrow();
  });

  it('should accept timezone parameter without error', () => {
    const result = parseRelativeDate('tomorrow', 'America/New_York');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});

describe('formatDateTime', () => {
  const testDate = '2026-06-15T14:30:00Z';

  it('should format as ISO by default', () => {
    const result = formatDateTime(testDate);
    expect(result).toContain('2026-06-15');
  });

  it('should format as date only', () => {
    const result = formatDateTime(testDate, 'date');
    expect(result).toContain('2026');
    expect(result).toContain('06');
    expect(result).toContain('15');
  });

  it('should format as friendly', () => {
    const result = formatDateTime(testDate, 'friendly');
    expect(result).toContain('2026');
    expect(result).toContain('June');
  });

  it('should format as time', () => {
    const result = formatDateTime(testDate, 'time');
    expect(result).toMatch(/\d/);
  });

  it('should throw for invalid date', () => {
    expect(() => formatDateTime('not-a-date')).toThrow('Invalid date');
  });

  it('should handle timezone parameter', () => {
    const result = formatDateTime(testDate, 'datetime', 'America/New_York');
    expect(result).toContain('2026');
  });
});

describe('validateDate', () => {
  it('should validate a proper ISO date', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const result = validateDate(futureDate.toISOString());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject dates more than 1 year in the future', () => {
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 2);
    const result = validateDate(farFuture.toISOString());
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('more than');
  });

  it('should reject invalid date strings', () => {
    const result = validateDate('not-a-date');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Invalid date format');
  });

  it('should warn about non-strict ISO format', () => {
    const result = validateDate('Jun 15, 2026');
    // May or may not parse, but format is non-ISO
    expect(result.warnings.length + result.errors.length).toBeGreaterThan(0);
  });
});

describe('validateTimezone', () => {
  it('should validate UTC', () => {
    const result = validateTimezone('UTC');
    expect(result.valid).toBe(true);
  });

  it('should validate America/New_York', () => {
    const result = validateTimezone('America/New_York');
    expect(result.valid).toBe(true);
  });

  it('should reject invalid timezone', () => {
    const result = validateTimezone('Not/A/Timezone');
    expect(result.valid).toBe(false);
  });

  it('should reject empty string', () => {
    const result = validateTimezone('');
    expect(result.valid).toBe(false);
  });
});

describe('LangChain Tool Wrappers', () => {
  it('should create a date parser tool with correct name', () => {
    const tool = createDateParserTool();
    expect(tool.name).toBe('parse_relative_date');
  });

  it('should create a current time tool with correct name', () => {
    const tool = createCurrentTimeTool();
    expect(tool.name).toBe('get_current_time');
  });

  it('should create a date format tool with correct name', () => {
    const tool = createDateFormatTool();
    expect(tool.name).toBe('format_date');
  });

  it('should return 3 tools from getTimeDateTools', () => {
    const tools = getTimeDateTools();
    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name)).toEqual([
      'parse_relative_date',
      'get_current_time',
      'format_date',
    ]);
  });

  it('should parse "tomorrow" via tool function', async () => {
    const tool = createDateParserTool();
    const result = await tool.func({ expression: 'tomorrow', timezone: 'UTC' });
    const parsed = JSON.parse(result);
    expect(parsed.date).toBeDefined();
    expect(parsed.human_readable).toContain('Parsed "tomorrow"');
  });

  it('should handle errors in date parser tool gracefully', async () => {
    const tool = createDateParserTool();
    const result = await tool.func({ expression: 'completely invalid gibberish xyz', timezone: 'UTC' });
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeDefined();
  });

  it('should get current time via tool function', async () => {
    const tool = createCurrentTimeTool();
    const result = await tool.func({ timezone: 'UTC', format: 'friendly' });
    const parsed = JSON.parse(result);
    expect(parsed.iso).toBeDefined();
    expect(parsed.formatted).toBeDefined();
    expect(parsed.timezone).toBe('UTC');
  });

  it('should format date via tool function', async () => {
    const tool = createDateFormatTool();
    const result = await tool.func({ date: '2026-06-15T14:30:00Z', format: 'friendly', timezone: 'UTC' });
    expect(result).toContain('2026');
    expect(result).toContain('June');
  });
});
