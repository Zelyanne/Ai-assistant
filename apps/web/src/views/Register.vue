<script setup lang="ts">
import { ref } from 'vue';
import { supabase, signInWithGoogle } from '../services/supabase';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Message from 'primevue/message';

const router = useRouter();
const email = ref('');
const password = ref('');
const fullName = ref('');
const loading = ref(false);
const errorMessage = ref('');

const handleRegister = async () => {
  loading.value = true;
  errorMessage.value = '';

  if (password.value.length < 8) {
    errorMessage.value = 'Password must be at least 8 characters long';
    loading.value = false;
    return;
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.value,
      password: password.value,
      options: {
        data: {
          full_name: fullName.value,
        },
      },
    });

    if (error) throw error;

    if (data.user) {
      // Poll for profile creation (trigger latency)
      let retries = 5;
      while (retries > 0) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', data.user.id)
          .single();
        
        if (profile) break;
        await new Promise(r => setTimeout(r, 1000));
        retries--;
      }
    }

    // Redirect to onboarding after successful registration
    router.push('/onboarding');
  } catch (error: any) {
    errorMessage.value = error.message || 'Failed to create account';
  } finally {
    loading.value = false;
  }
};

const handleGoogleLogin = async () => {
  loading.value = true;
  errorMessage.value = '';
  try {
    await signInWithGoogle();
  } catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to sign in with Google. Please try again.';
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
          <h1 class="text-2xl font-bold text-executive-primary tracking-tight">Create Account</h1>
          <p class="text-slate-500 mt-2 text-sm text-center">Join the network of background intelligence</p>
        </div>

        <form @submit.prevent="handleRegister" class="space-y-6">
          <Message v-if="errorMessage" severity="error" variant="simple">{{ errorMessage }}</Message>
          
          <div class="flex flex-col gap-2">
            <label for="fullName" class="text-xs font-semibold uppercase tracking-wider text-slate-500 font-technical">Full Name</label>
            <InputText 
              id="fullName" 
              v-model="fullName" 
              type="text" 
              placeholder="John Doe" 
              required 
              class="w-full font-technical"
              :disabled="loading"
            />
          </div>

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
              toggleMask 
              required 
              fluid
              class="font-technical"
              :disabled="loading"
            />
          </div>

          <Button 
            type="submit" 
            label="Register" 
            :loading="loading" 
            class="w-full py-3"
            severity="contrast"
          />

          <div class="relative my-6">
            <div class="absolute inset-0 flex items-center">
              <span class="w-full border-t border-slate-200"></span>
            </div>
            <div class="relative flex justify-center text-xs uppercase">
              <span class="bg-white px-2 text-slate-500 font-technical">Or continue with</span>
            </div>
          </div>

          <Button 
            type="button"
            label="Google" 
            icon="pi pi-google"
            :loading="loading" 
            class="w-full py-3"
            severity="secondary"
            outlined
            @click="handleGoogleLogin"
          />
        </form>

        <div class="mt-8 pt-8 border-t border-slate-100 text-center space-y-4">
          <p class="text-sm text-slate-600">
            Already have an account? 
            <router-link to="/login" class="text-executive-primary font-semibold hover:underline">Sign In</router-link>
          </p>
          <p class="text-xs text-slate-400">
            Secure enterprise registration governed by PerimeterGuard™
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
