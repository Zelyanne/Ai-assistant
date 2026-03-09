<script setup lang="ts">
import { ref } from 'vue';
import AppHeader from './AppHeader.vue';
import AppSidebar from './AppSidebar.vue';
import Drawer from 'primevue/drawer';

const mobileMenuVisible = ref(false);
</script>

<template>
  <div class="min-h-screen bg-executive-background flex flex-col font-sans text-executive-primary">
    <AppHeader @toggle-menu="mobileMenuVisible = true" />
    
    <div class="flex-1 flex overflow-hidden">
      <!-- Desktop Sidebar -->
      <AppSidebar class="hidden md:flex shrink-0" />

      <!-- Mobile Sidebar Drawer -->
      <Drawer
        v-model:visible="mobileMenuVisible"
        header="Navigation"
        class="!w-72"
      >
        <AppSidebar class="!border-none !w-full" />
      </Drawer>
      
      <main class="flex-1 overflow-y-auto p-8 lg:p-12">
        <div class="max-w-6xl mx-auto">
          <router-view v-slot="{ Component }">
            <transition
              name="fade"
              mode="out-in"
            >
              <component :is="Component" />
            </transition>
          </router-view>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
