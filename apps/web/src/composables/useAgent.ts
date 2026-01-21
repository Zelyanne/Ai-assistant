import { ref, onUnmounted } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import { Task, TaskStatus } from '@ai-assistant/shared';

export function useAgent() {
  const userStore = useUserStore();
  const loading = ref(false);
  const error = ref<string | null>(null);

  /**
   * Submits a task to the database-as-queue.
   */
  async function submitTask(domainAction: string, payload: Record<string, any>, topic = 'General'): Promise<Task | null> {
    if (!userStore.profile?.organization_id) {
      error.value = 'Organization ID is missing';
      return null;
    }

    loading.value = true;
    error.value = null;

    try {
      const { data, error: insertError } = await supabase
        .from('tasks')
        .insert({
          organization_id: userStore.profile.organization_id,
          user_id: userStore.profile.id,
          domain_action: domainAction,
          payload,
          topic,
          status: 'queued'
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return data as Task;
    } catch (err: any) {
      console.error('[useAgent] Failed to submit task:', err);
      error.value = err.message;
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Monitors a task until it reaches a terminal state.
   */
  function monitorTask(taskId: string, onUpdate: (task: Task) => void) {
    const channel = supabase
      .channel(`task:${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`
        },
        (payload) => {
          onUpdate(payload.new as Task);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }

  return {
    loading,
    error,
    submitTask,
    monitorTask
  };
}
