import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRelancingSetup } from './useRelancingSetup';

type ContextRow = {
  id: string;
  organization_id: string;
  project_name: string;
  deadline: string | null;
  setup_status: 'incomplete' | 'complete';
  updated_at: string;
};

type MemberRow = {
  organization_id: string;
  project_context_id: string;
  member_name: string;
  is_active: boolean;
  updated_at: string;
};

let contexts: ContextRow[] = [];
let members: MemberRow[] = [];

vi.mock('../services/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'project_scheduling_contexts') {
        const filters: Record<string, unknown> = {};

        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => {
              filters[column] = value;
              return {
                order: vi.fn(() => ({
                  limit: vi.fn(async (count: number) => {
                    const organizationId = filters.organization_id as string | undefined;
                    const rows = contexts
                      .filter((row) => (organizationId ? row.organization_id === organizationId : true))
                      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
                    return { data: rows.slice(0, count), error: null };
                  }),
                })),
              };
            }),
          })),
          upsert: vi.fn(async (payload: ContextRow) => {
            const existingIndex = contexts.findIndex((row) => row.id === payload.id);
            if (existingIndex >= 0) {
              contexts[existingIndex] = { ...contexts[existingIndex], ...payload };
            } else {
              contexts.push(payload);
            }
            return { error: null };
          }),
        };
      }

      if (table === 'project_member_assignments') {
        return {
          select: vi.fn(() => {
            const filters: Record<string, unknown> = {};
            const chain = {
              eq: vi.fn((column: string, value: unknown) => {
                filters[column] = value;
                if (Object.keys(filters).length >= 2) {
                  const rows = members.filter((row) => {
                    const byContext = filters.project_context_id ? row.project_context_id === filters.project_context_id : true;
                    const byActive = typeof filters.is_active === 'boolean' ? row.is_active === filters.is_active : true;
                    return byContext && byActive;
                  });
                  return Promise.resolve({ data: rows, error: null });
                }
                return chain;
              }),
            };
            return chain;
          }),
          update: vi.fn((payload: Partial<MemberRow>) => ({
            eq: vi.fn(async (column: string, value: unknown) => {
              if (column === 'project_context_id') {
                members = members.map((row) =>
                  row.project_context_id === value ? { ...row, ...payload } : row,
                );
              }
              return { error: null };
            }),
          })),
          upsert: vi.fn(async (payload: MemberRow[]) => {
            for (const row of payload) {
              const existingIndex = members.findIndex(
                (member) =>
                  member.project_context_id === row.project_context_id
                  && member.member_name === row.member_name,
              );

              if (existingIndex >= 0) {
                members[existingIndex] = { ...members[existingIndex], ...row };
              } else {
                members.push(row);
              }
            }

            return { error: null };
          }),
        };
      }

      return {
        select: vi.fn(() => Promise.resolve({ data: [], error: null })),
      };
    }),
  },
}));

describe('useRelancingSetup', () => {
  beforeEach(() => {
    contexts = [];
    members = [];
    vi.clearAllMocks();
  });

  it('returns incomplete snapshot when no setup exists', async () => {
    const setup = useRelancingSetup();

    const snapshot = await setup.loadSnapshot('org-1');

    expect(snapshot.setupStatus).toBe('incomplete');
    expect(snapshot.missingFields).toEqual(['project_name', 'members', 'deadline']);
  });

  it('persists complete setup context with members and deadline', async () => {
    const setup = useRelancingSetup();

    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    const saved = await setup.saveSetup({
      organizationId: 'org-1',
      contextId: 'context-1',
      projectName: 'Q2 Launch',
      membersInput: 'Alexis, Jordan',
      deadlineInput: nextYear.toISOString(),
    });

    expect(saved.setupStatus).toBe('complete');
    expect(saved.missingFields).toEqual([]);

    const snapshot = await setup.loadSnapshot('org-1');
    expect(snapshot.projectName).toBe('Q2 Launch');
    expect(snapshot.members).toEqual(['Alexis', 'Jordan']);
    expect(snapshot.setupStatus).toBe('complete');
  });

  it('keeps setup incomplete when required fields are missing', async () => {
    const setup = useRelancingSetup();

    const saved = await setup.saveSetup({
      organizationId: 'org-1',
      contextId: 'context-2',
      projectName: '',
      membersInput: '',
      deadlineInput: '',
    });

    expect(saved.setupStatus).toBe('incomplete');
    expect(saved.missingFields).toEqual(['project_name', 'members', 'deadline']);
  });
});
