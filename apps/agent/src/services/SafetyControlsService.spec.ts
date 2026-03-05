import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SafetyControlsService } from './SafetyControlsService.js';
import { supabase } from './supabase.js';

type ChangePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

let changeCallback: ((payload: ChangePayload) => void) | null = null;

vi.mock('./supabase.js', () => {
  const channelObj = {
    on: vi.fn((_: unknown, __: unknown, cb: (payload: ChangePayload) => void) => {
      changeCallback = cb;
      return channelObj;
    }),
    subscribe: vi.fn(() => channelObj),
    unsubscribe: vi.fn(() => Promise.resolve(undefined)),
  };

  return {
    supabase: {
      from: vi.fn(),
      channel: vi.fn(() => channelObj),
      removeChannel: vi.fn(),
    },
  };
});

describe('SafetyControlsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    changeCallback = null;
    SafetyControlsService.__dangerousResetForTests();
  });

  it('defaults to brake disabled when no row exists', async () => {
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const enabled = await SafetyControlsService.isEmergencyBrakeEnabled('org-1');
    expect(enabled).toBe(false);
  });

  it('returns brake enabled when row indicates enabled=true', async () => {
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { emergency_brake_enabled: true }, error: null }),
    });

    const enabled = await SafetyControlsService.isEmergencyBrakeEnabled('org-1');
    expect(enabled).toBe(true);
  });

  it('updates cache immediately on realtime UPDATE', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { emergency_brake_enabled: false }, error: null });
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    });

    expect(await SafetyControlsService.isEmergencyBrakeEnabled('org-1')).toBe(false);
    expect(changeCallback).not.toBeNull();

    changeCallback?.({
      eventType: 'UPDATE',
      new: { organization_id: 'org-1', emergency_brake_enabled: true },
      old: { organization_id: 'org-1', emergency_brake_enabled: false },
    });

    maybeSingle.mockClear();
    expect(await SafetyControlsService.isEmergencyBrakeEnabled('org-1')).toBe(true);
    expect(maybeSingle).not.toHaveBeenCalled();
  });
});
