import { ChatMistralAI } from '@langchain/mistralai';
import { config } from '../config/index.js';

type ParsedRuleResult = {
  cronExpression: string;
  taskType: string;
  taskPayload: Record<string, unknown>;
  confirmationMessage: string;
};

type ParsedTime = {
  hour: number;
  minute: number;
};

export type ScheduleParseResult = {
  cronExpression: string;
  timezone: string;
  taskType: string;
  taskPayload: Record<string, unknown>;
  confirmationMessage: string;
  source: 'rules' | 'llm';
};

type LlmScheduleParseResult = {
  cronExpression: string;
  taskType: string;
  taskPayload: Record<string, unknown>;
  confirmationMessage: string;
};

type ScheduleParserDeps = {
  defaultTimezone?: string;
  llmParse?: (input: string, timezone: string) => Promise<LlmScheduleParseResult | null>;
};

const WEEKDAY_BY_NAME: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function parseClockToken(value: string): ParsedTime | null {
  const normalized = normalizeWhitespace(value).toLowerCase();

  if (normalized === 'midnight') {
    return { hour: 0, minute: 0 };
  }

  if (normalized === 'noon') {
    return { hour: 12, minute: 0 };
  }

  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) {
    return null;
  }

  const hourRaw = Number(match[1]);
  const minuteRaw = Number(match[2] ?? '0');
  const meridiem = (match[3] ?? '').toLowerCase();

  if (!Number.isInteger(hourRaw) || !Number.isInteger(minuteRaw) || minuteRaw < 0 || minuteRaw > 59) {
    return null;
  }

  if (!meridiem && hourRaw >= 0 && hourRaw <= 23) {
    return { hour: hourRaw, minute: minuteRaw };
  }

  if (hourRaw < 1 || hourRaw > 12) {
    return null;
  }

  if (meridiem === 'am') {
    return { hour: hourRaw % 12, minute: minuteRaw };
  }

  if (meridiem === 'pm') {
    return { hour: (hourRaw % 12) + 12, minute: minuteRaw };
  }

  return null;
}

function inferTaskType(input: string): string {
  const normalized = input.toLowerCase();

  if (normalized.includes('email') || normalized.includes('mail')) {
    return 'email.check';
  }

  if (normalized.includes('calendar') || normalized.includes('meeting')) {
    return 'calendar.check';
  }

  if (normalized.includes('status report') || normalized.includes('report')) {
    return 'report.send';
  }

  if (normalized.includes('remind') || normalized.includes('reminder')) {
    return 'reminder.send';
  }

  return 'schedule.execute';
}

function isValidCronExpression(value: string): boolean {
  const fields = value.trim().split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }

  const validField = /^\*$|^\*\/\d+$|^\d+$/;
  return fields.every((field) => validField.test(field));
}

function buildRuleResult(input: {
  cronExpression: string;
  taskType: string;
  timezone: string;
  originalInput: string;
}): ParsedRuleResult {
  return {
    cronExpression: input.cronExpression,
    taskType: input.taskType,
    taskPayload: {
      original_input: input.originalInput,
    },
    confirmationMessage: `Confirmed: ${input.taskType} on cron ${input.cronExpression} (${input.timezone}).`,
  };
}

function parseWithRules(input: string, timezone: string): ParsedRuleResult | null {
  const normalized = normalizeWhitespace(input).toLowerCase();
  const taskType = inferTaskType(normalized);

  if (/\bevery\s+hour\b/.test(normalized)) {
    return buildRuleResult({
      cronExpression: '0 * * * *',
      taskType,
      timezone,
      originalInput: input,
    });
  }

  const everyMinutes = normalized.match(/\bevery\s+(\d{1,2})\s+minutes?\b/);
  if (everyMinutes) {
    const interval = Number(everyMinutes[1]);
    if (interval >= 1 && interval <= 59) {
      return buildRuleResult({
        cronExpression: `*/${interval} * * * *`,
        taskType,
        timezone,
        originalInput: input,
      });
    }
  }

  const everyHours = normalized.match(/\bevery\s+(\d{1,2})\s+hours?\b/);
  if (everyHours) {
    const interval = Number(everyHours[1]);
    if (interval >= 1 && interval <= 23) {
      return buildRuleResult({
        cronExpression: `0 */${interval} * * *`,
        taskType,
        timezone,
        originalInput: input,
      });
    }
  }

  const weekdayAtTime = normalized.match(
    /\b(?:every|on)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b\s+at\s+([a-z0-9: ]+(?:am|pm)?|noon|midnight)/,
  );

  if (weekdayAtTime) {
    const weekday = WEEKDAY_BY_NAME[weekdayAtTime[1]];
    const time = parseClockToken(weekdayAtTime[2]);
    if (typeof weekday === 'number' && time) {
      return buildRuleResult({
        cronExpression: `${time.minute} ${time.hour} * * ${weekday}`,
        taskType,
        timezone,
        originalInput: input,
      });
    }
  }

  const atTimeWeekday = normalized.match(
    /\bat\s+([a-z0-9: ]+(?:am|pm)?|noon|midnight)\s+(?:every|on)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  );

  if (atTimeWeekday) {
    const time = parseClockToken(atTimeWeekday[1]);
    const weekday = WEEKDAY_BY_NAME[atTimeWeekday[2]];
    if (time && typeof weekday === 'number') {
      return buildRuleResult({
        cronExpression: `${time.minute} ${time.hour} * * ${weekday}`,
        taskType,
        timezone,
        originalInput: input,
      });
    }
  }

  const dailyAt = normalized.match(/\b(?:every day|daily)\s+at\s+([a-z0-9: ]+(?:am|pm)?|noon|midnight)\b/);
  if (dailyAt) {
    const time = parseClockToken(dailyAt[1]);
    if (time) {
      return buildRuleResult({
        cronExpression: `${time.minute} ${time.hour} * * *`,
        taskType,
        timezone,
        originalInput: input,
      });
    }
  }

  const atTimeDaily = normalized.match(/\bat\s+([a-z0-9: ]+(?:am|pm)?|noon|midnight)\s+(?:every day|daily)\b/);
  if (atTimeDaily) {
    const time = parseClockToken(atTimeDaily[1]);
    if (time) {
      return buildRuleResult({
        cronExpression: `${time.minute} ${time.hour} * * *`,
        taskType,
        timezone,
        originalInput: input,
      });
    }
  }

  return null;
}

