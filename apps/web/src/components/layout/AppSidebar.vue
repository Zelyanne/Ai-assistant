<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const navItems = [
  { label: 'Dashboard', icon: 'pi pi-home', to: '/dashboard' },
  { label: 'Protocol', icon: 'pi pi-bolt', to: '/dashboard/brain-setup' },
  { label: 'Settings', icon: 'pi pi-cog', to: '/dashboard/settings' },
];

const isCollapsed = ref(false);
</script>

<template>
  <aside 
    class="bg-white border-r border-executive-background flex flex-col transition-all duration-300 ease-in-out"
    :class="[isCollapsed ? 'w-20' : 'w-64']"
  >
    <div class="flex-1 py-6 px-3 space-y-2">
      <router-link
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-3 px-3 py-3 rounded-executive no-underline transition-colors"
        :class="[
          route.path === item.to 
            ? 'bg-slate-100 text-executive-primary font-semibold' 
            : 'text-slate-500 hover:bg-slate-50 hover:text-executive-primary'
        ]"
      >
        <i :class="item.icon" class="text-lg"></i>
        <span v-if="!isCollapsed" class="text-sm">{{ item.label }}</span>
      </router-link>
    </div>

    <div class="p-4 border-t border-executive-background">
      <button 
        @click="isCollapsed = !isCollapsed"
        class="w-full flex items-center justify-center p-2 rounded-executive hover:bg-slate-50 text-slate-400 hover:text-executive-primary transition-colors"
      >
        <i :class="isCollapsed ? 'pi pi-angle-double-right' : 'pi pi-angle-double-left'"></i>
      </button>
    </div>
  </aside>
</template>
