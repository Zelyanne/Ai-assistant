<script setup lang="ts">
import WorkspaceIntegration from '../components/WorkspaceIntegration.vue';
</script>

<template>
  <div class="space-y-8">
    <header>
      <h1 class="text-3xl font-bold text-executive-primary tracking-tight">Settings</h1>
      <p class="text-slate-500 mt-2">Manage your account and platform integrations.</p>
    </header>

    <div class="grid grid-cols-1 gap-8">
      <section class="bg-white p-8 rounded-executive border border-slate-200 shadow-sm">
        <h2 class="text-xl font-semibold text-executive-primary mb-6">Integrations</h2>
        <WorkspaceIntegration />
      </section>
    </div>
  </div>
</template>
