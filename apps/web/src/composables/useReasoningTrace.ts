import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { AgentActivityLog } from '@ai-assistant/shared';

export function useReasoningTrace() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const traceLog = ref<AgentActivityLog | null>(null);

  async function fetchTrace(taskId: string) {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: fetchError } = await supabase
        .from('agent_activity_log')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (fetchError) throw fetchError;
      traceLog.value = data as AgentActivityLog;
    } catch (err: any) {
      console.error('[useReasoningTrace] Failed to fetch trace:', err);
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    traceLog,
    fetchTrace
  };
}
