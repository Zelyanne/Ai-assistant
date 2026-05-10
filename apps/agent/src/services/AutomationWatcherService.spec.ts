import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutomationWatcherService, type AutomationWatcherRow } from './AutomationWatcherService.js';

type MockState = {
  watchers: AutomationWatcherRow[];
  tasks: Record<string, unknown>[];
  updates: Record<string, unknown>[];
};

function watcher(overrides: Partial<AutomationWatcherRow> = {}): AutomationWatcherRow {
  return {
    id: 'watcher-1',
    organization_id: 'org-1',
    user_id: 'user-1',
    name: 'Client escalation watcher',
    source: 'slack.support',
    match_text: 'urgent client issue',
    prompt_template: 'Summarize the issue and draft a response.',
    skill_name: null,
    is_active: true,
    last_triggered_at: null,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

function createMockSupabase(state: MockState) {
  return {
    from: (table: string) => {
      if (table === 'automation_watchers') {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: state.watchers, error: null }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const inserted = watcher({
                  id: 'watcher-created',
                  organization_id: String(payload.organization_id),
                  user_id: payload.user_id === null ? null : String(payload.user_id),
                  name: String(payload.name),
                  source: String(payload.source),
                  match_text: String(payload.match_text),
                  prompt_template: String(payload.prompt_template),
                  skill_name: payload.skill_name === null ? null : String(payload.skill_name),
                });
                state.watchers.push(inserted);
                return { data: inserted, error: null };
              },
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async (_column: string, id: string) => {
              state.updates.push({ id, ...payload });
              return { error: null };
            },
          }),
        };
      }

      if (table === 'tasks') {
        return {
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const id = `task-${state.tasks.length + 1}`;
                state.tasks.push({ id, ...payload });
                return { data: { id }, error: null };
              },
            }),
          }),
        };
      }

      throw new Error(`Unhandled table ${table}`);
    },
  };
}

describe('AutomationWatcherService', () => {
  let state: MockState;
  let service: AutomationWatcherService;
  const auditLogger = { flush: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    vi.clearAllMocks();
    state = { watchers: [], tasks: [], updates: [] };
    service = new AutomationWatcherService({
      supabaseClient: createMockSupabase(state),
      auditLogger,
      now: () => new Date('2026-05-10T12:00:00Z'),
      skillsService: {
        getSkillByName: vi.fn().mockResolvedValue(null),
      },
    });
  });

  it('creates a scoped watcher with normalized source', async () => {
    const created = await service.createWatcher({
      organizationId: 'org-1',
      userId: 'user-1',
      name: 'Sheet ready watcher',
      source: 'Google.Sheets',
      matchText: 'Ready for Review',
      promptTemplate: 'Review the row and create a follow-up task.',
      skillName: 'sheet-review',
    });

    expect(created).toMatchObject({
      name: 'Sheet ready watcher',
      source: 'google.sheets',
      match_text: 'Ready for Review',
      skill_name: 'sheet-review',
    });
  });

  it('queues an assistant command when an event source and text match', async () => {
    state.watchers = [watcher()];

    const result = await service.handleEvent({
      organizationId: 'org-1',
      userId: 'user-1',
      source: 'slack.support',
      text: 'We have an urgent client issue with billing.',
      eventId: 'evt-1',
      context: { channel: '#support' },
    });

    expect(result).toEqual({ matchedWatchers: 1, queuedTaskIds: ['task-1'] });
    expect(state.tasks[0]).toMatchObject({
      organization_id: 'org-1',
      user_id: 'user-1',
      domain_action: 'assistant.command',
      status: 'queued',
      topic: 'Automation: Client escalation watcher',
    });
    expect(state.tasks[0]?.payload).toMatchObject({
      automation: true,
      watcher_id: 'watcher-1',
      trigger_source: 'slack.support',
      trigger_event_id: 'evt-1',
    });
    expect(String((state.tasks[0]?.payload as Record<string, unknown>).command)).toContain('Trigger context:');
    expect(state.updates[0]).toMatchObject({ id: 'watcher-1', last_triggered_at: '2026-05-10T12:00:00.000Z' });
    expect(auditLogger.flush).toHaveBeenCalledOnce();
  });

  it('ignores non-matching events without queueing work', async () => {
    state.watchers = [watcher({ match_text: 'board meeting ended' })];

    const result = await service.handleEvent({
      organizationId: 'org-1',
      userId: 'user-1',
      source: 'slack.support',
      text: 'general team update',
    });

    expect(result).toEqual({ matchedWatchers: 0, queuedTaskIds: [] });
    expect(state.tasks).toEqual([]);
  });
});
