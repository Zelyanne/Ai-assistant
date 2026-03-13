import { ref, onMounted, onUnmounted, watch } from "vue";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import InputText from "primevue/inputtext";
import Button from "primevue/button";
import Badge from "primevue/badge";
import Tag from "primevue/tag";
import ReasoningTracePane from "../components/activity/ReasoningTracePane.vue";
import { supabase } from "../services/supabase";
// State
const logs = ref([]);
const loading = ref(true);
const totalRecords = ref(0);
const drawerVisible = ref(false);
const selectedTaskId = ref(null);
// Pagination & Filtering
const currentPage = ref(0);
const rowsPerPage = ref(15);
const filters = ref({
    action_taken: "",
    task_id: "",
});
const primeFilters = ref({}); // Empty object for primevue structure
// Realtime subscription
let subscription = null;
// Methods
const fetchLogs = async () => {
    loading.value = true;
    try {
        const from = currentPage.value * rowsPerPage.value;
        const to = from + rowsPerPage.value - 1;
        let query = supabase
            .from("agent_activity_log")
            .select("*", { count: "exact" });
        // Apply custom filters
        if (filters.value.action_taken) {
            query = query.ilike("action_taken", `%${filters.value.action_taken}%`);
        }
        if (filters.value.task_id) {
            query = query.eq("task_id", filters.value.task_id);
        }
        const { data, error, count } = await query
            .order("created_at", { ascending: false })
            .range(from, to);
        if (error)
            throw error;
        logs.value = data;
        if (count !== null) {
            totalRecords.value = count;
        }
    }
    catch (error) {
        console.error("Error fetching audit logs:", error);
    }
    finally {
        loading.value = false;
    }
};
const setupRealtime = () => {
    subscription = supabase
        .channel("audit-logs-channel")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_activity_log" }, (payload) => {
        // If we're on the first page and filters match, unshift the new log
        if (currentPage.value === 0) {
            const newLog = payload.new;
            // Check if it matches current filters
            const matchesAction = !filters.value.action_taken ||
                newLog.action_taken
                    .toLowerCase()
                    .includes(filters.value.action_taken.toLowerCase());
            const matchesTask = !filters.value.task_id || newLog.task_id === filters.value.task_id;
            if (matchesAction && matchesTask) {
                logs.value.unshift(newLog);
                // Remove last item if we exceed page size to maintain consistent view
                if (logs.value.length > rowsPerPage.value) {
                    logs.value.pop();
                }
                totalRecords.value += 1;
            }
        }
        else {
            // Just update the total count if we're on a different page
            totalRecords.value += 1;
        }
    })
        .subscribe();
};
const onPage = (event) => {
    currentPage.value = event.page;
    rowsPerPage.value = event.rows;
    fetchLogs();
};
const clearFilters = () => {
    filters.value = { action_taken: "", task_id: "" };
    currentPage.value = 0;
    fetchLogs();
};
const onRowClick = (event) => {
    if (event.data.task_id) {
        selectedTaskId.value = event.data.task_id;
        drawerVisible.value = true;
    }
};
// Debounce filter changes
let filterTimeout = null;
watch(filters, () => {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
        currentPage.value = 0;
        fetchLogs();
    }, 500);
}, { deep: true });
// Formatting Helpers
const formatDateTime = (dateStr) => {
    return new Date(dateStr).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
};
const truncateId = (id) => {
    if (!id)
        return "";
    return `${id.substring(0, 8)}...${id.substring(id.length - 4)}`;
};
const getActionIcon = (action) => {
    const map = {
        task_completed: "pi pi-check-circle text-green-500",
        task_error: "pi pi-times-circle text-red-500",
        task_escalation: "pi pi-exclamation-circle text-amber-500",
        task_paused: "pi pi-pause-circle text-blue-500",
    };
    return map[action] || "pi pi-info-circle text-surface-400";
};
const rowClass = () => "cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors";
// Lifecycle
onMounted(() => {
    fetchLogs();
    setupRealtime();
});
onUnmounted(() => {
    if (subscription) {
        supabase.removeChannel(subscription);
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "audit-log-container p-6 w-full max-w-7xl mx-auto flex flex-col gap-6" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-section flex flex-col gap-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "text-2xl font-semibold text-surface-900 dark:text-surface-0 flex items-center gap-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
    ...{ class: "pi pi-shield text-indigo-600 dark:text-indigo-400" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-surface-600 dark:text-surface-400" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "filters-card bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-4 flex flex-wrap gap-4 items-end" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-2 flex-grow max-w-xs" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    for: "actionFilter",
    ...{ class: "text-sm font-medium text-surface-700 dark:text-surface-300" },
});
const __VLS_0 = {}.InputText;
/** @type {[typeof __VLS_components.InputText, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    id: "actionFilter",
    modelValue: (__VLS_ctx.filters.action_taken),
    placeholder: "Filter by action (e.g., task_completed)",
}));
const __VLS_2 = __VLS_1({
    id: "actionFilter",
    modelValue: (__VLS_ctx.filters.action_taken),
    placeholder: "Filter by action (e.g., task_completed)",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-2 flex-grow max-w-xs" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    for: "taskFilter",
    ...{ class: "text-sm font-medium text-surface-700 dark:text-surface-300" },
});
const __VLS_4 = {}.InputText;
/** @type {[typeof __VLS_components.InputText, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    id: "taskFilter",
    modelValue: (__VLS_ctx.filters.task_id),
    placeholder: "Filter by specific task ID",
}));
const __VLS_6 = __VLS_5({
    id: "taskFilter",
    modelValue: (__VLS_ctx.filters.task_id),
    placeholder: "Filter by specific task ID",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex gap-2 ml-auto" },
});
const __VLS_8 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ 'onClick': {} },
    label: "Clear",
    icon: "pi pi-filter-slash",
    severity: "secondary",
    outlined: true,
}));
const __VLS_10 = __VLS_9({
    ...{ 'onClick': {} },
    label: "Clear",
    icon: "pi pi-filter-slash",
    severity: "secondary",
    outlined: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
let __VLS_12;
let __VLS_13;
let __VLS_14;
const __VLS_15 = {
    onClick: (__VLS_ctx.clearFilters)
};
var __VLS_11;
const __VLS_16 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    ...{ 'onClick': {} },
    label: "Refresh",
    icon: "pi pi-refresh",
    loading: (__VLS_ctx.loading),
}));
const __VLS_18 = __VLS_17({
    ...{ 'onClick': {} },
    label: "Refresh",
    icon: "pi pi-refresh",
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
let __VLS_20;
let __VLS_21;
let __VLS_22;
const __VLS_23 = {
    onClick: (__VLS_ctx.fetchLogs)
};
var __VLS_19;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "table-card bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl overflow-hidden shadow-sm" },
});
const __VLS_24 = {}.DataTable;
/** @type {[typeof __VLS_components.DataTable, typeof __VLS_components.DataTable, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    ...{ 'onPage': {} },
    ...{ 'onRowClick': {} },
    filters: (__VLS_ctx.primeFilters),
    value: (__VLS_ctx.logs),
    loading: (__VLS_ctx.loading),
    paginator: (true),
    rows: (15),
    totalRecords: (__VLS_ctx.totalRecords),
    lazy: (true),
    filterDisplay: "menu",
    dataKey: "id",
    ...{ class: "audit-table" },
    stripedRows: true,
    hoverableRows: true,
    rowClass: (__VLS_ctx.rowClass),
}));
const __VLS_26 = __VLS_25({
    ...{ 'onPage': {} },
    ...{ 'onRowClick': {} },
    filters: (__VLS_ctx.primeFilters),
    value: (__VLS_ctx.logs),
    loading: (__VLS_ctx.loading),
    paginator: (true),
    rows: (15),
    totalRecords: (__VLS_ctx.totalRecords),
    lazy: (true),
    filterDisplay: "menu",
    dataKey: "id",
    ...{ class: "audit-table" },
    stripedRows: true,
    hoverableRows: true,
    rowClass: (__VLS_ctx.rowClass),
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
let __VLS_28;
let __VLS_29;
let __VLS_30;
const __VLS_31 = {
    onPage: (__VLS_ctx.onPage)
};
const __VLS_32 = {
    onRowClick: (__VLS_ctx.onRowClick)
};
__VLS_27.slots.default;
{
    const { empty: __VLS_thisSlot } = __VLS_27.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-center p-8 text-surface-500" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
        ...{ class: "pi pi-inbox text-4xl mb-4 text-surface-300 dark:text-surface-600 block" },
    });
}
{
    const { loading: __VLS_thisSlot } = __VLS_27.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-center p-8 text-surface-500" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
        ...{ class: "pi pi-spin pi-spinner text-4xl mb-4 text-indigo-500 block" },
    });
}
const __VLS_33 = {}.Column;
/** @type {[typeof __VLS_components.Column, typeof __VLS_components.Column, ]} */ ;
// @ts-ignore
const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
    field: "created_at",
    header: "Timestamp",
    sortable: (false),
}));
const __VLS_35 = __VLS_34({
    field: "created_at",
    header: "Timestamp",
    sortable: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_34));
