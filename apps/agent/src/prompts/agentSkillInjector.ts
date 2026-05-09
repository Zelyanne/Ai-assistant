import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UserSkillRow } from '../services/UserSkillsService.js';

type AgentSkillTarget = 'gmail' | 'calendar' | 'docs' | 'sheets' | 'slides' | 'drive';

const SKILL_FILES: Partial<Record<AgentSkillTarget, string>> = {
  gmail: 'agent skill/gmail-agent-skill.md',
  calendar: 'agent skill/google-calendar-agent-skill.md',
  docs: 'agent skill/google-docs-agent-skill.md',
  sheets: 'agent skill/google-sheets-agent-skill.md',
  slides: 'agent skill/google-slides-agent-skill.md',
  drive: 'agent skill/google-drive-agent-skill.md',
};

const cache: Partial<Record<AgentSkillTarget, string>> = {};

function tryReadTextFile(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, 'utf8');
    return content.trim();
  } catch {
    return null;
  }
}

function loadAgentSkill(target: AgentSkillTarget): string {
  const cached = cache[target];
  if (typeof cached === 'string') {
    return cached;
  }

  const relPath = SKILL_FILES[target];
  if (!relPath) {
    cache[target] = '';
    return '';
  }
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const repoRootFromHere = resolve(moduleDir, '../../../../');

  const bases = [
    process.cwd(),
    resolve(process.cwd(), '..'),
    resolve(process.cwd(), '../..'),
    resolve(process.cwd(), '../../..'),
    repoRootFromHere,
  ];

  for (const base of bases) {
    const content = tryReadTextFile(resolve(base, relPath));
    if (content !== null) {
      cache[target] = content;
      return content;
    }
  }

  cache[target] = '';
  return '';
}

export function buildAgentSkillAppendix(target: AgentSkillTarget): string {
  const content = loadAgentSkill(target);
  if (!content) {
    return '';
  }

  const relPath = SKILL_FILES[target];
  if (!relPath) {
    return '';
  }
  return [
    '',
    '',
    'PROJECT SKILL PLAYBOOK (MUST FOLLOW)',
    'This is injected automatically at agent start and overrides generic guidance when it conflicts.',
    `Source: ${relPath}`,
    '',
    content,
  ].join('\n');
}

function truncateSkillContent(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 1200) {
    return normalized;
  }

  return `${normalized.slice(0, 1197)}...`;
}

function formatUserSkill(skill: UserSkillRow): string {
  const description = skill.description ? `Description: ${skill.description}` : null;
  const tags = skill.tags.length > 0 ? `Tags: ${skill.tags.join(', ')}` : null;
  const triggers = skill.triggers.length > 0 ? `Triggers: ${skill.triggers.join(', ')}` : null;

  return [
    `### ${skill.name}`,
    description,
    tags,
    triggers,
    'Content:',
    truncateSkillContent(skill.content_markdown),
  ].filter((line): line is string => Boolean(line)).join('\n');
}

export interface PromptScopedSkillAppendixInput {
  target: AgentSkillTarget;
  prompt: string;
  organizationId: string;
  userId?: string | null;
  maxUserSkills?: number;
}

export interface PromptScopedSkillAppendix {
  content: string;
  userSkillNames: string[];
  lookupError?: string;
}

export async function buildPromptScopedSkillAppendix(
  input: PromptScopedSkillAppendixInput,
): Promise<PromptScopedSkillAppendix> {
  const sections: string[] = [];
  const staticSkill = buildAgentSkillAppendix(input.target);
  if (staticSkill) {
    sections.push(staticSkill);
  }

  if (!input.userId) {
    return { content: sections.join('\n\n'), userSkillNames: [] };
  }

  try {
    const { userSkillsService } = await import('../services/UserSkillsService.js');
    const skills = await userSkillsService.findRelevantSkills(
      input.organizationId,
      input.userId,
      {
        query: `${input.target} ${input.prompt}`,
        maxResults: input.maxUserSkills ?? 3,
      },
    );

    if (skills.length > 0) {
      sections.push([
        '',
        'RELEVANT USER SKILLS (PROMPT-SCOPED)',
        'Apply only when they fit the current specialist task. Do not mention irrelevant skills.',
        '',
        ...skills.map(formatUserSkill),
      ].join('\n'));
    }

    return {
      content: sections.join('\n\n'),
      userSkillNames: skills.map((skill) => skill.name),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: sections.join('\n\n'),
      userSkillNames: [],
      lookupError: message,
    };
  }
}
