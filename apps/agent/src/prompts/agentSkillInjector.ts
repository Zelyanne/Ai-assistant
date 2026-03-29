import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type AgentSkillTarget = 'generalProjectManagement' | 'sheets' | 'slides';

const SKILL_FILES: Record<AgentSkillTarget, string> = {
  generalProjectManagement: 'agent skill/google-workspace-project-management-general-agent-skill.md',
  sheets: 'agent skill/google-sheets-agent-skill.md',
  slides: 'agent skill/google-slides-agent-skill.md',
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