__VLS_36.slots.default;
{
    const { body: __VLS_thisSlot } = __VLS_36.slots;
    const [{ data }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-mono text-sm" },
    });
    (__VLS_ctx.formatDateTime(data.created_at));
}
var __VLS_36;
const __VLS_37 = {}.Column;
/** @type {[typeof __VLS_components.Column, typeof __VLS_components.Column, ]} */ ;
// @ts-ignore
const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
    field: "agent_id",
    header: "Actor",
    sortable: (false),
}));
const __VLS_39 = __VLS_38({
    field: "agent_id",
    header: "Actor",
    sortable: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_38));
__VLS_40.slots.default;
{
    const { body: __VLS_thisSlot } = __VLS_40.slots;
    const [{ data }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_41 = {}.Badge;
    /** @type {[typeof __VLS_components.Badge, ]} */ ;
    // @ts-ignore
    const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
        value: (data.agent_id === 'agent-controller' ? 'System' : 'User'),
        severity: (data.agent_id === 'agent-controller' ? 'info' : 'secondary'),
        ...{ class: "mr-2" },
    }));
    const __VLS_43 = __VLS_42({
        value: (data.agent_id === 'agent-controller' ? 'System' : 'User'),
        severity: (data.agent_id === 'agent-controller' ? 'info' : 'secondary'),
        ...{ class: "mr-2" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_42));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "text-sm truncate max-w-[120px] inline-block align-bottom" },
        title: (data.agent_id),
    });
    (data.agent_id);
}
var __VLS_40;
const __VLS_45 = {}.Column;
/** @type {[typeof __VLS_components.Column, typeof __VLS_components.Column, ]} */ ;
// @ts-ignore
const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({
    field: "action_taken",
    header: "Action Taken",
    sortable: (false),
}));
const __VLS_47 = __VLS_46({
    field: "action_taken",
    header: "Action Taken",
    sortable: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_46));
