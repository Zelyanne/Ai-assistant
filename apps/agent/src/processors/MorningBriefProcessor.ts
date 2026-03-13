import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { Task } from '@ai-assistant/shared';
import { supabase } from "../services/supabase.js";
import { PerimeterGuard } from '../guards/PerimeterGuard.js';
import { mcpService } from '../services/mcp.js';
import { AuditLogger } from '../services/AuditLogger.js';
import { z } from 'zod';

const UUID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function containsSourceIdLeak(text: string): boolean {
  if (!text) return false;
  if (UUID_REGEX.test(text)) {
    UUID_REGEX.lastIndex = 0;
    return true;
  }
  UUID_REGEX.lastIndex = 0;
  return /\bSOURCE_ID\s*:/i.test(text) || /\[\s*ID\s*:/i.test(text) || /\[\s*SOURCE_ID\s*:/i.test(text);
}

function stripSourceIdsFromProse(text: string): string {
  const normalized = String(text || '');
  const withoutWrappers = normalized
    .replace(/\[\s*ID\s*:\s*/gi, '[')
    .replace(/\[\s*SOURCE_ID\s*:\s*/gi, '[')
    .replace(/SOURCE_ID\s*:\s*/gi, '')
    .replace(/\[\s*ID\s*\]/gi, '')
    .replace(/\[\s*\]/g, '');

  const withoutUuids = withoutWrappers.replace(UUID_REGEX, '');
  UUID_REGEX.lastIndex = 0;

  return withoutUuids
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

/**
 * Schema for LLM-generated morning brief sections
 */
const BriefSectionsSchema = z.object({
  narrative_overview: z.string().describe('Executive narrative overview in readable prose. Mention all items here, but DO NOT include any source IDs/UUIDs in the narrative.'),
  actionable_items: z.array(z.object({
    source_id: z.string(),
    title: z.string(),
    action_required: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
    topic: z.string()
  })).describe('Strictly only items that require a specific action from the CEO.'),
  topic_summaries: z.array(z.object({
    topic: z.string(),
    narrative: z.string().describe('Conversational summary of this topic. Mention all related items, but DO NOT include any source IDs/UUIDs.')
  }))
});

const MORNING_BRIEF_PROMPT = `You are an elite Executive Assistant preparing a verbal Morning Brief.

GOAL: Filter the noise. Only highlight specific actionable cards for things I actually need to DO. Everything else goes into the narrative rundown.

STYLE:
- Narrative should be readable and easy to scan.
- Start with a 1-2 sentence BLUF.
- Then insert ONE blank line.
- Then write short paragraphs (2-3 sentences each).
- NEVER include source IDs / UUIDs / bracketed IDs in the narrative or topic summaries.
- Source IDs must ONLY appear in structured fields (e.g., actionable_items[].source_id). Do not echo IDs in prose.

STRUCTURE:
{
  "narrative_overview": "...",
  "actionable_items": [{"source_id": "...", "title": "...", "action_required": "...", "priority": "...", "topic": "..."}],
  "topic_summaries": [{"topic": "...", "narrative": "..."}]
}`;

interface BriefSource {
  id: string;
  sourceType: 'email' | 'relancing_update';
  subject: string;
  summary: string;
  actionItems: string[];
  topics: string[];
  priorityScore: number;
  externalId?: string;
  link?: string;
}

/**
 * Processor for generating an executive Morning Brief from triaged thread summaries.
 * Aggregates recent thread summaries into a synthesized briefing document.
 * Uses Langchain agent for automatic Langsmith tracing.
 */
export class MorningBriefProcessor extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    this.clearTrace();
    const { organization_id } = task;
    const user_id = task.user_id || 'system';

    console.log(`[MorningBriefProcessor][${task.id}] Generating morning brief...`);

    // 1. Fetch user profile to check last generation time
    let lastGeneratedAt: string | null = null;
    if (user_id !== 'system') {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('last_brief_generated_at')
        .eq('id', user_id)
        .eq('organization_id', organization_id)
        .single();
      
      if (profileError) {
        console.warn(`[MorningBriefProcessor] Could not fetch profile for user ${user_id}:`, profileError.message);
      }
      lastGeneratedAt = profile?.last_brief_generated_at || null;
    }

    // 2. Fetch threads and relancing updates updated after the last brief
    this.addTraceStep('Data Ingestion', 'Fetching new triaged threads and relancing updates since last brief');
    const sinceTime = lastGeneratedAt || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const fetchSourcesSince = async (lowerBound: string): Promise<{ threads: any[]; relancingUpdates: any[] }> => {
      const [{ data: threads, error: threadError }, { data: relancingUpdates, error: relancingError }] = await Promise.all([
        supabase
          .from('ingested_threads')
          .select('id, subject, summary_json, classification, priority_score, external_id')
          .eq('organization_id', organization_id)
          .not('summary_json', 'is', null)
          .gt('updated_at', lowerBound)
          .order('priority_score', { ascending: false })
          .limit(20),
        supabase
          .from('relancing_updates')
          .select('id, message_text, progress_summary, blocker_summary, dependency, requested_help, eta_hint, intents, created_at, project_scheduling_contexts(project_name), project_member_assignments(member_name)')
          .eq('organization_id', organization_id)
          .gt('created_at', lowerBound)
          .order('created_at', { ascending: false })
          .limit(20),
      ]) as [{ data: any[] | null; error: any }, { data: any[] | null; error: any }];

      if (threadError) throw threadError;
      if (relancingError) throw relancingError;

      return {
        threads: threads || [],
        relancingUpdates: relancingUpdates || [],
      };
    };

    let { threads: activeThreads, relancingUpdates: activeRelancingUpdates } = await fetchSourcesSince(sinceTime);

    // Check if we have new sources. If not, and not forced, skip.
    if (activeThreads.length === 0 && activeRelancingUpdates.length === 0) {
      if (!task.payload?.force) {
        console.log(`[MorningBriefProcessor][${task.id}] No new summarized threads or relancing updates since ${sinceTime}. Skipping.`);
        return {
          message: 'No new relevant updates found since your last brief.',
          success: true,
          brief_generated: false,
        };
      }

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      ({ threads: activeThreads, relancingUpdates: activeRelancingUpdates } = await fetchSourcesSince(twentyFourHoursAgo));

      if (activeThreads.length === 0 && activeRelancingUpdates.length === 0) {
        return { message: 'No summarized threads or relancing updates found in last 24 hours', success: false, brief_generated: false };
      }
    }

    this.addTraceStep('Data Filter', `Found ${activeThreads.length} threads and ${activeRelancingUpdates.length} relancing updates`);

    const guard = new PerimeterGuard();

    // 3. Prepare sources with PII redaction
    this.addTraceStep('Perimeter Check', 'Applying PII redaction to thread summaries and relancing updates');

    const threadSources: BriefSource[] = activeThreads.map(t => {
      const matches = t.classification?.matches || [];
      const topics = matches.map((m: any) => m.topic);

      return {
        id: t.id,
        sourceType: 'email',
        subject: guard.redactPII(t.subject || 'Incoming communication'),
        summary: guard.redactPII(t.summary_json?.context || ''),
        actionItems: (t.summary_json?.action_items || []).map((a: string) => guard.redactPII(a)),
        topics,
        priorityScore: t.priority_score || 0,
        externalId: t.external_id,
        link: t.external_id ? `https://mail.google.com/mail/u/0/#all/${t.external_id}` : undefined,
      };
    });

    const relancingSources: BriefSource[] = activeRelancingUpdates.map((update) => {
      const projectRelation = Array.isArray(update.project_scheduling_contexts)
        ? update.project_scheduling_contexts[0]
        : update.project_scheduling_contexts;
      const memberRelation = Array.isArray(update.project_member_assignments)
        ? update.project_member_assignments[0]
        : update.project_member_assignments;
      const projectName = guard.redactPII(projectRelation?.project_name || 'Unnamed project');
      const memberName = guard.redactPII(memberRelation?.member_name || 'Team member');
      const intents = Array.isArray(update.intents) ? update.intents : [];
      const actionItems = [
        typeof update.requested_help === 'string' ? update.requested_help : null,
        typeof update.dependency === 'string' ? `Dependency: ${update.dependency}` : null,
        typeof update.eta_hint === 'string' ? `ETA: ${update.eta_hint}` : null,
        typeof update.blocker_summary === 'string' && intents.includes('blocker_report') ? `Blocker: ${update.blocker_summary}` : null,
      ]
        .filter((value): value is string => Boolean(value))
        .map((item) => guard.redactPII(item));
      const summaryParts = [
        typeof update.progress_summary === 'string' ? update.progress_summary : null,
        typeof update.blocker_summary === 'string' ? `Blocker: ${update.blocker_summary}` : null,
        typeof update.dependency === 'string' ? `Dependency: ${update.dependency}` : null,
        typeof update.eta_hint === 'string' ? `ETA: ${update.eta_hint}` : null,
        typeof update.message_text === 'string' ? update.message_text : null,
      ].filter((value): value is string => Boolean(value));
      const topics = ['Relancing'];
      if (intents.includes('blocker_report')) topics.push('Blocker');
      if (intents.includes('status_update')) topics.push('Status update');

      return {
        id: update.id,
        sourceType: 'relancing_update',
        subject: `${memberName} on ${projectName}`,
        summary: guard.redactPII(summaryParts[0] || 'Relancing update received.'),
        actionItems,
        topics,
        priorityScore: intents.includes('blocker_report') ? 95 : 60,
      };
    });

    const briefSources = [...threadSources, ...relancingSources]
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 20);

    // 4. Group by topics for deep dives
    const topicGroups: Record<string, any[]> = {};
    briefSources.forEach(t => {
      if (t.topics.length === 0) {
        topicGroups['General'] = topicGroups['General'] || [];
        topicGroups['General'].push(t);
      } else {
        t.topics.forEach((topic: string) => {
          topicGroups[topic] = topicGroups[topic] || [];
          topicGroups[topic].push(t);
        });
      }
    });

    // 4. Generate executive brief using Langchain agent (traces to Langsmith)
    this.addTraceStep('LLM Synthesis', 'Generating conversational executive brief via Langchain agent');
    
    // Fetch and wrap tools for the agent (even if we don't use them, needed for agent initialization)
    const rawTools = await mcpService.getLangChainTools(organization_id);
    const securedTools = rawTools.map(t => PerimeterGuard.wrapToolWithSecurity(t, guard));

    // Create agent with morning brief prompt
    const agent = this.createAgentInstance(MORNING_BRIEF_PROMPT, securedTools, 'single-turn');

    const validSourceIdSet = new Set<string>(briefSources.map((t) => t.id));

    const briefInput = `
        EXECUTIVE BRIEFING REQUEST
        
        Total items triaged: ${briefSources.length}
        
        DATA FOR NARRATIVE RUNDOWN:
        ${briefSources.map((t) => `
          SOURCE_ID: ${t.id}
          Source Type: ${t.sourceType}
          Subject: "${t.subject}"
          Priority: ${t.priorityScore}/100
          Context: ${t.summary}
          Action Items FOUND: ${t.actionItems.join('; ') || 'NONE'}
          Topics: ${t.topics.join(', ') || 'General'}
        `).join('\n---\n')}
        
        INSTRUCTIONS:
        1. Write an "Executive Rundown" covering ALL items in readable prose.
        2. Your narrative_overview MUST follow: 1-2 sentence BLUF, blank line, then short paragraphs (2-3 sentences each).
        3. CRITICAL: Do NOT include SOURCE_ID/UUIDs anywhere in narrative_overview or topic_summaries.
        4. IF an item has a clear, high-priority Action Item (something I MUST do), create an entry in 'actionable_items' and set actionable_items[].source_id to the SOURCE_ID provided.
        5. IF an item is just informational (no action required), mention it by subject/details in the narrative_overview, but do NOT create an actionable_item card.
        6. Group narrative summaries by watch topic in 'topic_summaries' (no IDs in prose).
        7. CRITICAL: For 'priority' field in actionable_items, you MUST map the numeric score to one of: "high" (>80), "medium" (50-80), or "low" (<50). Do NOT return numbers.
      `;

    try {
      const result = await agent.invoke({
        messages: [{ role: 'user', content: briefInput }],
      });

      const outputText = String(result.messages?.at(-1)?.content || '');
      console.log(`[MorningBriefProcessor] Model raw output: ${outputText.substring(0, 1000)}`);
      
      if (outputText.startsWith('Model call limits exceeded')) {
        throw new Error(`Agent failed: ${outputText}`);
      }

      const cleanOutput = outputText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      
      try {
        const briefSections = BriefSectionsSchema.parse(JSON.parse(cleanOutput));
        
        // 5. Recover PII
        briefSections.narrative_overview = guard.recoverPII(briefSections.narrative_overview);
        briefSections.actionable_items = briefSections.actionable_items.map(item => ({
          ...item,
          title: guard.recoverPII(item.title),
          action_required: guard.recoverPII(item.action_required)
        }));
        briefSections.topic_summaries = briefSections.topic_summaries.map(s => ({
          ...s,
          narrative: guard.recoverPII(s.narrative)
        }));

        // 5b. Enforce: no source IDs in prose (backend boundary)
        if (containsSourceIdLeak(briefSections.narrative_overview)) {
          this.addTraceStep('Output Cleanup', 'Source ID leak detected in narrative_overview; stripping IDs from prose');
          briefSections.narrative_overview = stripSourceIdsFromProse(briefSections.narrative_overview);
        }

        briefSections.topic_summaries = briefSections.topic_summaries.map(s => {
          if (containsSourceIdLeak(s.narrative)) {
            this.addTraceStep('Output Cleanup', `Source ID leak detected in topic summary for "${s.topic}"; stripping IDs from prose`);
            return { ...s, narrative: stripSourceIdsFromProse(s.narrative) };
          }
          return s;
        });

        // 5c. Validate actionable items reference known source IDs
        const beforeCount = briefSections.actionable_items.length;
        briefSections.actionable_items = briefSections.actionable_items.filter((item) => validSourceIdSet.has(item.source_id));
        const dropped = beforeCount - briefSections.actionable_items.length;
        if (dropped > 0) {
          this.addTraceStep('Output Cleanup', `Dropped ${dropped} actionable_items with unknown source_id`);
        }

        // 6. Save to morning_briefs
        const generationTime = new Date().toISOString();
        const sourceIds: string[] = [];
        const seenSourceIds = new Set<string>();
        for (const t of briefSources) {
          if (!seenSourceIds.has(t.id)) {
            seenSourceIds.add(t.id);
            sourceIds.push(t.id);
          }
        }

         const briefData = {
           organization_id,
           user_id,
           generated_at: generationTime,
           summary_text: briefSections.narrative_overview,
           blockers: briefSections.actionable_items.filter(i => i.priority === 'high').map(i => i.action_required),
           risks: briefSections.actionable_items.filter(i => i.priority === 'medium').map(i => i.action_required),
           topic_deep_dives: briefSections.topic_summaries.map(d => ({
             topic: d.topic,
             count: briefSections.actionable_items.filter(i => i.topic === d.topic).length,
             summaries: [d.narrative]
           })),
           metadata: {
            actionable_items: briefSections.actionable_items,
            source_ids: sourceIds
           },
           is_read: false
         };

        const { data: savedBrief, error: saveError } = await supabase
          .from('morning_briefs')
          .insert(briefData)
          .select()
          .single();

        if (saveError) throw saveError;

        // Update profile with last generation time
        if (user_id !== 'system') {
          await supabase
            .from('profiles')
            .update({ last_brief_generated_at: generationTime })
            .eq('id', user_id)
            .eq('organization_id', organization_id);
        }

        // 7. Log activity with reasoning trace and citations via standardized AuditLogger
        await AuditLogger.flush(
          organization_id,
          task.id || null,
          user_id,
          `Generated morning brief with ${briefSources.length} sources`,
          this.getTrace(),
          briefSources.slice(0, 5).map(source => ({
            source_type: source.sourceType,
            source_id: source.externalId || source.id,
            link: source.link || '',
            description: source.sourceType === 'email'
              ? `Source thread: ${source.subject}`
              : `Relancing update: ${source.subject}`,
          }))
        );

        return {
          message: `Successfully generated morning brief with ${briefSources.length} sources`,
          brief_id: savedBrief.id,
          thread_count: activeThreads.length,
          relancing_update_count: activeRelancingUpdates.length,
          topic_count: Object.keys(topicGroups).length,
          brief: briefSections
        };
      } catch (parseErr: any) {
        console.error(`[MorningBriefProcessor] Failed to parse model output: ${parseErr.message}`);
        console.error(`[MorningBriefProcessor] Cleaned output was: ${cleanOutput}`);
        throw parseErr;
      }

    } catch (err: any) {
      this.addTraceStep('Agent Error', `Failed to generate brief: ${err.message}`);
      throw err;
    }
  }
}
