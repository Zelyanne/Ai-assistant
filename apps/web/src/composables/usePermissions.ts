import { computed } from 'vue';
import { useUserStore } from '../stores/user';

export function usePermissions() {
  const userStore = useUserStore();

  const isCEO = computed(() => userStore.isCEO);
  const isPM = computed(() => userStore.isPM);
  const isTeamMember = computed(() => userStore.isTeamMember);
  const role = computed(() => userStore.role);

  return {
    isCEO,
    isPM,
    isTeamMember,
    role,
  };
}