__VLS_48.slots.default;
{
    const { body: __VLS_thisSlot } = __VLS_48.slots;
    const [{ data }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex items-center gap-2" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
        ...{ class: (__VLS_ctx.getActionIcon(data.action_taken)) },
        ...{ class: "text-surface-500" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "font-medium text-surface-900 dark:text-surface-100" },
    });
    (data.action_taken);
}
var __VLS_48;
const __VLS_49 = {}.Column;
/** @type {[typeof __VLS_components.Column, typeof __VLS_components.Column, ]} */ ;
// @ts-ignore
const __VLS_50 = __VLS_asFunctionalComponent(__VLS_49, new __VLS_49({
    field: "task_id",
    header: "Task ID",
    sortable: (false),
}));
const __VLS_51 = __VLS_50({
    field: "task_id",
    header: "Task ID",
    sortable: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_50));
__VLS_52.slots.default;
{
    const { body: __VLS_thisSlot } = __VLS_52.slots;
    const [{ data }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (data.task_id) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "font-mono text-xs bg-surface-100 dark:bg-surface-800 px-2 py-1 rounded text-surface-600 dark:text-surface-400" },
        });
        (__VLS_ctx.truncateId(data.task_id));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-surface-400 italic text-sm" },
        });
    }
}
var __VLS_52;
const __VLS_53 = {}.Column;
/** @type {[typeof __VLS_components.Column, typeof __VLS_components.Column, ]} */ ;
// @ts-ignore
const __VLS_54 = __VLS_asFunctionalComponent(__VLS_53, new __VLS_53({
    header: "Evidence",
    sortable: (false),
    alignFrozen: "right",
}));
const __VLS_55 = __VLS_54({
    header: "Evidence",
    sortable: (false),
    alignFrozen: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_54));
