<script setup lang="ts">
import { ref } from 'vue';
import Button from 'primevue/button';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import { RouterLink } from 'vue-router';

type Tile = {
  title: string;
  description: string;
  icon: string;
  tone?: 'dark' | 'light';
};

const logos = ['Northstar', 'Juniper', 'Arcade', 'Keystone', 'Sable', 'Beacon'] as const;

const bento: Tile[] = [
  {
    title: 'Command Center',
    description: 'One surface for natural language execution — timeline, composer, and threads.',
    icon: 'pi pi-comments',
    tone: 'dark',
  },
  {
    title: 'Safety Controls',
    description: 'Perimeter checks, brakes, and clear escalation boundaries.',
    icon: 'pi pi-shield',
    tone: 'light',
  },
  {
    title: 'Realtime Status',
    description: 'Tasks, execution runs, and messages update live — no refresh loops.',
    icon: 'pi pi-bolt',
    tone: 'light',
  },
  {
    title: 'Audit Trail',
    description: 'Every action is recorded for accountability and review.',
    icon: 'pi pi-book',
    tone: 'light',
  },
  {
    title: 'Org Scoped',
    description: 'Multi-tenant by design with RLS as the source of truth.',
    icon: 'pi pi-sitemap',
    tone: 'light',
  },
];

const faqs = [
  {
    q: 'What is the Command Center?',
    a: 'It is the primary interaction surface: you describe a task in natural language, the system queues work, and you can follow the full trace in realtime.',
  },
  {
    q: 'How do you prevent unsafe actions?',
    a: 'Safety controls can pause or block high-risk execution, and the system records an audit trail to keep outcomes reviewable and accountable.',
  },
  {
    q: 'Is this multi-tenant?',
    a: 'Yes. Data access is scoped to your organization with RLS as the authoritative boundary.',
  },
] as const;

const openFaq = ref<string[]>(['0']);
</script>

