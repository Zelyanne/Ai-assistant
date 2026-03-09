import { describe, it, expect, vi, beforeEach } from 'vitest';
// @vitest-environment jsdom
import router from './index';
import { useUserStore } from '../stores/user';
import { createPinia, setActivePinia } from 'pinia';
import { supabase } from '../services/supabase';

type GetSessionResult = Awaited<ReturnType<typeof supabase.auth.getSession>>;

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
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as GetSessionResult);
    await router.push('/');
  });

  it('redirects to login when accessing a protected route without a session', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as GetSessionResult);
    
    await router.push('/dashboard/settings');
    expect(router.currentRoute.value.name).toBe('login');
  });

  it('allows access to login page even when not authenticated', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as GetSessionResult);
    
    await router.push('/login');
    expect(router.currentRoute.value.name).toBe('login');
  });

  it('redirects to dashboard when accessing login page while authenticated', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: { id: '123' } } } } as GetSessionResult);
    // Mock profile fetch
    const userStore = useUserStore();
    vi.spyOn(userStore, 'fetchProfile').mockResolvedValue();
    userStore.profile = { id: '123', role: 'CEO', organization_id: 'org-123' } as unknown as typeof userStore.profile;

    // Ensure we are not already on login
    await router.push('/dashboard/settings'); 

    await router.push('/login');
    expect(router.currentRoute.value.name).toBe('dashboard');
  });

  it('redirects to unauthorized when a non-CEO tries to access admin', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: { id: '123' } } } } as GetSessionResult);
    const userStore = useUserStore();
    vi.spyOn(userStore, 'fetchProfile').mockResolvedValue();
    userStore.profile = { id: '123', role: 'Team Member', organization_id: 'org-123' } as unknown as typeof userStore.profile;

    await router.push('/dashboard/admin');
    expect(router.currentRoute.value.name).toBe('unauthorized');
  });

  it('does NOT redirect to onboarding if user has no org but visits a public page (Landing)', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: { id: '123' } } } } as GetSessionResult);
    const userStore = useUserStore();
    vi.spyOn(userStore, 'fetchProfile').mockResolvedValue();
    // User has NO organization
    userStore.profile = { id: '123', role: 'Team Member', organization_id: null } as unknown as typeof userStore.profile;

    await router.push('/'); // Landing page (public)
    
    expect(router.currentRoute.value.name).toBe('landing');
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('allows authenticated users with organization to access command center route', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: { id: '123' } } } } as GetSessionResult);
    const userStore = useUserStore();
    vi.spyOn(userStore, 'fetchProfile').mockResolvedValue();
    userStore.profile = { id: '123', role: 'Team Member', organization_id: 'org-123' } as unknown as typeof userStore.profile;

    await router.push('/dashboard/command-center');

    expect(router.currentRoute.value.name).toBe('command-center');
  });
});
