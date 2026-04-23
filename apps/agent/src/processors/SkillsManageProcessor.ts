import type { Task } from '@ai-assistant/shared';
import { BaseProcessor, type ProcessorResult } from './BaseProcessor.js';
import { skillCreatorAgent } from '../agents/SkillCreatorAgent.js';
import { userSkillsService } from '../services/UserSkillsService.js';

type SkillOperation = 'list' | 'upsert' | 'delete';

type SkillsManagePayload = {
  command_text?: unknown;
  command?: unknown;
  operation?: unknown;
  skill_name?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function detectOperation(commandText: string, explicitOperation: string | null): SkillOperation {
  if (explicitOperation === 'list' || explicitOperation === 'upsert' || explicitOperation === 'delete') {
    return explicitOperation;
  }

  const lower = commandText.toLowerCase();

  if (/\b(list|show|view)\b/.test(lower) && /\bskills?\b/.test(lower)) {
    return 'list';
  }

  if (/\b(delete|remove|forget)\b/.test(lower) && /\bskills?\b/.test(lower)) {
    return 'delete';
  }

  return 'upsert';
}

function extractSkillName(commandText: string, fallback: string | null): string | null {
  if (fallback) {
    return fallback;
  }

  const direct = commandText.match(/\bskill\s*[:\-]\s*([a-z0-9][a-z0-9\-_ ]{1,80})/i);
  if (direct?.[1]) {
    return direct[1].trim();
  }

  const called = commandText.match(/\b(?:called|named)\s+["“']([^"”']+)["”']/i);
  if (called?.[1]) {
    return called[1].trim();
  }

  const deletePattern = commandText.match(/\b(?:delete|remove|forget)\s+(?:this\s+)?skill\s+([a-z0-9][a-z0-9\-_ ]{1,80})/i);
  if (deletePattern?.[1]) {
    return deletePattern[1].trim();
  }

  return null;
}

function summarizeSkillNames(names: string[]): string {
  if (names.length === 0) {
    return 'No skills found.';
  }

  return `Skills: ${names.join(', ')}`;
}

export class SkillsManageProcessor extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    this.clearTrace();

    const payload = asRecord(task.payload) as SkillsManagePayload;
    const commandText = asString(payload.command_text) ?? asString(payload.command) ?? '';

    if (!task.user_id) {
      this.addTraceStep('skills_scope_missing', 'skills.manage requires task.user_id', 0);
      return {
        outcome: 'setup_required',
        reason: 'skills.manage requires task.user_id',
        prompt: 'I need a logged-in user context before I can save personal skills.',
        summary: 'Cannot manage skills without user scope.',
        trace: this.getTrace(),
      };
    }

    const explicitOperation = asString(payload.operation)?.toLowerCase() ?? null;
    const operation = detectOperation(commandText, explicitOperation);
    const explicitSkillName = asString(payload.skill_name);

    this.addTraceStep('skills_manage_operation', `Operation: ${operation}`, 0.92);

    if (operation === 'list') {
      const skills = await userSkillsService.listSkills(task.organization_id, task.user_id);
      return {
        outcome: 'listed',
        total: skills.length,
        skills,
        summary: summarizeSkillNames(skills.map((skill) => skill.name)),
        trace: this.getTrace(),
      };
    }

    if (operation === 'delete') {
      const skillName = extractSkillName(commandText, explicitSkillName);
      if (!skillName) {
        return {
          outcome: 'setup_required',
          reason: 'Skill name missing for deletion',
          prompt: 'Tell me which skill to delete, for example: "delete skill cover-letter-style".',
          summary: 'Skill deletion requires a skill name.',
          trace: this.getTrace(),
        };
      }

      const deleted = await userSkillsService.deleteSkill(task.organization_id, task.user_id, skillName);
      return {
        outcome: deleted.deleted ? 'deleted' : 'not_found',
        deleted: deleted.deleted,
        skill_name: skillName,
        summary: deleted.deleted
          ? `Deleted skill ${skillName}.`
          : `No skill found for ${skillName}.`,
        trace: this.getTrace(),
      };
    }

    const draft = await skillCreatorAgent.createSkill({
      commandText: commandText || 'Create a reusable user preference skill from this request.',
      existingName: extractSkillName(commandText, explicitSkillName) ?? undefined,
    });

    const saved = await userSkillsService.upsertSkill(task.organization_id, task.user_id, draft);

    return {
      outcome: 'saved',
      operation: 'upsert',
      skill: saved,
      summary: `Saved user skill ${saved.name}.`,
      trace: this.getTrace(),
    };
  }
}
