import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { Task, MorningBriefSchema } from '@ai-assistant/shared';
import { supabase } from "../services/supabase.js";
import { PerimeterGuard } from '../guards/PerimeterGuard.js';
import { mcpService } from '../services/mcp.js';
import { AGENT_PROMPTS } from '../prompts/agentPrompts.js';
import { z } from 'zod';

/**
 * Schema for LLM-generated morning brief sections
 */
const BriefSectionsSchema = z.object({
  narrative_overview: z.string().describe('Conversational executive summary. Mention all items here. Items WITHOUT actionable items should be summarized here with their [SOURCE_ID] but NOT included in the actionable_cards.'),
  actionable_items: z.array(z.object({
    source_id: z.string(),
    title: z.string(),
    action_required: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
    topic: z.string()
  })).describe('Strictly only items that require a specific action from the CEO.'),
  topic_summaries: z.array(z.object({
    topic: z.string(),
    narrative: z.string().describe('Conversational summary of this topic. Mention all related items.')
  }))
});

const MORNING_BRIEF_PROMPT = `You are an elite Executive Assistant preparing a verbal Morning Brief.

GOAL: Filter the noise. Only highlight specific actionable cards for things I actually need to DO. Everything else goes into the narrative rundown.

STYLE:
- Narrative: "Good morning. I've handled the triage. You have 3 items requiring your input (highlighted below). Aside from that, [Item A] was received and I've noted it... [Item B] is also on track..."
- Use [SOURCE_ID] to link narrative text to original data.

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

      const briefInput = `
        EXECUTIVE BRIEFING REQUEST
        
        Total items triaged: ${threadSummaries.length}
        
        DATA FOR NARRATIVE RUNDOWN:
        ${threadSummaries.map((t, i) => `
          [ID: ${t.id}] "${t.subject}"
          Priority: ${t.priority_score}/100
          Context: ${t.summary}
          Action Items FOUND: ${t.action_items.join('; ') || 'NONE'}
          Topics: ${t.topics.join(', ') || 'General'}
        `).join('\n---\n')}
        
        INSTRUCTIONS:
        1. Write a conversational "Executive Rundown" covering ALL items.
        2. IF an item has a clear, high-priority Action Item (something I MUST do), create an entry in 'actionable_items'.
        3. IF an item is just for info (no Action Items found), mention it in the Rundown narrative with its [ID] but DO NOT create an actionable_item card for it.
        4. Group narrative summaries by watch topic in 'topic_summaries'.
        5. CRITICAL: For 'priority' field in actionable_items, you MUST map the numeric score to one of: "high" (>80), "medium" (50-80), or "low" (<50). Do NOT return numbers.
      `;

    try {
      const result = await agent.invoke({
        messages: [{ role: 'user', content: briefInput }],
      });

      const outputText = String(result.messages?.at(-1)?.content || '');
      const cleanOutput = outputText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
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

      // 6. Save to morning_briefs
      const generationTime = new Date().toISOString();
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
          actionable_items: briefSections.actionable_items
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

    } catch (err: any) {
      this.addTraceStep('Agent Error', `Failed to generate brief: ${err.message}`);
      throw err;
    }
  }
}
