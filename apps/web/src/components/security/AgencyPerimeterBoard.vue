<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'
import { supabase } from '../../services/supabase'
import type { AgencyPerimeter, AgencyTier } from '@ai-assistant/shared'

const props = defineProps<{ organizationId: string; canWrite: boolean }>()

const toast = useToast()

const loading = ref(true)
const writeBlocked = ref(!props.canWrite)

const perimeters = ref<AgencyPerimeter[]>([])

const bannerMessage = ref<string | null>(null)
const inlineError = ref<string | null>(null)

const newTopicName = ref('')
const creating = ref(false)

const editingId = ref<string | null>(null)
const editingName = ref('')
const savingId = ref<string | null>(null)

const draggingId = ref<string | null>(null)
const dragOverTier = ref<AgencyTier | null>(null)

const tiers: Array<{ tier: AgencyTier; title: string; icon: string; hint: string }> = [
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
]

const isGeneral = (p: AgencyPerimeter): boolean => p.topic_name === 'General'

const sortTopics = (a: AgencyPerimeter, b: AgencyPerimeter): number => {
  if (isGeneral(a) && !isGeneral(b)) return -1
  if (!isGeneral(a) && isGeneral(b)) return 1
  return a.topic_name.localeCompare(b.topic_name)
}

const topicsByTier = computed(() => {
  const groups: Record<AgencyTier, AgencyPerimeter[]> = {
    Public: [],
    Controlled: [],
    Restricted: [],
  }

  for (const p of perimeters.value) {
    groups[p.tier].push(p)
  }

  groups.Public.sort(sortTopics)
  groups.Controlled.sort(sortTopics)
  groups.Restricted.sort(sortTopics)

  return groups
})

type SupabaseLikeError = {
  status?: number | string
  statusCode?: number | string
  code?: string
  message?: string
}

const isAuthWriteError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false

  const e = err as SupabaseLikeError
  const status = typeof e.status === 'string' ? Number(e.status) : e.status
  const statusCode = e.statusCode != null ? String(e.statusCode).toUpperCase() : ''
  const code = (e.code ?? '').toUpperCase()
  const message = (e.message ?? '').toLowerCase()

  return (
    status === 401 ||
    status === 403 ||
    statusCode === '401' ||
    statusCode === '403' ||
    statusCode === '42501' ||
    code === '42501' ||
    message.includes('permission denied') ||
    message.includes('forbidden') ||
    message.includes('row-level security')
  )
}

const isUniqueViolation = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false
  const code = (err as SupabaseLikeError).code
  return String(code ?? '') === '23505'
}

const setWriteBlocked = (message: string) => {
  writeBlocked.value = true
  bannerMessage.value = message
}

const loadPerimeters = async (): Promise<void> => {
  loading.value = true
  inlineError.value = null

  const { data, error } = await supabase
    .from('agency_perimeters')
    .select('*')
    .eq('organization_id', props.organizationId)

  if (error) {
    inlineError.value = error.message
    loading.value = false
    return
  }

  perimeters.value = (data ?? []) as AgencyPerimeter[]
  loading.value = false
}

const ensureGeneralExists = async (): Promise<void> => {
  if (perimeters.value.some((p) => p.topic_name === 'General')) return

  if (!props.canWrite) {
    bannerMessage.value = 'The default topic "General" is missing. Ask your CEO to create it.'
    return
  }

  const { data, error } = await supabase
    .from('agency_perimeters')
    .insert({
      organization_id: props.organizationId,
      topic_name: 'General',
      tier: 'Restricted',
    })
    .select('*')
    .single()

  if (error) {
    if (isAuthWriteError(error)) {
      setWriteBlocked('Write access denied by policy. Controls are in read-only mode.')
    }
    inlineError.value = error.message
    return
  }

  perimeters.value = [...perimeters.value, data as AgencyPerimeter]
}

onMounted(async () => {
  await loadPerimeters()
  await ensureGeneralExists()
})

const beginRename = (p: AgencyPerimeter) => {
  if (writeBlocked.value) return
  if (!p.id) return
  if (isGeneral(p)) return

  editingId.value = p.id
  editingName.value = p.topic_name
}

const cancelRename = () => {
  editingId.value = null
  editingName.value = ''
}

