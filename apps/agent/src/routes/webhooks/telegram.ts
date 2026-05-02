import { randomUUID } from 'crypto';
import { Request, Response, Router } from 'express';
import { ChannelAdapterRegistry, channelAdapterRegistry } from '../../channels/ChannelAdapterRegistry.js';
import { ChannelRouterService, channelRouter } from '../../services/channelRouter.js';
import { MessagingChannelLinkService, messagingChannelLinkService } from '../../services/MessagingChannelLinkService.js';

export type TelegramWebhookDeps = {
  registry: ChannelAdapterRegistry;
  routerService: ChannelRouterService;
  linkService: MessagingChannelLinkService;
};

function buildRequestPath(req: Request): string {
  const forwardedProto = req.header('x-forwarded-proto');
  const forwardedHost = req.header('x-forwarded-host');

  const protocol = (forwardedProto ?? req.protocol ?? 'https').split(',')[0]?.trim() || 'https';
  const host = (forwardedHost ?? req.get('host') ?? 'localhost').split(',')[0]?.trim() || 'localhost';
  return `${protocol}://${host}${req.originalUrl}`;
}

function ensureRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readTelegramChatId(update: Record<string, unknown>): string | null {
  const callbackQuery = ensureRecord(update.callback_query);
  const message = ensureRecord(update.message);
  const editedMessage = ensureRecord(update.edited_message);
  const callbackMessage = ensureRecord(callbackQuery.message);
  const source = Object.keys(message).length > 0
    ? message
    : Object.keys(editedMessage).length > 0
      ? editedMessage
      : callbackMessage;
  const chat = ensureRecord(source.chat);
  const id = chat.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

function readTelegramMessageText(update: Record<string, unknown>): string | null {
  const message = ensureRecord(update.message);
  const editedMessage = ensureRecord(update.edited_message);
  const source = Object.keys(message).length > 0 ? message : editedMessage;
  return typeof source.text === 'string' && source.text.trim().length > 0 ? source.text.trim() : null;
}

function readStartToken(update: Record<string, unknown>): string | null {
  const text = readTelegramMessageText(update);
  if (!text) return null;

  const match = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  return match?.[1]?.trim() || null;
}

export async function handleTelegramWebhook(req: Request, res: Response, deps: TelegramWebhookDeps): Promise<void> {
  const adapter = deps.registry.get('telegram');
  const rawBody = typeof (req as Request & { rawBody?: string }).rawBody === 'string'
    ? (req as Request & { rawBody?: string }).rawBody as string
    : JSON.stringify(req.body ?? {});

  const validation = adapter.validateWebhook({
    headers: req.headers,
    rawBody,
    parsedBody: req.body,
    requestPath: buildRequestPath(req),
  });

  if (!validation.valid) {
    res.status(401).json({ error: 'Invalid Telegram webhook signature', reason: validation.reason });
    return;
  }

  const body = ensureRecord(req.body);
  const startToken = readStartToken(body);

  if (startToken) {
    try {
      const activation = await deps.linkService.activateTelegramLink(startToken, body);
      if (activation.chatId) {
        await deps.linkService
          .sendTelegramText(activation.chatId, activation.message)
          .catch((error: unknown) => {
            console.warn('[TelegramWebhook] Failed to send link activation reply:', error);
          });
      }

      res.status(202).json({ accepted: true, linked: activation.ok });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to link Telegram account';
      res.status(400).json({ error: message });
    }
    return;
  }

  const identity = await deps.linkService.resolveTelegramIdentity(body);
  if (!identity) {
    const chatId = readTelegramChatId(body);
    if (chatId) {
      await deps.linkService
        .sendTelegramText(chatId, 'Open Settings in the web app and connect Telegram before messaging this assistant.')
        .catch((error: unknown) => {
          console.warn('[TelegramWebhook] Failed to send unlinked-chat guidance:', error);
        });
    }
    res.status(202).json({ accepted: true, ignored: true, reason: 'telegram_chat_not_linked' });
    return;
  }

  const domainAction = typeof body.domain_action === 'string'
    ? body.domain_action
    : (typeof req.query.domain_action === 'string' ? req.query.domain_action : undefined);

  const correlationId = typeof req.header('x-correlation-id') === 'string'
    ? req.header('x-correlation-id') as string
    : randomUUID();

  try {
    const result = await deps.routerService.enqueueInbound('telegram', {
      ...body,
      organization_id: identity.organization_id,
      user_id: identity.user_id,
      correlation_id: correlationId,
      domain_action: domainAction,
    });

    res.status(202).json({
      accepted: true,
      task_id: result.task_id,
      correlation_id: result.correlation_id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process telegram webhook';
    res.status(400).json({ error: message });
  }
}

export function createTelegramWebhookRouter(deps: TelegramWebhookDeps = { registry: channelAdapterRegistry, routerService: channelRouter, linkService: messagingChannelLinkService }): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    await handleTelegramWebhook(req, res, deps);
  });

  return router;
}

export const telegramWebhookRouter = createTelegramWebhookRouter();
