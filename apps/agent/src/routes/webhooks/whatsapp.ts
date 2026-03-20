import { randomUUID } from 'crypto';
import { Request, Response, Router } from 'express';
import { ChannelAdapterRegistry, channelAdapterRegistry } from '../../channels/ChannelAdapterRegistry.js';
import { ChannelRouterService, channelRouter } from '../../services/channelRouter.js';

export type WhatsAppWebhookDeps = {
  registry: ChannelAdapterRegistry;
  routerService: ChannelRouterService;
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

function readEventName(body: Record<string, unknown>): string | undefined {
  return typeof body.event === 'string' ? body.event : undefined;
}

function isFromMePayload(body: Record<string, unknown>): boolean {
  const data = ensureRecord(body.data);
  const key = ensureRecord(data.key);
  return key.fromMe === true || data.fromMe === true;
}

function isDeliveryPayload(body: Record<string, unknown>): boolean {
  const event = readEventName(body);
  return event === 'send.message'
    || event === 'send.message.update'
    || event === 'messages.update'
    || typeof body.MessageStatus === 'string'
    || typeof body.SmsStatus === 'string'
    || typeof body.ErrorCode === 'string'
    || typeof body.ErrorMessage === 'string'
    || Boolean((body as any).entry?.[0]?.changes?.[0]?.value?.statuses);
}

function shouldIgnorePayload(body: Record<string, unknown>): boolean {
  return readEventName(body) === 'messages.upsert' && isFromMePayload(body);
}

export async function handleWhatsAppWebhook(req: Request, res: Response, deps: WhatsAppWebhookDeps): Promise<void> {
  const adapter = deps.registry.get('whatsapp');
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
    res.status(401).json({ error: 'Invalid WhatsApp webhook signature', reason: validation.reason });
    return;
  }

  const body = ensureRecord(req.body);
  const organizationId = typeof body.organization_id === 'string'
    ? body.organization_id
    : (typeof req.query.organization_id === 'string' ? req.query.organization_id : undefined);

  if (!organizationId) {
    res.status(400).json({ error: 'organization_id is required for whatsapp webhook routing' });
    return;
  }

  const userId = typeof body.user_id === 'string'
    ? body.user_id
    : (typeof req.query.user_id === 'string' ? req.query.user_id : null);

  const domainAction = typeof body.domain_action === 'string'
    ? body.domain_action
    : (typeof req.query.domain_action === 'string' ? req.query.domain_action : undefined);

  const taskId = typeof body.task_id === 'string'
    ? body.task_id
    : (typeof req.query.task_id === 'string' ? req.query.task_id : undefined);

  const correlationId = typeof req.header('x-correlation-id') === 'string'
    ? req.header('x-correlation-id') as string
    : randomUUID();

  try {
    if (isDeliveryPayload(body)) {
      const delivery = await deps.routerService.handleDeliveryEvent('whatsapp', {
        ...body,
        organization_id: organizationId,
        user_id: userId,
        task_id: taskId,
        correlation_id: correlationId,
      });

      res.status(delivery.accepted ? 200 : 202).json({
        accepted: delivery.accepted,
        persisted: delivery.persisted,
        reason: delivery.reason,
      });
      return;
    }

    if (shouldIgnorePayload(body)) {
      res.status(202).json({
        accepted: true,
        persisted: false,
        reason: 'self_message_ignored',
      });
      return;
    }

    const eventName = readEventName(body);
    if (eventName && eventName !== 'messages.upsert') {
      res.status(202).json({
        accepted: false,
        persisted: false,
        reason: `unsupported_event:${eventName}`,
      });
      return;
    }

    const result = await deps.routerService.enqueueInbound('whatsapp', {
      ...body,
      organization_id: organizationId,
      user_id: userId,
      correlation_id: correlationId,
      domain_action: domainAction,
    });

    res.status(202).json({
      accepted: true,
      task_id: result.task_id,
      correlation_id: result.correlation_id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process whatsapp webhook';
    res.status(400).json({ error: message });
  }
}

export function createWhatsAppWebhookRouter(deps: WhatsAppWebhookDeps = { registry: channelAdapterRegistry, routerService: channelRouter }): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe') {
      if (token === process.env.WHATSAPP_WEBHOOK_SECRET) {
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
      return;
    }

    res.status(200).json({
      ok: true,
      providers: ['evolution', 'meta', 'twilio'],
      path: buildRequestPath(req),
    });
  });

  router.post('/', async (req, res) => {
    await handleWhatsAppWebhook(req, res, deps);
  });

  return router;
}

export const whatsAppWebhookRouter = createWhatsAppWebhookRouter();
