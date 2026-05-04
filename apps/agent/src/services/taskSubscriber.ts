import { Task } from '@ai-assistant/shared';
import { graph } from '../controller/graph.js';
import { tracingService } from './llm/tracing.js';
import { executionRunService } from './ExecutionRunService.js';
import { commandConversationContextService } from './CommandConversationContextService.js';
import { supabase } from './supabase.js';

const STARTUP_RECOVERY_LIMIT = 20;
const STALE_PROCESSING_TASK_MS = 15 * 60 * 1000;

function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/sb_[A-Za-z0-9_\-.]+/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer [REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500) || 'Unknown error';
}

async function markTaskExecutionFailed(task: Task, error: unknown): Promise<void> {
  if (!task.id) {
    return;
  }

  const now = new Date().toISOString();
  const detail = safeErrorMessage(error);
  const summary = 'Command execution failed before it could finish. Please retry.';
  const result = {
    ...(task.result && typeof task.result === 'object' && !Array.isArray(task.result) ? task.result : {}),
    summary,
    error: `Graph execution failed: ${detail}`,
  };

  const { error: taskError } = await supabase
    .from('tasks')
    .update({
      status: 'error',
      result,
      updated_at: now,
    })
    .eq('id', task.id);

  if (taskError) {
    console.error(`[Realtime] Failed to mark task ${task.id} as error: ${taskError.message}`);
  }

  const { error: messageError } = await supabase
    .from('command_messages')
    .update({
      state: 'error',
      content: summary,
      updated_at: now,
    })
    .eq('source_task_id', task.id)
    .eq('role', 'assistant');

  if (messageError) {
    console.error(`[Realtime] Failed to mark command message for task ${task.id} as error: ${messageError.message}`);
  }
}

export async function processQueuedTask(task: Task): Promise<void> {
  console.log(`[Realtime] New task detected: ${task.id} (${task.domain_action})`);

  try {
    const hydratedTask = await commandConversationContextService.hydrateTaskConversationContext(task);
    const executionRun = task.id
      ? await executionRunService.getByTaskId(task.id)
      : null;
    const langfuseHandler = tracingService.getHandler();
    const callbacks = langfuseHandler ? [langfuseHandler] : [];

    await graph.invoke(
      {
        task: hydratedTask,
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
    await markTaskExecutionFailed(task, error);
  }
}

async function fetchRecoverableTasks(
  status: 'queued' | 'processing',
  options: { staleCutoffIso?: string; domainAction?: string; newestFirst?: boolean } = {},
): Promise<Task[]> {
  let query = supabase
    .from('tasks')
    .select('*')
    .eq('status', status);

  if (options.domainAction) {
    query = query.eq('domain_action', options.domainAction);
  }

  if (status === 'processing' && options.staleCutoffIso) {
    query = query.lt('updated_at', options.staleCutoffIso);
  }

  const { data, error } = await query
    .order('created_at', { ascending: !options.newestFirst })
    .limit(STARTUP_RECOVERY_LIMIT);

  if (error) {
    console.error(`[Realtime] Failed to fetch ${status} tasks for startup recovery: ${error.message}`);
    return [];
  }

  return (data ?? []) as Task[];
}

export async function recoverPendingTasks(): Promise<void> {
  const staleCutoffIso = new Date(Date.now() - STALE_PROCESSING_TASK_MS).toISOString();
  const [queuedCommands, staleProcessingCommands, queuedTasks, staleProcessingTasks] = await Promise.all([
    fetchRecoverableTasks('queued', { domainAction: 'assistant.command', newestFirst: true }),
    fetchRecoverableTasks('processing', { domainAction: 'assistant.command', staleCutoffIso, newestFirst: true }),
    fetchRecoverableTasks('queued'),
    fetchRecoverableTasks('processing', { staleCutoffIso }),
  ]);

  const seen = new Set<string>();
  const tasks = [
    ...queuedCommands,
    ...staleProcessingCommands,
    ...queuedTasks,
    ...staleProcessingTasks,
  ]
    .filter((task) => {
      if (!task.id || seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    })
    .slice(0, STARTUP_RECOVERY_LIMIT);

  if (tasks.length === 0) {
    return;
  }

  console.log(`[Realtime] Recovering ${tasks.length} pending task${tasks.length === 1 ? '' : 's'} on startup.`);
  for (const task of tasks) {
    await processQueuedTask(task);
  }
}
