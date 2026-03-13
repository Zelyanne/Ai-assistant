import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
function isControlsRow(value) {
    if (!value || typeof value !== 'object')
        return false;
    const v = value;
    return typeof v.organization_id === 'string' && typeof v.emergency_brake_enabled === 'boolean';
}
export function useSafetyControls() {
    const userStore = useUserStore();
    const emergencyBrakeEnabled = ref(false);
    const loading = ref(false);
    const saving = ref(false);
    const error = ref(null);
    let channel = null;
    async function refresh() {
        const organizationId = userStore.profile?.organization_id;
        if (!organizationId)
            return;
        loading.value = true;
        error.value = null;
        try {
            const { data, error: selectError } = await supabase
                .from('org_safety_controls')
                .select('organization_id, emergency_brake_enabled')
                .eq('organization_id', organizationId)
                .maybeSingle();
            if (selectError) {
                error.value = selectError.message;
                emergencyBrakeEnabled.value = false;
                return;
            }
            emergencyBrakeEnabled.value = data?.emergency_brake_enabled === true;
        }
        catch (err) {
            error.value = err instanceof Error ? err.message : 'Failed to load safety controls.';
            emergencyBrakeEnabled.value = false;
        }
        finally {
            loading.value = false;
        }
    }
    function subscribe() {
        const organizationId = userStore.profile?.organization_id;
        if (!organizationId)
            return;
        if (channel)
            return;
        channel = supabase
            .channel(`org_safety_controls:org:${organizationId}`)
            .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'org_safety_controls',
            filter: `organization_id=eq.${organizationId}`,
        }, (payload) => {
            const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) ?? null;
            if (!isControlsRow(row))
                return;
            emergencyBrakeEnabled.value = payload.eventType === 'DELETE' ? false : row.emergency_brake_enabled;
        })
            .subscribe();
    }
    function unsubscribe() {
        if (!channel)
            return;
        void channel.unsubscribe();
        supabase.removeChannel(channel);
        channel = null;
    }
    async function setEmergencyBrakeEnabled(enabled) {
        const organizationId = userStore.profile?.organization_id;
        const userId = userStore.profile?.id;
        if (!organizationId || !userId)
            return;
        if (!enabled && userStore.isCEO !== true) {
            error.value = 'Only the CEO can disable the Emergency Brake.';
            return;
        }
        saving.value = true;
        error.value = null;
        try {
            const now = new Date().toISOString();
            const { error: upsertError } = await supabase
                .from('org_safety_controls')
                .upsert({
                organization_id: organizationId,
                emergency_brake_enabled: enabled,
                updated_by: userId,
                updated_at: now,
            }, { onConflict: 'organization_id' });
            if (upsertError) {
                error.value = upsertError.message;
                return;
            }
            emergencyBrakeEnabled.value = enabled;
        }
        catch (err) {
            error.value = err instanceof Error ? err.message : 'Failed to update safety controls.';
        }
        finally {
            saving.value = false;
        }
    }
    return {
        emergencyBrakeEnabled,
        loading,
        saving,
        error,
        refresh,
        subscribe,
        unsubscribe,
        setEmergencyBrakeEnabled,
    };
}
//# sourceMappingURL=useSafetyControls.js.map