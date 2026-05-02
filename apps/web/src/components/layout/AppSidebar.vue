<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const navItems = [
  { label: 'Assistant', icon: 'pi pi-comments', to: '/dashboard/command-center' },
  { label: 'Dashboard', icon: 'pi pi-home', to: '/dashboard' },
  { label: 'Messages', icon: 'pi pi-envelope', to: '/messages/topic' },
  { label: 'Protocol', icon: 'pi pi-bolt', to: '/dashboard/brain-setup' },
  { label: 'Audit Log', icon: 'pi pi-shield', to: '/dashboard/audit-log' },
  { label: 'Settings', icon: 'pi pi-cog', to: '/dashboard/settings' },
];

const isCollapsed = ref(false);

const collapseButtonLabel = computed(() => {
  return isCollapsed.value ? 'Expand sidebar' : 'Collapse sidebar';
});
</script>

<template>
  <aside 
    class="bg-white border-r border-executive-background flex flex-col transition-[width] duration-300 ease-in-out"
    :class="[isCollapsed ? 'w-20' : 'w-64']"
  >
    <div class="flex-1 py-6 px-3 space-y-2">
      <router-link
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        :aria-label="item.label"
        :title="item.label"
        class="flex items-center gap-3 px-3 py-3 rounded-executive no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-executive-primary/30"
        :class="[
          route.path.startsWith(item.to) && (item.to !== '/dashboard' || route.path === '/dashboard')
            ? 'bg-slate-100 text-executive-primary font-semibold' 
            : 'text-slate-500 hover:bg-slate-50 hover:text-executive-primary'
        ]"
      >
        <i
          :class="item.icon"
          class="text-lg"
          aria-hidden="true"
        />
        <span
          v-if="!isCollapsed"
          class="text-sm"
        >{{ item.label }}</span>
      </router-link>
    </div>

    <div class="p-4 border-t border-executive-background">
      <button 
        type="button"
        class="w-full flex items-center justify-center p-2 rounded-executive hover:bg-slate-50 text-slate-400 hover:text-executive-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-executive-primary/30"
        :aria-label="collapseButtonLabel"
        :aria-expanded="!isCollapsed"
        @click="isCollapsed = !isCollapsed"
      >
        <i
          :class="isCollapsed ? 'pi pi-angle-double-right' : 'pi pi-angle-double-left'"
          aria-hidden="true"
        />
      </button>
    </div>
  </aside>
</template>
