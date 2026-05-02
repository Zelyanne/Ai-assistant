import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  watchTopicService,
  type WatchTopicPriority,
  type WatchTopicResult,
  type WatchTopicRow,
} from '../services/WatchTopicService.js';

export interface WatchTopicToolScope {
  organizationId: string;
  userId?: string | null;
}

const PrioritySchema = z.enum(['High', 'Medium', 'Low']);

const ManageWatchTopicSchema = z.object({
  action: z.enum(['create', 'update', 'upsert']).default('upsert'),
  topic: z.string().trim().min(1).describe('Topic to watch in incoming mail, such as APSEC or investor updates.'),
  priority: PrioritySchema.optional().describe('Priority for matched messages. Defaults to Medium.'),
  keywords: z.array(z.string().trim().min(1)).max(20).optional().describe('Optional explicit keywords. Defaults to the topic.'),
});

function serializeTopic(topic: WatchTopicRow): Record<string, unknown> {
  return {
    id: topic.id,
    topic: topic.topic,
    priority: topic.priority,
    keywords: topic.keywords_array,
    user_id: topic.user_id,
    updated_at: topic.updated_at,
  };
}

function serializeResult(result: WatchTopicResult): Record<string, unknown> {
  return {
    outcome: result.outcome,
    confirmation_message: result.confirmation_message,
    topic: serializeTopic(result.topic),
  };
}

function toJsonString(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function requireLinkedUser(scope: WatchTopicToolScope): string {
  const userId = scope.userId?.trim() ?? '';
  if (!scope.organizationId.trim() || !userId) {
    throw new Error('Account linking required before I can manage watch topics. Please connect your account and try again.');
  }

  return userId;
}

export function createManageWatchTopicTool(scope: WatchTopicToolScope): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'manage_watch_topic',
    description: [
      'Create or update a scoped mail watch topic for this user/organization.',
      'Use when the user asks to watch, monitor, prioritize, or alert on emails about a topic.',
      'This is not a calendar alarm and does not send or draft email automatically.',
    ].join(' '),
    schema: ManageWatchTopicSchema,
    func: async (input) => {
      const userId = requireLinkedUser(scope);
      const payload = {
        organizationId: scope.organizationId,
        userId,
        topic: input.topic,
        priority: input.priority as WatchTopicPriority | undefined,
        keywords: input.keywords,
      };

      const result = input.action === 'create'
        ? await watchTopicService.createTopic(payload)
        : input.action === 'update'
          ? await watchTopicService.updateTopic(payload)
          : await watchTopicService.upsertTopic(payload);

      return toJsonString(serializeResult(result));
    },
  });
}

export function createListWatchTopicsTool(scope: WatchTopicToolScope): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'list_watch_topics',
    description: 'List existing mail watch topics for this user/organization before creating duplicates or when the user asks what is being watched.',
    schema: z.object({}),
    func: async () => {
      const userId = requireLinkedUser(scope);
      const topics = await watchTopicService.listTopics(scope.organizationId, userId);
      return toJsonString({
        total: topics.length,
        topics: topics.map(serializeTopic),
      });
    },
  });
}

export function createWatchTopicTools(scope: WatchTopicToolScope): DynamicStructuredTool[] {
  return [
    createManageWatchTopicTool(scope),
    createListWatchTopicsTool(scope),
  ];
}
