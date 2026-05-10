import { beforeEach, describe, expect, it, vi } from 'vitest';
import { automationWatcherService } from '../services/AutomationWatcherService.js';
import { createAutomationWatcherTool, createListAutomationWatchersTool } from './automationTools.js';

const mocks = vi.hoisted(() => ({
  createWatcher: vi.fn(),
  listWatchers: vi.fn(),
}));

vi.mock('../services/AutomationWatcherService.js', () => ({
  automationWatcherService: {
    createWatcher: mocks.createWatcher,
    listWatchers: mocks.listWatchers,
  },
}));

describe('automationTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createWatcher.mockResolvedValue({
      id: 'watcher-1',
      name: 'Sheet ready watcher',
      source: 'google.sheets',
      match_text: 'Ready for Review',
      prompt_template: 'Review the row and create a follow-up task.',
      skill_name: 'sheet-review',
      is_active: true,
      last_triggered_at: null,
      updated_at: '2026-05-10T12:00:00Z',
    });
    mocks.listWatchers.mockResolvedValue([]);
  });

  it('creates a watcher with optional skill scope', async () => {
    const tool = createAutomationWatcherTool({ organizationId: 'org-1', userId: 'user-1' });

    const raw = await tool.invoke({
      name: 'Sheet ready watcher',
      source: 'google.sheets',
      match_text: 'Ready for Review',
      prompt_template: 'Review the row and create a follow-up task.',
      skill_name: 'sheet-review',
    });
    const parsed = JSON.parse(String(raw)) as { outcome: string; watcher: { skill_name: string | null } };

    expect(automationWatcherService.createWatcher).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      name: 'Sheet ready watcher',
      source: 'google.sheets',
      matchText: 'Ready for Review',
      promptTemplate: 'Review the row and create a follow-up task.',
      skillName: 'sheet-review',
    });
    expect(parsed.outcome).toBe('created');
    expect(parsed.watcher.skill_name).toBe('sheet-review');
  });

  it('lists scoped automation watchers', async () => {
    mocks.listWatchers.mockResolvedValueOnce([
      {
        id: 'watcher-1',
        name: 'Slack escalation watcher',
        source: 'slack.support',
        match_text: 'urgent',
        prompt_template: 'Summarize and draft a response.',
        skill_name: null,
        is_active: true,
        last_triggered_at: null,
        updated_at: '2026-05-10T12:00:00Z',
      },
    ]);

    const tool = createListAutomationWatchersTool({ organizationId: 'org-1', userId: 'user-1' });
    const raw = await tool.invoke({});
    const parsed = JSON.parse(String(raw)) as { total: number; watchers: Array<{ name: string }> };

    expect(automationWatcherService.listWatchers).toHaveBeenCalledWith('org-1', 'user-1');
    expect(parsed.total).toBe(1);
    expect(parsed.watchers[0]?.name).toBe('Slack escalation watcher');
  });
});
