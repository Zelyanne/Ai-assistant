import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetch, mockFrom } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('../config/index.js', () => ({
  config: {
    TELEGRAM_BOT_TOKEN: 'bot-token',
    TELEGRAM_BOT_USERNAME: 'assistant_bot',
    TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
    TELEGRAM_WEBHOOK_URL: 'https://agent.example.com/webhooks/telegram',
  },
}));

vi.mock('./supabase.js', () => ({
  supabase: {
    from: mockFrom,
  },
}));

const { MessagingChannelLinkService } = await import('./MessagingChannelLinkService.js');

function jsonResponse(payload: unknown, ok = true, statusText = 'OK'): Response {
  return {
    ok,
    statusText,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function createFilterChain(): Record<string, ReturnType<typeof vi.fn>> {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.eq = vi.fn(() => chain);
  chain.gt = vi.fn(() => chain);
  chain.or = vi.fn(() => chain);
  return chain;
}

describe('MessagingChannelLinkService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue(jsonResponse({ ok: true, result: true }));
  });

  it('creates a Telegram link token after ensuring the webhook is configured', async () => {
    const query = createFilterChain();
    const update = vi.fn(() => query);
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ update, insert });

    const result = await new MessagingChannelLinkService().createTelegramLinkToken({
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/setWebhook',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          url: 'https://agent.example.com/webhooks/telegram',
          secret_token: 'webhook-secret',
          allowed_updates: ['message', 'edited_message', 'callback_query'],
        }),
      }),
    );
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked' }));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: 'org-1',
      user_id: 'user-1',
      channel: 'telegram',
      status: 'pending',
      link_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      link_token_expires_at: expect.any(String),
    }));
    expect(result.deepLink).toMatch(/^https:\/\/t\.me\/assistant_bot\?start=/);
  });

  it('activates a pending Telegram link for the webhook chat', async () => {
    const pendingLink = {
      id: 'link-1',
      organization_id: 'org-1',
      user_id: 'user-1',
      channel: 'telegram',
      status: 'pending',
      external_thread_id: null,
      external_user_id: null,
      username: null,
      display_name: null,
      link_token_hash: 'hash',
      link_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
      linked_at: null,
      last_seen_at: null,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const activatedLink = { ...pendingLink, status: 'active', external_thread_id: '123' };

    const pendingQuery = createFilterChain();
    pendingQuery.select = vi.fn(() => pendingQuery);
    pendingQuery.maybeSingle = vi.fn().mockResolvedValue({ data: pendingLink, error: null });

    const revokeQuery = createFilterChain();

    const activateQuery = createFilterChain();
    activateQuery.select = vi.fn(() => activateQuery);
    activateQuery.single = vi.fn().mockResolvedValue({ data: activatedLink, error: null });

    const update = vi.fn((payload: Record<string, unknown>) => (
      payload.status === 'revoked' ? revokeQuery : activateQuery
    ));
    mockFrom.mockReturnValue({
      select: pendingQuery.select,
      update,
    });

    const result = await new MessagingChannelLinkService().activateTelegramLink('token-1', {
      message: {
        chat: { id: 123 },
        from: { id: 456, username: 'alexis', first_name: 'Alexis', last_name: 'Othily' },
      },
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, chatId: '123', link: activatedLink }));
    expect(update).toHaveBeenCalledWith({ status: 'revoked' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      external_user_id: '456',
      external_thread_id: '123',
      username: 'alexis',
      display_name: 'Alexis Othily',
      status: 'active',
    }));
  });

  it('surfaces Telegram send failures with API descriptions', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: false, description: 'chat not found' }, false, 'Bad Request'));

    await expect(new MessagingChannelLinkService().sendTelegramText('123', 'hello'))
      .rejects
      .toThrow('chat not found');
  });
});
