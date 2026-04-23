import { onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Dropdown from 'primevue/dropdown';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { useSchedules } from '../../composables/useSchedules';
const { loading, error, listSchedules, createSchedule, updateSchedule, pauseSchedule, resumeSchedule, deleteSchedule, } = useSchedules();
const schedules = ref([]);
const creating = ref(false);
const editingId = ref(null);
const formError = ref(null);
const editError = ref(null);
const TASK_TYPE_OPTIONS = ['assistant.command', 'channel.send'];
const CHANNEL_OPTIONS = ['web', 'telegram', 'whatsapp'];
const form = ref({
    task_type: 'assistant.command',
    cron_expression: '0 9 * * 1',
    timezone: 'UTC',
    command: '',
    channel: 'web',
    thread_id: '',
    message_text: '',
});
const editForm = ref({
    task_type: '',
    cron_expression: '',
    timezone: 'UTC',
    command: '',
    channel: 'web',
    thread_id: '',
    message_text: '',
});
function isSupportedTaskType(taskType) {
    return TASK_TYPE_OPTIONS.includes(taskType);
}
function isSupportedChannel(channel) {
    return CHANNEL_OPTIONS.includes(channel);
}
function buildTaskPayload(input) {
    if (!isSupportedTaskType(input.task_type)) {
        return {
            payload: null,
            error: 'Unsupported task type. Choose assistant.command or channel.send.',
        };
    }
    if (input.task_type === 'assistant.command') {
        const command = input.command.trim();
        if (!command) {
            return {
                payload: null,
                error: 'Command is required for assistant.command schedules.',
            };
        }
        return {
            payload: {
                command,
                command_text: command,
                message_text: command,
                confirmed: true,
                high_risk: true,
            },
            error: null,
        };
    }
    if (!isSupportedChannel(input.channel)) {
        return {
            payload: null,
            error: 'Unsupported channel. Choose web, telegram, or whatsapp.',
        };
    }
    const threadId = input.thread_id.trim();
    const messageText = input.message_text.trim();
    if (!threadId) {
        return {
            payload: null,
            error: 'thread_id is required for channel.send schedules.',
        };
    }
    if (!messageText) {
        return {
            payload: null,
            error: 'message_text is required for channel.send schedules.',
        };
    }
    return {
        payload: {
            channel: input.channel,
            thread_id: threadId,
            message_text: messageText,
            confirmed: true,
            high_risk: true,
        },
        error: null,
    };
}
async function refresh() {
    schedules.value = await listSchedules();
}
async function submit() {
    creating.value = true;
    formError.value = null;
    const { payload: taskPayload, error: validationError } = buildTaskPayload(form.value);
    if (!taskPayload) {
        formError.value = validationError;
        creating.value = false;
        return;
    }
    const created = await createSchedule({
        task_type: form.value.task_type,
        cron_expression: form.value.cron_expression,
        timezone: form.value.timezone,
        task_payload: taskPayload,
        is_active: true,
    });
    creating.value = false;
    if (created) {
        form.value = {
            task_type: 'assistant.command',
            cron_expression: '0 9 * * 1',
            timezone: 'UTC',
            command: '',
            channel: 'web',
            thread_id: '',
            message_text: '',
        };
        await refresh();
    }
}
function startEdit(schedule) {
    editingId.value = schedule.id;
    editError.value = null;
    const payload = schedule.task_payload ?? {};
    const command = typeof payload.command === 'string'
        ? payload.command
        : (typeof payload.command_text === 'string' ? payload.command_text : '');
    editForm.value = {
        task_type: schedule.task_type,
        cron_expression: schedule.cron_expression,
        timezone: schedule.timezone ?? 'UTC',
        command,
        channel: typeof payload.channel === 'string' ? payload.channel : 'web',
        thread_id: typeof payload.thread_id === 'string' ? payload.thread_id : '',
        message_text: typeof payload.message_text === 'string' ? payload.message_text : '',
    };
}
function cancelEdit() {
    editingId.value = null;
    editError.value = null;
}
async function saveEdit(schedule) {
    editError.value = null;
    const { payload: taskPayload, error: validationError } = buildTaskPayload(editForm.value);
    if (!taskPayload) {
        editError.value = validationError;
        return;
    }
    const updated = await updateSchedule(schedule.id, {
        task_type: editForm.value.task_type,
        cron_expression: editForm.value.cron_expression,
        timezone: editForm.value.timezone,
        task_payload: taskPayload,
        is_active: schedule.is_active,
    });
    if (updated) {
        editError.value = null;
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
if (__VLS_ctx.formError) {
    const __VLS_4 = {}.Message;
    /** @type {[typeof __VLS_components.Message, typeof __VLS_components.Message, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        severity: "error",
        closable: (false),
        ...{ class: "mb-3" },
    }));
    const __VLS_6 = __VLS_5({
        severity: "error",
        closable: (false),
        ...{ class: "mb-3" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    (__VLS_ctx.formError);
    var __VLS_7;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "grid gap-3 md:grid-cols-3" },
});
const __VLS_8 = {}.Dropdown;
/** @type {[typeof __VLS_components.Dropdown, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    modelValue: (__VLS_ctx.form.task_type),
    options: (__VLS_ctx.TASK_TYPE_OPTIONS),
    placeholder: "task type",
    fluid: true,
}));
const __VLS_10 = __VLS_9({
    modelValue: (__VLS_ctx.form.task_type),
    options: (__VLS_ctx.TASK_TYPE_OPTIONS),
    placeholder: "task type",
    fluid: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
const __VLS_12 = {}.InputText;
/** @type {[typeof __VLS_components.InputText, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    modelValue: (__VLS_ctx.form.cron_expression),
    placeholder: "cron expression",
}));
const __VLS_14 = __VLS_13({
    modelValue: (__VLS_ctx.form.cron_expression),
    placeholder: "cron expression",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
const __VLS_16 = {}.InputText;
/** @type {[typeof __VLS_components.InputText, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    modelValue: (__VLS_ctx.form.timezone),
    placeholder: "timezone (e.g. UTC)",
}));
const __VLS_18 = __VLS_17({
    modelValue: (__VLS_ctx.form.timezone),
    placeholder: "timezone (e.g. UTC)",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mt-3 grid gap-3 md:grid-cols-3" },
});
if (__VLS_ctx.form.task_type === 'assistant.command') {
    const __VLS_20 = {}.Textarea;
    /** @type {[typeof __VLS_components.Textarea, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        modelValue: (__VLS_ctx.form.command),
        autoResize: true,
        rows: "2",
        ...{ class: "md:col-span-3" },
        placeholder: "Command to run at each scheduled time",
    }));
    const __VLS_22 = __VLS_21({
        modelValue: (__VLS_ctx.form.command),
        autoResize: true,
        rows: "2",
        ...{ class: "md:col-span-3" },
        placeholder: "Command to run at each scheduled time",
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
}
else {
    const __VLS_24 = {}.Dropdown;
    /** @type {[typeof __VLS_components.Dropdown, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        modelValue: (__VLS_ctx.form.channel),
        options: (__VLS_ctx.CHANNEL_OPTIONS),
        placeholder: "channel",
        fluid: true,
    }));
    const __VLS_26 = __VLS_25({
        modelValue: (__VLS_ctx.form.channel),
        options: (__VLS_ctx.CHANNEL_OPTIONS),
        placeholder: "channel",
        fluid: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    const __VLS_28 = {}.InputText;
    /** @type {[typeof __VLS_components.InputText, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        modelValue: (__VLS_ctx.form.thread_id),
        placeholder: "thread_id",
    }));
    const __VLS_30 = __VLS_29({
        modelValue: (__VLS_ctx.form.thread_id),
        placeholder: "thread_id",
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    const __VLS_32 = {}.InputText;
    /** @type {[typeof __VLS_components.InputText, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        modelValue: (__VLS_ctx.form.message_text),
        placeholder: "message_text",
    }));
    const __VLS_34 = __VLS_33({
        modelValue: (__VLS_ctx.form.message_text),
        placeholder: "message_text",
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mt-3 flex justify-end" },
});
const __VLS_36 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    ...{ 'onClick': {} },
    label: "Create",
    icon: "pi pi-plus",
    loading: (__VLS_ctx.creating),
}));
const __VLS_38 = __VLS_37({
    ...{ 'onClick': {} },
    label: "Create",
    icon: "pi pi-plus",
    loading: (__VLS_ctx.creating),
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
let __VLS_40;
let __VLS_41;
let __VLS_42;
const __VLS_43 = {
    onClick: (__VLS_ctx.submit)
};
var __VLS_39;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "space-y-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center justify-between" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    ...{ class: "text-sm font-semibold text-slate-800" },
});
const __VLS_44 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    ...{ 'onClick': {} },
    label: "Refresh",
    text: true,
    icon: "pi pi-refresh",
    loading: (__VLS_ctx.loading),
}));
const __VLS_46 = __VLS_45({
    ...{ 'onClick': {} },
    label: "Refresh",
    text: true,
    icon: "pi pi-refresh",
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
let __VLS_48;
let __VLS_49;
let __VLS_50;
const __VLS_51 = {
    onClick: (__VLS_ctx.refresh)
};
var __VLS_47;
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
        if (__VLS_ctx.editError) {
            const __VLS_52 = {}.Message;
            /** @type {[typeof __VLS_components.Message, typeof __VLS_components.Message, ]} */ ;
            // @ts-ignore
            const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
                severity: "error",
                closable: (false),
                ...{ class: "mb-3" },
            }));
            const __VLS_54 = __VLS_53({
                severity: "error",
                closable: (false),
                ...{ class: "mb-3" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_53));
            __VLS_55.slots.default;
            (__VLS_ctx.editError);
            var __VLS_55;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "grid gap-3 md:grid-cols-3" },
        });
        const __VLS_56 = {}.Dropdown;
        /** @type {[typeof __VLS_components.Dropdown, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
            modelValue: (__VLS_ctx.editForm.task_type),
            options: (__VLS_ctx.TASK_TYPE_OPTIONS),
            placeholder: "task type",
            fluid: true,
        }));
        const __VLS_58 = __VLS_57({
            modelValue: (__VLS_ctx.editForm.task_type),
            options: (__VLS_ctx.TASK_TYPE_OPTIONS),
            placeholder: "task type",
            fluid: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        const __VLS_60 = {}.InputText;
        /** @type {[typeof __VLS_components.InputText, ]} */ ;
        // @ts-ignore
        const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
            modelValue: (__VLS_ctx.editForm.cron_expression),
            placeholder: "cron expression",
        }));
        const __VLS_62 = __VLS_61({
            modelValue: (__VLS_ctx.editForm.cron_expression),
            placeholder: "cron expression",
        }, ...__VLS_functionalComponentArgsRest(__VLS_61));
        const __VLS_64 = {}.InputText;
        /** @type {[typeof __VLS_components.InputText, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            modelValue: (__VLS_ctx.editForm.timezone),
            placeholder: "timezone",
        }));
        const __VLS_66 = __VLS_65({
            modelValue: (__VLS_ctx.editForm.timezone),
            placeholder: "timezone",
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mt-3 grid gap-3 md:grid-cols-3" },
        });
        if (__VLS_ctx.editForm.task_type === 'assistant.command') {
            const __VLS_68 = {}.Textarea;
            /** @type {[typeof __VLS_components.Textarea, ]} */ ;
            // @ts-ignore
            const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
                modelValue: (__VLS_ctx.editForm.command),
                autoResize: true,
                rows: "2",
                ...{ class: "md:col-span-3" },
                placeholder: "Command",
            }));
            const __VLS_70 = __VLS_69({
                modelValue: (__VLS_ctx.editForm.command),
                autoResize: true,
                rows: "2",
                ...{ class: "md:col-span-3" },
                placeholder: "Command",
            }, ...__VLS_functionalComponentArgsRest(__VLS_69));
        }
        else {
            const __VLS_72 = {}.Dropdown;
            /** @type {[typeof __VLS_components.Dropdown, ]} */ ;
            // @ts-ignore
            const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
                modelValue: (__VLS_ctx.editForm.channel),
                options: (__VLS_ctx.CHANNEL_OPTIONS),
                placeholder: "channel",
                fluid: true,
            }));
            const __VLS_74 = __VLS_73({
                modelValue: (__VLS_ctx.editForm.channel),
                options: (__VLS_ctx.CHANNEL_OPTIONS),
                placeholder: "channel",
                fluid: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_73));
            const __VLS_76 = {}.InputText;
            /** @type {[typeof __VLS_components.InputText, ]} */ ;
            // @ts-ignore
            const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
                modelValue: (__VLS_ctx.editForm.thread_id),
                placeholder: "thread_id",
            }));
            const __VLS_78 = __VLS_77({
                modelValue: (__VLS_ctx.editForm.thread_id),
                placeholder: "thread_id",
            }, ...__VLS_functionalComponentArgsRest(__VLS_77));
            const __VLS_80 = {}.InputText;
            /** @type {[typeof __VLS_components.InputText, ]} */ ;
            // @ts-ignore
            const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
                modelValue: (__VLS_ctx.editForm.message_text),
                placeholder: "message_text",
            }));
            const __VLS_82 = __VLS_81({
                modelValue: (__VLS_ctx.editForm.message_text),
                placeholder: "message_text",
            }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        }
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
        const __VLS_84 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
            ...{ 'onClick': {} },
            label: "Save",
            icon: "pi pi-check",
            size: "small",
        }));
        const __VLS_86 = __VLS_85({
            ...{ 'onClick': {} },
            label: "Save",
            icon: "pi pi-check",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_85));
        let __VLS_88;
        let __VLS_89;
        let __VLS_90;
        const __VLS_91 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.editingId === item.id))
                    return;
                __VLS_ctx.saveEdit(item);
            }
        };
        var __VLS_87;
        const __VLS_92 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
            ...{ 'onClick': {} },
            label: "Cancel",
            icon: "pi pi-times",
            size: "small",
            severity: "secondary",
        }));
        const __VLS_94 = __VLS_93({
            ...{ 'onClick': {} },
            label: "Cancel",
            icon: "pi pi-times",
            size: "small",
            severity: "secondary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_93));
        let __VLS_96;
        let __VLS_97;
        let __VLS_98;
        const __VLS_99 = {
            onClick: (__VLS_ctx.cancelEdit)
        };
        var __VLS_95;
    }
    else {
        const __VLS_100 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
            ...{ 'onClick': {} },
            label: "Edit",
            icon: "pi pi-pencil",
            size: "small",
            severity: "secondary",
        }));
        const __VLS_102 = __VLS_101({
            ...{ 'onClick': {} },
            label: "Edit",
            icon: "pi pi-pencil",
            size: "small",
            severity: "secondary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_101));
        let __VLS_104;
        let __VLS_105;
        let __VLS_106;
        const __VLS_107 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.editingId === item.id))
                    return;
                __VLS_ctx.startEdit(item);
            }
        };
        var __VLS_103;
        const __VLS_108 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
            ...{ 'onClick': {} },
            label: (item.is_active ? 'Pause' : 'Resume'),
            icon: (item.is_active ? 'pi pi-pause' : 'pi pi-play'),
            size: "small",
            severity: "secondary",
        }));
        const __VLS_110 = __VLS_109({
            ...{ 'onClick': {} },
            label: (item.is_active ? 'Pause' : 'Resume'),
            icon: (item.is_active ? 'pi pi-pause' : 'pi pi-play'),
            size: "small",
            severity: "secondary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        let __VLS_112;
        let __VLS_113;
        let __VLS_114;
        const __VLS_115 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.editingId === item.id))
                    return;
                __VLS_ctx.toggle(item);
            }
        };
        var __VLS_111;
        const __VLS_116 = {}.Button;
        /** @type {[typeof __VLS_components.Button, ]} */ ;
        // @ts-ignore
        const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
            ...{ 'onClick': {} },
            label: "Delete",
            icon: "pi pi-trash",
            size: "small",
            severity: "danger",
        }));
        const __VLS_118 = __VLS_117({
            ...{ 'onClick': {} },
            label: "Delete",
            icon: "pi pi-trash",
            size: "small",
            severity: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_117));
        let __VLS_120;
        let __VLS_121;
        let __VLS_122;
        const __VLS_123 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.editingId === item.id))
                    return;
                __VLS_ctx.remove(item);
            }
        };
        var __VLS_119;
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
/** @type {__VLS_StyleScopedClasses['mb-3']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['md:col-span-3']} */ ;
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
/** @type {__VLS_StyleScopedClasses['mb-3']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-3']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['md:col-span-3']} */ ;
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
            Dropdown: Dropdown,
            InputText: InputText,
            Message: Message,
            Textarea: Textarea,
            loading: loading,
            error: error,
            schedules: schedules,
            creating: creating,
            editingId: editingId,
            formError: formError,
            editError: editError,
            TASK_TYPE_OPTIONS: TASK_TYPE_OPTIONS,
            CHANNEL_OPTIONS: CHANNEL_OPTIONS,
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