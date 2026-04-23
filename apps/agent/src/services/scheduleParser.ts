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
  commandText?: string;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  // Scheduled execution must use a task_type supported by the agent graph.
  // Default to assistant.command so the General Agent can route appropriately.
  // (Direct task types like channel.send are supported, but require fully specified payload.)
  void input;
  return 'assistant.command';
}

function isValidCronExpression(value: string): boolean {
  const fields = value.trim().split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }

  const constraints = [
    { minExact: 0, maxExact: 59, maxStep: 59 }, // minute
    { minExact: 0, maxExact: 23, maxStep: 23 }, // hour
    { minExact: 1, maxExact: 31, maxStep: 31 }, // day of month
    { minExact: 1, maxExact: 12, maxStep: 12 }, // month
    { minExact: 0, maxExact: 6, maxStep: 7 }, // weekday (step 7 = Sundays only in our modulo matcher)
  ] as const;

  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i]!.trim();
    if (field === '*') continue;

    const stepMatch = field.match(/^\*\/(\d+)$/);
    if (stepMatch) {
      const step = Number(stepMatch[1]);
      const maxStep = constraints[i]!.maxStep;
      if (!Number.isInteger(step) || step < 1 || step > maxStep) {
        return false;
      }
      continue;
    }

    const exactMatch = field.match(/^\d+$/);
    if (exactMatch) {
      const exact = Number(field);
      const { minExact, maxExact } = constraints[i]!;
      if (!Number.isInteger(exact) || exact < minExact || exact > maxExact) {
        return false;
      }
      continue;
    }

    return false;
  }

  return true;
}

function buildRuleResult(input: {
  cronExpression: string;
  taskType: string;
  timezone: string;
  originalInput: string;
  commandText: string;
}): ParsedRuleResult {
  const command = normalizeWhitespace(input.commandText);
  return {
    cronExpression: input.cronExpression,
    taskType: input.taskType,
    taskPayload: {
      original_input: input.originalInput,
      command,
      command_text: command,
      message_text: command,
    },
    confirmationMessage: `Confirmed: ${input.taskType} on cron ${input.cronExpression} (${input.timezone}).`,
  };
}

