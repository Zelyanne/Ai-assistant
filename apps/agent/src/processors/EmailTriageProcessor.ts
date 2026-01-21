import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { Task } from '@ai-assistant/shared';
import { supabase } from "../services/supabase.js";
import { LLMProviderFactory } from '../services/llm/factory.js';
import { PerimeterGuard } from '../guards/PerimeterGuard.js';
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
    console.log(`[EmailTriageProcessor][${task.id}] Processing email.triage...`);

    const { organization_id, user_id } = task;

    // 1. Fetch unclassified threads for this organization
    const { data: threads, error: threadError } = await supabase
      .from('ingested_threads')
      .select('id, subject, metadata')
      .eq('organization_id', organization_id)
      .eq('classification', '{}') as { data: any[] | null, error: any };

    if (threadError) throw threadError;
    if (!threads || threads.length === 0) {
      return { message: "No unclassified threads found", processed_count: 0 };
    }

    // 2. Fetch watch topics - Prioritize user-specific topics, fallback to organization
    const topicQuery = supabase
      .from('watch_topics')
      .select('topic, priority')
      .eq('organization_id', organization_id);

    if (user_id) {
      topicQuery.eq('user_id', user_id);
    }

    const { data: topics, error: topicError } = await topicQuery as { data: any[] | null, error: any };

    if (topicError) throw topicError;
    if (!topics || topics.length === 0) {
      return { message: "No watch topics defined for triage scope", processed_count: 0 };
    }

    const llm = LLMProviderFactory.getProvider();
    const guard = new PerimeterGuard();
    let processedCount = 0;

    // Parallelize processing with Promise.all to satisfy NFR <60s
    const triagePromises = threads.map(async (thread) => {
      const snippet = (thread.metadata as any)?.snippet || '';
      
      // CRITICAL: Apply PerimeterGuard PII filtering before LLM call
      const filteredSubject = guard.redactPII(thread.subject || '');
      const filteredSnippet = guard.redactPII(snippet);

      const prompt = `
        Analyze the following email thread against the user's watch topics.
        
        EMAIL SUBJECT: ${filteredSubject}
        EMAIL SNIPPET: ${filteredSnippet}
        
        WATCH TOPICS:
        ${topics.map(t => `- ${t.topic} (Priority: ${t.priority})`).join('\n')}
        
        DETERMINE:
        1. Does this email match any topics?
        2. Assign a priority_score (0-100) based on topic matches and priority levels.
        3. Should this be highlighted (is_highlighted: true if score > 70)?
        
        RETURN JSON:
        {
          "matches": [{"topic": "...", "reason": "...", "priority_score": 0-100}],
          "overall_priority_score": 0-100,
          "is_highlighted": boolean
        }
      `;

      try {
        const response = await llm.generateStructured(prompt, TriageResultSchema);
        const classification = response.data;

        // Restore PII in reason strings if any placeholders were used by the LLM (unlikely but safe)
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

        // 4. Log reasoning to agent_activity_log - Store full classification for trace
        await supabase.from('agent_activity_log').insert({
          organization_id,
          task_id: task.id,
          agent_id: task.user_id ?? '',
          action_taken: `Triaged thread: ${thread.subject}`,
          reasoning_trace: {
            thread_id: thread.id,
            classification, // Store complete result
            confidence: "High",
            pii_redacted: true
          }
        } as any);

        processedCount++;
      } catch (err) {
        console.error(`Failed to triage thread ${thread.id}:`, err);
      }
    });

    await Promise.all(triagePromises);

    return {
      message: `Successfully triaged ${processedCount} threads`,
      processed_count: processedCount,
      task_id: task.id
    };
  }
}
