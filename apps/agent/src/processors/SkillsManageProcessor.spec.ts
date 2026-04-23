import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@ai-assistant/shared';
import { SkillsManageProcessor } from './SkillsManageProcessor.js';
import { skillCreatorAgent } from '../agents/SkillCreatorAgent.js';
import { userSkillsService } from '../services/UserSkillsService.js';

const {
  mockCreateSkill,
  mockListSkills,
  mockDeleteSkill,
  mockUpsertSkill,
} = vi.hoisted(() => ({
  mockCreateSkill: vi.fn(),
  mockListSkills: vi.fn(),
  mockDeleteSkill: vi.fn(),
  mockUpsertSkill: vi.fn(),
}));

vi.mock('../agents/SkillCreatorAgent.js', () => ({
  skillCreatorAgent: {
    createSkill: mockCreateSkill,
  },
}));

vi.mock('../services/UserSkillsService.js', () => ({
  userSkillsService: {
    listSkills: mockListSkills,
    deleteSkill: mockDeleteSkill,
    upsertSkill: mockUpsertSkill,
  },
}));

const baseTask: Task = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  organization_id: '123e4567-e89b-12d3-a456-426614174001',
  user_id: '123e4567-e89b-12d3-a456-426614174002',
  domain_action: 'skills.manage',
  status: 'queued',
  payload: {},
};

describe('SkillsManageProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockListSkills.mockResolvedValue([]);
    mockDeleteSkill.mockResolvedValue({ deleted: false });
    mockCreateSkill.mockResolvedValue({
      name: 'cover-letter-style',
      description: 'Preferred style for cover letters',
      content_markdown: 'Use concise confident tone.',
      tags: ['cover-letter'],
      triggers: ['cover letter'],
      is_active: true,
    });
    mockUpsertSkill.mockResolvedValue({
      id: 'skill-1',
      organization_id: baseTask.organization_id,
      user_id: baseTask.user_id,
      name: 'cover-letter-style',
      description: 'Preferred style for cover letters',
      content_markdown: 'Use concise confident tone.',
      tags: ['cover-letter'],
      triggers: ['cover letter'],
      is_active: true,
      created_at: '2026-03-31T00:00:00Z',
      updated_at: '2026-03-31T00:00:00Z',
    });
  });

  it('returns setup_required when task.user_id is missing', async () => {
    const processor = new SkillsManageProcessor();

    const result = await processor.process({
      ...baseTask,
      user_id: undefined,
      payload: {
        command_text: 'save this as a skill: cover-letter-style',
      },
    } as unknown as Task);

    expect(result.outcome).toBe('setup_required');
    expect(result.reason).toContain('task.user_id');
  });

  it('lists skills for the current user scope', async () => {
    mockListSkills.mockResolvedValueOnce([
      {
        id: 'skill-1',
        organization_id: baseTask.organization_id,
        user_id: baseTask.user_id,
        name: 'cover-letter-style',
        description: null,
        content_markdown: 'Use concise confident tone.',
        tags: ['cover-letter'],
        triggers: ['cover letter'],
        is_active: true,
        created_at: '2026-03-31T00:00:00Z',
        updated_at: '2026-03-31T00:00:00Z',
      },
    ]);

    const processor = new SkillsManageProcessor();
    const result = await processor.process({
      ...baseTask,
      payload: {
        command_text: 'list my skills',
      },
    });

    expect(mockListSkills).toHaveBeenCalledWith(baseTask.organization_id, baseTask.user_id);
    expect(result.outcome).toBe('listed');
    expect(result.total).toBe(1);
  });

  it('returns setup_required when delete command has no skill name', async () => {
    const processor = new SkillsManageProcessor();

    const result = await processor.process({
      ...baseTask,
      payload: {
        command_text: 'delete skill',
        operation: 'delete',
      },
    });

    expect(result.outcome).toBe('setup_required');
    expect(result.summary).toContain('requires a skill name');
  });

  it('deletes a named skill when delete input is valid', async () => {
    mockDeleteSkill.mockResolvedValueOnce({ deleted: true });

    const processor = new SkillsManageProcessor();

    const result = await processor.process({
      ...baseTask,
      payload: {
        command_text: 'delete skill cover-letter-style',
        operation: 'delete',
      },
    });

    expect(userSkillsService.deleteSkill).toHaveBeenCalledWith(
      baseTask.organization_id,
      baseTask.user_id,
      'cover-letter-style',
    );
    expect(result.outcome).toBe('deleted');
    expect(result.deleted).toBe(true);
  });

  it('creates or updates a skill via SkillCreatorAgent then UserSkillsService', async () => {
    const processor = new SkillsManageProcessor();

    const result = await processor.process({
      ...baseTask,
      payload: {
        command_text: 'save this as a skill: cover-letter-style',
      },
    });

    expect(skillCreatorAgent.createSkill).toHaveBeenCalledOnce();
    expect(userSkillsService.upsertSkill).toHaveBeenCalledWith(
      baseTask.organization_id,
      baseTask.user_id,
      expect.objectContaining({ name: 'cover-letter-style' }),
    );
    expect(result.outcome).toBe('saved');
    expect(result.summary).toContain('Saved user skill');
  });
});
