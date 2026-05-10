import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  automationWatcherService,
  type AutomationWatcherRow,
} from '../services/AutomationWatcherService.js';

export interface AutomationToolScope {
  organizationId: string;
  userId?: string | null;
}

const CreateAutomationWatcherSchema = z.object({
  name: z.string().trim().min(1).describe('Short name for the automation watcher.'),
  source: z.string().trim().min(1).describe('Event source to watch, such as slack.support, google.sheets, calendar, file, webhook, or *.'),
  match_text: z.string().trim().min(1).describe('Case-insensitive text/topic to match in event source, topic, text, or context. Use * to match every event from the source.'),
  prompt_template: z.string().trim().min(1).describe('Instruction sent to the General Agent when this watcher triggers.'),
  skill_name: z.string().trim().min(1).optional().describe('Optional user skill name to inject into the triggered General Agent prompt.'),
});

function requireLinkedUser(scope: AutomationToolScope): string {
  const userId = scope.userId?.trim() ?? '';
  if (!scope.organizationId.trim() || !userId) {
    throw new Error('Account linking required before I can manage automations. Please connect your account and try again.');
  }

  return userId;
}

function serializeWatcher(watcher: AutomationWatcherRow): Record<string, unknown> {
  return {
    id: watcher.id,
    name: watcher.name,
    source: watcher.source,
    match_text: watcher.match_text,
    prompt_template: watcher.prompt_template,
    skill_name: watcher.skill_name,
    is_active: watcher.is_active,
    last_triggered_at: watcher.last_triggered_at,
    updated_at: watcher.updated_at,
  };
}

function toJsonString(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function createAutomationWatcherTool(scope: AutomationToolScope): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'create_automation_watcher',
    description: [
      'Create an event-driven automation watcher for the current user.',
      'Use when the user wants the agent to monitor a source/event/topic and run an action later when matching data arrives.',
      'The watcher queues an assistant.command prompt with event context when triggered.',
      'If the user mentions a reusable skill/process/style, pass skill_name so the triggered agent prompt includes that skill.',
    ].join(' '),
    schema: CreateAutomationWatcherSchema,
    func: async (input) => {
      const userId = requireLinkedUser(scope);
      const watcher = await automationWatcherService.createWatcher({
        organizationId: scope.organizationId,
        userId,
        name: input.name,
        source: input.source,
        matchText: input.match_text,
        promptTemplate: input.prompt_template,
        skillName: input.skill_name,
      });

      return toJsonString({
        outcome: 'created',
        confirmation_message: `Automation watcher created: ${watcher.name}.`,
        watcher: serializeWatcher(watcher),
      });
    },
  });
}

export function createListAutomationWatchersTool(scope: AutomationToolScope): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'list_automation_watchers',
    description: 'List active automation watchers for this user/organization before creating duplicates or when the user asks what automations exist.',
    schema: z.object({}),
    func: async () => {
      const userId = requireLinkedUser(scope);
      const watchers = await automationWatcherService.listWatchers(scope.organizationId, userId);
      return toJsonString({
        total: watchers.length,
        watchers: watchers.map(serializeWatcher),
      });
    },
  });
}

export function createAutomationTools(scope: AutomationToolScope): DynamicStructuredTool[] {
  return [
    createAutomationWatcherTool(scope),
    createListAutomationWatchersTool(scope),
  ];
}