function normalizeTimezone(timezone: string): string {
  const value = normalizeWhitespace(timezone);
  return value.length > 0 ? value : 'UTC';
}

function extractJsonObject(content: string): string | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return content.slice(start, end + 1).trim();
}

export class ScheduleParser {
  private readonly defaultTimezone: string;
  private readonly llmParse?: (input: string, timezone: string) => Promise<LlmScheduleParseResult | null>;

  constructor(deps: ScheduleParserDeps = {}) {
    this.defaultTimezone = normalizeTimezone(deps.defaultTimezone ?? config.DEFAULT_TIMEZONE ?? 'UTC');
    this.llmParse = deps.llmParse;
  }

  async parse(input: string, options?: { timezone?: string }): Promise<ScheduleParseResult> {
    const normalizedInput = normalizeWhitespace(input);
    if (!normalizedInput) {
      throw new Error('Unable to parse schedule expression: input is empty.');
    }

    const timezone = normalizeTimezone(options?.timezone ?? this.defaultTimezone);

    const ruleResult = parseWithRules(normalizedInput, timezone);
    if (ruleResult) {
      return {
        ...ruleResult,
        timezone,
        source: 'rules',
      };
    }

    const llmResult = this.llmParse
      ? await this.llmParse(normalizedInput, timezone)
      : await this.parseWithMistral(normalizedInput, timezone);

    if (!llmResult || !isValidCronExpression(llmResult.cronExpression)) {
      throw new Error('Unable to parse schedule expression. Please provide a clearer cadence.');
    }

    return {
      cronExpression: llmResult.cronExpression,
      timezone,
      taskType: llmResult.taskType,
      taskPayload: llmResult.taskPayload,
      confirmationMessage: llmResult.confirmationMessage,
      source: 'llm',
    };
  }

  private async parseWithMistral(
    input: string,
    timezone: string,
  ): Promise<LlmScheduleParseResult | null> {
    const llm = new ChatMistralAI({
      apiKey: config.MISTRAL_API_KEY,
      model: config.DEFAULT_LLM_MODEL,
      temperature: 0,
    });

    const prompt = [
      'Convert natural language schedule text into a strict cron expression.',
      'Return JSON only with keys: cronExpression, taskType, taskPayload, confirmationMessage.',
      'Use 5-field cron format: minute hour day month weekday.',
      `Timezone: ${timezone}.`,
      `Input: ${input}`,
    ].join('\n');

    try {
      const response = await llm.invoke(prompt);
      const content = typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? response.content.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join('')
          : JSON.stringify(response.content);
      const jsonRaw = extractJsonObject(content);
      if (!jsonRaw) {
        return null;
      }

      const parsed = JSON.parse(jsonRaw) as {
        cronExpression?: unknown;
        taskType?: unknown;
        taskPayload?: unknown;
        confirmationMessage?: unknown;
      };

      if (typeof parsed.cronExpression !== 'string' || typeof parsed.taskType !== 'string') {
        return null;
      }

      return {
        cronExpression: parsed.cronExpression.trim(),
        taskType: parsed.taskType.trim(),
        taskPayload: parsed.taskPayload && typeof parsed.taskPayload === 'object' && !Array.isArray(parsed.taskPayload)
          ? parsed.taskPayload as Record<string, unknown>
          : { original_input: input },
        confirmationMessage: typeof parsed.confirmationMessage === 'string' && parsed.confirmationMessage.trim().length > 0
          ? parsed.confirmationMessage.trim()
          : `Confirmed: ${parsed.taskType} on cron ${parsed.cronExpression} (${timezone}).`,
      };
    } catch {
      return null;
    }
  }
}
