import { AuditLogger } from '../../services/AuditLogger.js';
import { executionRunService } from '../../services/ExecutionRunService.js';
import type { AgentState } from '../graph.js';

export const loadWorkspaceContext = async (
  state: AgentState,
): Promise<Partial<AgentState>> => {
  if (!state.task.id) {
    return {};
  }

  const executionRun = await executionRunService.getByTaskId(state.task.id);
  if (!executionRun) {
    return {};
  }

  const items = executionRun.plan_json.steps
    .filter((step: typeof executionRun.plan_json.steps[number]) => step.status === 'completed')
    .flatMap((step: typeof executionRun.plan_json.steps[number]) => {
      const summary = typeof step.output.summary === 'string'
        ? step.output.summary
        : JSON.stringify(step.output);

      return [
        {
          content: `${step.worker_type}/${step.action}: ${summary}`,
          citation: AuditLogger.createCitation(
            'execution_run_step',
            `${executionRun.id ?? 'run'}:${step.key}`,
            `Execution run step ${step.key}`,
          ),
        },
      ];
    });

  return {
    execution_run: executionRun,
    workspace_context_items: items,
  };
};
