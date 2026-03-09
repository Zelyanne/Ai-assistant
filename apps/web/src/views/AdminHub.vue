<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { supabase } from '../services/supabase';
import { useUserStore } from '../stores/user';
import { useToast } from 'primevue/usetoast';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Dropdown from 'primevue/dropdown';
import { type Profile, type UserRole, UserRoleSchema } from '@ai-assistant/shared';

const userStore = useUserStore();
const toast = useToast();
const users = ref<Profile[]>([]);
const roles: UserRole[] = UserRoleSchema.options;
const editingRows = ref([]);

const fetchUsers = async () => {
  if (!userStore.profile?.organization_id) return;
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('organization_id', userStore.profile.organization_id);
    
  if (error) {
    console.error('Error fetching users:', error);
  } else {
    users.value = data as Profile[];
  }
};

const onRowEditSave = async (event: any) => {
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
  } else {
    users.value[index] = newData;
    toast.add({ severity: 'success', summary: 'Success', detail: 'User role updated', life: 3000 });
  }
};

const getRoleSeverity = (role: string) => {
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
</script>

<template>
  <div class="p-8">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">
        Organization Management
      </h1>
      <Tag
        :value="userStore.profile?.organization_id"
        icon="pi pi-building"
        severity="info"
      />
    </div>

    <div class="card bg-white shadow rounded-lg overflow-hidden">
      <DataTable 
        v-model:editing-rows="editingRows" 
        :value="users" 
        edit-mode="row" 
        data-key="id" 
        class="p-datatable-sm"
        @row-edit-save="onRowEditSave"
      >
        <Column
          field="full_name"
          header="Name"
          style="width: 25%"
        />
        <Column
          field="email"
          header="Email"
          style="width: 35%"
        />
        <Column
          field="role"
          header="Role"
          style="width: 25%"
        >
          <template #body="slotProps">
            <Tag
              :value="slotProps.data.role"
              :severity="getRoleSeverity(slotProps.data.role)"
            />
          </template>
          <template #editor="{ data, field }">
            <Dropdown
              v-model="data[field]"
              :options="roles"
              placeholder="Select a Role"
              fluid
            />
          </template>
        </Column>
        <Column
          :row-editor="true"
          style="width: 15%; min-width: 8rem"
          body-style="text-align:center"
        />
      </DataTable>
    </div>
  </div>
</template>
