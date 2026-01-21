import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '../stores/user';
import { useAgent } from '../composables/useAgent';
import { supabase } from '../services/supabase';
import OutcomeCard from '../components/activity/OutcomeCard.vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
const TIME_SAVED_PER_WIN_MINUTES = 15;
const router = useRouter();
const userStore = useUserStore();
const { subscribeToTable } = useAgent();
const threads = ref([]);
const tasks = ref([]);
const loading = ref(true);
const greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12)
        return 'Good morning';
    if (hour < 18)
        return 'Good afternoon';
    return 'Good evening';
});
const stats = computed(() => {
    let autonomousWins = 0;
    let taskEscalations = 0;
    for (const task of tasks.value) {
        if (task.status === 'done')
            autonomousWins++;
        if (task.status === 'escalation')
            taskEscalations++;
    }
    let threadEscalations = 0;
    for (const thread of threads.value) {
        const meta = thread.metadata;
        if (meta?.is_escalation === true)
            threadEscalations++;
    }
    const escalations = taskEscalations + threadEscalations;
    const timeSavedMinutes = autonomousWins * TIME_SAVED_PER_WIN_MINUTES;
    const timeSavedLabel = timeSavedMinutes >= 60
        ? `${(timeSavedMinutes / 60).toFixed(1)}h saved`
        : `${timeSavedMinutes}m saved`;
    return {
        autonomousWins,
        escalations,
        timeSavedLabel
    };
});
const outcomeItems = computed(() => {
    const items = [];
    // Map Tasks (Silent Wins & Escalations)
    tasks.value.forEach(task => {
        let status = 'insight';
        if (task.status === 'done')
            status = 'done';
        else if (task.status === 'escalation')
            status = 'escalation';
        else if (task.status === 'processing')
            status = 'processing';
        else if (task.status === 'error')
            status = 'error';
        else
            status = 'queued';
        const taskPayload = task.payload;
        const taskResult = task.result;
        items.push({
            id: task.id,
            type: 'task',
            title: task.domain_action.split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
            summary: taskResult?.summary || `Action executed: ${task.domain_action}`,
            status,
            agencyTier: taskPayload?.agency_tier || 'Controlled',
            timestamp: new Date(task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            original: task
        });
    });
    // Map Threads (Insights & High-Priority)
    threads.value.forEach(thread => {
        const threadMetadata = thread.metadata;
        const isEscalation = threadMetadata?.is_escalation === true;
        items.push({
            id: thread.id,
            type: 'thread',
            title: threadMetadata?.subject || 'Incoming Communication',
            summary: thread.summary || 'New priority thread detected and classified.',
            status: isEscalation ? 'escalation' : 'insight',
            agencyTier: 'Public', // Threads are usually Public tier until actioned
            timestamp: new Date(thread.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            original: thread
        });
    });
    // Sort by timestamp desc
    return items.sort((a, b) => {
        const aTime = new Date(a.original.created_at).getTime();
        const bTime = new Date(b.original.created_at).getTime();
        return bTime - aTime;
    });
});
async function fetchData() {
    if (!userStore.profile?.organization_id)
        return;
    loading.value = true;
    try {
        const [threadsRes, tasksRes] = await Promise.all([
            supabase
                .from('ingested_threads')
                .select('*')
                .eq('organization_id', userStore.profile.organization_id)
                .order('created_at', { ascending: false })
                .limit(10),
            supabase
                .from('tasks')
                .select('*')
                .eq('organization_id', userStore.profile.organization_id)
                .order('created_at', { ascending: false })
                .limit(10)
        ]);
        if (threadsRes.error)
            throw threadsRes.error;
        if (tasksRes.error)
            throw tasksRes.error;
        threads.value = threadsRes.data;
        tasks.value = tasksRes.data;
    }
    catch (err) {
        console.error('Error fetching dashboard data:', err);
    }
    finally {
        loading.value = false;
    }
}
let cleanupThreads = null;
let cleanupTasks = null;
onMounted(async () => {
    await fetchData();
    cleanupThreads = subscribeToTable('ingested_threads', (payload) => {
        if (payload.eventType === 'INSERT') {
            threads.value = [payload.new, ...threads.value].slice(0, 10);
        }
        else if (payload.eventType === 'UPDATE') {
            threads.value = threads.value.map(t => t.id === payload.new.id ? payload.new : t);
        }
        else if (payload.eventType === 'DELETE') {
            threads.value = threads.value.filter(t => t.id !== payload.old.id);
        }
    });
    cleanupTasks = subscribeToTable('tasks', (payload) => {
        if (payload.eventType === 'INSERT') {
            tasks.value = [payload.new, ...tasks.value].slice(0, 10);
        }
        else if (payload.eventType === 'UPDATE') {
            tasks.value = tasks.value.map(t => t.id === payload.new.id ? payload.new : t);
        }
        else if (payload.eventType === 'DELETE') {
            tasks.value = tasks.value.filter(t => t.id !== payload.old.id);
        }
    });
});
onUnmounted(() => {
    if (cleanupThreads)
        cleanupThreads();
    if (cleanupTasks)
        cleanupTasks();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "space-y-8 p-6 lg:p-10 max-w-7xl mx-auto" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "flex flex-col md:flex-row md:items-end justify-between gap-6" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "space-y-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "text-4xl font-bold text-executive-primary tracking-tight font-sans" },
});
(__VLS_ctx.greeting);
(__VLS_ctx.userStore.profile?.full_name?.split(' ')[0] || 'Executive');
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-slate-500 font-technical text-lg" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex gap-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "px-6 py-3 bg-white border border-slate-200 rounded-executive shadow-sm flex flex-col items-center min-w-[120px]" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-xs font-bold text-slate-400 uppercase tracking-widest font-technical" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-2xl font-bold text-executive-success font-sans" },
});
(__VLS_ctx.stats.autonomousWins);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "px-6 py-3 bg-white border border-slate-200 rounded-executive shadow-sm flex flex-col items-center min-w-[120px]" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-xs font-bold text-slate-400 uppercase tracking-widest font-technical" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-2xl font-bold text-executive-info font-sans" },
});
(__VLS_ctx.stats.timeSavedLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "px-6 py-3 bg-white border border-slate-200 rounded-executive shadow-sm flex flex-col items-center min-w-[120px]" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-xs font-bold text-slate-400 uppercase tracking-widest font-technical" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-2xl font-bold text-executive-warning font-sans" },
});
(__VLS_ctx.stats.escalations);
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" },
    });
    for (const [i] of __VLS_getVForSourceType((6))) {
        const __VLS_0 = {}.Card;
        /** @type {[typeof __VLS_components.Card, ]} */ ;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
            key: (i),
            ...{ class: "h-48 border-none shadow-sm animate-pulse bg-slate-50" },
        }));
        const __VLS_2 = __VLS_1({
            key: (i),
            ...{ class: "h-48 border-none shadow-sm animate-pulse bg-slate-50" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    }
}
else if (__VLS_ctx.outcomeItems.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.outcomeItems))) {
        /** @type {[typeof OutcomeCard, typeof OutcomeCard, ]} */ ;
        // @ts-ignore
        const __VLS_4 = __VLS_asFunctionalComponent(OutcomeCard, new OutcomeCard({
            key: (item.id),
            title: (item.title),
            summary: (item.summary),
            status: (item.status),
            agencyTier: (item.agencyTier),
            timestamp: (item.timestamp),
        }));
        const __VLS_5 = __VLS_4({
            key: (item.id),
            title: (item.title),
            summary: (item.summary),
            status: (item.status),
            agencyTier: (item.agencyTier),
            timestamp: (item.timestamp),
        }, ...__VLS_functionalComponentArgsRest(__VLS_4));
        __VLS_6.slots.default;
        {
            const { actions: __VLS_thisSlot } = __VLS_6.slots;
            if (item.status === 'escalation') {
                const __VLS_7 = {}.Button;
                /** @type {[typeof __VLS_components.Button, ]} */ ;
                // @ts-ignore
                const __VLS_8 = __VLS_asFunctionalComponent(__VLS_7, new __VLS_7({
                    label: "Take Action",
                    icon: "pi pi-bolt",
                    severity: "warning",
                    size: "small",
                    ...{ class: "p-button-technical" },
                }));
                const __VLS_9 = __VLS_8({
                    label: "Take Action",
                    icon: "pi pi-bolt",
                    severity: "warning",
                    size: "small",
                    ...{ class: "p-button-technical" },
                }, ...__VLS_functionalComponentArgsRest(__VLS_8));
            }
            const __VLS_11 = {}.Button;
            /** @type {[typeof __VLS_components.Button, ]} */ ;
            // @ts-ignore
            const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({
                ...{ 'onClick': {} },
                label: "View Trace",
                icon: "pi pi-search",
                text: true,
                size: "small",
                ...{ class: "p-button-technical" },
                disabled: true,
                title: "TODO: Story 3.5 (Reasoning Trace) not yet implemented",
            }));
            const __VLS_13 = __VLS_12({
                ...{ 'onClick': {} },
                label: "View Trace",
                icon: "pi pi-search",
                text: true,
                size: "small",
                ...{ class: "p-button-technical" },
                disabled: true,
                title: "TODO: Story 3.5 (Reasoning Trace) not yet implemented",
            }, ...__VLS_functionalComponentArgsRest(__VLS_12));
            let __VLS_15;
            let __VLS_16;
            let __VLS_17;
            const __VLS_18 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        return;
                    if (!(__VLS_ctx.outcomeItems.length > 0))
                        return;
                    __VLS_ctx.router.push(`/activity?task=${item.id}`);
                }
            };
            var __VLS_14;
        }
        var __VLS_6;
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "bg-white p-12 rounded-executive border border-dashed border-slate-300 flex flex-col items-center justify-center text-center" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center text-4xl mb-6" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
        ...{ class: "pi pi-sparkles text-slate-400" },
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        ...{ class: "text-2xl font-semibold text-executive-primary mb-3 font-sans" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "text-slate-500 font-technical max-w-md" },
    });
    const __VLS_19 = {}.Button;
    /** @type {[typeof __VLS_components.Button, ]} */ ;
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
        ...{ 'onClick': {} },
        label: "Refresh Brief",
        icon: "pi pi-refresh",
        text: true,
        ...{ class: "mt-6" },
    }));
    const __VLS_21 = __VLS_20({
        ...{ 'onClick': {} },
        label: "Refresh Brief",
        icon: "pi pi-refresh",
        text: true,
        ...{ class: "mt-6" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_20));
    let __VLS_23;
    let __VLS_24;
    let __VLS_25;
    const __VLS_26 = {
        onClick: (__VLS_ctx.fetchData)
    };
    var __VLS_22;
}
/** @type {__VLS_StyleScopedClasses['space-y-8']} */ ;
/** @type {__VLS_StyleScopedClasses['p-6']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:p-10']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-7xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['md:flex-row']} */ ;
/** @type {__VLS_StyleScopedClasses['md:items-end']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-6']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-4xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['py-3']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-[120px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-widest']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-success']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['py-3']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-[120px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-widest']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-info']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['py-3']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-[120px]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-widest']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-warning']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-6']} */ ;
/** @type {__VLS_StyleScopedClasses['h-48']} */ ;
/** @type {__VLS_StyleScopedClasses['border-none']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['animate-pulse']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-2']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-6']} */ ;
/** @type {__VLS_StyleScopedClasses['p-button-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['p-button-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['p-12']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-executive']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-dashed']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-300']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['h-20']} */ ;
/** @type {__VLS_StyleScopedClasses['w-20']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-4xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-6']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-sparkles']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-3']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-md']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-6']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            OutcomeCard: OutcomeCard,
            Button: Button,
            Card: Card,
            router: router,
            userStore: userStore,
            loading: loading,
            greeting: greeting,
            stats: stats,
            outcomeItems: outcomeItems,
            fetchData: fetchData,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=Dashboard.vue.js.map