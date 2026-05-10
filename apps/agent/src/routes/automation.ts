import { Request, Response, Router } from 'express';
import { AutomationWatcherService, automationWatcherService } from '../services/AutomationWatcherService.js';
import { supabase } from '../services/supabase.js';

type AutomationRouteDeps = {
  service: AutomationWatcherService;
  supabaseClient: typeof supabase;
};

type AuthContext = {
  organizationId: string;
  userId: string;
};

function readBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function ensureRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

async function authenticate(req: Request, deps: AutomationRouteDeps): Promise<AuthContext> {
  const token = readBearerToken(req.header('authorization'));
  if (!token) {
    throw new Error('Missing bearer token');
  }

  const { data: authData, error: authError } = await deps.supabaseClient.auth.getUser(token);
  if (authError || !authData.user) {
    throw new Error('Invalid bearer token');
  }

  const { data: profile, error: profileError } = await deps.supabaseClient
    .from('profiles')
    .select('id, organization_id')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    throw new Error('User profile or organization not found');
  }

  return {
    organizationId: String(profile.organization_id),
    userId: String(profile.id),
  };
}

export async function handleCreateAutomationWatcher(
  req: Request,
  res: Response,
  deps: AutomationRouteDeps,
): Promise<void> {
  try {
    const auth = await authenticate(req, deps);
    const body = ensureRecord(req.body);
    const name = readString(body, 'name');
    const source = readString(body, 'source');
    const matchText = readString(body, 'matchText') ?? readString(body, 'match_text');
    const promptTemplate = readString(body, 'promptTemplate') ?? readString(body, 'prompt_template');
    const skillName = readString(body, 'skillName') ?? readString(body, 'skill_name');

    if (!name || !source || !matchText || !promptTemplate) {
      res.status(400).json({ error: 'name, source, matchText, and promptTemplate are required' });
      return;
    }

    const watcher = await deps.service.createWatcher({
      organizationId: auth.organizationId,
      userId: auth.userId,
      name,
      source,
      matchText,
      promptTemplate,
      skillName,
    });

    res.status(201).json({ watcher });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create automation watcher';
    res.status(message.includes('bearer') || message.includes('organization') ? 401 : 400).json({ error: message });
  }
}

export async function handleAutomationEvent(
  req: Request,
  res: Response,
  deps: AutomationRouteDeps,
): Promise<void> {
  try {
    const auth = await authenticate(req, deps);
    const body = ensureRecord(req.body);
    const source = readString(body, 'source');
    const contextValue = body.context;

    if (!source) {
      res.status(400).json({ error: 'source is required' });
      return;
    }

    const result = await deps.service.handleEvent({
      organizationId: auth.organizationId,
      userId: auth.userId,
      source,
      text: readString(body, 'text'),
      topic: readString(body, 'topic'),
      eventId: readString(body, 'eventId') ?? readString(body, 'event_id'),
      context: ensureRecord(contextValue),
    });

    res.status(202).json({ accepted: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process automation event';
    res.status(message.includes('bearer') || message.includes('organization') ? 401 : 400).json({ error: message });
  }
}

export function createAutomationRouter(
  deps: AutomationRouteDeps = { service: automationWatcherService, supabaseClient: supabase },
): Router {
  const router = Router();

  router.post('/watchers', async (req, res) => {
    await handleCreateAutomationWatcher(req, res, deps);
  });

  router.post('/events', async (req, res) => {
    await handleAutomationEvent(req, res, deps);
  });

  return router;
}

export const automationRouter = createAutomationRouter();
