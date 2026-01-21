<script setup lang="ts">
import { ref } from 'vue';
import { useUserStore } from '../stores/user';
import Card from 'primevue/card';

const userStore = useUserStore();
const greeting = ref('Good morning'); // This could be dynamic based on time

// Mock data for the "Morning Brief" placeholder
const dailySummary = {
  tasks: 12,
  nudges: 4,
  escalations: 1
};
</script>

<template>
  <div class="space-y-8">
    <header>
      <h1 class="text-3xl font-bold text-executive-primary tracking-tight font-sans">
        {{ greeting }}, {{ userStore.profile?.full_name?.split(' ')[0] || 'Executive' }}
      </h1>
      <p class="text-slate-500 mt-2 font-technical">Here is your morning brief for today.</p>
    </header>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 font-technical">
      <Card class="border-none shadow-sm overflow-hidden">
        <template #content>
          <div class="flex items-center gap-4">
            <div class="h-12 w-12 rounded-executive bg-blue-50 text-executive-info flex items-center justify-center text-xl">
              <i class="pi pi-check-square"></i>
            </div>
            <div>
              <div class="text-sm font-medium text-slate-500 uppercase tracking-wider">Active Tasks</div>
              <div class="text-2xl font-bold text-executive-primary">{{ dailySummary.tasks }}</div>
            </div>
          </div>
        </template>
      </Card>

      <Card class="border-none shadow-sm overflow-hidden">
        <template #content>
          <div class="flex items-center gap-4">
            <div class="h-12 w-12 rounded-executive bg-teal-50 text-executive-success flex items-center justify-center text-xl">
              <i class="pi pi-send"></i>
            </div>
            <div>
              <div class="text-sm font-medium text-slate-500 uppercase tracking-wider">Pending Nudges</div>
              <div class="text-2xl font-bold text-executive-primary">{{ dailySummary.nudges }}</div>
            </div>
          </div>
        </template>
      </Card>

      <Card class="border-none shadow-sm overflow-hidden">
        <template #content>
          <div class="flex items-center gap-4">
            <div class="h-12 w-12 rounded-executive bg-amber-50 text-executive-warning flex items-center justify-center text-xl">
              <i class="pi pi-exclamation-circle"></i>
            </div>
            <div>
              <div class="text-sm font-medium text-slate-500 uppercase tracking-wider">Escalations</div>
              <div class="text-2xl font-bold text-red-600">{{ dailySummary.escalations }}</div>
            </div>
          </div>
        </template>
      </Card>
    </div>

    <section class="bg-white p-8 rounded-executive border border-slate-200 shadow-sm min-h-[400px] flex flex-col items-center justify-center text-center">
      <div class="max-w-md">
        <div class="text-4xl mb-4">🧠</div>
        <h2 class="text-xl font-semibold text-executive-primary mb-2 font-sans">Morning Brief is coming soon</h2>
        <p class="text-slate-500 font-technical">
          The autonomous protocol engine is currently being initialized. Once complete, your personalized briefing will appear here.
        </p>
      </div>
    </section>
  </div>
</template>
