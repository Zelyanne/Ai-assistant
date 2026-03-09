import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/index.js', () => ({
  config: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    MISTRAL_API_KEY: 'test-mistral-key',
    DEFAULT_LLM_MODEL: 'mistral-small-latest',
  },
}));

const mockAgent = {
  invoke: vi.fn(),
};

vi.mock('../services/mcp.js', () => ({
  mcpService: {
    getLangChainTools: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../guards/PerimeterGuard.js', () => {
  const MockPerimeterGuard = class {
    redactPII(text: string) {
      return text;
    }
    recoverPII(text: string) {
      return text;
    }
    static wrapToolWithSecurity(tool: unknown) {
      return tool;
    }
  };

  return { PerimeterGuard: MockPerimeterGuard };
});

const store = {
  insertedBrief: null as Record<string, unknown> | null,
  auditEntries: [] as Record<string, unknown>[],
};

function createChain(table: string): any {
  const state = {
    mode: 'select' as 'select' | 'insert' | 'update',
    payload: undefined as unknown,
  };

  const resolveResult = (): { data: any; error: any } => {
    if (table === 'profiles' && state.mode === 'select') {
      return { data: { last_brief_generated_at: null }, error: null };
    }

    if (table === 'profiles' && state.mode === 'update') {
      return { data: null, error: null };
    }

    if (table === 'ingested_threads') {
      return { data: [], error: null };
    }

    if (table === 'relancing_updates') {
      return {
        data: [
          {
            id: 'rel-update-1',
            message_text: 'Blocked waiting for API access. Need help from Sam.',
            progress_summary: null,
            blocker_summary: 'waiting for API access',
            dependency: 'API access',
            requested_help: 'Need help from Sam.',
            eta_hint: 'by Friday',
            intents: ['blocker_report'],
            created_at: new Date().toISOString(),
            project_scheduling_contexts: { project_name: 'Launch' },
            project_member_assignments: { member_name: 'Jordan' },
          },
        ],
        error: null,
      };
    }

    if (table === 'morning_briefs' && state.mode === 'insert') {
      store.insertedBrief = state.payload as Record<string, unknown>;
      return { data: { id: 'brief-1' }, error: null };
    }

    if (table === 'agent_activity_log' && state.mode === 'insert') {
      store.auditEntries.push(state.payload as Record<string, unknown>);
      return { data: { id: 'audit-1' }, error: null };
    }

    return { data: null, error: null };
  };

  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn((payload: unknown) => {
      state.mode = 'insert';
      state.payload = payload;
      return chain;
    }),
    update: vi.fn((payload: unknown) => {
      state.mode = 'update';
      state.payload = payload;
      return chain;
    }),
    eq: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    not: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(async () => resolveResult()),
    then: vi.fn((resolve: (value: { data: any; error: any }) => unknown, reject?: (reason?: unknown) => unknown) => {
      return Promise.resolve(resolveResult()).then(resolve, reject);
    }),
  };

  return chain;
}

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: vi.fn((table: string) => createChain(table)),
  },
}));

describe('MorningBriefProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.insertedBrief = null;
    store.auditEntries = [];
    mockAgent.invoke.mockResolvedValue({
      messages: [
        {
          role: 'assistant',
          content: JSON.stringify({
            narrative_overview: 'BLUF sentence.\n\nJordan is blocked on Launch and needs help.',
            actionable_items: [
              {
                source_id: 'rel-update-1',
                title: 'Jordan blocked on Launch',
                action_required: 'Help unblock API access.',
                priority: 'high',
                topic: 'Blocker',
              },
            ],
            topic_summaries: [
              {
                topic: 'Blocker',
                narrative: 'Jordan reported a blocker on Launch.',
              },
            ],
          }),
        },
      ],
    });
  });

  it('includes relancing updates in the generated morning brief inputs and outputs', async () => {
    const { MorningBriefProcessor } = await import('./MorningBriefProcessor.js');
    const processor = new MorningBriefProcessor();
    vi.spyOn(processor as any, 'createAgentInstance').mockReturnValue(mockAgent);

    const result = await processor.process({
      id: 'task-1',
      organization_id: 'org-1',
      user_id: 'user-1',
      domain_action: 'morning.brief',
      status: 'queued',
      payload: {},
    } as any);

    expect(mockAgent.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining('Source Type: relancing_update'),
          }),
        ],
      }),
    );

    expect(result.thread_count).toBe(0);
    expect(result.relancing_update_count).toBe(1);
    expect(result.message).toContain('1 sources');
    expect(store.insertedBrief?.metadata).toEqual(
      expect.objectContaining({
        source_ids: ['rel-update-1'],
      }),
    );
    expect(store.auditEntries[0]).toEqual(
      expect.objectContaining({
        action_taken: 'Generated morning brief with 1 sources',
        citations: [
          expect.objectContaining({
            source_type: 'relancing_update',
            source_id: 'rel-update-1',
          }),
        ],
      }),
    );
  });
});
