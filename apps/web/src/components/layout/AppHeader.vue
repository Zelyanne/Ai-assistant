<script setup lang="ts">
import { useUserStore } from '../../stores/user';
import Button from 'primevue/button';

const userStore = useUserStore();

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
        @click="$emit('toggle-menu')"
      />
      <router-link to="/dashboard" class="flex items-center gap-2 no-underline">
        <span class="text-xl font-bold text-executive-primary tracking-tight">AI Assistant</span>
      </router-link>
    </div>

    <div class="flex items-center gap-4">
      <!-- Emergency Brake -->
      <Button 
        severity="danger" 
        variant="outlined"
        class="!rounded-executive !px-4 !py-2 !text-sm font-medium animate-pulse"
      >
        <template #icon>
          <span class="mr-2">🚨</span>
        </template>
        Emergency Brake
      </Button>

      <div class="h-8 w-px bg-executive-background mx-2"></div>

      <div class="flex items-center gap-3">
        <div class="text-right hidden sm:block">
          <div class="text-sm font-semibold text-executive-primary leading-none">{{ userStore.profile?.full_name || 'User' }}</div>
          <div class="text-xs text-slate-500 mt-1">{{ userStore.profile?.role }}</div>
        </div>
        <div class="h-10 w-10 rounded-full bg-executive-background flex items-center justify-center text-executive-primary font-bold">
          {{ userStore.profile?.email?.[0].toUpperCase() }}
        </div>
      </div>
    </div>
  </header>
</template>
