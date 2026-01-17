import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePermissions } from './usePermissions';
import { createPinia, setActivePinia } from 'pinia';
import { useUserStore } from '../stores/user';
import type { Profile } from '@ai-assistant/shared';

describe('usePermissions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('correctly identifies CEO role', () => {
    const userStore = useUserStore();
    userStore.profile = { role: 'CEO' } as Profile;

    const { isCEO, isPM, isTeamMember } = usePermissions();

    expect(isCEO.value).toBe(true);
    expect(isPM.value).toBe(false);
    expect(isTeamMember.value).toBe(false);
  });

  it('correctly identifies PM role', () => {
    const userStore = useUserStore();
    userStore.profile = { role: 'PM' } as Profile;

    const { isCEO, isPM, isTeamMember } = usePermissions();

    expect(isCEO.value).toBe(false);
    expect(isPM.value).toBe(true);
    expect(isTeamMember.value).toBe(false);
  });

  it('correctly identifies Team Member role', () => {
    const userStore = useUserStore();
    userStore.profile = { role: 'Team Member' } as Profile;

    const { isCEO, isPM, isTeamMember } = usePermissions();

    expect(isCEO.value).toBe(false);
    expect(isPM.value).toBe(false);
    expect(isTeamMember.value).toBe(true);
  });

  it('handles null profile (unauthenticated)', () => {
    const userStore = useUserStore();
    userStore.profile = null;

    const { isCEO, isPM, isTeamMember } = usePermissions();

    expect(isCEO.value).toBe(false);
    expect(isPM.value).toBe(false);
    expect(isTeamMember.value).toBe(false);
  });

  // Verify Principal-Driven Access Logic (Frontend Simulation)
  it('verifies that a PM cannot act as a CEO', () => {
    const userStore = useUserStore();
    userStore.profile = { role: 'PM' } as Profile;
    const { isCEO } = usePermissions();
    
    // Explicit assertion that PM is NOT CEO
    expect(isCEO.value).toBe(false);
  });
});
