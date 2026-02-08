import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUserStore } from './user';
import { supabase } from '../services/supabase';

vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
    })),
  },
}));

describe('User Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('initializes with null profile and loading true', () => {
    const store = useUserStore();
    expect(store.profile).toBeNull();
    expect(store.loading).toBe(true);
  });

  it('correctly identifies hasOrganization state', async () => {
    const store = useUserStore();
    
    // Mock user
    (supabase.auth.getUser as any).mockResolvedValue({ data: { user: { id: '123' } } });
    
    // Mock profile without organization
    const mockFrom = supabase.from as any;
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { id: '123', organization_id: null, role: null },
            error: null
          }),
        })),
      })),
    });

    await store.fetchProfile();
    expect(store.hasOrganization).toBe(false);

    // Mock profile with organization
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { id: '123', organization_id: 'org-456', role: 'Simple User' },
            error: null
          }),
        })),
      })),
    });

    await store.fetchProfile();
    expect(store.hasOrganization).toBe(true);
    expect(store.isSimpleUser).toBe(true);
  });
});