function parseWithRules(input: string, timezone: string): ParsedRuleResult | null {
  const normalized = normalizeWhitespace(input).toLowerCase();
  const taskType = inferTaskType(normalized);

  if (/\bevery\s+hour\b/.test(normalized)) {
    const commandText = normalizeWhitespace(input.replace(/\bevery\s+hour\b/i, '')) || input;
    return buildRuleResult({
      cronExpression: '0 * * * *',
      taskType,
      timezone,
      originalInput: input,
      commandText,
    });
  }

  const everyMinutes = normalized.match(/\bevery\s+(\d{1,2})\s+minutes?\b/);
  if (everyMinutes) {
    const interval = Number(everyMinutes[1]);
    if (interval >= 1 && interval <= 59) {
      const commandText = normalizeWhitespace(input.replace(new RegExp(escapeRegExp(everyMinutes[0]), 'i'), '')) || input;
      return buildRuleResult({
        cronExpression: `*/${interval} * * * *`,
        taskType,
        timezone,
        originalInput: input,
        commandText,
      });
    }
  }

  const everyHours = normalized.match(/\bevery\s+(\d{1,2})\s+hours?\b/);
  if (everyHours) {
    const interval = Number(everyHours[1]);
    if (interval >= 1 && interval <= 23) {
      const commandText = normalizeWhitespace(input.replace(new RegExp(escapeRegExp(everyHours[0]), 'i'), '')) || input;
      return buildRuleResult({
        cronExpression: `0 */${interval} * * *`,
        taskType,
        timezone,
        originalInput: input,
        commandText,
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
      const commandText = normalizeWhitespace(input.replace(new RegExp(escapeRegExp(weekdayAtTime[0]), 'i'), '')) || input;
      return buildRuleResult({
        cronExpression: `${time.minute} ${time.hour} * * ${weekday}`,
        taskType,
        timezone,
        originalInput: input,
        commandText,
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
      const commandText = normalizeWhitespace(input.replace(new RegExp(escapeRegExp(atTimeWeekday[0]), 'i'), '')) || input;
      return buildRuleResult({
        cronExpression: `${time.minute} ${time.hour} * * ${weekday}`,
        taskType,
        timezone,
        originalInput: input,
        commandText,
      });
    }
  }

  const dailyAt = normalized.match(/\b(?:every day|daily)\s+at\s+([a-z0-9: ]+(?:am|pm)?|noon|midnight)\b/);
  if (dailyAt) {
    const time = parseClockToken(dailyAt[1]);
    if (time) {
      const commandText = normalizeWhitespace(input.replace(new RegExp(escapeRegExp(dailyAt[0]), 'i'), '')) || input;
      return buildRuleResult({
        cronExpression: `${time.minute} ${time.hour} * * *`,
        taskType,
        timezone,
        originalInput: input,
        commandText,
      });
    }
  }

  const atTimeDaily = normalized.match(/\bat\s+([a-z0-9: ]+(?:am|pm)?|noon|midnight)\s+(?:every day|daily)\b/);
  if (atTimeDaily) {
    const time = parseClockToken(atTimeDaily[1]);
    if (time) {
      const commandText = normalizeWhitespace(input.replace(new RegExp(escapeRegExp(atTimeDaily[0]), 'i'), '')) || input;
      return buildRuleResult({
        cronExpression: `${time.minute} ${time.hour} * * *`,
        taskType,
        timezone,
        originalInput: input,
        commandText,
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

     const requestedType = typeof llmResult.taskType === 'string' ? llmResult.taskType.trim() : '';
     const taskType = requestedType === 'channel.send' ? 'channel.send' : 'assistant.command';

     const commandText = typeof llmResult.commandText === 'string' && llmResult.commandText.trim().length > 0
       ? llmResult.commandText.trim()
       : normalizedInput;

     const basePayload = llmResult.taskPayload && typeof llmResult.taskPayload === 'object' && !Array.isArray(llmResult.taskPayload)
       ? llmResult.taskPayload
       : {};

    return {
      cronExpression: llmResult.cronExpression,
      timezone,
      taskType,
      taskPayload: {
        ...basePayload,
        original_input: input,
        command: commandText,
        command_text: commandText,
        message_text: commandText,
      },
      confirmationMessage: llmResult.confirmationMessage?.trim().length
        ? llmResult.confirmationMessage
        : `Confirmed: ${taskType} on cron ${llmResult.cronExpression} (${timezone}).`,
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
      'Return JSON only with keys: cronExpression, taskType, taskPayload, confirmationMessage, commandText.',
      'Use 5-field cron format: minute hour day month weekday.',
      'Only use field forms supported by our scheduler: "*", "*/N", or an exact integer value. No ranges, no lists, no names.',
      'weekday must be a number 0-6 (0=Sunday).',
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
        commandText?: unknown;
      };

      if (typeof parsed.cronExpression !== 'string' || typeof parsed.taskType !== 'string') {
        return null;
      }

      const taskType = parsed.taskType.trim() || 'assistant.command';
      const normalizedTaskType = taskType === 'channel.send' ? 'channel.send' : 'assistant.command';

      const commandText = typeof parsed.commandText === 'string' && parsed.commandText.trim().length > 0
        ? parsed.commandText.trim()
        : input;

      const basePayload = parsed.taskPayload && typeof parsed.taskPayload === 'object' && !Array.isArray(parsed.taskPayload)
        ? parsed.taskPayload as Record<string, unknown>
        : { original_input: input };

      return {
        cronExpression: parsed.cronExpression.trim(),
        taskType: normalizedTaskType,
        taskPayload: {
          ...basePayload,
          original_input: input,
          command: commandText,
          command_text: commandText,
          message_text: commandText,
        },
        confirmationMessage: typeof parsed.confirmationMessage === 'string' && parsed.confirmationMessage.trim().length > 0
          ? parsed.confirmationMessage.trim()
          : `Confirmed: ${normalizedTaskType} on cron ${parsed.cronExpression} (${timezone}).`,
        commandText,
      };
    } catch {
      return null;
    }
  }
}
