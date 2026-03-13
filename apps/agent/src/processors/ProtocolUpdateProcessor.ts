import { BaseProcessor, type ProcessorResult } from './BaseProcessor.js';
import {
  Task,
  Json,
} from '@ai-assistant/shared';
import { ProtocolService } from '../services/ProtocolService.js';
import { z } from 'zod';

const ProtocolUpdatePayloadSchema = z.object({
  title: z.string().default('Primary Leadership Protocol'),
  content_markdown: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
});

/**
 * Processor for protocol.update
 * - saves approved protocol to the user_protocols table
 * - logs a "Silent Win"
 */
export class ProtocolUpdateProcessor extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    this.clearTrace();
    this.addTraceStep('protocol_update_start', `Updating protocol for org ${task.organization_id}`);

    const payload = ProtocolUpdatePayloadSchema.parse(task.payload);

    await ProtocolService.saveProtocol(
      task.organization_id,
      task.user_id || 'system',
      payload.title,
      payload.content_markdown,
      payload.metadata as Json
    );

    this.addTraceStep('protocol_update_save_success', 'Protocol saved to database');

    return {
      summary: 'Silent Win: Leadership protocol updated successfully.',
      status: 'done',
      trace: this.getTrace(),
    };
  }
}
