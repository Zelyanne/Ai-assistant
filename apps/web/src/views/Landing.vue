<script setup lang="ts">
import Button from 'primevue/button';
import Card from 'primevue/card';
import { useRouter } from 'vue-router';

const router = useRouter();

const features = [
  {
    title: 'Autonomous Triage',
    description: 'The engine handles routine follow-ups and coordination while you sleep.',
    icon: '🧠',
    color: 'bg-teal-50',
    iconColor: 'text-teal-600',
    border: 'border-teal-100'
  },
  {
    title: 'Agency Perimeters',
    description: 'Define exactly where the AI can act and where it must escalate to you.',
    icon: '🛡️',
    color: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    border: 'border-indigo-100'
  },
  {
    title: 'Source Citations',
    description: 'Every assertion includes deep-links to original sources for total verifiability.',
    icon: '🔗',
    color: 'bg-blue-50',
    iconColor: 'text-blue-600',
    border: 'border-blue-100'
  }
];

const navigateToLogin = () => {
  router.push('/login');
};
</script>

<template>
  <div class="min-h-screen bg-executive-background font-sans text-executive-primary selection:bg-executive-primary/10 relative overflow-hidden">
    <!-- Background Decorative Elements (Subtle Depth) -->
    <div class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-200/20 blur-[120px] rounded-full -z-10 animate-pulse"></div>
    <div class="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-teal-200/20 blur-[100px] rounded-full -z-10"></div>

    <!-- Navigation -->
    <nav class="h-20 flex items-center justify-between px-8 lg:px-16 bg-white/60 backdrop-blur-xl sticky top-0 z-50 border-b border-white/20 shadow-sm">
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 bg-gradient-to-br from-executive-primary to-slate-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <span class="text-white font-bold text-xl">A</span>
        </div>
        <span class="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-executive-primary to-slate-600">AI Assistant</span>
      </div>
      <div class="flex items-center gap-6">
        <Button label="Login" severity="secondary" text @click="navigateToLogin" class="!font-medium" />
        <Button label="Get Started" severity="contrast" class="!px-6 !rounded-full shadow-md hover:shadow-lg transition-shadow" @click="navigateToLogin" />
      </div>
    </nav>

    <!-- Hero Section -->
    <section class="py-20 lg:py-32 px-8 lg:px-16 flex flex-col items-center text-center relative">
      <div class="max-w-4xl space-y-10 relative z-10">
        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/50 backdrop-blur-sm border border-white shadow-sm text-executive-primary text-xs font-bold uppercase tracking-widest">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-executive-success opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-executive-success"></span>
          </span>
          Next-Gen Chief of Staff
        </div>
        
        <h1 class="text-6xl lg:text-8xl font-black leading-[1.05] tracking-tight text-executive-primary">
          Background <span class="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-indigo-500 to-teal-500">Intelligence.</span><br />
          <span class="text-slate-400/70">Foreground Simplicity.</span>
        </h1>
        
        <p class="text-lg lg:text-xl text-slate-500/90 max-w-2xl mx-auto font-technical leading-relaxed">
          Reclaim your strategic focus. Ai assistant orchestrates your operational momentum autonomously, mirroring your unique leadership style.
        </p>

        <div class="flex flex-col sm:flex-row items-center justify-center gap-5 pt-6">
          <Button label="Experience the Hub" severity="contrast" class="!px-10 !py-4 !text-lg !rounded-full shadow-xl shadow-executive-primary/20 hover:-translate-y-0.5 transition-transform" @click="navigateToLogin" />
          <Button label="Watch the Vision" severity="secondary" outlined class="!px-10 !py-4 !text-lg !rounded-full bg-white/30 backdrop-blur-sm" />
        </div>
      </div>

      <!-- Hero Visual (Glassmorphism & Depth) -->
      <div class="mt-20 w-full max-w-5xl aspect-[16/10] rounded-[2.5rem] bg-gradient-to-b from-white to-slate-50 border border-white shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] overflow-hidden relative group">
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(51,65,85,0.03),transparent)]"></div>
          <div class="text-slate-300 font-technical text-sm flex flex-col items-center gap-4">
            <div class="w-20 h-20 rounded-full border-4 border-slate-100 border-t-indigo-300 animate-spin"></div>
            Morning Brief Interface Preview
          </div>
        </div>
        
        <!-- Floating UI Mockup Elements -->
        <div class="absolute top-12 left-12 w-72 h-40 bg-white/80 backdrop-blur-md border border-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] transform -rotate-2 group-hover:rotate-0 group-hover:scale-105 transition-all duration-700 p-6 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-600 font-bold">✓</div>
            <div class="h-3 w-32 bg-slate-100 rounded-full"></div>
          </div>
          <div class="space-y-2">
            <div class="h-2 w-full bg-slate-100/50 rounded-full"></div>
            <div class="h-2 w-4/5 bg-slate-100/50 rounded-full"></div>
          </div>
        </div>
        
        <div class="absolute bottom-16 right-16 w-80 h-56 bg-white/90 backdrop-blur-md border border-white rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.08)] transform rotate-3 group-hover:rotate-0 group-hover:scale-105 transition-all duration-700 p-8">
          <div class="h-4 w-40 bg-indigo-500/10 rounded-full mb-6"></div>
          <div class="space-y-3">
            <div class="h-2.5 w-full bg-slate-100 rounded-full"></div>
            <div class="h-2.5 w-full bg-slate-100 rounded-full"></div>
            <div class="h-2.5 w-2/3 bg-slate-100 rounded-full"></div>
          </div>
        </div>
      </div>

      <!-- Subtle Trusted By -->
      <div class="mt-24 flex flex-col items-center gap-8 opacity-40 grayscale contrast-125">
        <p class="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Architected for Industry Leaders</p>
        <div class="flex flex-wrap justify-center gap-x-16 gap-y-8 text-xl font-black italic tracking-tighter">
          <span>FORBES</span>
          <span>TECHCRUNCH</span>
          <span>WIRED</span>
          <span>FORTUNE</span>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="py-32 bg-white relative">
      <!-- Decorative background for section transition -->
      <div class="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-executive-background to-white"></div>
      
      <div class="max-w-6xl mx-auto space-y-20 relative px-8">
        <div class="text-center space-y-5">
          <h2 class="text-4xl lg:text-5xl font-bold tracking-tight text-executive-primary">Designed for Executive Momentum</h2>
          <p class="text-slate-500 max-w-xl mx-auto text-lg font-technical">The digital partner that handles the coordination, so you can lead the vision.</p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-10">
          <Card v-for="feature in features" :key="feature.title" 
            class="!border-none !shadow-none !bg-transparent hover:-translate-y-2 transition-all duration-300">
            <template #content>
              <div :class="['space-y-6 p-10 rounded-[2rem] border transition-all duration-300 group', feature.color, feature.border, 'hover:shadow-xl hover:shadow-indigo-500/5']">
                <div :class="['w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-sm bg-white', feature.iconColor]">
                  {{ feature.icon }}
                </div>
                <div class="space-y-3">
                  <h3 class="text-2xl font-bold text-executive-primary">{{ feature.title }}</h3>
                  <p class="text-slate-600 font-technical leading-relaxed">{{ feature.description }}</p>
                </div>
              </div>
            </template>
          </Card>
        </div>
      </div>
    </section>

    <!-- Trust / Call to Action -->
    <section class="py-32 px-8 lg:px-16 bg-slate-50/50">
      <div class="max-w-6xl mx-auto space-y-24">
        <!-- Testimonial -->
        <div class="text-center max-w-3xl mx-auto space-y-8">
          <div class="text-5xl text-indigo-200">“</div>
          <h3 class="text-3xl lg:text-4xl font-medium italic leading-snug text-executive-primary tracking-tight">
            The first AI tool that actually reduces my mental checklist instead of adding to it.
          </h3>
          <div class="flex flex-col items-center gap-2">
            <div class="text-sm font-black uppercase tracking-widest text-executive-primary">Sarah Chen</div>
            <div class="text-xs font-bold text-slate-400 uppercase tracking-widest">CEO, Scaling Fintech</div>
          </div>
        </div>
        
        <!-- Big CTA -->
        <div class="relative overflow-hidden bg-executive-primary rounded-[3rem] p-12 lg:p-20 text-white shadow-2xl shadow-indigo-900/40">
          <!-- Background accent for CTA -->
          <div class="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-indigo-400/10 to-transparent"></div>
          
          <div class="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12">
            <div class="space-y-6 max-w-xl text-center lg:text-left">
              <h2 class="text-4xl lg:text-5xl font-bold leading-tight">Ready to offload the routine?</h2>
              <p class="text-indigo-100 text-lg font-technical">Join the private beta for SME leaders and reclaim your focus.</p>
            </div>
            
            <div class="flex flex-col gap-4 w-full lg:w-auto min-w-[320px]">
              <Button label="Request Private Beta Access" severity="secondary" class="!w-full !rounded-full !py-4 !bg-white !text-executive-primary !border-none !text-lg !font-bold shadow-lg" />
              <p class="text-center text-xs text-indigo-300 font-technical">Limited to 50 organizations per cohort.</p>
            </div>
          </div>
        </div>
      </div>
      
      <footer class="mt-32 pt-12 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6 text-xs text-slate-400 font-technical uppercase tracking-widest">
        <div>© 2026 AI Assistant. Built for high-agency leadership.</div>
        <div class="flex gap-10">
          <a href="#" class="hover:text-executive-primary transition-colors">Privacy</a>
          <a href="#" class="hover:text-executive-primary transition-colors">Agency Terms</a>
          <a href="#" class="hover:text-executive-primary transition-colors">Security</a>
        </div>
      </footer>
    </section>
  </div>
</template>
