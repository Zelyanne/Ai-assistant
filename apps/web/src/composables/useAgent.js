import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
export function useAgent() {
    const userStore = useUserStore();
    const loading = ref(false);
    const error = ref(null);
    /**
     * Submits a task to the database-as-queue.
     */
    async function submitTask(domainAction, payload, topic = 'General') {
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
            if (insertError)
                throw insertError;
            return data;
        }
        catch (err) {
            console.error('[useAgent] Failed to submit task:', err);
            error.value = err.message;
            return null;
        }
        finally {
            loading.value = false;
        }
    }
    /**
     * Monitors a task until it reaches a terminal state.
     */
    function monitorTask(taskId, onUpdate) {
        const channel = supabase
            .channel(`task:${taskId}`)
            .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'tasks',
            filter: `id=eq.${taskId}`
        }, (payload) => {
            onUpdate(payload.new);
        })
            .subscribe();
        return () => {
            channel.unsubscribe();
            supabase.removeChannel(channel);
        };
    }
    /**
     * Subscribes to changes in a specific table for the user's organization.
     */
    function subscribeToTable(table, onUpdate) {
        if (!userStore.profile?.organization_id)
            return null;
        const channel = supabase
            .channel(`${table}:org:${userStore.profile.organization_id}`)
            .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: table,
            filter: `organization_id=eq.${userStore.profile.organization_id}`
        }, (payload) => {
            onUpdate(payload);
        })
            .subscribe();
        return () => {
            channel.unsubscribe();
            supabase.removeChannel(channel);
        };
    }
    return {
        loading,
        error,
        submitTask,
        monitorTask,
        subscribeToTable
    };
}
//# sourceMappingURL=useAgent.js.map