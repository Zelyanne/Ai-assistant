import { supabase } from './supabase.js';

export type WatchTopicPriority = 'High' | 'Medium' | 'Low';

export interface WatchTopicRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  topic: string;
  priority: WatchTopicPriority;
  keywords_array: string[];
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface WatchTopicInput {
  organizationId: string;
  userId?: string | null;
  topic: string;
  priority?: WatchTopicPriority;
  keywords?: string[];
  expiresAt?: string | null;
  durationDays?: number | null;
}

export interface WatchTopicResult {
  outcome: 'created' | 'updated' | 'reused';
  topic: WatchTopicRow;
  confirmation_message: string;
}

type WatchTopicTable = {
  select: (columns?: string) => WatchTopicQuery;
  insert: (values: WatchTopicInsert) => WatchTopicMutation;
  update: (values: WatchTopicUpdate) => WatchTopicMutation;
};

type WatchTopicQuery = {
  eq: (column: string, value: string) => WatchTopicQuery;
  or: (filters: string) => WatchTopicQuery;
  is: (column: string, value: null) => WatchTopicQuery;
  order: (column: string, options?: { ascending?: boolean }) => WatchTopicQuery;
  then: (resolve: (value: { data: WatchTopicRow[] | null; error: { message?: string } | null }) => unknown) => Promise<unknown>;
};

type WatchTopicMutation = {
  eq: (column: string, value: string) => WatchTopicMutation;
  select: (columns?: string) => WatchTopicMutation;
  single: () => Promise<{ data: WatchTopicRow | null; error: { message?: string } | null }>;
};

type WatchTopicInsert = {
  organization_id: string;
  user_id?: string | null;
  topic: string;
  priority: WatchTopicPriority;
  keywords_array: string[];
  expires_at?: string | null;
};

type WatchTopicUpdate = Partial<Pick<WatchTopicInsert, 'topic' | 'priority' | 'keywords_array' | 'expires_at'>> & {
  updated_at: string;
};

function table(): WatchTopicTable {
  return supabase.from('watch_topics') as unknown as WatchTopicTable;
}

function normalizeTopic(topic: string): string {
  return topic.trim().replace(/\s+/g, ' ').toLowerCase();
}

function topicTokens(topic: string): Set<string> {
  return new Set(normalizeTopic(topic).split(/\s+/).filter((token) => token.length > 2));
}

function isSimilarTopic(left: string, right: string): boolean {
  const normalizedLeft = normalizeTopic(left);
  const normalizedRight = normalizeTopic(right);
  if (normalizedLeft === normalizedRight) {
    return true;
  }

  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return true;
  }

  const leftTokens = topicTokens(left);
  const rightTokens = topicTokens(right);
  return Array.from(leftTokens).some((token) => rightTokens.has(token));
}

function normalizeKeywords(keywords: string[] | undefined, topic: string): string[] {
  const values = keywords && keywords.length > 0 ? keywords : [topic];
  return Array.from(
    new Set(
      values
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword.length > 0),
    ),
  );
}

function normalizeExpiresAt(value: string | null | undefined): string | null | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (value === null || value.trim().length === 0) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid watch topic expires_at: expected an ISO-8601 datetime.');
  }

  return date.toISOString();
}

function computeExpiresAt(input: WatchTopicInput): string | null | undefined {
  const explicitExpiresAt = normalizeExpiresAt(input.expiresAt);
  if (typeof explicitExpiresAt !== 'undefined') {
    return explicitExpiresAt;
  }

  if (input.durationDays === null || typeof input.durationDays === 'undefined') {
    return undefined;
  }

  if (!Number.isInteger(input.durationDays) || input.durationDays <= 0 || input.durationDays > 366) {
    throw new Error('Invalid watch topic duration_days: expected 1-366 whole days.');
  }

  return new Date(Date.now() + input.durationDays * 24 * 60 * 60 * 1000).toISOString();
}

function normalizedKeywordKey(keywords: string[]): string {
  return keywords.map(normalizeTopic).sort().join('\u0000');
}

function assertTopic(topic: string): string {
  const normalized = topic.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    throw new Error('Watch topic cannot be empty.');
  }
  return normalized;
}

