import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabase } from '../services/supabase';
export const useUserStore = defineStore('user', () => {
    const profile = ref(null);
    const loading = ref(true);
    const role = computed(() => profile.value?.role || null);
    const isCEO = computed(() => role.value === 'CEO');
    const isPM = computed(() => role.value === 'PM');
    const isTeamMember = computed(() => role.value === 'Team Member');
    const isSimpleUser = computed(() => role.value === 'Simple User');
    const hasOrganization = computed(() => !!profile.value?.organization_id);
    async function fetchProfile() {
        loading.value = true;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                profile.value = null;
                return;
            }
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            if (error)
                throw error;
            profile.value = data;
        }
        catch (err) {
            console.error('Error fetching profile:', err);
            profile.value = null;
        }
        finally {
            loading.value = false;
        }
    }
    return {
        profile,
        loading,
        role,
        isCEO,
        isPM,
        isTeamMember,
        isSimpleUser,
        hasOrganization,
        fetchProfile,
    };
});
//# sourceMappingURL=user.js.map