<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '../services/supabase'
import { useUserStore } from '../stores/user'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import { useToast } from 'primevue/usetoast'
import AgencyPerimeterBoard from './security/AgencyPerimeterBoard.vue'

const userStore = useUserStore()
const toast = useToast()

const loading = ref(true)
const saving = ref(false)
const briefingTime = ref('08:00')

const fetchSettings = async () => {
  if (!userStore.profile?.organization_id) return

  loading.value = true
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userStore.profile.id)
      .single()

    const preferredBriefingTime = (profile as { preferred_briefing_time?: string | null } | null)?.preferred_briefing_time

    if (preferredBriefingTime) {
      briefingTime.value = preferredBriefingTime.slice(0, 5)
    }
  } catch (err: any) {
    console.error('Error fetching settings:', err)
  } finally {
    loading.value = false
  }
}

const saveSettings = async () => {
  if (!userStore.profile?.organization_id) return

  saving.value = true
  try {
    const profilesTable = supabase.from('profiles') as any
    const { error } = await profilesTable
      .update({
        preferred_briefing_time: `${briefingTime.value}:00`,
      })
      .eq('id', userStore.profile.id)

    if (error) {
      throw error
    }

    toast.add({
      severity: 'success',
      summary: 'Settings Updated',
      detail: 'Your settings have been saved.',
      life: 3000,
    })
  } catch (err: any) {
    console.error('Error saving settings:', err)
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: err.message || 'Failed to update settings',
      life: 5000,
    })
  } finally {
    saving.value = false
  }
}

onMounted(fetchSettings)
</script>

<template>
  <div class="space-y-6">
    <div
      v-if="loading"
      class="flex justify-center py-12"
    >
      <ProgressSpinner style="width: 50px; height: 50px" />
    </div>

    <div
      v-else
      class="space-y-6"
    >
      <div class="flex flex-col gap-4">
        <h3 class="text-lg font-bold text-executive-primary font-sans">
          Agency Perimeter Manager
        </h3>
        <p class="text-sm text-slate-500 font-technical">
          Drag topics between tiers to control what your proxy agent can do autonomously.
        </p>

        <AgencyPerimeterBoard
          v-if="userStore.profile?.organization_id"
          :organization-id="userStore.profile.organization_id"
          :can-write="userStore.isCEO"
        />
      </div>

      <!-- Briefing Schedule Section -->
      <div class="pt-6 border-t border-slate-100 flex flex-col gap-4">
        <h3 class="text-lg font-bold text-executive-primary font-sans">
          Morning Briefing Schedule
        </h3>
        <p class="text-sm text-slate-500 font-technical">
          When should your agent generate your executive summary? The agent will only generate a brief if new relevant activity is detected.
        </p>
        
        <div class="flex items-center gap-4 max-w-xs">
          <div class="flex-1 flex flex-col gap-2">
            <label
              for="briefingTime"
              class="text-xs font-bold uppercase tracking-wider text-slate-400 font-technical"
            >Delivery Time</label>
            <div class="flex items-center gap-2">
              <i class="pi pi-clock text-slate-400" />
              <input 
                id="briefingTime" 
                v-model="briefingTime" 
                type="time"
                class="p-inputtext p-component font-technical w-full"
              >
            </div>
          </div>
        </div>
      </div>

      <div class="pt-4 border-t border-slate-100 flex justify-end">
        <Button 
          label="Save Changes" 
          icon="pi pi-check" 
          severity="contrast" 
          :loading="saving" 
          @click="saveSettings" 
        />
      </div>
    </div>
  </div>
</template>