<template>
  <div class="min-h-screen bg-executive-background font-sans text-executive-primary">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 rounded-xl bg-white px-4 py-2 text-sm font-semibold shadow-sm ring-2 ring-executive-primary/20"
    >
      Skip to content
    </a>

    <!-- Hero (new layout: dark, centered, bento-first) -->
    <header class="relative overflow-hidden bg-slate-950 text-slate-50">
      <div class="pointer-events-none absolute inset-0">
        <div class="absolute -left-48 -top-48 h-[34rem] w-[34rem] rounded-full bg-indigo-500/25 blur-[120px]" />
        <div class="absolute -right-48 top-[-10rem] h-[34rem] w-[34rem] rounded-full bg-teal-500/20 blur-[120px]" />
        <div class="absolute left-1/2 top-[10rem] h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-slate-400/10 blur-[140px]" />
      </div>

      <nav class="relative z-10 mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <RouterLink
          to="/"
          class="inline-flex items-center gap-3 rounded-xl px-2 py-1 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
        >
          <span class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white font-black">
            A
          </span>
          <span class="text-sm font-bold tracking-tight text-white">AI Assistant</span>
        </RouterLink>

        <div class="flex items-center gap-2">
          <Button
            v-slot="slotProps"
            as-child
            severity="secondary"
            text
            class="!text-white/90"
          >
            <RouterLink
              to="/login"
              v-bind="slotProps.a11yAttrs"
              :class="slotProps.class"
            >
              Login
            </RouterLink>
          </Button>

          <Button
            v-slot="slotProps"
            as-child
            severity="secondary"
            class="!rounded-full !bg-white !text-slate-950 !border-none"
          >
            <RouterLink
              to="/login"
              v-bind="slotProps.a11yAttrs"
              :class="slotProps.class"
            >
              Get Started
            </RouterLink>
          </Button>
        </div>
      </nav>

      <main
        id="main"
        class="relative z-10"
        tabindex="-1"
      >
        <section class="mx-auto max-w-6xl px-6 pb-16 pt-14 md:pb-20 md:pt-20">
          <div class="mx-auto max-w-3xl text-center">
            <div class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">
              <span
                class="inline-flex h-2 w-2 rounded-full bg-emerald-400 motion-safe:animate-pulse"
                aria-hidden="true"
              />
              Gemini-like command experience
            </div>

            <h1 class="mt-6 text-pretty text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
              Calm execution.
              <span class="bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-indigo-200 to-teal-200">Visible trace.</span>
              Safer outcomes.
            </h1>

            <p class="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-white/75 md:text-lg">
              A focused surface for natural language operations — backed by queue-based execution, realtime status, and an audit trail.
            </p>

            <div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                v-slot="slotProps"
                as-child
                severity="secondary"
                class="!rounded-full !bg-white !text-slate-950 !border-none !px-8"
              >
                <RouterLink
                  to="/login"
                  v-bind="slotProps.a11yAttrs"
                  :class="slotProps.class"
                >
                  Open Command Center
                </RouterLink>
              </Button>

              <Button
                v-slot="slotProps"
                as-child
                severity="secondary"
                outlined
                class="!rounded-full !border-white/25 !text-white !px-8"
              >
                <a
                  href="#bento"
                  v-bind="slotProps.a11yAttrs"
                  :class="slotProps.class"
                >
                  See the System
                </a>
              </Button>
            </div>

            <div class="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-white/60">
              <span class="text-white/50">Trusted by teams like</span>
              <span
                v-for="name in logos"
                :key="name"
                class="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-semibold"
              >
                {{ name }}
              </span>
            </div>
          </div>
        </section>

        <section
          id="bento"
          class="mx-auto max-w-6xl px-6 pb-16 md:pb-20"
        >
          <div class="grid gap-4 md:grid-cols-12">
            <div class="md:col-span-7">
              <div class="h-full rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-8">
                <div class="flex items-center gap-3">
                  <span
                    class="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10"
                    aria-hidden="true"
                  >
                    <i
                      class="pi pi-sparkles"
                      aria-hidden="true"
                    />
                  </span>
                  <div>
                    <div class="text-xs font-bold uppercase tracking-[0.22em] text-white/70">
                      Bento layout
                    </div>
                    <div class="text-lg font-bold">
                      Everything important, at a glance.
                    </div>
                  </div>
                </div>

                <div class="mt-8 grid gap-4 sm:grid-cols-2">
                  <div
                    v-for="tile in bento"
                    :key="tile.title"
                    class="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 transition-colors hover:bg-white/10"
                  >
                    <div class="flex items-start gap-3">
                      <span
                        class="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10"
                        aria-hidden="true"
                      >
                        <i
                          :class="tile.icon"
                          aria-hidden="true"
                        />
                      </span>
                      <div class="min-w-0">
                        <div class="text-sm font-bold text-white">
                          {{ tile.title }}
                        </div>
                        <p class="mt-2 text-sm leading-relaxed text-white/70">
                          {{ tile.description }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="md:col-span-5 grid gap-4">
              <div class="rounded-[2rem] border border-white/10 bg-white/5 p-7">
                <div class="text-xs font-bold uppercase tracking-[0.22em] text-white/70">
                  How it works
                </div>
                <h2 class="mt-3 text-2xl font-black tracking-tight">
                  A short loop to shipped outcomes.
                </h2>

                <ol class="mt-6 space-y-4">
                  <li class="flex gap-3">
                    <span class="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-bold">1</span>
                    <div>
                      <div class="text-sm font-semibold">
                        Write a command
                      </div>
                      <div class="text-sm text-white/70">
                        Natural language, specific intent.
                      </div>
                    </div>
                  </li>
                  <li class="flex gap-3">
                    <span class="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-bold">2</span>
                    <div>
                      <div class="text-sm font-semibold">
                        Queue execution
                      </div>
                      <div class="text-sm text-white/70">
                        Postgres-backed tasks, realtime status.
                      </div>
                    </div>
                  </li>
                  <li class="flex gap-3">
                    <span class="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-bold">3</span>
                    <div>
                      <div class="text-sm font-semibold">
                        Review the trace
                      </div>
                      <div class="text-sm text-white/70">
                        Audit logging keeps it accountable.
                      </div>
                    </div>
                  </li>
                </ol>
              </div>

              <div class="rounded-[2rem] border border-white/10 bg-gradient-to-br from-indigo-500/20 via-white/5 to-transparent p-7">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <div class="text-xs font-bold uppercase tracking-[0.22em] text-white/70">
                      Built-in posture
                    </div>
                    <div class="mt-2 text-lg font-bold">
                      Safety isn’t an add-on.
                    </div>
                    <p class="mt-3 text-sm leading-relaxed text-white/70">
                      Perimeter checks and braking controls keep high-risk actions reviewable.
                    </p>
                  </div>
                  <span
                    class="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10"
                    aria-hidden="true"
                  >
                    <i
                      class="pi pi-lock"
                      aria-hidden="true"
                    />
                  </span>
                </div>

                <div class="mt-6 flex flex-wrap gap-2 text-xs text-white/70">
                  <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1">Perimeter</span>
                  <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1">Brake</span>
                  <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1">Escalation</span>
                  <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1">Audit</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </header>

    <!-- Light sections (new layout: distinct from previous) -->
    <section class="mx-auto max-w-6xl px-6 py-16 md:py-20">
      <div class="grid gap-6 md:grid-cols-3">
        <div class="rounded-[2rem] border border-slate-200 bg-white p-7">
          <div class="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
            Designed for
          </div>
          <div class="mt-3 text-lg font-black tracking-tight">
            Leaders
          </div>
          <p class="mt-2 text-sm leading-relaxed text-slate-600">
            See what’s happening without chasing updates.
          </p>
        </div>
        <div class="rounded-[2rem] border border-slate-200 bg-white p-7">
          <div class="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
            Designed for
          </div>
          <div class="mt-3 text-lg font-black tracking-tight">
            Operators
          </div>
          <p class="mt-2 text-sm leading-relaxed text-slate-600">
            Queue work quickly, monitor status, and keep focus.
          </p>
        </div>
        <div class="rounded-[2rem] border border-slate-200 bg-white p-7">
          <div class="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
            Designed for
          </div>
          <div class="mt-3 text-lg font-black tracking-tight">
            Builders
          </div>
          <p class="mt-2 text-sm leading-relaxed text-slate-600">
            RLS boundaries and durable tasks make systems legible.
          </p>
        </div>
      </div>
    </section>

    <section class="border-y border-white/50 bg-white/60">
      <div class="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <div class="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:items-start">
          <div class="space-y-3">
            <div class="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
              FAQ
            </div>
            <h2 class="text-2xl font-black tracking-tight md:text-3xl">
              Common questions.
            </h2>
            <p class="text-sm leading-relaxed text-slate-600">
              Short answers. Clear defaults.
            </p>

            <div class="mt-6">
              <Button
                v-slot="slotProps"
                as-child
                severity="contrast"
                class="!rounded-full !px-8"
              >
                <RouterLink
                  to="/login"
                  v-bind="slotProps.a11yAttrs"
                  :class="slotProps.class"
                >
                  Try it now
                </RouterLink>
              </Button>
            </div>
          </div>

          <div class="rounded-[2rem] border border-slate-200 bg-white p-2">
            <Accordion
              v-model:value="openFaq"
              multiple
              class="!border-none"
            >
              <AccordionPanel
                v-for="(item, idx) in faqs"
                :key="item.q"
                :value="String(idx)"
              >
                <AccordionHeader>
                  <span class="text-sm font-semibold">{{ item.q }}</span>
                </AccordionHeader>
                <AccordionContent>
                  <p class="m-0 text-sm leading-relaxed text-slate-600">
                    {{ item.a }}
                  </p>
                </AccordionContent>
              </AccordionPanel>
            </Accordion>
          </div>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-6xl px-6 py-16 md:py-20">
      <div class="rounded-[2.25rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-8 py-10 text-slate-50">
        <div class="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)] md:items-center">
          <div class="space-y-3">
            <div class="text-xs font-bold uppercase tracking-[0.22em] text-slate-300">
              Final CTA
            </div>
            <h2 class="text-2xl font-black tracking-tight md:text-3xl">
              Open the Command Center.
            </h2>
            <p class="text-sm leading-relaxed text-slate-200">
              Start with one message. Keep execution calm. Keep outcomes visible.
            </p>
          </div>

          <div class="flex flex-col gap-3">
            <Button
              v-slot="slotProps"
              as-child
              severity="secondary"
              class="!rounded-full !bg-white !text-slate-950 !border-none"
            >
              <RouterLink
                to="/login"
                v-bind="slotProps.a11yAttrs"
                :class="slotProps.class"
              >
                Get Started
              </RouterLink>
            </Button>
            <div class="text-xs text-slate-300">
              No new dependencies. Lightweight gradients. Intentional motion.
            </div>
          </div>
        </div>
      </div>

      <footer class="mt-10 flex flex-col gap-4 border-t border-white/40 pt-8 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
        <div>© 2026 AI Assistant</div>
        <div class="flex flex-wrap gap-x-6 gap-y-2">
          <span>Privacy</span>
          <span>Terms</span>
          <span>Security</span>
        </div>
      </footer>
    </section>
  </div>
</template>
