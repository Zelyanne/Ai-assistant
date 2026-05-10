import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpecialistNodeContext } from './types.js';
import {
  buildSpecialistContextPrompt,
  getSpecialistMcpTools,
} from './specialistToolBuilder.js';

const {
  mockGetLangChainTools,
  mockIsToolAllowed,
} = vi.hoisted(() => ({
  mockGetLangChainTools: vi.fn(),
  mockIsToolAllowed: vi.fn(),
}));

vi.mock('../../services/mcp.js', () => ({
  mcpService: {
    getLangChainTools: mockGetLangChainTools,
  },
}));

vi.mock('../../services/WorkerToolPolicyService.js', () => ({
  workerToolPolicyService: {
    isToolAllowed: mockIsToolAllowed,
  },
}));

vi.mock('../../tools/timeDateTool.js', () => ({
  createCurrentTimeTool: () => ({ name: 'get_current_time' }),
}));

vi.mock('../../tools/userSkillsTools.js', () => ({
  createSearchUserSkillsTool: () => ({ name: 'search_user_skills' }),
  createListUserSkillsTool: () => ({ name: 'list_user_skills' }),
  createGetUserSkillTool: () => ({ name: 'get_user_skill' }),
}));

vi.mock('../../tools/researchTools.js', () => ({
  createSearchWebResearchTool: () => ({ name: 'search_web_research' }),
}));

describe('specialistToolBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsToolAllowed.mockReturnValue(true);
  });

  it('adds skills + research + time tools for docs specialist', async () => {
    mockGetLangChainTools.mockResolvedValueOnce([
      { name: 'create_doc' },
      { name: 'modify_doc_text' },
      { name: 'get_doc_content' },
      { name: 'send_gmail_message' },
    ]);

    const tools = await getSpecialistMcpTools('org-1', 'docs', { userId: 'user-1' });
    const names = tools.map((tool) => tool.name);
    const sorted = [...names].sort();

    expect(sorted).toEqual([
      'create_doc',
      'get_current_time',
      'get_doc_content',
      'get_user_skill',
      'list_user_skills',
      'modify_doc_text',
      'search_user_skills',
      'search_web_research',
    ]);
    expect(names).not.toContain('send_gmail_message');
  });

  it('excludes tools denied by worker policy', async () => {
    mockGetLangChainTools.mockResolvedValueOnce([
      { name: 'create_doc' },
      { name: 'modify_doc_text' },
      { name: 'get_doc_content' },
    ]);
    mockIsToolAllowed.mockImplementation((workerType: string, toolName: string) => {
      if (workerType === 'docs' && toolName === 'modify_doc_text') {
        return false;
      }

      return true;
    });

    const tools = await getSpecialistMcpTools('org-1', 'docs', { userId: 'user-1' });
    const names = tools.map((tool) => tool.name);

    expect(names).toContain('create_doc');
    expect(names).toContain('get_doc_content');
    expect(names).not.toContain('modify_doc_text');
  });

  it('keeps drive specialist toolset free of skills/research helpers', async () => {
    mockGetLangChainTools.mockResolvedValueOnce([
      { name: 'search_drive_files' },
      { name: 'get_drive_file_content' },
      { name: 'create_drive_file' },
      { name: 'import_to_google_doc' },
    ]);

    const tools = await getSpecialistMcpTools('org-1', 'drive', { userId: 'user-1' });
    const names = tools.map((tool) => tool.name);

    expect(names).toEqual(expect.arrayContaining([
      'search_drive_files',
      'get_drive_file_content',
      'create_drive_file',
      'import_to_google_doc',
      'get_current_time',
    ]));
    expect(names).not.toContain('search_user_skills');
    expect(names).not.toContain('search_web_research');
  });

  it('injects persona and long-term memory in specialist context prompt', () => {
    const context: SpecialistNodeContext = {
      task: {
        id: 'task-1',
        organization_id: 'org-1',
        user_id: 'user-1',
        domain_action: 'assistant.command',
        status: 'processing',
        payload: {},
      },
      executionRun: {
        id: 'run-1',
        task_id: 'task-1',
        organization_id: 'org-1',
        status: 'processing',
        plan_json: {
          version: 'v1',
          original_command: 'Draft a cover letter',
          summary: 'test',
          ledger_entries: [],
          replan_count: 0,
          steps: [
            {
              key: 'step-1',
              title: 'Write draft',
              worker_type: 'docs',
              action: 'create_document',
              status: 'pending',
              requested_tools: [],
              input: {},
              output: {
                summary: 'Source context',
              },
              attempt_count: 0,
              idempotency_key: 'docs-step-1',
              recoverable: false,
            },
          ],
        },
        idempotency_state: {},
        tool_policy_version: 'v1',
        version: 1,
        created_at: '2026-03-31T00:00:00Z',
        updated_at: '2026-03-31T00:00:00Z',
      },
      step: {
        key: 'step-2',
        title: 'Draft content',
        worker_type: 'docs',
        action: 'create_document',
        status: 'in_progress',
        requested_tools: [],
        input: {
          source_step_key: 'step-1',
          title: 'Cover Letter',
        },
        output: {},
        attempt_count: 0,
        idempotency_key: 'docs-step-2',
        recoverable: false,
      },
      memory: {
        persona_memory: 'Use crisp professional writing.',
        long_term_memory: 'User prefers concise openings.',
      },
      agentToolPrompt: 'Create the document using the General Agent handoff.',
      relevantSkillContext: 'RELEVANT USER SKILLS\nUse short headings.',
    } as unknown as SpecialistNodeContext;

    const prompt = buildSpecialistContextPrompt(context);
    expect(prompt).toContain('General Agent prompt for this specialist:');
    expect(prompt).toContain('Create the document using the General Agent handoff.');
    expect(prompt).toContain('User preferences / memory:');
    expect(prompt).toContain('Use crisp professional writing.');
    expect(prompt).toContain('User prefers concise openings.');
    expect(prompt).toContain('Prompt-scoped skill context:');
    expect(prompt).toContain('Use short headings.');
    expect(prompt).toContain('Source step output:');
  });
});
