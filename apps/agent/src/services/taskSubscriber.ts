import { Task } from '@ai-assistant/shared';
import { Effect } from 'effect';
import { graph } from '../controller/graph.js';
import { tracingService } from './llm/tracing.js';
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

function markTaskExecutionFailedEffect(task: Task, error: unknown): Effect.Effect<void, unknown> {
  const taskId = task.id;
  if (!taskId) {
    return Effect.void;
  }

  const now = new Date().toISOString();
  const detail = safeErrorMessage(error);
  const summary = 'Command execution failed before it could finish. Please retry.';
  const result = {
    ...(task.result && typeof task.result === 'object' && !Array.isArray(task.result) ? task.result : {}),
    summary,
    error: `Graph execution failed: ${detail}`,
  };

  return Effect.gen(function* () {
    const { error: taskError } = yield* Effect.tryPromise({
      try: async () => await supabase
        .from('tasks')
        .update({
          status: 'error',
          result,
          updated_at: now,
        })
        .eq('id', taskId),
      catch: (error) => error,
    });

    if (taskError) {
      yield* Effect.sync(() => console.error(`[Realtime] Failed to mark task ${taskId} as error: ${taskError.message}`));
    }

    const { error: messageError } = yield* Effect.tryPromise({
      try: async () => await supabase
        .from('command_messages')
        .update({
          state: 'error',
          content: summary,
          updated_at: now,
        })
        .eq('source_task_id', taskId)
        .eq('role', 'assistant'),
      catch: (error) => error,
    });

    if (messageError) {
      yield* Effect.sync(() => console.error(`[Realtime] Failed to mark command message for task ${taskId} as error: ${messageError.message}`));
    }
  });
}

export function processQueuedTaskEffect(task: Task): Effect.Effect<void, unknown> {
  return Effect.gen(function* () {
    yield* Effect.sync(() => console.log(`[Realtime] New task detected: ${task.id} (${task.domain_action})`));

    const hydratedTask = yield* Effect.tryPromise({
      try: () => commandConversationContextService.hydrateTaskConversationContext(task),
      catch: (error) => error,
    });
    const langfuseHandler = yield* Effect.sync(() => tracingService.getHandler());
    const callbacks = langfuseHandler ? [langfuseHandler] : [];

    yield* Effect.tryPromise({
      try: () => graph.invoke(
        {
          task: hydratedTask,
        },
        {
          runName: `Graph: ${task.domain_action}`,
          metadata: {
            taskId: task.id,
            orgId: task.organization_id,
            domain_action: task.domain_action,
            langfuseUserId: task.user_id,
          },
          tags: [task.domain_action, 'langgraph'],
          callbacks,
        },
      ),
      catch: (error) => error,
    });

    yield* Effect.tryPromise({
      try: () => tracingService.flush(),
      catch: (error) => error,
    });
  }).pipe(
    Effect.catchAll((error) => Effect.gen(function* () {
      yield* Effect.sync(() => console.error(`[Realtime] Graph execution failed for task ${task.id}:`, error));
      yield* markTaskExecutionFailedEffect(task, error);
    })),
  );
}

export async function processQueuedTask(task: Task): Promise<void> {
  return Effect.runPromise(processQueuedTaskEffect(task));
}

function fetchRecoverableTasksEffect(
  status: 'queued' | 'processing',
  options: { staleCutoffIso?: string; domainAction?: string; newestFirst?: boolean } = {},
): Effect.Effect<Task[], never> {
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

  return Effect.tryPromise({
    try: async () => await query
      .order('created_at', { ascending: !options.newestFirst })
      .limit(STARTUP_RECOVERY_LIMIT),
    catch: (error) => error,
  }).pipe(
    Effect.map(({ data, error }) => {
      if (error) {
        console.error(`[Realtime] Failed to fetch ${status} tasks for startup recovery: ${error.message}`);
        return [];
      }

      return (data ?? []) as Task[];
    }),
    Effect.catchAll((error) => Effect.sync(() => {
      console.error(`[Realtime] Failed to fetch ${status} tasks for startup recovery: ${safeErrorMessage(error)}`);
      return [];
    })),
  );
}

export function recoverPendingTasksEffect(): Effect.Effect<void, unknown> {
  const staleCutoffIso = new Date(Date.now() - STALE_PROCESSING_TASK_MS).toISOString();
  return Effect.gen(function* () {
    const [queuedCommands, staleProcessingCommands, queuedTasks, staleProcessingTasks] = yield* Effect.all([
      fetchRecoverableTasksEffect('queued', { domainAction: 'assistant.command', newestFirst: true }),
      fetchRecoverableTasksEffect('processing', { domainAction: 'assistant.command', staleCutoffIso, newestFirst: true }),
      fetchRecoverableTasksEffect('queued'),
      fetchRecoverableTasksEffect('processing', { staleCutoffIso }),
    ], { concurrency: 'unbounded' });

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

    yield* Effect.sync(() => console.log(`[Realtime] Recovering ${tasks.length} pending task${tasks.length === 1 ? '' : 's'} on startup.`));
    for (const task of tasks) {
      yield* processQueuedTaskEffect(task);
    }
  });
}

export async function recoverPendingTasks(): Promise<void> {
  return Effect.runPromise(recoverPendingTasksEffect());
}
