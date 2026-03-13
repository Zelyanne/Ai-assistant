import { BaseProcessor, type ProcessorResult } from './BaseProcessor.js';
import {
  Task,
  ProtocolOptimizePayloadSchema,
  ProtocolOptimizationTaskResultSchema,
} from '@ai-assistant/shared';
import { ProtocolService } from '../services/ProtocolService.js';

/**
 * Processor for system.optimize_protocol
 * - analyzes recent execution evidence + current protocol
 * - produces a conservative NL diff suggestion for human review
 * - never applies protocol changes directly in this processor
 */
export class ProtocolOptimizationProcessor extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    this.clearTrace();
    this.addTraceStep('protocol_optimization_start', `Processing ${task.domain_action}`);

    const payload = ProtocolOptimizePayloadSchema.parse(task.payload ?? {});
    const lookbackDays = payload.lookback_days;
    const minFrictionEvents = payload.min_friction_events;

    this.addTraceStep(
      'protocol_optimization_inputs',
      `lookback_days=${lookbackDays}, min_friction_events=${minFrictionEvents}`,
      1,
    );

    const suggestion = await ProtocolService.suggestOptimizations(task.organization_id, {
      lookbackDays,
      minFrictionEvents,
      sourceTaskId: task.id,
    });

    if (!suggestion) {
      const noSuggestionResult = ProtocolOptimizationTaskResultSchema.parse({
        summary:
          'No protocol optimization suggested. Evidence is insufficient or no recurring friction pattern was detected.',
      });

      this.addTraceStep(
        'protocol_optimization_no_suggestion',
        'No optimization generated from available evidence.',
        0.9,
      );

      return {
        ...noSuggestionResult,
        trace: this.getTrace(),
      };
    }

    const result = ProtocolOptimizationTaskResultSchema.parse({
      summary: `Protocol optimization suggestion ready for review: ${suggestion.nl_diff_summary}`,
      suggestion,
      escalation: true,
      reason: 'Protocol optimization suggestion requires human review.',
      prompt: 'Please review the suggested protocol optimization and approve or decline.',
    });

    this.addTraceStep(
      'protocol_optimization_suggestion_ready',
      `Generated suggestion for section "${suggestion.markdown_section}"`,
      0.92,
    );

    return {
      ...result,
      trace: this.getTrace(),
    };
  }
}
