import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { definePreset } from '@primevue/themes';
import Aura from '@primevue/themes/aura';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import Tooltip from 'primevue/tooltip';
import App from './App.vue';
import router from './router';
import 'primeicons/primeicons.css';
import './style.css';
const ExecutivePreset = definePreset(Aura, {
    primitive: {
        teal: {
            600: '#059669' // Success: Deep Teal
        },
        amber: {
            600: '#D97706' // Warning: Muted Amber
        },
        blue: {
            600: '#2563EB' // Info: Clear Blue
        }
    },
    semantic: {
        primary: {
            50: '#f8fafc',
            100: '#f1f5f9',
            200: '#e2e8f0',
            300: '#cbd5e1',
            400: '#94a3b8',
            500: '#64748b',
            600: '#475569',
            700: '#334155', // Executive Primary (Indigo/Slate)
            800: '#1e293b',
            900: '#0f172a',
            950: '#020617'
        },
        success: {
            color: '{teal.600}'
        },
        warning: {
            color: '{amber.600}'
        },
        info: {
            color: '{blue.600}'
        },
        colorScheme: {
            light: {
                surface: {
                    0: '#ffffff',
                    50: '#F1F5F9', // Background: Soft Grey
                    100: '#f1f5f9',
                    200: '#e2e8f0',
                    300: '#cbd5e1',
                    400: '#94a3b8',
                    500: '#64748b',
                    600: '#475569',
                    700: '#334155',
                    800: '#1e293b',
                    900: '#0f172a',
                    950: '#020617'
                },
                primary: {
                    color: '#334155',
                    inverseColor: '#ffffff',
                    hoverColor: '#1e293b',
                    activeColor: '#0f172a'
                }
            }
        }
    }
});
const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(ToastService);
app.use(ConfirmationService);
app.directive('tooltip', Tooltip);
app.use(PrimeVue, {
    theme: {
        preset: ExecutivePreset,
        options: {
            darkModeSelector: '.dark-mode',
            cssLayer: {
                name: 'primevue',
                order: 'tailwind-base, primevue, tailwind-utilities'
            }
        }
    }
});
app.mount('#app');
//# sourceMappingURL=main.js.map