<script setup lang="ts">
import HelloWorld from '../components/HelloWorld.vue'
import WorkspaceIntegration from '../components/WorkspaceIntegration.vue'
</script>

<template>
  <div class="py-12 px-4 sm:px-6 lg:px-8">
    <div class="flex flex-col items-center mb-12">
      <div class="flex gap-4 mb-4">
        <a href="https://vite.dev" target="_blank">
          <img src="/vite.svg" class="logo" alt="Vite logo" />
        </a>
        <a href="https://vuejs.org/" target="_blank">
          <img src="../assets/vue.svg" class="logo vue" alt="Vue logo" />
        </a>
      </div>
      <HelloWorld msg="AI Assistant SME Hub" />
    </div>

    <div class="grid grid-cols-1 gap-8">
      <section>
        <h2 class="text-2xl font-semibold text-gray-900 mb-6 text-center">Settings & Integrations</h2>
        <WorkspaceIntegration />
      </section>
    </div>
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
