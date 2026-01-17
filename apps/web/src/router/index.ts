import { createRouter, createWebHistory } from 'vue-router';
import { useUserStore } from '../stores/user';

const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: () => import('../views/Dashboard.vue'),
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('../views/AdminHub.vue'),
    meta: { requiresAuth: true, requiresCEO: true },
  },
  {
    path: '/unauthorized',
    name: 'unauthorized',
    component: { template: '<div class="p-8 text-center"><h1 class="text-2xl font-bold">Permission Denied</h1><p>You do not have access to this page.</p><router-link to="/" class="text-blue-500 underline">Go back to Dashboard</router-link></div>' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to, _from, next) => {
  const userStore = useUserStore();
  
  // Ensure profile is loaded if user is authenticated
  if (!userStore.profile) {
    await userStore.fetchProfile();
  }

  if (to.meta.requiresAuth && !userStore.profile) {
    next({ name: 'dashboard' }); // Or login
    return;
  }

  if (to.meta.requiresCEO && !userStore.isCEO) {
    next({ name: 'unauthorized' });
    return;
  }

  next();
});

export default router;
