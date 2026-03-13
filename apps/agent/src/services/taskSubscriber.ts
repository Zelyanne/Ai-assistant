import { Task } from '@ai-assistant/shared';
import { graph } from '../controller/graph.js';
import { tracingService } from './llm/tracing.js';
import { executionRunService } from './ExecutionRunService.js';

export async function processQueuedTask(task: Task): Promise<void> {
  console.log(`[Realtime] New task detected: ${task.id} (${task.domain_action})`);

  try {
    const executionRun = task.id
      ? await executionRunService.getByTaskId(task.id)
      : null;
    const langfuseHandler = tracingService.getHandler();
    const callbacks = langfuseHandler ? [langfuseHandler] : [];

    await graph.invoke(
      {
        task,
        execution_run: executionRun,
      },
      {
        runName: `Graph: ${task.domain_action}`,
        metadata: {
          taskId: task.id,
          orgId: task.organization_id,
          domain_action: task.domain_action,
          executionRunId: executionRun?.id,
          executionRunStatus: executionRun?.status,
          langfuseUserId: task.user_id,
        },
        tags: [task.domain_action, 'langgraph'],
        callbacks,
      },
    );
    await tracingService.flush();
  } catch (error) {
    console.error(`[Realtime] Graph execution failed for task ${task.id}:`, error);
  }
}
