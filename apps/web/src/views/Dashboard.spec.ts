import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import Dashboard from './Dashboard.vue';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { useUserStore } from '../stores/user';
import { supabase } from '../services/supabase';

const confirmRequireMock = vi.fn();
const tasksInsertMock = vi.fn(() => Promise.resolve({ error: null }));

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({
    add: () => undefined,
    removeGroup: () => undefined,
  }),
}));

vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => ({
    require: confirmRequireMock,
  }),
}));

vi.mock('../services/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'morning_briefs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
                }))
              }))
            }))
          }))
        };
      }

      const defaultSelectResult = Promise.resolve({ data: [], error: null });
      const defaultSingleResult = Promise.resolve({ data: { status: null }, error: null });
      const defaultMaybeSingleResult = Promise.resolve({ data: { user_id: 'user-1' }, error: null });

      const insert = table === 'tasks' ? tasksInsertMock : vi.fn(() => Promise.resolve({ error: null }));

      return {
        insert,
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => defaultMaybeSingleResult),
            })),
            maybeSingle: vi.fn(() => defaultMaybeSingleResult),
            single: vi.fn(() => defaultSingleResult),
            order: vi.fn(() => ({
              limit: vi.fn(() => defaultSelectResult)
            })),
            limit: vi.fn(() => defaultSelectResult)
          }))
        }))
      };
    }),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('../composables/useAgent', () => ({
  useAgent: vi.fn(() => ({
    subscribeToTable: vi.fn(() => vi.fn()),
  })),
}));

const defaultSupabaseFromImpl = (supabase.from as any).getMockImplementation();

