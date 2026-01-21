<script setup lang="ts">
import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Message from 'primevue/message';

const router = useRouter();
const email = ref('');
const password = ref('');
const loading = ref(false);
const errorMessage = ref('');

const handleLogin = async () => {
  loading.value = true;
  errorMessage.value = '';
  
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    });

    if (error) throw error;
    
    router.push('/dashboard');
  } catch (error: any) {
    errorMessage.value = error.message || 'Failed to sign in';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-executive-background flex items-center justify-center p-6 font-sans">
    <div class="w-full max-w-md bg-white rounded-executive shadow-sm border border-slate-200 overflow-hidden">
      <div class="p-8">
        <div class="flex flex-col items-center mb-10">
          <div class="h-12 w-12 bg-executive-primary rounded-xl flex items-center justify-center mb-4 shadow-sm">
            <span class="text-white text-2xl font-bold">A</span>
          </div>
          <h1 class="text-2xl font-bold text-executive-primary tracking-tight">AI Assistant</h1>
          <p class="text-slate-500 mt-2 text-sm">Background Intelligence, Foreground Simplicity</p>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-6">
          <Message v-if="errorMessage" severity="error" variant="simple">{{ errorMessage }}</Message>
          
          <div class="flex flex-col gap-2">
            <label for="email" class="text-xs font-semibold uppercase tracking-wider text-slate-500 font-technical">Email Address</label>
            <InputText 
              id="email" 
              v-model="email" 
              type="email" 
              placeholder="name@company.com" 
              required 
              class="w-full font-technical"
              :disabled="loading"
            />
          </div>

          <div class="flex flex-col gap-2">
            <label for="password" class="text-xs font-semibold uppercase tracking-wider text-slate-500 font-technical">Password</label>
            <Password 
              id="password" 
              v-model="password" 
              placeholder="••••••••" 
              :feedback="false" 
              toggleMask 
              required 
              fluid
              class="font-technical"
              :disabled="loading"
            />
          </div>

          <Button 
            type="submit" 
            label="Sign In" 
            :loading="loading" 
            class="w-full py-3"
            severity="contrast"
          />
        </form>

        <div class="mt-8 pt-8 border-t border-slate-100 text-center">
          <p class="text-xs text-slate-400">
            Secure enterprise access governed by PerimeterGuard™
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
