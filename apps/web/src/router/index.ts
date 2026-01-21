import { createRouter, createWebHistory } from 'vue-router';
import { useUserStore } from '../stores/user';
import { supabase } from '../services/supabase';

const routes = [
  {
    path: '/',
    name: 'landing',
    component: () => import('../views/Landing.vue'),
    meta: { public: true }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { public: true }
  },
  {
    path: '/dashboard',
    component: () => import('../components/layout/AppLayout.vue'),
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('../views/Dashboard.vue'),
        meta: { requiresAuth: true }
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('../views/Settings.vue'),
        meta: { requiresAuth: true }
      },
      {
        path: 'brain-setup',
        name: 'brain-setup',
        component: () => import('../views/BrainSetup.vue'),
        meta: { requiresAuth: true }
      },
      {
        path: 'admin',
        name: 'admin',
        component: () => import('../views/AdminHub.vue'),
        meta: { requiresAuth: true, requiresCEO: true }
      }
    ]
  },
  {
    path: '/unauthorized',
    name: 'unauthorized',
    component: { template: '<div class="p-8 text-center"><h1 class="text-2xl font-bold">Permission Denied</h1><p>You do not have access to this page.</p><router-link to="/dashboard" class="text-blue-500 underline">Go back to Dashboard</router-link></div>' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to, _from, next) => {
  const userStore = useUserStore();
  
  // Check Supabase session
  const { data: { session } } = await supabase.auth.getSession();
  const isAuthenticated = !!session;

  if (to.meta.requiresAuth && !isAuthenticated) {
    next({ name: 'login' });
    return;
  }

  if (isAuthenticated && to.name === 'login') {
    next({ name: 'dashboard' });
    return;
  }

  // Ensure profile is loaded if authenticated
  if (isAuthenticated && !userStore.profile) {
    await userStore.fetchProfile();
  }

  if (to.meta.requiresCEO && !userStore.isCEO) {
    next({ name: 'unauthorized' });
    return;
  }

  next();
});

export default router;