function normalizeScopeUserId(userId: string | null | undefined): string | null {
  const normalized = userId?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function assertSafePostgrestFilterValue(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Invalid watch topic user scope.');
  }

  return value;
}

function confirmation(outcome: WatchTopicResult['outcome'], topic: WatchTopicRow): string {
  const verb = outcome === 'created' ? 'created' : outcome === 'updated' ? 'updated' : 'already watching';
  const expiry = topic.expires_at ? ` until ${topic.expires_at}` : '';
  return `Watch topic ${verb}: ${topic.topic} (${topic.priority} priority${expiry}).`;
}

export class WatchTopicService {
  async listTopics(organizationId: string, userId?: string | null): Promise<WatchTopicRow[]> {
    let query = table()
      .select('id, organization_id, user_id, topic, priority, keywords_array, expires_at, created_at, updated_at')
      .eq('organization_id', organizationId)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false });

    if (userId && userId.trim().length > 0) {
      query = query.or(`user_id.eq.${assertSafePostgrestFilterValue(userId.trim())},user_id.is.null`);
    } else {
      query = query.is('user_id', null);
    }

    const { data, error } = await query as { data: WatchTopicRow[] | null; error: { message?: string } | null };
    if (error) {
      throw new Error(error.message ?? 'Failed to list watch topics.');
    }

    return data ?? [];
  }

  async upsertTopic(input: WatchTopicInput): Promise<WatchTopicResult> {
    const topic = assertTopic(input.topic);
    const scopedUserId = normalizeScopeUserId(input.userId);
    const existing = await this.findDuplicate(input.organizationId, scopedUserId, topic);
    const priority = input.priority ?? existing?.priority ?? 'Medium';
    const keywords = normalizeKeywords(input.keywords, topic);
    const expiresAtPatch = computeExpiresAt(input);
    const expiresAt = typeof expiresAtPatch === 'undefined' ? existing?.expires_at ?? null : expiresAtPatch;

    if (existing) {
      const shouldUpdate = normalizeTopic(existing.topic) !== normalizeTopic(topic)
        || existing.priority !== priority
        || normalizedKeywordKey(keywords) !== normalizedKeywordKey(existing.keywords_array)
        || existing.expires_at !== expiresAt;

      if (!shouldUpdate) {
        return {
          outcome: 'reused',
          topic: existing,
          confirmation_message: confirmation('reused', existing),
        };
      }

      const { data, error } = await table()
        .update({
          topic,
          priority,
          keywords_array: keywords,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('id, organization_id, user_id, topic, priority, keywords_array, expires_at, created_at, updated_at')
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? 'Failed to update watch topic.');
      }

      return {
        outcome: 'updated',
        topic: data,
        confirmation_message: confirmation('updated', data),
      };
    }

    const { data, error } = await table()
      .insert({
        organization_id: input.organizationId,
        user_id: scopedUserId,
        topic,
        priority,
        keywords_array: keywords,
        expires_at: expiresAt,
      })
      .select('id, organization_id, user_id, topic, priority, keywords_array, expires_at, created_at, updated_at')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to create watch topic.');
    }

    return {
      outcome: 'created',
      topic: data,
      confirmation_message: confirmation('created', data),
    };
  }

  async updateTopic(input: WatchTopicInput): Promise<WatchTopicResult> {
    return this.upsertTopic(input);
  }

  async createTopic(input: WatchTopicInput): Promise<WatchTopicResult> {
    return this.upsertTopic(input);
  }

  private async findDuplicate(
    organizationId: string,
    userId: string | null,
    topic: string,
  ): Promise<WatchTopicRow | null> {
    const rows = await this.listTopics(organizationId, userId);
    const normalized = normalizeTopic(topic);
    const scopedRows = rows.filter((row) => row.user_id === userId);
    const exact = scopedRows.find((row) => normalizeTopic(row.topic) === normalized);
    if (exact) {
      return exact;
    }

    const similar = scopedRows.filter((row) => isSimilarTopic(row.topic, topic));
    if (similar.length > 1) {
      throw new Error(`Multiple similar watch topics already exist: ${similar.map((row) => row.topic).join(', ')}. Please choose which one to update.`);
    }

    return similar[0] ?? null;
  }
}

export const watchTopicService = new WatchTopicService();
