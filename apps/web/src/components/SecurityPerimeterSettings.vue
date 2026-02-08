<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import InputText from 'primevue/inputtext';
import { useToast } from 'primevue/usetoast';

const userStore = useUserStore();
const toast = useToast();

const loading = ref(true);
const saving = ref(false);
const perimeterId = ref<string | null>(null);
const selectedTier = ref('Restricted');
const briefingTime = ref('08:00');

const tierOptions = [
  { label: 'Full Autonomy (Public)', value: 'Public', icon: 'pi pi-bolt', description: 'Agent takes action automatically for maximum speed.' },
  { label: 'Balanced (Controlled)', value: 'Controlled', icon: 'pi pi-sliders-h', description: 'Agent takes action but flags sensitive items for review.' },
  { label: 'High Security (Restricted)', value: 'Restricted', icon: 'pi pi-shield', description: 'Agent analyzes but always waits for your approval.' }
];

const fetchSettings = async () => {
  if (!userStore.profile?.organization_id) return;
  
  loading.value = true;
  try {
    // Fetch perimeter
    const { data: perimeter } = await supabase
      .from('agency_perimeters')
      .select('*')
      .eq('organization_id', userStore.profile.organization_id)
      .eq('topic_name', 'General')
      .single();

    if (perimeter) {
      perimeterId.value = perimeter.id;
      selectedTier.value = perimeter.tier;
    }

    // Fetch briefing preference from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('preferred_briefing_time')
      .eq('id', userStore.profile.id)
      .single();
    
    if (profile?.preferred_briefing_time) {
      briefingTime.value = profile.preferred_briefing_time.slice(0, 5);
    }
  } catch (err: any) {
    console.error('Error fetching settings:', err);
  } finally {
    loading.value = false;
  }
};

const saveSettings = async () => {
  if (!userStore.profile?.organization_id) return;
  
  saving.value = true;
  try {
    // 1. Save Perimeter
    if (perimeterId.value) {
      await supabase.from('agency_perimeters').update({ tier: selectedTier.value }).eq('id', perimeterId.value);
    } else {
      const { data } = await supabase.from('agency_perimeters').insert({
        organization_id: userStore.profile.organization_id,
        topic_name: 'General',
        tier: selectedTier.value
      }).select().single();
      if (data) perimeterId.value = data.id;
    }

    // 2. Save Briefing Time
    await supabase.from('profiles').update({ 
      preferred_briefing_time: `${briefingTime.value}:00` 
    }).eq('id', userStore.profile.id);

    toast.add({
      severity: 'success',
      summary: 'Settings Updated',
      detail: 'Your agent behavior preferences have been saved.',
      life: 3000
    });
  } catch (err: any) {
    console.error('Error saving settings:', err);
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: err.message || 'Failed to update settings',
      life: 5000
    });
  } finally {
    saving.value = false;
  }
};

onMounted(fetchSettings);
</script>

<template>
  <div class="space-y-6">
    <div v-if="loading" class="flex justify-center py-12">
      <ProgressSpinner style="width: 50px; height: 50px" />
    </div>

    <div v-else class="space-y-6">
      <div class="flex flex-col gap-4">
        <h3 class="text-lg font-bold text-executive-primary font-sans">Agent Autonomy Level</h3>
        <p class="text-sm text-slate-500 font-technical">
          Configure how much control your proxy agent has over automated tasks and information processing.
        </p>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          <div 
            v-for="opt in tierOptions" 
            :key="opt.value"
            class="flex flex-col gap-3 p-4 border rounded-xl cursor-pointer transition-all hover:shadow-md"
            :class="selectedTier === opt.value ? 'border-executive-primary bg-slate-50 ring-1 ring-executive-primary' : 'border-slate-200 bg-white'"
            @click="selectedTier = opt.value"
          >
            <div class="flex items-center justify-between">
              <div class="h-10 w-10 rounded-full bg-white shadow-sm flex items-center justify-center border border-slate-100">
                <i :class="[opt.icon, selectedTier === opt.value ? 'text-executive-primary' : 'text-slate-400']"></i>
              </div>
              <div class="h-5 w-5 rounded-full border-2 flex items-center justify-center" :class="selectedTier === opt.value ? 'border-executive-primary' : 'border-slate-300'">
                <div v-if="selectedTier === opt.value" class="h-2.5 w-2.5 rounded-full bg-executive-primary"></div>
              </div>
            </div>
            <div>
              <div class="font-bold text-executive-primary">{{ opt.label }}</div>
              <p class="text-xs text-slate-500 font-technical mt-1 leading-relaxed">{{ opt.description }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Briefing Schedule Section -->
      <div class="pt-6 border-t border-slate-100 flex flex-col gap-4">
        <h3 class="text-lg font-bold text-executive-primary font-sans">Morning Briefing Schedule</h3>
        <p class="text-sm text-slate-500 font-technical">
          When should your agent generate your executive summary? The agent will only generate a brief if new relevant activity is detected.
        </p>
        
        <div class="flex items-center gap-4 max-w-xs">
          <div class="flex-1 flex flex-col gap-2">
            <label for="briefingTime" class="text-xs font-bold uppercase tracking-wider text-slate-400 font-technical">Delivery Time</label>
            <div class="flex items-center gap-2">
              <i class="pi pi-clock text-slate-400"></i>
              <input 
                id="briefingTime" 
                type="time" 
                v-model="briefingTime"
                class="p-inputtext p-component font-technical w-full"
              />
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
