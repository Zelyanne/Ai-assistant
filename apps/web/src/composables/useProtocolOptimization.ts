import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import { useAgent } from './useAgent';
import type { Json, Task, ProtocolOptimizationTaskResult } from '@ai-assistant/shared';

function updatedOptimizationResult(
  result: ProtocolOptimizationTaskResult,
  outcome: 'approved' | 'declined',
): Json {
  return {
    ...(result as unknown as Record<string, Json | undefined>),
    outcome,
  };
}

export function useProtocolOptimization() {
  const userStore = useUserStore();
  const { submitTask } = useAgent();
  const suggestions = ref<Task[]>([]);
  const loading = ref(false);

  async function fetchSuggestions() {
    if (!userStore.profile?.organization_id) return;
    loading.value = true;
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('organization_id', userStore.profile.organization_id)
      .eq('domain_action', 'system.optimize_protocol')
      .eq('status', 'escalation')
      .order('created_at', { ascending: false });

    if (!error) {
      suggestions.value = (data as Task[]).filter(t => (t.result as unknown as ProtocolOptimizationTaskResult)?.suggestion);
    }
    loading.value = false;
  }

  async function approveOptimization(task: Task) {
    const result = task.result as unknown as ProtocolOptimizationTaskResult;
    const suggestion = result?.suggestion;
    if (!suggestion) return;

    // 1. Create a protocol.update task
    await submitTask('protocol.update', {
      content_markdown: suggestion.new_content,
      metadata: suggestion.metadata_changes,
      title: 'Primary Leadership Protocol'
    });

    // 2. Mark the original task as done
    await supabase
      .from('tasks')
      .update({ 
        status: 'done', 
        updated_at: new Date().toISOString(),
        result: updatedOptimizationResult(result, 'approved')
      })
      .eq('id', task.id!);

    // 3. Refresh list
    await fetchSuggestions();
  }

  async function declineOptimization(task: Task) {
    const result = task.result as unknown as ProtocolOptimizationTaskResult;
    // Mark the original task as done with declined outcome
    await supabase
      .from('tasks')
      .update({ 
        status: 'done', 
        updated_at: new Date().toISOString(),
        result: updatedOptimizationResult(result, 'declined')
      })
      .eq('id', task.id!);

    // 2. Refresh list
    await fetchSuggestions();
  }

  return {
    suggestions,
    loading,
    fetchSuggestions,
    approveOptimization,
    declineOptimization
  };
}
