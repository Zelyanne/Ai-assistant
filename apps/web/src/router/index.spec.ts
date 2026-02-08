import { describe, it, expect, vi, beforeEach } from 'vitest';
// @vitest-environment jsdom
import router from './index';
import { useUserStore } from '../stores/user';
import { createPinia, setActivePinia } from 'pinia';
import { supabase } from '../services/supabase';

vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

describe('Router Auth Guards', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // Provide a default mock for getSession to avoid errors during initial navigation
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null } });
    await router.push('/');
  });

  it('redirects to login when accessing a protected route without a session', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null } });
    
    await router.push('/dashboard/settings');
    expect(router.currentRoute.value.name).toBe('login');
  });

  it('allows access to login page even when not authenticated', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null } });
    
    await router.push('/login');
    expect(router.currentRoute.value.name).toBe('login');
  });

  it('redirects to dashboard when accessing login page while authenticated', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: { user: { id: '123' } } } });
    // Mock profile fetch
    const userStore = useUserStore();
    vi.spyOn(userStore, 'fetchProfile').mockResolvedValue();
    userStore.profile = { id: '123', role: 'CEO', organization_id: 'org-123' } as any;

    // Ensure we are not already on login
    await router.push('/dashboard/settings'); 

    await router.push('/login');
    expect(router.currentRoute.value.name).toBe('dashboard');
  });

  it('redirects to unauthorized when a non-CEO tries to access admin', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: { user: { id: '123' } } } });
    const userStore = useUserStore();
    vi.spyOn(userStore, 'fetchProfile').mockResolvedValue();
    userStore.profile = { id: '123', role: 'Team Member', organization_id: 'org-123' } as any;

    await router.push('/dashboard/admin');
    expect(router.currentRoute.value.name).toBe('unauthorized');
  });

  it('does NOT redirect to onboarding if user has no org but visits a public page (Landing)', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: { user: { id: '123' } } } });
    const userStore = useUserStore();
    vi.spyOn(userStore, 'fetchProfile').mockResolvedValue();
    // User has NO organization
    userStore.profile = { id: '123', role: 'Team Member', organization_id: null } as any;

    await router.push('/'); // Landing page (public)
    
    expect(router.currentRoute.value.name).toBe('landing');
    expect(router.currentRoute.value.path).toBe('/');
  });
});
