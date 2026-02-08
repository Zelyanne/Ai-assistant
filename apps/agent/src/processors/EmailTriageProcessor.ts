import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { Task } from '@ai-assistant/shared';
import { supabase } from "../services/supabase.js";
import { PerimeterGuard } from '../guards/PerimeterGuard.js';
import { mcpService } from '../services/mcp.js';
import { AGENT_PROMPTS } from '../prompts/agentPrompts.js';
import { tracingService } from '../services/llm/tracing.js';
import { z } from 'zod';

const TriageResultSchema = z.object({
  matches: z.array(z.object({
    topic: z.string(),
    reason: z.string(),
    priority_score: z.number().min(0).max(100)
  })),
  overall_priority_score: z.number().min(0).max(100),
  is_highlighted: z.boolean()
});

export class EmailTriageProcessor extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    console.log(`[EmailTriageProcessor][${task.id}] Processing email.triage (Agentic Parallel)...`);

    const { organization_id, user_id } = task;

    // 1. Fetch unclassified threads for this organization
    const { data: threads, error: threadError } = await supabase
      .from('ingested_threads')
      .select('id, subject, metadata, body, summary_json')
      .eq('organization_id', organization_id)
      .eq('classification', '{}') as { data: any[] | null, error: any };

    if (threadError) throw threadError;
    if (!threads || threads.length === 0) {
      return { message: "No unclassified threads found", processed_count: 0 };
    }

    // 2. Fetch watch topics
    let topicQuery = supabase
      .from('watch_topics')
      .select('topic, priority')
      .eq('organization_id', organization_id);

    if (user_id) {
      topicQuery = topicQuery.or(`user_id.eq.${user_id},user_id.is.null`);
    } else {
      topicQuery = topicQuery.is('user_id', null);
    }

    const { data: topics, error: topicError } = await topicQuery as { data: any[] | null, error: any };

    if (topicError) throw topicError;
    const effectiveTopics = (topics && topics.length > 0) 
      ? topics 
      : [{ topic: 'General', priority: 'Low' }];

    const guard = new PerimeterGuard();
    
    // Fetch and wrap tools ONCE for all threads
    const rawTools = await mcpService.getLangChainTools(organization_id);
    const securedTools = rawTools.map(t => PerimeterGuard.wrapToolWithSecurity(t, guard));

    // Create Agent instance ONCE to be reused
    const agent = this.createAgentInstance(AGENT_PROMPTS.EMAIL_TRIAGE, securedTools, 'single-turn');

    const langfuseHandler = tracingService.getHandler();
    const callbacks = langfuseHandler ? [langfuseHandler] : [];

    let processedCount = 0;

    // Parallelize processing
    const triagePromises = threads.map(async (thread) => {
      const extractSnippet = (t: any): string => {
        // Priority order: metadata.snippet > body (truncated) > summary_json.snippet > ''
        // Truncate body fallback to 1000 chars to avoid token overflow in triage prompt
        const bodyFallback = (t as any).body ? String((t as any).body).substring(0, 1000) : '';
        
        return (t.metadata as any)?.snippet 
          || bodyFallback
          || (t as any).summary_json?.snippet 
          || '';
      };

      const snippet = extractSnippet(thread);
      
      if (!snippet) {
        console.warn(`[EmailTriageProcessor] No snippet found for thread ${thread.id}. Fallbacks exhausted.`);
        try {
          await supabase.from('agent_activity_log').insert({
            organization_id,
            agent_id: 'email-triage',
            action_taken: 'snippet_extraction_failed',
            reasoning_trace: {
              thread_id: thread.id,
              available_metadata_keys: thread.metadata ? Object.keys(thread.metadata) : 'null',
              has_body: !!(thread as any).body,
              has_summary: !!(thread as any).summary_json
            }
          });
        } catch (logErr) {
          console.error('Failed to log snippet extraction failure:', logErr);
        }
      }
      
      const filteredSubject = guard.redactPII(thread.subject || '');
      const filteredSnippet = guard.redactPII(snippet);

      const input = `
        Analyze the following email thread against the user's watch topics.
        
        EMAIL SUBJECT: ${filteredSubject}
        EMAIL SNIPPET: ${filteredSnippet}
        
        WATCH TOPICS:
        ${effectiveTopics.map(t => `- ${t.topic} (Priority: ${t.priority})`).join('\n')}
        
        CRITICAL: Even if no watch topics match, you MUST evaluate if the email is actionable or important. 
        If it is an automated notification, newsletter, or spam, set a low priority_score.
        If it contains a direct request, deadline, or important information, set a higher priority_score (50+).
        
        RETURN JSON:
        {
          "matches": [{"topic": "...", "reason": "...", "priority_score": 0-100}],
          "overall_priority_score": 0-100,
          "is_highlighted": boolean
        }
      `;

      try {
        // Use agent.invoke directly for true parallel execution
        const result = await agent.invoke({
          messages: [{ role: 'user', content: input }],
        }, {
          callbacks,
          runName: `Triage Thread: ${thread.subject}`,
          metadata: {
            taskId: task.id,
            orgId: task.organization_id,
            threadId: thread.id,
            langfuseUserId: task.user_id,
          }
        });

        const outputText = String(result.messages?.at(-1)?.content || '');
        const cleanOutput = outputText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
        const classification = TriageResultSchema.parse(JSON.parse(cleanOutput));

        // Restore PII in reason strings
        classification.matches.forEach(m => {
          m.reason = guard.recoverPII(m.reason);
        });

        // 3. Update ingested_threads
        const { error: updateError } = await supabase
          .from('ingested_threads')
          .update({
            classification,
            priority_score: classification.overall_priority_score,
            is_highlighted: classification.is_highlighted,
            updated_at: new Date().toISOString()
          })
          .eq('id', thread.id);

        if (updateError) throw updateError;

        // 4. Trigger summarization for threads with matching topics or high priority
        const hasMatches = classification.matches.length > 0;
        const isHighPriority = classification.overall_priority_score >= 50;
        
        if (hasMatches || isHighPriority) {
          const { error: taskError } = await supabase.from('tasks').insert({
            organization_id,
            user_id,
            domain_action: 'email.summarize',
            status: 'queued',
            payload: { thread_id: thread.id },
            topic: hasMatches ? classification.matches[0].topic : undefined
          });

          if (taskError) {
            console.error(`Failed to create summarize task for thread ${thread.id}:`, taskError);
          } else {
            console.log(`[EmailTriageProcessor] Queued email.summarize for thread ${thread.id} (priority: ${classification.overall_priority_score}, matches: ${classification.matches.length})`);
          }
        }

        // 5. Detailed logging per thread to Supabase
        await supabase.from('agent_activity_log').insert({
          organization_id,
          task_id: task.id,
          agent_id: task.user_id || 'system',
          action_taken: `Triaged thread: ${thread.subject}`,
          reasoning_trace: {
            thread_id: thread.id,
            classification,
            pii_redacted: true,
            agent_output: outputText.substring(0, 500),
            summarize_triggered: hasMatches || isHighPriority
          }
        } as any);

        processedCount++;
      } catch (err) {
        console.error(`Failed to triage thread ${thread.id}:`, err);
      }
    });

    await Promise.all(triagePromises);
    await tracingService.flush();

    return {
      message: `Successfully triaged ${processedCount} threads with parallel agentic reasoning`,
      processed_count: processedCount,
      task_id: task.id
    };
  }
}