__VLS_56.slots.default;
{
    const { body: __VLS_thisSlot } = __VLS_56.slots;
    const [{ data }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex gap-2" },
    });
    const __VLS_57 = {}.Tag;
    /** @type {[typeof __VLS_components.Tag, ]} */ ;
    // @ts-ignore
    const __VLS_58 = __VLS_asFunctionalComponent(__VLS_57, new __VLS_57({
        severity: (data.reasoning_trace?.length ? 'success' : 'secondary'),
        value: (`${data.reasoning_trace?.length || 0} Steps`),
        rounded: true,
    }));
    const __VLS_59 = __VLS_58({
        severity: (data.reasoning_trace?.length ? 'success' : 'secondary'),
        value: (`${data.reasoning_trace?.length || 0} Steps`),
        rounded: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_58));
    const __VLS_61 = {}.Tag;
    /** @type {[typeof __VLS_components.Tag, ]} */ ;
    // @ts-ignore
    const __VLS_62 = __VLS_asFunctionalComponent(__VLS_61, new __VLS_61({
        severity: (data.citations?.length ? 'info' : 'secondary'),
        value: (`${data.citations?.length || 0} Refs`),
        rounded: true,
    }));
    const __VLS_63 = __VLS_62({
        severity: (data.citations?.length ? 'info' : 'secondary'),
        value: (`${data.citations?.length || 0} Refs`),
        rounded: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_62));
}
var __VLS_56;
var __VLS_27;
/** @type {[typeof ReasoningTracePane, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(ReasoningTracePane, new ReasoningTracePane({
    visible: (__VLS_ctx.drawerVisible),
    taskId: (__VLS_ctx.selectedTaskId),
}));
const __VLS_66 = __VLS_65({
    visible: (__VLS_ctx.drawerVisible),
    taskId: (__VLS_ctx.selectedTaskId),
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
/** @type {__VLS_StyleScopedClasses['audit-log-container']} */ ;
/** @type {__VLS_StyleScopedClasses['p-6']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-7xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-6']} */ ;
/** @type {__VLS_StyleScopedClasses['header-section']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-surface-900']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-surface-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-shield']} */ ;
/** @type {__VLS_StyleScopedClasses['text-indigo-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-indigo-400']} */ ;
/** @type {__VLS_StyleScopedClasses['text-surface-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-surface-400']} */ ;
/** @type {__VLS_StyleScopedClasses['filters-card']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-surface-0']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-surface-900']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-surface-200']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-surface-700']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['items-end']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-grow']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['text-surface-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-surface-300']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-grow']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['text-surface-700']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-surface-300']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['table-card']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-surface-0']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-surface-900']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-surface-200']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:border-surface-700']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['audit-table']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['p-8']} */ ;
/** @type {__VLS_StyleScopedClasses['text-surface-500']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-inbox']} */ ;
/** @type {__VLS_StyleScopedClasses['text-4xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-surface-300']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-surface-600']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['p-8']} */ ;
/** @type {__VLS_StyleScopedClasses['text-surface-500']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-spin']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['text-4xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-indigo-500']} */ ;
/** @type {__VLS_StyleScopedClasses['block']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['mr-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-[120px]']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-block']} */ ;
/** @type {__VLS_StyleScopedClasses['align-bottom']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-surface-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['text-surface-900']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-surface-100']} */ ;
/** @type {__VLS_StyleScopedClasses['font-mono']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-surface-100']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:bg-surface-800']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded']} */ ;
/** @type {__VLS_StyleScopedClasses['text-surface-600']} */ ;
/** @type {__VLS_StyleScopedClasses['dark:text-surface-400']} */ ;
/** @type {__VLS_StyleScopedClasses['text-surface-400']} */ ;
/** @type {__VLS_StyleScopedClasses['italic']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            DataTable: DataTable,
            Column: Column,
            InputText: InputText,
            Button: Button,
            Badge: Badge,
            Tag: Tag,
            ReasoningTracePane: ReasoningTracePane,
            logs: logs,
            loading: loading,
            totalRecords: totalRecords,
            drawerVisible: drawerVisible,
            selectedTaskId: selectedTaskId,
            filters: filters,
            primeFilters: primeFilters,
            fetchLogs: fetchLogs,
            onPage: onPage,
            clearFilters: clearFilters,
            onRowClick: onRowClick,
            formatDateTime: formatDateTime,
            truncateId: truncateId,
            getActionIcon: getActionIcon,
            rowClass: rowClass,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=AuditLog.vue.js.map