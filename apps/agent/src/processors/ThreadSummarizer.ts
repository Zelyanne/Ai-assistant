import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { Task, ThreadSummarySchema } from '@ai-assistant/shared';
import { supabase } from "../services/supabase.js";
import { LLMProviderFactory } from '../services/llm/factory.js';
import { PerimeterGuard } from '../guards/PerimeterGuard.js';

/**
 * Processor for generating structured summaries of email threads.
 * Implements AC 1, 2, and 3 of Story 3.4 and Story 3.5.
 */
export class ThreadSummarizer extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    this.clearTrace();
    const { organization_id, user_id } = task;
    const threadId = task.payload.thread_id;

    if (!threadId) {
      throw new Error("thread_id is required in task payload");
    }

    console.log(`[ThreadSummarizer][${task.id}] Summarizing thread ${threadId}...`);

    // 1. Fetch thread data
    this.addTraceStep('Input Ingestion', `Fetching thread content for ID: ${threadId}`);
    const { data: thread, error: threadError } = await supabase
      .from('ingested_threads')
      .select('id, subject, metadata, external_id')
      .eq('organization_id', organization_id)
      .eq('id', threadId)
      .single();

    if (threadError || !thread) {
      throw new Error(`Thread ${threadId} not found: ${threadError?.message}`);
    }

    // Extract messages from metadata stored during ingestion
    const messages = (thread.metadata as any)?.thread_raw?.messages || [];
    if (messages.length === 0) {
      return { message: "No messages found in thread metadata", success: false, thread_id: threadId };
    }

    const llm = LLMProviderFactory.getProvider();
    const guard = new PerimeterGuard();

    // 2. Prepare content for LLM (with PII redaction)
    this.addTraceStep('Perimeter Check', `Applying PII redaction to ${messages.length} messages`);
    const threadContent = messages.map((m: any, index: number) => {
      const from = m.payload?.headers?.find((h: any) => h.name === 'From')?.value || 'Unknown';
      const body = m.snippet || ''; 
      return `Message ${index + 1} from ${guard.redactPII(from)}:\n${guard.redactPII(body)}`;
    }).join('\n\n');

    const filteredSubject = guard.redactPII(thread.subject || '');

    // 3. Generate structured summary using Mistral
    this.addTraceStep('LLM Reasoning', 'Generating structured summary using executive tone');
    const prompt = `
      Provide a synthesized summary of the following email thread for an executive audience.
      
      CRITICAL INSTRUCTIONS:
      - Do NOT summarize message-by-message.
      - Do NOT mention specific sender names in the summary unless absolutely critical for the context of a decision.
      - Focus on the collective outcome and current state of the discussion.
      - Tone: "Executive Calm" (concise, factual, non-alarmist).
      
      THREAD SUBJECT: ${filteredSubject}
      
      MESSAGES IN THREAD:
      ${threadContent}
      
      STRICTLY FOLLOW THIS STRUCTURE:
      - context: High-level purpose of the entire thread.
      - decisions: Key updates or collective decisions made (array of strings).
      - action_items: Specific tasks required from the user (array of strings).
    `;

    const response = await llm.generateStructured(prompt, ThreadSummarySchema);
    const summaryJson = response.data;

    // 4. Recover PII in the generated summary
    this.addTraceStep('PII Recovery', 'Restoring sensitive data for authorized viewing');
    summaryJson.context = guard.recoverPII(summaryJson.context);
    summaryJson.decisions = summaryJson.decisions.map(d => guard.recoverPII(d));
    summaryJson.action_items = summaryJson.action_items.map(a => guard.recoverPII(a));

    const summaryText = `
Context: ${summaryJson.context}

Decisions:
${summaryJson.decisions.map(d => `- ${d}`).join('\n')}

Action Items:
${summaryJson.action_items.map(a => `- ${a}`).join('\n')}
    `.trim();

    // 5. Update ingested_threads
    const { error: updateError } = await supabase
      .from('ingested_threads')
      .update({
        summary: summaryText,
        summary_json: summaryJson,
        updated_at: new Date().toISOString()
      })
      .eq('id', thread.id);

    if (updateError) throw updateError;

    // 6. Log activity with reasoning trace and citations (AC 6)
    const citationLink = `https://mail.google.com/mail/u/0/#all/${thread.external_id}`;

    await supabase.from('agent_activity_log').insert({
      organization_id,
      task_id: task.id,
      agent_id: task.user_id ?? '',
      action_taken: `Summarized thread: ${thread.subject}`,
      reasoning_trace: this.getTrace(),
      citations: [{
        source_type: 'email',
        source_id: thread.external_id,
        link: citationLink,
        description: `Original email thread: ${thread.subject}`
      }]
    } as any);

    return {
      message: `Successfully summarized thread`,
      thread_id: thread.id,
      summary: summaryJson
    };
  }
}
