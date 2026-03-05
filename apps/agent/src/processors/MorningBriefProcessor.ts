import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { Task, MorningBriefSchema } from '@ai-assistant/shared';
import { supabase } from "../services/supabase.js";
import { PerimeterGuard } from '../guards/PerimeterGuard.js';
import { mcpService } from '../services/mcp.js';
import { AGENT_PROMPTS } from '../prompts/agentPrompts.js';
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

    // 2. Fetch threads with summaries updated after the last brief
    this.addTraceStep('Data Ingestion', 'Fetching new triaged threads since last brief');
    const sinceTime = lastGeneratedAt || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    let { data: threads, error: threadError } = await supabase
      .from('ingested_threads')
      .select('id, subject, summary_json, classification, priority_score, external_id')
      .eq('organization_id', organization_id)
      .not('summary_json', 'is', null)
      .gt('updated_at', sinceTime)
      .order('priority_score', { ascending: false })
      .limit(20) as { data: any[] | null, error: any };

    if (threadError) throw threadError;
    
    let activeThreads = threads || [];
    
    // Check if we have new threads. If not, and not forced, skip.
    if (activeThreads.length === 0) {
      if (!task.payload?.force) {
        console.log(`[MorningBriefProcessor][${task.id}] No new summarized threads since ${sinceTime}. Skipping.`);
        return { 
          message: "No new relevant updates found since your last brief.", 
          success: true,
          brief_generated: false 
        };
      }
      
      // If forced, fetch last 24h as fallback
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: fallbackThreads } = await supabase
        .from('ingested_threads')
        .select('id, subject, summary_json, classification, priority_score, external_id')
        .eq('organization_id', organization_id)
        .not('summary_json', 'is', null)
        .gte('updated_at', twentyFourHoursAgo)
        .order('priority_score', { ascending: false })
        .limit(20) as { data: any[] | null, error: any };
      
      if (!fallbackThreads || fallbackThreads.length === 0) {
        return { message: "No summarized threads found in last 24 hours", success: false, brief_generated: false };
      }
      activeThreads = fallbackThreads;
    }

    this.addTraceStep('Data Filter', `Found ${activeThreads.length} threads with summaries`);

    const guard = new PerimeterGuard();

    // 2. Prepare thread summaries with PII redaction
    this.addTraceStep('Perimeter Check', 'Applying PII redaction to thread summaries');
    
    const threadSummaries = activeThreads.map(t => {
      const matches = t.classification?.matches || [];
      const topics = matches.map((m: any) => m.topic);
      
      return {
        id: t.id,
        subject: guard.redactPII(t.subject || ''),
        summary: guard.redactPII(t.summary_json?.context || ''),
        decisions: (t.summary_json?.decisions || []).map((d: string) => guard.redactPII(d)),
        action_items: (t.summary_json?.action_items || []).map((a: string) => guard.redactPII(a)),
        topics: topics,
        priority_score: t.priority_score || 0,
        external_id: t.external_id
      };
    });

    // 3. Group by topics for deep dives
    const topicGroups: Record<string, any[]> = {};
    threadSummaries.forEach(t => {
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

    const validSourceIdSet = new Set<string>(threadSummaries.map((t) => t.id));

    const briefInput = `
        EXECUTIVE BRIEFING REQUEST
        
        Total items triaged: ${threadSummaries.length}
        
        DATA FOR NARRATIVE RUNDOWN:
        ${threadSummaries.map((t, i) => `
          SOURCE_ID: ${t.id}
          Subject: "${t.subject}"
          Priority: ${t.priority_score}/100
          Context: ${t.summary}
          Action Items FOUND: ${t.action_items.join('; ') || 'NONE'}
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
        for (const t of threadSummaries) {
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

        // 7. Log activity with reasoning trace and citations
        await supabase.from('agent_activity_log').insert({
          organization_id,
          task_id: task.id,
          agent_id: user_id,
          action_taken: `Generated morning brief with ${activeThreads.length} threads`,
          reasoning_trace: this.getTrace(),
          citations: activeThreads.slice(0, 5).map(t => ({
            source_type: 'email',
            source_id: t.external_id,
            link: `https://mail.google.com/mail/u/0/#all/${t.external_id}`,
            description: `Source thread: ${t.subject}`
          }))
        } as any);

        return {
          message: `Successfully generated morning brief with ${activeThreads.length} threads`,
          brief_id: savedBrief.id,
          thread_count: activeThreads.length,
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
