import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramAdapter } from './TelegramAdapter.js';
import { ChannelRouterService } from '../services/channelRouter.js';
import { ChannelAdapterRegistry } from './ChannelAdapterRegistry.js';
import { AuditLogger } from '../services/AuditLogger.js';

describe('Telegram Integration', () => {
  const mockSupabase = {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'task-123' }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((resolve) => resolve({ data: [], error: null })),
    })),
  };

  const adapter = new TelegramAdapter({ 
    bot_token: 'test-token',
    webhook_secret_token: 'secret' 
  });
  const registry = new ChannelAdapterRegistry([adapter]);
  const routerService = new ChannelRouterService({
    registry,
    supabaseClient: mockSupabase as any,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuditLogger, 'flush').mockResolvedValue(undefined);
  });

  it('handles inbound telegram message and routes to assistant.command', async () => {
    const payload = {
      update_id: 100,
      message: {
        message_id: 200,
        text: 'What is my schedule?',
        chat: { id: 12345 },
        from: { id: 555, username: 'testuser' },
      },
      organization_id: '11111111-1111-1111-1111-111111111111',
    };

    const result = await routerService.enqueueInbound('telegram', payload);

    expect(result.envelope.domain_action).toBe('assistant.command');
    expect(mockSupabase.from).toHaveBeenCalledWith('tasks');
  });

  it('sends outbound message via Telegram API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ok: true,
        result: { message_id: 999 }
      })
    });
    vi.stubGlobal('fetch', mockFetch);

    const outboundResult = await adapter.sendOutbound({
      channel: 'telegram',
      organization_id: 'org-1',
      external_message_id: 'ext-1',
      thread_id: '12345',
      message_text: 'Your schedule is empty.',
      channel_metadata: {},
    });

    expect(outboundResult.delivery_state).toBe('sent');
    expect(outboundResult.provider_message_id).toBe('999');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.telegram.org/bottest-token/sendMessage'),
      expect.any(Object)
    );

    vi.unstubAllGlobals();
  });
});