const commitRename = async (p: AgencyPerimeter): Promise<void> => {
  if (writeBlocked.value) return
  if (!p.id) return
  if (isGeneral(p)) return

  const nextName = editingName.value.trim()
  if (!nextName) {
    inlineError.value = 'Topic name cannot be empty.'
    return
  }

  if (nextName === 'General') {
    inlineError.value = '"General" is reserved.'
    return
  }

  if (perimeters.value.some((x) => x.id !== p.id && x.topic_name.trim() === nextName)) {
    inlineError.value = 'A topic with that name already exists.'
    return
  }

  inlineError.value = null
  savingId.value = p.id
  const prevName = p.topic_name
  p.topic_name = nextName

  const { error } = await supabase
    .from('agency_perimeters')
    .update({ topic_name: nextName })
    .eq('id', p.id)

  savingId.value = null
  editingId.value = null
  editingName.value = ''

  if (error) {
    p.topic_name = prevName
    if (isAuthWriteError(error)) {
      setWriteBlocked('Write access denied by policy. Controls are in read-only mode.')
    }
    if (isUniqueViolation(error)) {
      inlineError.value = 'A topic with that name already exists.'
      return
    }
    inlineError.value = error.message
    return
  }
}

const createTopic = async (): Promise<void> => {
  if (writeBlocked.value) return
  const name = newTopicName.value.trim()
  if (!name) {
    inlineError.value = 'Topic name cannot be empty.'
    return
  }
  if (name === 'General') {
    inlineError.value = '"General" is reserved.'
    return
  }
  if (perimeters.value.some((p) => p.topic_name.trim() === name)) {
    inlineError.value = 'A topic with that name already exists.'
    return
  }

  inlineError.value = null
  creating.value = true

  const tempId = `temp-${Date.now()}`
  const optimistic: AgencyPerimeter = {
    id: tempId,
    organization_id: props.organizationId,
    topic_name: name,
    tier: 'Restricted',
  }

  perimeters.value = [...perimeters.value, optimistic]
  newTopicName.value = ''

  const { data, error } = await supabase
    .from('agency_perimeters')
    .insert({
      organization_id: props.organizationId,
      topic_name: name,
      tier: 'Restricted',
    })
    .select('*')
    .single()

  creating.value = false

  if (error) {
    perimeters.value = perimeters.value.filter((p) => p.id !== tempId)
    if (isAuthWriteError(error)) {
      setWriteBlocked('Write access denied by policy. Controls are in read-only mode.')
    }
    if (isUniqueViolation(error)) {
      inlineError.value = 'A topic with that name already exists.'
      return
    }
    inlineError.value = error.message
    return
  }

  perimeters.value = perimeters.value.map((p) => (p.id === tempId ? (data as AgencyPerimeter) : p))
  toast.add({ severity: 'success', summary: 'Topic created', detail: name, life: 2500 })
}

const deleteTopic = async (p: AgencyPerimeter): Promise<void> => {
  if (writeBlocked.value) return
  if (!p.id) return
  if (isGeneral(p)) return

  inlineError.value = null
  savingId.value = p.id
  const snapshot = [...perimeters.value]
  perimeters.value = perimeters.value.filter((x) => x.id !== p.id)

  const { error } = await supabase.from('agency_perimeters').delete().eq('id', p.id)

  savingId.value = null

  if (error) {
    perimeters.value = snapshot
    if (isAuthWriteError(error)) {
      setWriteBlocked('Write access denied by policy. Controls are in read-only mode.')
    }
    inlineError.value = error.message
    return
  }

  toast.add({ severity: 'success', summary: 'Topic deleted', detail: p.topic_name, life: 2500 })
}

const moveTopicToTier = async (id: string, tier: AgencyTier): Promise<void> => {
  if (writeBlocked.value) return

  const p = perimeters.value.find((x) => x.id === id)
  if (!p || !p.id) return
  if (p.tier === tier) return

  inlineError.value = null
  savingId.value = p.id
  const prevTier = p.tier
  p.tier = tier

  const { error } = await supabase
    .from('agency_perimeters')
    .update({ tier })
    .eq('id', p.id)

  savingId.value = null

  if (error) {
    p.tier = prevTier
    if (isAuthWriteError(error)) {
      setWriteBlocked('Write access denied by policy. Controls are in read-only mode.')
    }
    inlineError.value = error.message
  }
}

const onCardDragStart = (id: string, e: DragEvent) => {
  if (writeBlocked.value) return
  draggingId.value = id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'topic', id }))
  }
}

const onCardDragEnd = () => {
  draggingId.value = null
  dragOverTier.value = null
}

const onColumnDragOver = (tier: AgencyTier, e: DragEvent) => {
  if (writeBlocked.value) return
  e.preventDefault()
  dragOverTier.value = tier
}

const onColumnDragLeave = (tier: AgencyTier) => {
  if (dragOverTier.value === tier) dragOverTier.value = null
}

const onColumnDrop = async (tier: AgencyTier, e: DragEvent) => {
  if (writeBlocked.value) return
  e.preventDefault()

  let id = draggingId.value
  const payload = e.dataTransfer?.getData('application/json')
  if (!id && payload) {
    try {
      const parsed = JSON.parse(payload)
      if (parsed?.type === 'topic' && typeof parsed.id === 'string') id = parsed.id
    } catch {
      // ignore
    }
  }

  dragOverTier.value = null
  draggingId.value = null
  if (!id) return

  await moveTopicToTier(id, tier)
}
</script>

