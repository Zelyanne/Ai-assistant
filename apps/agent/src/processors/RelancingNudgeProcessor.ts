import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { RelancingNudgePayloadSchema, Task } from '@ai-assistant/shared';

export class RelancingNudgeProcessor extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    const payload = RelancingNudgePayloadSchema.parse(task.payload);
    const escalationPriority =
      payload.escalation_priority === 'high' || payload.urgency_band === 'overdue' ? 'high' : 'normal';

    return {
      summary: `Relancing nudge prepared for ${payload.member_name} on project "${payload.project_name}".`,
      project_context_id: payload.project_context_id,
      member_assignment_id: payload.member_assignment_id,
      member_name: payload.member_name,
      project_name: payload.project_name,
      deadline: payload.deadline,
      urgency_band: payload.urgency_band,
      cadence_hours: payload.cadence_hours,
      reason_code: payload.reason_code,
      escalation_priority: escalationPriority,
      nudge_window_start: payload.nudge_window_start,
      nudge_window_end: payload.nudge_window_end,
    };
  }
}
