import { AuditLogger } from './AuditLogger.js';
import { supabase } from './supabase.js';
import { userSkillsService, type UserSkillRow } from './UserSkillsService.js';

type SupabaseLike = {
  from: (table: string) => any;
};

export interface AutomationWatcherRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  name: string;
  source: string;
  match_text: string;
  prompt_template: string;
  skill_name: string | null;
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAutomationWatcherInput {
  organizationId: string;
  userId?: string | null;
  name: string;
  source: string;
  matchText: string;
  promptTemplate: string;
  skillName?: string | null;
}

export interface AutomationEventInput {
  organizationId: string;
  userId?: string | null;
  source: string;
  text?: string | null;
  topic?: string | null;
  eventId?: string | null;
  context?: Record<string, unknown> | null;
}

export interface AutomationTriggerResult {
  matchedWatchers: number;
  queuedTaskIds: string[];
}

type AutomationWatcherDeps = {
  supabaseClient?: SupabaseLike;
  auditLogger?: {
    flush: (...args: any[]) => Promise<void>;
  };
  skillsService?: {
    getSkillByName: (organizationId: string, userId: string, name: string) => Promise<UserSkillRow | null>;
  };
  now?: () => Date;
};

function cleanRequiredText(value: string, fieldName: string): string {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (cleaned.length === 0) {
    throw new Error(`${fieldName} cannot be empty.`);
  }
  return cleaned;
}

function normalizeSource(source: string): string {
  const cleaned = cleanRequiredText(source, 'Automation source').toLowerCase();
  if (cleaned !== '*' && !/^[a-z0-9_.:-]+$/.test(cleaned)) {
    throw new Error('Automation source can only contain letters, numbers, dot, underscore, colon, or dash.');
  }
  return cleaned;
}

function normalizeMatchText(matchText: string): string {
  return cleanRequiredText(matchText, 'Automation match text');
}

function compactString(value: string | null | undefined): string | null {
  const cleaned = value?.trim().replace(/\s+/g, ' ') ?? '';
  return cleaned.length > 0 ? cleaned : null;
}

