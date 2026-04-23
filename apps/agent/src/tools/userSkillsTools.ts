import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { userSkillsService, type UserSkillRow } from '../services/UserSkillsService.js';

export interface UserSkillsToolScope {
  organizationId: string;
  userId?: string | null;
}

function ensureUserScope(scope: UserSkillsToolScope): { organizationId: string; userId: string } {
  if (!scope.userId || scope.userId.trim().length === 0) {
    throw new Error('User-scoped skills require task.user_id. This task has no user context.');
  }

  return {
    organizationId: scope.organizationId,
    userId: scope.userId,
  };
}

function serializeSkill(skill: UserSkillRow): Record<string, unknown> {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    content_markdown: skill.content_markdown,
    tags: skill.tags,
    triggers: skill.triggers,
    is_active: skill.is_active,
    updated_at: skill.updated_at,
  };
}

function toJsonString(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function createSearchUserSkillsTool(scope: UserSkillsToolScope): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'search_user_skills',
    description:
      'Search user-scoped skills relevant to the current writing/generation task. Use this before drafting personalized career content.',
    schema: z.object({
      query: z.string().min(1),
      max_results: z.number().int().positive().max(20).optional(),
    }),
    func: async (input) => {
      const { organizationId, userId } = ensureUserScope(scope);
      const skills = await userSkillsService.findRelevantSkills(organizationId, userId, {
        query: input.query,
        maxResults: input.max_results,
      });

      return toJsonString({
        query: input.query,
        total: skills.length,
        skills: skills.map(serializeSkill),
      });
    },
  });
}

export function createListUserSkillsTool(scope: UserSkillsToolScope): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'list_user_skills',
    description:
      'List all active user-scoped skills. Use when you need to inspect available preferences before choosing style guidance.',
    schema: z.object({}),
    func: async () => {
      const { organizationId, userId } = ensureUserScope(scope);
      const skills = await userSkillsService.listSkills(organizationId, userId);

      return toJsonString({
        total: skills.length,
        skills: skills.map(serializeSkill),
      });
    },
  });
}

export function createGetUserSkillTool(scope: UserSkillsToolScope): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_user_skill',
    description:
      'Retrieve a specific user skill by name. Use when the task already references a known style label.',
    schema: z.object({
      name: z.string().min(1),
    }),
    func: async (input) => {
      const { organizationId, userId } = ensureUserScope(scope);
      const skill = await userSkillsService.getSkillByName(organizationId, userId, input.name);

      return toJsonString({
        found: Boolean(skill),
        skill: skill ? serializeSkill(skill) : null,
      });
    },
  });
}
