import { ref, onMounted } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import { useToast } from 'primevue/usetoast';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Dropdown from 'primevue/dropdown';
import { UserRoleSchema } from '@ai-assistant/shared';
const userStore = useUserStore();
const toast = useToast();
const users = ref([]);
const roles = UserRoleSchema.options;
const editingRows = ref([]);
const fetchUsers = async () => {
    if (!userStore.profile?.organization_id)
        return;
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', userStore.profile.organization_id);
    if (error) {
        console.error('Error fetching users:', error);
    }
    else {
        users.value = data;
    }
};
const onRowEditSave = async (event) => {
    const { newData, index } = event;
    const { error } = await supabase
        .from('profiles')
        .update({ role: newData.role })
        .eq('id', newData.id);
    if (error) {
        console.error('Error updating role:', error);
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to update user role', life: 3000 });
        // Revert change locally if needed, or re-fetch
        fetchUsers();
    }
    else {
        users.value[index] = newData;
        toast.add({ severity: 'success', summary: 'Success', detail: 'User role updated', life: 3000 });
    }
};
const getRoleSeverity = (role) => {
    switch (role) {
        case 'CEO': return 'primary';
        case 'PM': return 'info';
        case 'Team Member': return 'secondary';
        default: return 'secondary';
    }
};
onMounted(() => {
    fetchUsers();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "p-8" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex justify-between items-center mb-6" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "text-3xl font-bold" },
});
const __VLS_0 = {}.Tag;
/** @type {[typeof __VLS_components.Tag, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    value: (__VLS_ctx.userStore.profile?.organization_id),
    icon: "pi pi-building",
    severity: "info",
}));
const __VLS_2 = __VLS_1({
    value: (__VLS_ctx.userStore.profile?.organization_id),
    icon: "pi pi-building",
    severity: "info",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "card bg-white shadow rounded-lg overflow-hidden" },
});
const __VLS_4 = {}.DataTable;
/** @type {[typeof __VLS_components.DataTable, typeof __VLS_components.DataTable, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ 'onRowEditSave': {} },
    editingRows: (__VLS_ctx.editingRows),
    value: (__VLS_ctx.users),
    editMode: "row",
    dataKey: "id",
    ...{ class: "p-datatable-sm" },
}));
const __VLS_6 = __VLS_5({
    ...{ 'onRowEditSave': {} },
    editingRows: (__VLS_ctx.editingRows),
    value: (__VLS_ctx.users),
    editMode: "row",
    dataKey: "id",
    ...{ class: "p-datatable-sm" },
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
let __VLS_8;
let __VLS_9;
let __VLS_10;
const __VLS_11 = {
    onRowEditSave: (__VLS_ctx.onRowEditSave)
};
__VLS_7.slots.default;
const __VLS_12 = {}.Column;
/** @type {[typeof __VLS_components.Column, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    field: "full_name",
    header: "Name",
    ...{ style: {} },
}));
const __VLS_14 = __VLS_13({
    field: "full_name",
    header: "Name",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
const __VLS_16 = {}.Column;
/** @type {[typeof __VLS_components.Column, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    field: "email",
    header: "Email",
    ...{ style: {} },
}));
const __VLS_18 = __VLS_17({
    field: "email",
    header: "Email",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
const __VLS_20 = {}.Column;
/** @type {[typeof __VLS_components.Column, typeof __VLS_components.Column, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    field: "role",
    header: "Role",
    ...{ style: {} },
}));
const __VLS_22 = __VLS_21({
    field: "role",
    header: "Role",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
{
    const { body: __VLS_thisSlot } = __VLS_23.slots;
    const [slotProps] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_24 = {}.Tag;
    /** @type {[typeof __VLS_components.Tag, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        value: (slotProps.data.role),
        severity: (__VLS_ctx.getRoleSeverity(slotProps.data.role)),
    }));
    const __VLS_26 = __VLS_25({
        value: (slotProps.data.role),
        severity: (__VLS_ctx.getRoleSeverity(slotProps.data.role)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
}
{
    const { editor: __VLS_thisSlot } = __VLS_23.slots;
    const [{ data, field }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_28 = {}.Dropdown;
    /** @type {[typeof __VLS_components.Dropdown, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        modelValue: (data[field]),
        options: (__VLS_ctx.roles),
        placeholder: "Select a Role",
        fluid: true,
    }));
    const __VLS_30 = __VLS_29({
        modelValue: (data[field]),
        options: (__VLS_ctx.roles),
        placeholder: "Select a Role",
        fluid: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
}
var __VLS_23;
const __VLS_32 = {}.Column;
/** @type {[typeof __VLS_components.Column, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    rowEditor: (true),
    ...{ style: {} },
    bodyStyle: "text-align:center",
}));
const __VLS_34 = __VLS_33({
    rowEditor: (true),
    ...{ style: {} },
    bodyStyle: "text-align:center",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
var __VLS_7;
/** @type {__VLS_StyleScopedClasses['p-8']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-6']} */ ;
/** @type {__VLS_StyleScopedClasses['text-3xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['p-datatable-sm']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            DataTable: DataTable,
            Column: Column,
            Tag: Tag,
            Dropdown: Dropdown,
            userStore: userStore,
            users: users,
            roles: roles,
            editingRows: editingRows,
            onRowEditSave: onRowEditSave,
            getRoleSeverity: getRoleSeverity,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=AdminHub.vue.js.map