function eventSearchText(input: AutomationEventInput): string {
  return [
    input.source,
    input.topic,
    input.text,
    input.context ? JSON.stringify(input.context) : null,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
    .toLowerCase();
}

function watcherMatches(watcher: AutomationWatcherRow, input: AutomationEventInput): boolean {
  const source = normalizeSource(input.source);
  if (watcher.source !== '*' && watcher.source !== source) {
    return false;
  }

  if (watcher.user_id && watcher.user_id !== (input.userId ?? null)) {
    return false;
  }

  const matchText = watcher.match_text.trim().toLowerCase();
  return matchText === '*' || eventSearchText(input).includes(matchText);
}

function renderPrompt(watcher: AutomationWatcherRow, input: AutomationEventInput, skill: UserSkillRow | null): string {
  const lines = [
    watcher.prompt_template.trim(),
    '',
    skill ? `Relevant skill: ${skill.name}\n${skill.content_markdown}` : null,
    skill ? '' : null,
    'Trigger context:',
    `- watcher: ${watcher.name}`,
    `- source: ${input.source}`,
  ];

  const topic = compactString(input.topic);
  const text = compactString(input.text);
  const eventId = compactString(input.eventId);

  if (topic) lines.push(`- topic: ${topic}`);
  if (text) lines.push(`- text: ${text}`);
  if (eventId) lines.push(`- event_id: ${eventId}`);
  if (input.context) lines.push(`- context: ${JSON.stringify(input.context)}`);

  return lines.filter((line): line is string => line !== null).join('\n');
}

export class AutomationWatcherService {
  private readonly supabaseClient: SupabaseLike;
  private readonly auditLogger: { flush: (...args: any[]) => Promise<void> };
  private readonly skillsService: {
    getSkillByName: (organizationId: string, userId: string, name: string) => Promise<UserSkillRow | null>;
  };
  private readonly now: () => Date;

  constructor(deps: AutomationWatcherDeps = {}) {
    this.supabaseClient = deps.supabaseClient ?? supabase;
    this.auditLogger = deps.auditLogger ?? AuditLogger;
    this.skillsService = deps.skillsService ?? userSkillsService;
    this.now = deps.now ?? (() => new Date());
  }

  async createWatcher(input: CreateAutomationWatcherInput): Promise<AutomationWatcherRow> {
    const payload = {
      organization_id: cleanRequiredText(input.organizationId, 'Organization id'),
      user_id: input.userId?.trim() || null,
      name: cleanRequiredText(input.name, 'Automation name'),
      source: normalizeSource(input.source),
      match_text: normalizeMatchText(input.matchText),
      prompt_template: cleanRequiredText(input.promptTemplate, 'Automation prompt'),
      skill_name: input.skillName?.trim() || null,
      is_active: true,
    };

    const { data, error } = await this.supabaseClient
      .from('automation_watchers')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to create automation watcher.');
    }

    return data as AutomationWatcherRow;
  }

  async listWatchers(organizationId: string, userId?: string | null): Promise<AutomationWatcherRow[]> {
    let query = this.supabaseClient
      .from('automation_watchers')
      .select('*')
      .eq('organization_id', cleanRequiredText(organizationId, 'Organization id'))
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (userId?.trim()) {
      query = query.or(`user_id.eq.${userId.trim()},user_id.is.null`);
    } else {
      query = query.is('user_id', null);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message ?? 'Failed to list automation watchers.');
    }

    return (data ?? []) as AutomationWatcherRow[];
  }

  async handleEvent(input: AutomationEventInput): Promise<AutomationTriggerResult> {
    const source = normalizeSource(input.source);
    const organizationId = cleanRequiredText(input.organizationId, 'Organization id');
    const normalizedInput = {
      ...input,
      organizationId,
      source,
      userId: input.userId?.trim() || null,
    };

    const { data, error } = await this.supabaseClient
      .from('automation_watchers')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (error) {
      throw new Error(error.message ?? 'Failed to load automation watchers.');
    }

    const watchers = ((data ?? []) as AutomationWatcherRow[]).filter((watcher) => watcherMatches(watcher, normalizedInput));
    const queuedTaskIds: string[] = [];

    for (const watcher of watchers) {
      const taskId = await this.dispatchWatcher(watcher, normalizedInput);
      queuedTaskIds.push(taskId);
    }

    return {
      matchedWatchers: watchers.length,
      queuedTaskIds,
    };
  }

  private async dispatchWatcher(watcher: AutomationWatcherRow, input: AutomationEventInput): Promise<string> {
    const skill = await this.loadWatcherSkill(watcher);
    const command = renderPrompt(watcher, input, skill);
    const nowIso = this.now().toISOString();

    const { data, error } = await this.supabaseClient
      .from('tasks')
      .insert({
        organization_id: watcher.organization_id,
        user_id: watcher.user_id ?? input.userId ?? null,
        domain_action: 'assistant.command',
        status: 'queued',
        topic: `Automation: ${watcher.name}`,
        payload: {
          command,
          command_text: command,
          message_text: command,
          confirmed: true,
          high_risk: true,
          automation: true,
          watcher_id: watcher.id,
          watcher_name: watcher.name,
          skill_name: watcher.skill_name,
          trigger_source: input.source,
          trigger_event_id: input.eventId ?? null,
          trigger_context: input.context ?? {},
        },
      })
      .select('id')
      .single();

    if (error || !data?.id) {
      throw new Error(error?.message ?? 'Failed to queue automation task.');
    }

    const taskId = String(data.id);

    await this.supabaseClient
      .from('automation_watchers')
      .update({ last_triggered_at: nowIso, updated_at: nowIso })
      .eq('id', watcher.id);

    await this.auditLogger.flush(
      watcher.organization_id,
      taskId,
      'agent-controller',
      'automation_watcher_triggered',
      [
        {
          timestamp: nowIso,
          step_name: 'Automation Trigger',
          message: `Queued automation watcher ${watcher.name}`,
          input_summary: `source=${input.source}; match=${watcher.match_text}`,
          output_summary: `task_id=${taskId}`,
        },
      ],
      [],
    );

    return taskId;
  }

  private async loadWatcherSkill(watcher: AutomationWatcherRow): Promise<UserSkillRow | null> {
    if (!watcher.skill_name || !watcher.user_id) {
      return null;
    }

    try {
      return await this.skillsService.getSkillByName(watcher.organization_id, watcher.user_id, watcher.skill_name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[AutomationWatcherService] Failed to load skill ${watcher.skill_name}: ${message}`);
      return null;
    }
  }
}

export const automationWatcherService = new AutomationWatcherService();
