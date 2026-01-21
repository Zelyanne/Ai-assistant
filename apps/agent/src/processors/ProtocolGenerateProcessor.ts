import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { Task, ProtocolGeneratePayloadSchema } from '@ai-assistant/shared';
import { ProtocolService } from '../services/ProtocolService.js';
import { AuditLogger } from '../services/AuditLogger.js';

/**
 * Processor for generating a leadership protocol from natural language philosophy.
 */
export class ProtocolGenerateProcessor extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    console.log(`[ProtocolGenerateProcessor][${task.id}] Generating protocol...`);

    // 1. Validate payload
    const result = ProtocolGeneratePayloadSchema.safeParse(task.payload);
    if (!result.success) {
      throw new Error(`Invalid payload for protocol.generate: ${result.error.message}`);
    }

    const { philosophy } = result.data;

    // 2. Generate protocol via service
    const generationResult = await ProtocolService.generateProtocol(philosophy);

    // 3. Add reasoning trace and citations for transparency (AC 7)
    const step = AuditLogger.createStep('Protocol Generation', 'Transformed natural language philosophy into structured Markdown and JSON metadata using LLM', {
      input_summary: philosophy.substring(0, 100) + '...',
      confidence_score: 0.95
    });

    const citation = AuditLogger.createCitation(
      'philosophy-input',
      'user_input',
      'Original leadership philosophy provided by user',
      'User-provided natural language text'
    );
    
    return {
      protocol_markdown: generationResult.markdown,
      metadata: generationResult.metadata,
      status: 'review_pending',
      message: 'Protocol generated successfully and is ready for review.',
      trace: [step],
      citations: [citation]
    };
  }
}