<template>
  <div class="space-y-4">
    <Message
      v-if="bannerMessage"
      severity="warn"
      :closable="false"
      class="rounded-xl"
      data-testid="read-only-banner"
    >
      {{ bannerMessage }}
    </Message>

    <Message
      v-else-if="writeBlocked"
      severity="info"
      :closable="false"
      class="rounded-xl"
      data-testid="read-only-banner"
    >
      Read-only mode: only the CEO can create/update/delete topics.
    </Message>

    <Message v-if="inlineError" severity="error" :closable="false" class="rounded-xl" data-testid="inline-error">
      {{ inlineError }}
    </Message>

    <div class="flex items-end gap-3">
      <div class="flex-1">
        <label class="text-xs font-bold uppercase tracking-wider text-slate-400 font-technical">New Topic</label>
        <InputText
          v-model="newTopicName"
          class="w-full font-technical"
          placeholder="e.g., Project Logistics"
          :disabled="writeBlocked"
          data-testid="new-topic-input"
        />
      </div>
      <Button
        label="Add"
        icon="pi pi-plus"
        severity="contrast"
        :loading="creating"
        :disabled="writeBlocked"
        @click="createTopic"
        data-testid="new-topic-submit"
      />
    </div>

    <div v-if="loading" class="flex justify-center py-10">
      <ProgressSpinner style="width: 40px; height: 40px" />
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <section
        v-for="t in tiers"
        :key="t.tier"
        class="rounded-2xl border border-slate-200 bg-white overflow-hidden"
        :class="dragOverTier === t.tier ? 'ring-2 ring-executive-primary' : ''"
        @dragover="(e) => onColumnDragOver(t.tier, e)"
        @dragleave="() => onColumnDragLeave(t.tier)"
        @drop="(e) => onColumnDrop(t.tier, e)"
        :data-testid="`tier-dropzone-${t.tier}`"
      >
        <header class="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
          <div class="flex items-center gap-2">
            <i :class="[t.icon, 'text-executive-primary']"></i>
            <div class="font-bold text-executive-primary font-sans">{{ t.title }}</div>
          </div>
          <div class="text-xs text-slate-500 font-technical">{{ topicsByTier[t.tier].length }}</div>
        </header>

        <div class="p-3 space-y-2 min-h-24" :data-testid="`tier-column-${t.tier}`">
          <div v-if="topicsByTier[t.tier].length === 0" class="text-xs text-slate-400 font-technical px-2 py-3">
            No topics.
          </div>

          <article
            v-for="p in topicsByTier[t.tier]"
            :key="p.id"
            class="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm flex items-center justify-between gap-2"
            :class="writeBlocked ? 'opacity-90' : 'hover:shadow-md transition-shadow'"
            :draggable="!writeBlocked"
            @dragstart="(e) => onCardDragStart(String(p.id), e)"
            @dragend="onCardDragEnd"
            :data-testid="`topic-card-${p.id}`"
          >
            <div class="min-w-0 flex-1">
              <div v-if="editingId === p.id" class="flex items-center gap-2">
                <InputText v-model="editingName" class="w-full font-technical" data-testid="rename-input" />
                <Button
                  icon="pi pi-check"
                  severity="success"
                  text
                  :disabled="savingId === p.id"
                  @click="commitRename(p)"
                  data-testid="rename-commit"
                />
                <Button
                  icon="pi pi-times"
                  severity="secondary"
                  text
                  :disabled="savingId === p.id"
                  @click="cancelRename"
                  data-testid="rename-cancel"
                />
              </div>
              <div v-else class="flex items-center gap-2">
                <span class="truncate font-technical text-slate-800" :title="p.topic_name">{{ p.topic_name }}</span>
                <span
                  v-if="isGeneral(p)"
                  class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600"
                  title="Default topic"
                >
                  Default
                </span>
              </div>
            </div>

            <div class="flex items-center gap-1">
              <Button
                v-if="!isGeneral(p)"
                icon="pi pi-pencil"
                severity="secondary"
                text
                :disabled="writeBlocked || savingId === p.id"
                @click="beginRename(p)"
                data-testid="rename-start"
              />
              <Button
                v-if="!isGeneral(p)"
                icon="pi pi-trash"
                severity="danger"
                text
                :disabled="writeBlocked || savingId === p.id"
                @click="deleteTopic(p)"
                data-testid="delete-topic"
              />
              <i v-if="savingId === p.id" class="pi pi-spin pi-spinner text-slate-400" />
            </div>
          </article>
        </div>
      </section>
    </div>

    <p class="text-xs text-slate-500 font-technical">
      Tip: Drag a topic card between tiers to change autonomy.
    </p>
  </div>
</template>
