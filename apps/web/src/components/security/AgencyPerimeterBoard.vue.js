import { computed, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import InputText from 'primevue/inputtext';
import { useToast } from 'primevue/usetoast';
import { supabase } from '../../services/supabase';
const props = defineProps();
const toast = useToast();
const loading = ref(true);
const writeBlocked = ref(!props.canWrite);
const perimeters = ref([]);
const bannerMessage = ref(null);
const inlineError = ref(null);
const newTopicName = ref('');
const creating = ref(false);
const editingId = ref(null);
const editingName = ref('');
const savingId = ref(null);
const draggingId = ref(null);
const dragOverTier = ref(null);
const tiers = [
    {
        tier: 'Public',
        title: 'Public',
        icon: 'pi pi-bolt',
        hint: 'Auto-exec ok for this topic.',
    },
    {
        tier: 'Controlled',
        title: 'Controlled',
        icon: 'pi pi-sliders-h',
        hint: 'Auto-exec with tighter guardrails.',
    },
    {
        tier: 'Restricted',
        title: 'Restricted',
        icon: 'pi pi-shield',
        hint: 'Human approval required.',
    },
];
const isGeneral = (p) => p.topic_name === 'General';
const sortTopics = (a, b) => {
    if (isGeneral(a) && !isGeneral(b))
        return -1;
    if (!isGeneral(a) && isGeneral(b))
        return 1;
    return a.topic_name.localeCompare(b.topic_name);
};
const topicsByTier = computed(() => {
    const groups = {
        Public: [],
        Controlled: [],
        Restricted: [],
    };
    for (const p of perimeters.value) {
        groups[p.tier].push(p);
    }
    groups.Public.sort(sortTopics);
    groups.Controlled.sort(sortTopics);
    groups.Restricted.sort(sortTopics);
    return groups;
});
const isAuthWriteError = (err) => {
    if (!err || typeof err !== 'object')
        return false;
    const e = err;
    const status = typeof e.status === 'string' ? Number(e.status) : e.status;
    const statusCode = e.statusCode != null ? String(e.statusCode).toUpperCase() : '';
    const code = (e.code ?? '').toUpperCase();
    const message = (e.message ?? '').toLowerCase();
    return (status === 401 ||
        status === 403 ||
        statusCode === '401' ||
        statusCode === '403' ||
        statusCode === '42501' ||
        code === '42501' ||
        message.includes('permission denied') ||
        message.includes('forbidden') ||
        message.includes('row-level security'));
};
const isUniqueViolation = (err) => {
    if (!err || typeof err !== 'object')
        return false;
    const code = err.code;
    return String(code ?? '') === '23505';
};
const setWriteBlocked = (message) => {
    writeBlocked.value = true;
    bannerMessage.value = message;
};
const loadPerimeters = async () => {
    loading.value = true;
    inlineError.value = null;
    const { data, error } = await supabase
        .from('agency_perimeters')
        .select('*')
        .eq('organization_id', props.organizationId);
    if (error) {
        inlineError.value = error.message;
        loading.value = false;
        return;
    }
    perimeters.value = (data ?? []);
    loading.value = false;
};
const ensureGeneralExists = async () => {
    if (perimeters.value.some((p) => p.topic_name === 'General'))
        return;
    if (!props.canWrite) {
        bannerMessage.value = 'The default topic "General" is missing. Ask your CEO to create it.';
        return;
    }
    const { data, error } = await supabase
        .from('agency_perimeters')
        .insert({
        organization_id: props.organizationId,
        topic_name: 'General',
        tier: 'Restricted',
    })
        .select('*')
        .single();
    if (error) {
        if (isAuthWriteError(error)) {
            setWriteBlocked('Write access denied by policy. Controls are in read-only mode.');
        }
        inlineError.value = error.message;
        return;
    }
    perimeters.value = [...perimeters.value, data];
};
onMounted(async () => {
    await loadPerimeters();
    await ensureGeneralExists();
});
const beginRename = (p) => {
    if (writeBlocked.value)
        return;
    if (!p.id)
        return;
    if (isGeneral(p))
        return;
    editingId.value = p.id;
    editingName.value = p.topic_name;
};
const cancelRename = () => {
    editingId.value = null;
    editingName.value = '';
};
const commitRename = async (p) => {
    if (writeBlocked.value)
        return;
    if (!p.id)
        return;
    if (isGeneral(p))
        return;
    const nextName = editingName.value.trim();
    if (!nextName) {
        inlineError.value = 'Topic name cannot be empty.';
        return;
    }
    if (nextName === 'General') {
        inlineError.value = '"General" is reserved.';
        return;
    }
    if (perimeters.value.some((x) => x.id !== p.id && x.topic_name.trim() === nextName)) {
        inlineError.value = 'A topic with that name already exists.';
        return;
    }
    inlineError.value = null;
    savingId.value = p.id;
    const prevName = p.topic_name;
    p.topic_name = nextName;
    const { error } = await supabase
        .from('agency_perimeters')
        .update({ topic_name: nextName })
        .eq('id', p.id);
    savingId.value = null;
    editingId.value = null;
    editingName.value = '';
    if (error) {
        p.topic_name = prevName;
        if (isAuthWriteError(error)) {
            setWriteBlocked('Write access denied by policy. Controls are in read-only mode.');
        }
        if (isUniqueViolation(error)) {
            inlineError.value = 'A topic with that name already exists.';
            return;
        }
        inlineError.value = error.message;
        return;
    }
};
const createTopic = async () => {
    if (writeBlocked.value)
        return;
    const name = newTopicName.value.trim();
    if (!name) {
        inlineError.value = 'Topic name cannot be empty.';
        return;
    }
    if (name === 'General') {
        inlineError.value = '"General" is reserved.';
        return;
    }
    if (perimeters.value.some((p) => p.topic_name.trim() === name)) {
        inlineError.value = 'A topic with that name already exists.';
        return;
    }
    inlineError.value = null;
    creating.value = true;
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
        id: tempId,
        organization_id: props.organizationId,
        topic_name: name,
        tier: 'Restricted',
    };
    perimeters.value = [...perimeters.value, optimistic];
    newTopicName.value = '';
    const { data, error } = await supabase
        .from('agency_perimeters')
        .insert({
        organization_id: props.organizationId,
        topic_name: name,
        tier: 'Restricted',
    })
        .select('*')
        .single();
    creating.value = false;
    if (error) {
        perimeters.value = perimeters.value.filter((p) => p.id !== tempId);
        if (isAuthWriteError(error)) {
            setWriteBlocked('Write access denied by policy. Controls are in read-only mode.');
        }
        if (isUniqueViolation(error)) {
            inlineError.value = 'A topic with that name already exists.';
            return;
        }
        inlineError.value = error.message;
        return;
    }
    perimeters.value = perimeters.value.map((p) => (p.id === tempId ? data : p));
    toast.add({ severity: 'success', summary: 'Topic created', detail: name, life: 2500 });
};
const deleteTopic = async (p) => {
    if (writeBlocked.value)
        return;
    if (!p.id)
        return;
    if (isGeneral(p))
        return;
    inlineError.value = null;
    savingId.value = p.id;
    const snapshot = [...perimeters.value];
    perimeters.value = perimeters.value.filter((x) => x.id !== p.id);
    const { error } = await supabase.from('agency_perimeters').delete().eq('id', p.id);
    savingId.value = null;
    if (error) {
        perimeters.value = snapshot;
        if (isAuthWriteError(error)) {
            setWriteBlocked('Write access denied by policy. Controls are in read-only mode.');
        }
        inlineError.value = error.message;
        return;
    }
    toast.add({ severity: 'success', summary: 'Topic deleted', detail: p.topic_name, life: 2500 });
};
const moveTopicToTier = async (id, tier) => {
    if (writeBlocked.value)
        return;
    const p = perimeters.value.find((x) => x.id === id);
    if (!p || !p.id)
        return;
    if (p.tier === tier)
        return;
    inlineError.value = null;
    savingId.value = p.id;
    const prevTier = p.tier;
    p.tier = tier;
    const { error } = await supabase
        .from('agency_perimeters')
        .update({ tier })
        .eq('id', p.id);
    savingId.value = null;
    if (error) {
        p.tier = prevTier;
        if (isAuthWriteError(error)) {
            setWriteBlocked('Write access denied by policy. Controls are in read-only mode.');
        }
        inlineError.value = error.message;
    }
};
const onCardDragStart = (id, e) => {
    if (writeBlocked.value)
        return;
    draggingId.value = id;
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'topic', id }));
    }
};
const onCardDragEnd = () => {
    draggingId.value = null;
    dragOverTier.value = null;
};
const onColumnDragOver = (tier, e) => {
    if (writeBlocked.value)
        return;
    e.preventDefault();
    dragOverTier.value = tier;
};
const onColumnDragLeave = (tier) => {
    if (dragOverTier.value === tier)
        dragOverTier.value = null;
};
const onColumnDrop = async (tier, e) => {
    if (writeBlocked.value)
        return;
    e.preventDefault();
    let id = draggingId.value;
    const payload = e.dataTransfer?.getData('application/json');
    if (!id && payload) {
        try {
            const parsed = JSON.parse(payload);
            if (parsed?.type === 'topic' && typeof parsed.id === 'string')
                id = parsed.id;
        }
        catch {
            // ignore
        }
    }
    dragOverTier.value = null;
    draggingId.value = null;
    if (!id)
        return;
    await moveTopicToTier(id, tier);
};
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "space-y-4" },
});
if (__VLS_ctx.bannerMessage) {
    const __VLS_0 = {}.Message;
    /** @type {[typeof __VLS_components.Message, typeof __VLS_components.Message, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        severity: "warn",
        closable: (false),
        ...{ class: "rounded-xl" },
        dataTestid: "read-only-banner",
    }));
    const __VLS_2 = __VLS_1({
        severity: "warn",
        closable: (false),
        ...{ class: "rounded-xl" },
        dataTestid: "read-only-banner",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    (__VLS_ctx.bannerMessage);
    var __VLS_3;
}
else if (__VLS_ctx.writeBlocked) {
    const __VLS_4 = {}.Message;
    /** @type {[typeof __VLS_components.Message, typeof __VLS_components.Message, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        severity: "info",
        closable: (false),
        ...{ class: "rounded-xl" },
        dataTestid: "read-only-banner",
    }));
    const __VLS_6 = __VLS_5({
        severity: "info",
        closable: (false),
        ...{ class: "rounded-xl" },
        dataTestid: "read-only-banner",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    var __VLS_7;
}
if (__VLS_ctx.inlineError) {
    const __VLS_8 = {}.Message;
    /** @type {[typeof __VLS_components.Message, typeof __VLS_components.Message, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        severity: "error",
        closable: (false),
        ...{ class: "rounded-xl" },
        dataTestid: "inline-error",
    }));
    const __VLS_10 = __VLS_9({
        severity: "error",
        closable: (false),
        ...{ class: "rounded-xl" },
        dataTestid: "inline-error",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    (__VLS_ctx.inlineError);
    var __VLS_11;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-end gap-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex-1" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "text-xs font-bold uppercase tracking-wider text-slate-400 font-technical" },
});
const __VLS_12 = {}.InputText;
/** @type {[typeof __VLS_components.InputText, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    modelValue: (__VLS_ctx.newTopicName),
    ...{ class: "w-full font-technical" },
    placeholder: "e.g., Project Logistics",
    disabled: (__VLS_ctx.writeBlocked),
    dataTestid: "new-topic-input",
}));
const __VLS_14 = __VLS_13({
    modelValue: (__VLS_ctx.newTopicName),
    ...{ class: "w-full font-technical" },
    placeholder: "e.g., Project Logistics",
    disabled: (__VLS_ctx.writeBlocked),
    dataTestid: "new-topic-input",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
const __VLS_16 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    ...{ 'onClick': {} },
    label: "Add",
    icon: "pi pi-plus",
    severity: "contrast",
    loading: (__VLS_ctx.creating),
    disabled: (__VLS_ctx.writeBlocked),
    dataTestid: "new-topic-submit",
}));
const __VLS_18 = __VLS_17({
    ...{ 'onClick': {} },
    label: "Add",
    icon: "pi pi-plus",
    severity: "contrast",
    loading: (__VLS_ctx.creating),
    disabled: (__VLS_ctx.writeBlocked),
    dataTestid: "new-topic-submit",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
let __VLS_20;
let __VLS_21;
let __VLS_22;
const __VLS_23 = {
    onClick: (__VLS_ctx.createTopic)
};
var __VLS_19;
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flex justify-center py-10" },
    });
    const __VLS_24 = {}.ProgressSpinner;
    /** @type {[typeof __VLS_components.ProgressSpinner, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        ...{ style: {} },
    }));
    const __VLS_26 = __VLS_25({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "grid grid-cols-1 md:grid-cols-3 gap-4" },
    });
    for (const [t] of __VLS_getVForSourceType((__VLS_ctx.tiers))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ onDragover: ((e) => __VLS_ctx.onColumnDragOver(t.tier, e)) },
            ...{ onDragleave: (() => __VLS_ctx.onColumnDragLeave(t.tier)) },
            ...{ onDrop: ((e) => __VLS_ctx.onColumnDrop(t.tier, e)) },
            key: (t.tier),
            ...{ class: "rounded-2xl border border-slate-200 bg-white overflow-hidden" },
            ...{ class: (__VLS_ctx.dragOverTier === t.tier ? 'ring-2 ring-executive-primary' : '') },
            'data-testid': (`tier-dropzone-${t.tier}`),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
            ...{ class: "flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flex items-center gap-2" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
            ...{ class: ([t.icon, 'text-executive-primary']) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "font-bold text-executive-primary font-sans" },
        });
        (t.title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-xs text-slate-500 font-technical" },
        });
        (__VLS_ctx.topicsByTier[t.tier].length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "p-3 space-y-2 min-h-24" },
            'data-testid': (`tier-column-${t.tier}`),
        });
        if (__VLS_ctx.topicsByTier[t.tier].length === 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "text-xs text-slate-400 font-technical px-2 py-3" },
            });
        }
        for (const [p] of __VLS_getVForSourceType((__VLS_ctx.topicsByTier[t.tier]))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                ...{ onDragstart: ((e) => __VLS_ctx.onCardDragStart(String(p.id), e)) },
                ...{ onDragend: (__VLS_ctx.onCardDragEnd) },
                key: (p.id),
                ...{ class: "rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm flex items-center justify-between gap-2" },
                ...{ class: (__VLS_ctx.writeBlocked ? 'opacity-90' : 'hover:shadow-md transition-shadow') },
                draggable: (!__VLS_ctx.writeBlocked),
                'data-testid': (`topic-card-${p.id}`),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "min-w-0 flex-1" },
            });
            if (__VLS_ctx.editingId === p.id) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "flex items-center gap-2" },
                });
                const __VLS_28 = {}.InputText;
                /** @type {[typeof __VLS_components.InputText, ]} */ ;
                // @ts-ignore
                const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
                    modelValue: (__VLS_ctx.editingName),
                    ...{ class: "w-full font-technical" },
                    dataTestid: "rename-input",
                }));
                const __VLS_30 = __VLS_29({
                    modelValue: (__VLS_ctx.editingName),
                    ...{ class: "w-full font-technical" },
                    dataTestid: "rename-input",
                }, ...__VLS_functionalComponentArgsRest(__VLS_29));
                const __VLS_32 = {}.Button;
                /** @type {[typeof __VLS_components.Button, ]} */ ;
                // @ts-ignore
                const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
                    ...{ 'onClick': {} },
                    icon: "pi pi-check",
                    severity: "success",
                    text: true,
                    disabled: (__VLS_ctx.savingId === p.id),
                    dataTestid: "rename-commit",
                }));
                const __VLS_34 = __VLS_33({
                    ...{ 'onClick': {} },
                    icon: "pi pi-check",
                    severity: "success",
                    text: true,
                    disabled: (__VLS_ctx.savingId === p.id),
                    dataTestid: "rename-commit",
                }, ...__VLS_functionalComponentArgsRest(__VLS_33));
                let __VLS_36;
                let __VLS_37;
                let __VLS_38;
                const __VLS_39 = {
                    onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!(__VLS_ctx.editingId === p.id))
                            return;
                        __VLS_ctx.commitRename(p);
                    }
                };
                var __VLS_35;
                const __VLS_40 = {}.Button;
                /** @type {[typeof __VLS_components.Button, ]} */ ;
                // @ts-ignore
                const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
                    ...{ 'onClick': {} },
                    icon: "pi pi-times",
                    severity: "secondary",
                    text: true,
                    disabled: (__VLS_ctx.savingId === p.id),
                    dataTestid: "rename-cancel",
                }));
                const __VLS_42 = __VLS_41({
                    ...{ 'onClick': {} },
                    icon: "pi pi-times",
                    severity: "secondary",
                    text: true,
                    disabled: (__VLS_ctx.savingId === p.id),
                    dataTestid: "rename-cancel",
                }, ...__VLS_functionalComponentArgsRest(__VLS_41));
                let __VLS_44;
                let __VLS_45;
                let __VLS_46;
                const __VLS_47 = {
                    onClick: (__VLS_ctx.cancelRename)
                };
                var __VLS_43;
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "flex items-center gap-2" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "truncate font-technical text-slate-800" },
                    title: (p.topic_name),
                });
                (p.topic_name);
                if (__VLS_ctx.isGeneral(p)) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600" },
                        title: "Default topic",
                    });
                }
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "flex items-center gap-1" },
            });
            if (!__VLS_ctx.isGeneral(p)) {
                const __VLS_48 = {}.Button;
                /** @type {[typeof __VLS_components.Button, ]} */ ;
                // @ts-ignore
                const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
                    ...{ 'onClick': {} },
                    icon: "pi pi-pencil",
                    severity: "secondary",
                    text: true,
                    disabled: (__VLS_ctx.writeBlocked || __VLS_ctx.savingId === p.id),
                    dataTestid: "rename-start",
                }));
                const __VLS_50 = __VLS_49({
                    ...{ 'onClick': {} },
                    icon: "pi pi-pencil",
                    severity: "secondary",
                    text: true,
                    disabled: (__VLS_ctx.writeBlocked || __VLS_ctx.savingId === p.id),
                    dataTestid: "rename-start",
                }, ...__VLS_functionalComponentArgsRest(__VLS_49));
                let __VLS_52;
                let __VLS_53;
                let __VLS_54;
                const __VLS_55 = {
                    onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!(!__VLS_ctx.isGeneral(p)))
                            return;
                        __VLS_ctx.beginRename(p);
                    }
                };
                var __VLS_51;
            }
            if (!__VLS_ctx.isGeneral(p)) {
                const __VLS_56 = {}.Button;
                /** @type {[typeof __VLS_components.Button, ]} */ ;
                // @ts-ignore
                const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
                    ...{ 'onClick': {} },
                    icon: "pi pi-trash",
                    severity: "danger",
                    text: true,
                    disabled: (__VLS_ctx.writeBlocked || __VLS_ctx.savingId === p.id),
                    dataTestid: "delete-topic",
                }));
                const __VLS_58 = __VLS_57({
                    ...{ 'onClick': {} },
                    icon: "pi pi-trash",
                    severity: "danger",
                    text: true,
                    disabled: (__VLS_ctx.writeBlocked || __VLS_ctx.savingId === p.id),
                    dataTestid: "delete-topic",
                }, ...__VLS_functionalComponentArgsRest(__VLS_57));
                let __VLS_60;
                let __VLS_61;
                let __VLS_62;
                const __VLS_63 = {
                    onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!(!__VLS_ctx.isGeneral(p)))
                            return;
                        __VLS_ctx.deleteTopic(p);
                    }
                };
                var __VLS_59;
            }
            if (__VLS_ctx.savingId === p.id) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.i)({
                    ...{ class: "pi pi-spin pi-spinner text-slate-400" },
                });
            }
        }
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-xs text-slate-500 font-technical" },
});
/** @type {__VLS_StyleScopedClasses['space-y-4']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-end']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wider']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['py-10']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-3']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['border-b']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-100']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['p-3']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['min-h-24']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-3']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-2']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['truncate']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-800']} */ ;
/** @type {__VLS_StyleScopedClasses['text-[10px]']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wider']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['py-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-100']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1']} */ ;
/** @type {__VLS_StyleScopedClasses['pi']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-spin']} */ ;
/** @type {__VLS_StyleScopedClasses['pi-spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Button: Button,
            Message: Message,
            ProgressSpinner: ProgressSpinner,
            InputText: InputText,
            loading: loading,
            writeBlocked: writeBlocked,
            bannerMessage: bannerMessage,
            inlineError: inlineError,
            newTopicName: newTopicName,
            creating: creating,
            editingId: editingId,
            editingName: editingName,
            savingId: savingId,
            dragOverTier: dragOverTier,
            tiers: tiers,
            isGeneral: isGeneral,
            topicsByTier: topicsByTier,
            beginRename: beginRename,
            cancelRename: cancelRename,
            commitRename: commitRename,
            createTopic: createTopic,
            deleteTopic: deleteTopic,
            onCardDragStart: onCardDragStart,
            onCardDragEnd: onCardDragEnd,
            onColumnDragOver: onColumnDragOver,
            onColumnDragLeave: onColumnDragLeave,
            onColumnDrop: onColumnDrop,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=AgencyPerimeterBoard.vue.js.map