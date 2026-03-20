import { onMounted, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { useSchedules } from '../../composables/useSchedules';
const { loading, error, listSchedules, createSchedule, updateSchedule, pauseSchedule, resumeSchedule, deleteSchedule, } = useSchedules();
const schedules = ref([]);
const creating = ref(false);
const editingId = ref(null);
const form = ref({
    task_type: 'schedule.execute',
    cron_expression: '0 9 * * 1',
    timezone: 'UTC',
});
const editForm = ref({
    task_type: '',
    cron_expression: '',
    timezone: 'UTC',
});
async function refresh() {
    schedules.value = await listSchedules();
}
async function submit() {
    creating.value = true;
    const created = await createSchedule({
        task_type: form.value.task_type,
        cron_expression: form.value.cron_expression,
        timezone: form.value.timezone,
        task_payload: {},
        is_active: true,
    });
    creating.value = false;
    if (created) {
        form.value = {
            task_type: 'schedule.execute',
            cron_expression: '0 9 * * 1',
            timezone: 'UTC',
        };
        await refresh();
    }
}
function startEdit(schedule) {
    editingId.value = schedule.id;
    editForm.value = {
        task_type: schedule.task_type,
        cron_expression: schedule.cron_expression,
        timezone: schedule.timezone ?? 'UTC',
    };
}
function cancelEdit() {
    editingId.value = null;
}
async function saveEdit(schedule) {
    const updated = await updateSchedule(schedule.id, {
        task_type: editForm.value.task_type,
        cron_expression: editForm.value.cron_expression,
        timezone: editForm.value.timezone,
        task_payload: schedule.task_payload ?? {},
        is_active: schedule.is_active,
    });
    if (updated) {
        editingId.value = null;
        await refresh();
    }
}
async function toggle(schedule) {
    if (schedule.is_active) {
        await pauseSchedule(schedule.id);
    }
    else {
        await resumeSchedule(schedule);
    }
    await refresh();
}
async function remove(schedule) {
    await deleteSchedule(schedule.id);
    await refresh();
}
onMounted(() => {
    void refresh();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "space-y-5" },
});
if (__VLS_ctx.error) {
    const __VLS_0 = {}.Message;
    /** @type {[typeof __VLS_components.Message, typeof __VLS_components.Message, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        severity: "error",
        closable: (false),
    }));
    const __VLS_2 = __VLS_1({
        severity: "error",
        closable: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    (__VLS_ctx.error);
    var __VLS_3;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rounded-xl border border-slate-200 bg-slate-50 p-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    ...{ class: "mb-3 text-sm font-semibold text-slate-800" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "grid gap-3 md:grid-cols-3" },
});
const __VLS_4 = {}.InputText;
/** @type {[typeof __VLS_components.InputText, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    modelValue: (__VLS_ctx.form.task_type),
    placeholder: "task type (domain.action)",
}));
const __VLS_6 = __VLS_5({
    modelValue: (__VLS_ctx.form.task_type),
    placeholder: "task type (domain.action)",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
const __VLS_8 = {}.InputText;
/** @type {[typeof __VLS_components.InputText, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    modelValue: (__VLS_ctx.form.cron_expression),
    placeholder: "cron expression",
}));
const __VLS_10 = __VLS_9({
    modelValue: (__VLS_ctx.form.cron_expression),
    placeholder: "cron expression",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
const __VLS_12 = {}.InputText;
/** @type {[typeof __VLS_components.InputText, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    modelValue: (__VLS_ctx.form.timezone),
    placeholder: "timezone (e.g. UTC)",
}));
const __VLS_14 = __VLS_13({
    modelValue: (__VLS_ctx.form.timezone),
    placeholder: "timezone (e.g. UTC)",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mt-3 flex justify-end" },
});
const __VLS_16 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    ...{ 'onClick': {} },
    label: "Create",
    icon: "pi pi-plus",
    loading: (__VLS_ctx.creating),
}));
const __VLS_18 = __VLS_17({
    ...{ 'onClick': {} },
    label: "Create",
    icon: "pi pi-plus",
    loading: (__VLS_ctx.creating),
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
let __VLS_20;
let __VLS_21;
let __VLS_22;
const __VLS_23 = {
    onClick: (__VLS_ctx.submit)
};
var __VLS_19;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "space-y-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    ...{ class: "text-sm font-semibold text-slate-800" },
});
const __VLS_24 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    ...{ 'onClick': {} },
    label: "Refresh",
    text: true,
    icon: "pi pi-refresh",
    loading: (__VLS_ctx.loading),
}));
const __VLS_26 = __VLS_25({
    ...{ 'onClick': {} },
    label: "Refresh",
    text: true,
    icon: "pi pi-refresh",
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
let __VLS_28;
let __VLS_29;
let __VLS_30;
const __VLS_31 = {
    onClick: (__VLS_ctx.refresh)
};
var __VLS_27;
if (__VLS_ctx.schedules.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500" },
    });
}
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.schedules))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        key: (item.id),
        ...{ class: "rounded-xl border border-slate-200 bg-white p-4" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex flex-wrap items-start justify-between gap-3" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "min-w-0 flex-1" },
    });
    if (__VLS_ctx.editingId === item.id) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "grid gap-3 md:grid-cols-3" },
        });
        const __VLS_32 = {}.InputText;
        /** @type {[typeof __VLS_components.InputText, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
            modelValue: (__VLS_ctx.editForm.task_type),
            placeholder: "task type",
        }));
        const __VLS_34 = __VLS_33({
            modelValue: (__VLS_ctx.editForm.task_type),
            placeholder: "task type",
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        const __VLS_36 = {}.InputText;
        /** @type {[typeof __VLS_components.InputText, ]} */ ;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
            modelValue: (__VLS_ctx.editForm.cron_expression),
            placeholder: "cron expression",
        }));
        const __VLS_38 = __VLS_37({
            modelValue: (__VLS_ctx.editForm.cron_expression),
            placeholder: "cron expression",
        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
        const __VLS_40 = {}.InputText;
        /** @type {[typeof __VLS_components.InputText, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            modelValue: (__VLS_ctx.editForm.timezone),
            placeholder: "timezone",
        }));
        const __VLS_42 = __VLS_41({
            modelValue: (__VLS_ctx.editForm.timezone),
            placeholder: "timezone",
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "text-sm font-semibold text-slate-900" },
        });
        (item.task_type);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "text-xs text-slate-500" },
        });
        (item.cron_expression);
        (item.timezone);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "mt-1 text-xs text-slate-400" },
        });
        (new Date(item.next_run).toLocaleString());
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex flex-wrap gap-2" },
    });
    if (__VLS_ctx.editingId === item.id) {
        const __VLS_44 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
            ...{ 'onClick': {} },
            label: "Save",
            icon: "pi pi-check",
            size: "small",
        }));
        const __VLS_46 = __VLS_45({
            ...{ 'onClick': {} },
            label: "Save",
            icon: "pi pi-check",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        let __VLS_48;
        let __VLS_49;
        let __VLS_50;
        const __VLS_51 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.editingId === item.id))
                    return;
                __VLS_ctx.saveEdit(item);
            }
        };
        var __VLS_47;
        const __VLS_52 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
            ...{ 'onClick': {} },
            label: "Cancel",
            icon: "pi pi-times",
            size: "small",
            severity: "secondary",
        }));
        const __VLS_54 = __VLS_53({
            ...{ 'onClick': {} },
            label: "Cancel",
            icon: "pi pi-times",
            size: "small",
            severity: "secondary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        let __VLS_56;
        let __VLS_57;
        let __VLS_58;
        const __VLS_59 = {
            onClick: (__VLS_ctx.cancelEdit)
        };
        var __VLS_55;
    }
    else {
        const __VLS_60 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
            ...{ 'onClick': {} },
            label: "Edit",
            icon: "pi pi-pencil",
            size: "small",
            severity: "secondary",
        }));
        const __VLS_62 = __VLS_61({
            ...{ 'onClick': {} },
            label: "Edit",
            icon: "pi pi-pencil",
            size: "small",
            severity: "secondary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_61));
        let __VLS_64;
        let __VLS_65;
        let __VLS_66;
        const __VLS_67 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.editingId === item.id))
                    return;
                __VLS_ctx.startEdit(item);
            }
        };
        var __VLS_63;
        const __VLS_68 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
            ...{ 'onClick': {} },
            label: (item.is_active ? 'Pause' : 'Resume'),
            icon: (item.is_active ? 'pi pi-pause' : 'pi pi-play'),
            size: "small",
            severity: "secondary",
        }));
        const __VLS_70 = __VLS_69({
            ...{ 'onClick': {} },
            label: (item.is_active ? 'Pause' : 'Resume'),
            icon: (item.is_active ? 'pi pi-pause' : 'pi pi-play'),
            size: "small",
            severity: "secondary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_69));
        let __VLS_72;
        let __VLS_73;
        let __VLS_74;
        const __VLS_75 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.editingId === item.id))
                    return;
                __VLS_ctx.toggle(item);
            }
        };
        var __VLS_71;
        const __VLS_76 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
            ...{ 'onClick': {} },
            label: "Delete",
            icon: "pi pi-trash",
            size: "small",
            severity: "danger",
        }));
        const __VLS_78 = __VLS_77({
            ...{ 'onClick': {} },
            label: "Delete",
            icon: "pi pi-trash",
            size: "small",
            severity: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        let __VLS_80;
        let __VLS_81;
        let __VLS_82;
        const __VLS_83 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.editingId === item.id))
                    return;
                __VLS_ctx.remove(item);
            }
        };
        var __VLS_79;
    }
}
/** @type {__VLS_StyleScopedClasses['space-y-5']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-800']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-800']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-dashed']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-300']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['items-start']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-semibold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-900']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Button: Button,
            InputText: InputText,
            Message: Message,
            loading: loading,
            error: error,
            schedules: schedules,
            creating: creating,
            editingId: editingId,
            form: form,
            editForm: editForm,
            refresh: refresh,
            submit: submit,
            startEdit: startEdit,
            cancelEdit: cancelEdit,
            saveEdit: saveEdit,
            toggle: toggle,
            remove: remove,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=ScheduleManager.vue.js.map