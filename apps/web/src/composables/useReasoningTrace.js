import { ref } from "vue";
import { supabase } from "../services/supabase";
export function useReasoningTrace() {
    const loading = ref(false);
    const error = ref(null);
    const traceLog = ref(null);
    async function fetchTrace(taskId) {
        loading.value = true;
        error.value = null;
        try {
            // Use maybeSingle() instead of single() so 0 rows doesn't throw an error.
            const { data, error: fetchError } = await supabase
                .from("agent_activity_log")
                .select("*")
                .eq("task_id", taskId)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (fetchError)
                throw fetchError;
            traceLog.value = data;
        }
        catch (err) {
            console.error("[useReasoningTrace] Failed to fetch trace:", err);
            error.value = err.message;
        }
        finally {
            loading.value = false;
        }
    }
    return {
        loading,
        error,
        traceLog,
        fetchTrace,
    };
}
//# sourceMappingURL=useReasoningTrace.js.map