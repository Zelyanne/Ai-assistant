<script setup lang="ts">
import Toast from 'primevue/toast';
</script>

<template>
  <div class="font-sans antialiased text-slate-900">
    <Toast />
    <router-view />
  </div>
</template>

<style>
/* Global styles if needed */
body {
  margin: 0;
  padding: 0;
}
</style>