describe('Dashboard.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    (supabase.from as any).mockImplementation(defaultSupabaseFromImpl);
  });

  const mountView = () => {
    return mount(Dashboard, {
      global: {
        plugins: [PrimeVue],
        stubs: {
          OutcomeCard: true,
          Button: true,
          Card: {
            template: '<div><slot name="title" /><slot name="content" /><slot /></div>'
          },
          Drawer: {
            props: ['visible'],
            template: '<div v-if="visible"><slot name="header" /><slot /></div>',
          },
          Tabs: { template: '<div><slot /></div>' },
          TabList: { template: '<div><slot /></div>' },
          Tab: { template: '<button><slot /></button>' },
          TabPanels: { template: '<div><slot /></div>' },
          TabPanel: { template: '<div><slot /></div>' },
          Badge: {
            props: ['value'],
            template: '<span>{{ value }}<slot /></span>'
          },
          ReasoningTracePane: true
        }
      }
    });
  };

  it('renders ReasoningTracePane in all states (regression check for broken v-if chain)', async () => {
    const userStore = useUserStore();
    userStore.profile = { id: 'user-1', organization_id: 'org-1' } as any;

    // 1. Loading state
    const wrapper = mountView();
    expect(wrapper.findComponent({ name: 'ReasoningTracePane' }).exists()).toBe(true);

    // 2. Data state
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'morning_briefs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
                }))
              }))
            }))
          }))
        };
      }

      if (table === 'workspace_integrations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: { user_id: 'user-1' }, error: null }))
              }))
            }))
          }))
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({
                data: table === 'tasks' ? [{ id: '1', status: 'done', created_at: new Date().toISOString(), domain_action: 'test' }] : [],
                error: null
              }))
            }))
          }))
        }))
      };
    });
    await wrapper.vm.$nextTick(); // Wait for fetch
    await vi.waitFor(() => {
        expect(wrapper.findComponent({ name: 'ReasoningTracePane' }).exists()).toBe(true);
    });

    // 3. Empty state
    // Create a NEW wrapper to ensure clean state and fresh onMounted call
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'morning_briefs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
                }))
              }))
            }))
          }))
        };
      }

      if (table === 'workspace_integrations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: { user_id: 'user-1' }, error: null }))
              }))
            }))
          }))
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
            }))
          }))
        }))
      };
    });

    const emptyWrapper = mountView();
    // Wait for the fetch cycle to complete
    await emptyWrapper.vm.$nextTick();
    await vi.waitFor(() => {
        // Verify text content to confirm we are actually in the empty state
        expect(emptyWrapper.text()).toContain('All Quiet');
        // Verify the component still exists (meaning it wasn't hidden/broken by the v-if chain)
        expect(emptyWrapper.findComponent({ name: 'ReasoningTracePane' }).exists()).toBe(true);
    });
  });

  it('treats thread.action as a high-risk bulk automation action', async () => {
    const userStore = useUserStore();
    userStore.profile = { id: 'user-1', organization_id: 'org-1' } as any;

    const wrapper = mountView();

    (wrapper.vm as any).threads = [
      {
        id: 'thread-1',
        subject: 'Subject',
        summary: 'Summary',
        summary_json: null,
        external_id: 'ext-1',
        classification: { matches: [{ topic: 'Scheduling', reason: 'x', priority_score: 1 }] },
        metadata: { subject: 'Subject' },
        created_at: new Date().toISOString(),
      },
    ];

    (wrapper.vm as any).selectedItemIds = ['thread-1'];

    await (wrapper.vm as any).automateTasks();

    expect(confirmRequireMock).toHaveBeenCalledTimes(1);
  });

  it('disables bulk automation when Emergency Brake is engaged', async () => {
    const userStore = useUserStore();
    userStore.profile = { id: 'user-1', organization_id: 'org-1' } as any;

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'org_safety_controls') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: { emergency_brake_enabled: true }, error: null })),
            })),
          })),
        };
      }

      return defaultSupabaseFromImpl(table);
    });

    const wrapper = mountView();

    await vi.waitFor(() => {
      expect((wrapper.vm as any).isEmergencyBrakeEngaged).toBe(true);
    });

    (wrapper.vm as any).threads = [
      {
        id: 'thread-1',
        subject: 'Subject',
        summary: 'Summary',
        summary_json: null,
        external_id: 'ext-1',
        classification: { matches: [{ topic: 'Scheduling', reason: 'x', priority_score: 1 }] },
        metadata: { subject: 'Subject' },
        created_at: new Date().toISOString(),
      },
    ];

    (wrapper.vm as any).selectedItemIds = ['thread-1'];

    await (wrapper.vm as any).automateTasks();

    expect(confirmRequireMock).not.toHaveBeenCalled();
    expect(tasksInsertMock).not.toHaveBeenCalled();
  });

  it('includes topic when inserting a thread.action task for a thread item', async () => {
    const userStore = useUserStore();
    userStore.profile = { id: 'user-1', organization_id: 'org-1' } as any;

    const wrapper = mountView();

    await (wrapper.vm as any).executeBulkAutomation([
      {
        id: 'thread-1',
        type: 'thread',
        title: 'Subject',
        summary: 'Summary',
        externalId: 'ext-1',
        status: 'insight',
        agencyTier: 'Public',
        timestamp: 'now',
        original: { created_at: new Date().toISOString() },
        topics: ['Scheduling', 'Other'],
      },
    ]);

    expect(tasksInsertMock).toHaveBeenCalledTimes(1);
    expect(tasksInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        domain_action: 'thread.action',
        topic: 'Scheduling',
      }),
    );
  });

  it('renders correctly and fetches data on mount', async () => {
    const userStore = useUserStore();
    userStore.profile = { id: 'user-1', organization_id: 'org-1', full_name: 'Alexis CEO' } as any;

    const wrapper = mountView();
    
    expect(wrapper.text()).toContain('Alexis');
    expect(supabase.from).toHaveBeenCalledWith('ingested_threads');
    expect(supabase.from).toHaveBeenCalledWith('tasks');
  });

  it('calculates momentum metrics correctly', async () => {
    const userStore = useUserStore();
    userStore.profile = { id: 'user-1', organization_id: 'org-1' } as any;

    // Mock data
    const mockTasks = [
      { id: '1', status: 'done', created_at: new Date().toISOString(), domain_action: 'email.send' },
      { id: '2', status: 'done', created_at: new Date().toISOString(), domain_action: 'calendar.create' },
      { id: '3', status: 'escalation', created_at: new Date().toISOString(), domain_action: 'email.draft' }
    ];
    const mockThreads = [
      { id: '4', metadata: { is_escalation: true }, created_at: new Date().toISOString() }
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'morning_briefs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
                }))
              }))
            }))
          }))
        };
      }

      if (table === 'workspace_integrations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: { user_id: 'user-1' }, error: null }))
              }))
            }))
          }))
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({
                data: table === 'tasks' ? mockTasks : mockThreads,
                error: null
              }))
            }))
          }))
        }))
      };
    });

    const wrapper = mountView();
    
    // Wait for async data fetch
    await vi.waitFor(() => {
        expect(wrapper.text()).toContain('2'); // Wins
        expect(wrapper.text()).toContain('30m saved'); // Momentum
    });
  });

  it('displays empty state when no data is found', async () => {
    const userStore = useUserStore();
    userStore.profile = { id: 'user-1', organization_id: 'org-1' } as any;

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'morning_briefs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
                }))
              }))
            }))
          }))
        };
      }

      if (table === 'workspace_integrations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: { user_id: 'user-1' }, error: null }))
              }))
            }))
          }))
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
            }))
          }))
        }))
      };
    });

    const wrapper = mountView();
    
    await vi.waitFor(() => {
        expect(wrapper.text()).toContain('All Quiet');
    });
  });

  it('renders morning brief without leaking UUIDs into prose and shows Sources row', async () => {
    const userStore = useUserStore();
    userStore.profile = { id: 'user-1', organization_id: 'org-1', full_name: 'Alexis CEO' } as any;

    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    const mockBrief = {
      id: 'brief-1',
      organization_id: 'org-1',
      user_id: 'user-1',
      generated_at: new Date().toISOString(),
      summary_text: `BLUF sentence.\n\nBody mentions ${uuid} inline.`,
      blockers: [],
      risks: [],
      topic_deep_dives: [],
      metadata: { source_ids: [uuid] },
      is_read: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'morning_briefs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: mockBrief, error: null }))
                }))
              }))
            }))
          }))
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
            }))
          }))
        }))
      };
    });

    const wrapper = mountView();

    await vi.waitFor(() => {
      const text = wrapper.text();
      expect(text).toContain('Morning Brief');
      expect(text).toContain('Sources');
      expect(text).not.toContain(uuid);
      expect(text).toContain('123e4567...');
    });
  });

  it('queues email.send task with approval metadata from escalation draft', async () => {
    const userStore = useUserStore();
    userStore.profile = { id: 'user-1', organization_id: 'org-1' } as any;

    const wrapper = mountView();

    (wrapper.vm as any).selectedItem = {
      id: 'task-esc-1',
      type: 'task',
      title: 'Thread Action',
      summary: 'Needs approval',
      status: 'escalation',
      agencyTier: 'Controlled',
      timestamp: 'now',
      original: {
        id: 'task-esc-1',
        topic: 'Finance',
        domain_action: 'thread.action',
        status: 'escalation',
        payload: {},
        result: {},
        created_at: new Date().toISOString(),
      },
    };

    (wrapper.vm as any).editableDraft = {
      to: 'owner@example.com',
      cc: '',
      bcc: '',
      subject: 'Re: Finance update',
      body: 'Approved response',
      body_format: 'plain',
      thread_external_id: 'gmail-thread-1',
      thread_id: 'thread-1',
    };

    await (wrapper.vm as any).queueApprovedSend();

    expect(tasksInsertMock).toHaveBeenCalled();
    expect(tasksInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        domain_action: 'email.send',
        topic: 'Finance',
        payload: expect.objectContaining({
          approved_by: 'user-1',
          source_task_id: 'task-esc-1',
          to: 'owner@example.com',
        }),
      }),
    );
  });

  it('shows confidence context in escalation peek when metadata exists', async () => {
    const userStore = useUserStore();
    userStore.profile = { id: 'user-1', organization_id: 'org-1' } as any;

    const wrapper = mountView();

    (wrapper.vm as any).selectedItem = {
      id: 'task-esc-ctx',
      type: 'task',
      title: 'Thread Action',
      summary: 'Needs review',
      status: 'escalation',
      agencyTier: 'Controlled',
      timestamp: 'now',
      original: {
        id: 'task-esc-ctx',
        topic: 'Finance',
        domain_action: 'thread.action',
        status: 'escalation',
        payload: {},
        result: {
          escalation: true,
          confidence_score: 0.79,
          confidence_threshold: 0.8,
          escalation_trigger: 'low_confidence',
          prompt: 'Please review.',
        },
        created_at: new Date().toISOString(),
      },
    };
    (wrapper.vm as any).isPeekOpen = true;
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Confidence Context');
    expect(wrapper.text()).toContain('Score: 79%');
    expect(wrapper.text()).toContain('Threshold: 80%');
    expect(wrapper.text()).toContain('Trigger: low confidence');
  });

  it('does not show confidence context in escalation peek when metadata is absent', async () => {
    const userStore = useUserStore();
    userStore.profile = { id: 'user-1', organization_id: 'org-1' } as any;

    const wrapper = mountView();

    (wrapper.vm as any).selectedItem = {
      id: 'task-esc-no-ctx',
      type: 'task',
      title: 'Thread Action',
      summary: 'Needs review',
      status: 'escalation',
      agencyTier: 'Controlled',
      timestamp: 'now',
      original: {
        id: 'task-esc-no-ctx',
        topic: 'Finance',
        domain_action: 'thread.action',
        status: 'escalation',
        payload: {},
        result: {
          escalation: true,
          prompt: 'Please review.',
        },
        created_at: new Date().toISOString(),
      },
    };
    (wrapper.vm as any).isPeekOpen = true;
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain('Confidence Context');
  });
});
