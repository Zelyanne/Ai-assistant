<script setup lang="ts">
import { computed, ref } from 'vue';
import AppHeader from './AppHeader.vue';
import AppSidebar from './AppSidebar.vue';
import Drawer from 'primevue/drawer';
import { useRoute } from 'vue-router';

const mobileMenuVisible = ref(false);

const route = useRoute();
const isWideLayout = computed(() => route.meta.layoutWidth === 'wide');
</script>

<template>
  <div class="min-h-screen bg-executive-background flex flex-col font-sans text-executive-primary">
    <a
      href="#app-main"
      class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 rounded-xl bg-white px-4 py-2 text-sm font-semibold shadow-sm ring-2 ring-executive-primary/20"
    >
      Skip to content
    </a>
    <AppHeader @toggle-menu="mobileMenuVisible = true" />
    
    <div class="flex-1 flex overflow-hidden">
      <!-- Desktop Sidebar -->
      <AppSidebar class="hidden md:flex shrink-0" />

      <!-- Mobile Sidebar Drawer -->
      <Drawer
        id="app-mobile-nav"
        v-model:visible="mobileMenuVisible"
        header="Navigation"
        class="!w-72"
        role="region"
      >
        <AppSidebar class="!border-none !w-full" />
      </Drawer>
      
      <main
        id="app-main"
        class="flex-1 overflow-y-auto p-8 lg:p-12"
        tabindex="-1"
      >
        <div
          class="mx-auto min-h-0"
          :class="isWideLayout ? 'max-w-none' : 'max-w-6xl'"
        >
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
