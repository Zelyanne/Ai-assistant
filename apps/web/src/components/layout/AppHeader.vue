<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useUserStore } from '../../stores/user';
import Button from 'primevue/button';
import ToggleSwitch from 'primevue/toggleswitch';
import { useSafetyControls } from '../../composables/useSafetyControls';

const userStore = useUserStore();
const safetyControls = useSafetyControls();

const toggleDisabled = computed(() => {
  if (safetyControls.loading.value || safetyControls.saving.value) return true;
  // Anyone can enable; only CEO can disable.
  return safetyControls.emergencyBrakeEnabled.value && userStore.isCEO !== true;
});

const toggleTooltip = computed(() => {
  if (toggleDisabled.value && safetyControls.emergencyBrakeEnabled.value && userStore.isCEO !== true) {
    return 'Only the CEO can disable the Emergency Brake.';
  }
  return safetyControls.emergencyBrakeEnabled.value
    ? 'Brake engaged: proxy actions will be paused.'
    : 'Brake off: proxy actions can run normally.';
});

const brakeModel = computed({
  get(): boolean {
    return safetyControls.emergencyBrakeEnabled.value;
  },
  set(next: boolean): void {
    void safetyControls.setEmergencyBrakeEnabled(next);
  },
});

onMounted(() => {
  void safetyControls.refresh();
  safetyControls.subscribe();
});

onUnmounted(() => {
  safetyControls.unsubscribe();
});

defineEmits(['toggle-menu']);
</script>

<template>
  <header class="h-16 bg-white border-b border-executive-background flex items-center justify-between px-6 sticky top-0 z-50">
    <div class="flex items-center gap-4">
      <Button 
        icon="pi pi-bars" 
        class="md:hidden !p-2" 
        severity="secondary" 
        text 
        aria-label="Open navigation"
        @click="$emit('toggle-menu')"
      />
      <router-link
        to="/dashboard/command-center"
        class="flex items-center gap-2 no-underline"
      >
        <span class="text-xl font-bold text-executive-primary tracking-tight">AI Assistant</span>
      </router-link>
    </div>

    <div class="flex items-center gap-4">
      <!-- Emergency Brake -->
      <div class="flex items-center gap-3 shrink-0">
        <div class="hidden sm:flex flex-col leading-tight">
          <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
            Emergency Brake
          </div>
          <div
            v-if="safetyControls.emergencyBrakeEnabled"
            class="flex items-center gap-2 text-rose-700 font-semibold"
          >
            <span class="h-2 w-2 rounded-full bg-rose-600 motion-safe:animate-pulse" />
            <span>Brake Engaged</span>
          </div>
          <div
            v-else
            class="text-slate-500 text-sm"
          >
            Normal Mode
          </div>
        </div>

        <ToggleSwitch
          v-model="brakeModel"
          v-tooltip.bottom="toggleTooltip"
          :disabled="toggleDisabled"
          :aria-label="'Emergency Brake Toggle'"
          data-testid="emergency-brake-toggle"
        />
      </div>

      <div class="h-8 w-px bg-executive-background mx-2" />

      <div class="flex items-center gap-3">
        <div class="text-right hidden sm:block">
          <div class="text-sm font-semibold text-executive-primary leading-none">
            {{ userStore.profile?.full_name || 'User' }}
          </div>
          <div class="text-xs text-slate-500 mt-1">
            {{ userStore.profile?.role }}
          </div>
        </div>
        <div class="h-10 w-10 rounded-full bg-executive-background flex items-center justify-center text-executive-primary font-bold">
          {{ userStore.profile?.email?.[0].toUpperCase() }}
        </div>
      </div>
    </div>
  </header>
</template>
