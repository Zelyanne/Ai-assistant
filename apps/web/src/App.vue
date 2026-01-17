<script setup lang="ts">
import { onMounted } from 'vue';
import { useUserStore } from './stores/user';
import { usePermissions } from './composables/usePermissions';
import Toast from 'primevue/toast';

const userStore = useUserStore();
const { isCEO } = usePermissions();

onMounted(() => {
  userStore.fetchProfile();
});
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <Toast />
    <nav class="bg-white shadow-sm mb-8">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center">
            <router-link to="/" class="text-xl font-bold text-indigo-600">AI Assistant</router-link>
            <div class="ml-10 flex items-baseline space-x-4">
              <router-link to="/" class="text-gray-600 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium">Dashboard</router-link>
              <router-link v-if="isCEO" to="/admin" class="text-gray-600 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium">Admin Hub</router-link>
            </div>
          </div>
          <div class="flex items-center">
            <span class="text-sm text-gray-500 mr-4">{{ userStore.profile?.email }}</span>
            <div v-if="userStore.profile?.role" class="px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">
              {{ userStore.profile.role }}
            </div>
          </div>
        </div>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
