import { supabase } from './supabase.js';

export interface UserSkillRow {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  description: string | null;
  content_markdown: string;
  tags: string[];
  triggers: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type UserSkillInsert = Omit<UserSkillRow, 'id' | 'created_at' | 'updated_at'>;

type UserSkillsDbClient = {
  from: (table: string) => any;
};

const userSkillsDb = supabase as unknown as UserSkillsDbClient;

export interface UserSkillUpsertInput {
  name: string;
  description?: string | null;
  content_markdown: string;
  tags?: string[];
  triggers?: string[];
  is_active?: boolean;
}

export interface FindRelevantSkillsInput {
  query: string;
  maxResults?: number;
}

function asTrimmed(value: string): string {
  return value.trim();
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeArray(values: string[] | undefined): string[] {
  if (!values || values.length === 0) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    ),
  );
}

function ensureScope(organizationId: string, userId: string): void {
  if (!organizationId || !userId) {
    throw new Error('organizationId and userId are required for user skills access.');
  }
}

function scoreSkill(skill: UserSkillRow, queryTokens: string[], queryLower: string): number {
  let score = 0;
  const nameLower = skill.name.toLowerCase();
  const descriptionLower = (skill.description ?? '').toLowerCase();
  const contentLower = skill.content_markdown.toLowerCase();
  const tagsLower = (skill.tags ?? []).map((tag) => tag.toLowerCase());
  const triggersLower = (skill.triggers ?? []).map((trigger) => trigger.toLowerCase());

  if (queryLower.length > 0 && nameLower.includes(queryLower)) {
    score += 10;
  }

  if (queryLower.length > 0 && tagsLower.some((tag) => tag.includes(queryLower))) {
    score += 8;
  }

  if (queryLower.length > 0 && triggersLower.some((trigger) => trigger.includes(queryLower))) {
    score += 8;
  }

  if (queryLower.length > 0 && descriptionLower.includes(queryLower)) {
    score += 5;
  }

  for (const token of queryTokens) {
    if (token.length < 2) {
      continue;
    }

    if (nameLower.includes(token)) {
      score += 3;
    }

    if (tagsLower.some((tag) => tag.includes(token))) {
      score += 3;
    }

    if (triggersLower.some((trigger) => trigger.includes(token))) {
      score += 3;
    }

    if (descriptionLower.includes(token)) {
      score += 2;
    }

    if (contentLower.includes(token)) {
      score += 1;
    }
  }

  return score;
}

export class UserSkillsService {
  async listSkills(organizationId: string, userId: string): Promise<UserSkillRow[]> {
    ensureScope(organizationId, userId);

    const { data, error } = await userSkillsDb
      .from('user_skills')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list user skills: ${error.message}`);
    }

    return (data ?? []) as UserSkillRow[];
  }

  async getSkillByName(
    organizationId: string,
    userId: string,
    name: string,
  ): Promise<UserSkillRow | null> {
    ensureScope(organizationId, userId);

    const normalizedName = normalizeName(name);
    if (!normalizedName) {
      return null;
    }

    const { data, error } = await userSkillsDb
      .from('user_skills')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .eq('name', normalizedName)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch user skill: ${error.message}`);
    }

    return (data as UserSkillRow | null) ?? null;
  }

  async upsertSkill(
    organizationId: string,
    userId: string,
    input: UserSkillUpsertInput,
  ): Promise<UserSkillRow> {
    ensureScope(organizationId, userId);

    const normalizedName = normalizeName(input.name);
    const content = asTrimmed(input.content_markdown ?? '');

    if (!normalizedName) {
      throw new Error('Skill name is required.');
    }

    if (!content) {
      throw new Error('Skill content_markdown is required.');
    }

    const payload: UserSkillInsert = {
      organization_id: organizationId,
      user_id: userId,
      name: normalizedName,
      description: input.description?.trim() || null,
      content_markdown: content,
      tags: normalizeArray(input.tags),
      triggers: normalizeArray(input.triggers),
      is_active: input.is_active ?? true,
    };

    const { data, error } = await userSkillsDb
      .from('user_skills')
      .upsert(payload, {
        onConflict: 'organization_id,user_id,name',
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to upsert user skill: ${error.message}`);
    }

    return data as UserSkillRow;
  }

  async deleteSkill(
    organizationId: string,
    userId: string,
    nameOrId: string,
  ): Promise<{ deleted: boolean }> {
    ensureScope(organizationId, userId);

    const lookup = nameOrId.trim();
    if (!lookup) {
      return { deleted: false };
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const query = userSkillsDb
      .from('user_skills')
      .delete()
      .eq('organization_id', organizationId)
      .eq('user_id', userId);

    if (uuidPattern.test(lookup)) {
      const { error, count } = await query
        .eq('id', lookup)
        .select('id', { count: 'exact', head: true });

      if (error) {
        throw new Error(`Failed to delete user skill: ${error.message}`);
      }

      return { deleted: Boolean(count && count > 0) };
    }

    const normalizedName = normalizeName(lookup);
    const { error, count } = await query
      .eq('name', normalizedName)
      .select('id', { count: 'exact', head: true });

    if (error) {
      throw new Error(`Failed to delete user skill: ${error.message}`);
    }

    return { deleted: Boolean(count && count > 0) };
  }

  async findRelevantSkills(
    organizationId: string,
    userId: string,
    input: FindRelevantSkillsInput,
  ): Promise<UserSkillRow[]> {
    ensureScope(organizationId, userId);

    const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 20);
    const queryLower = input.query.trim().toLowerCase();
    const queryTokens = queryLower
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);

    const allSkills = await this.listSkills(organizationId, userId);
    const activeSkills = allSkills.filter((skill) => skill.is_active);

    if (queryLower.length === 0) {
      return activeSkills.slice(0, maxResults);
    }

    const scored = activeSkills
      .map((skill) => ({
        skill,
        score: scoreSkill(skill, queryTokens, queryLower),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return b.skill.updated_at.localeCompare(a.skill.updated_at);
      })
      .slice(0, maxResults)
      .map((entry) => entry.skill);

    return scored;
  }
}

export const userSkillsService = new UserSkillsService();
