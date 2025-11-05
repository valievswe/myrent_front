<!-- eslint-disable no-empty -->
<script setup>
import { computed, onMounted, ref } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import CardBoxModal from '@/components/CardBoxModal.vue'
import { listUsers } from '@/services/users'
import { listSections, createSection, updateSection, deleteSection } from '@/services/sections'

const items = ref([])
const loading = ref(false)
const errorMsg = ref('')

const showForm = ref(false)
const editingId = ref(null)
const form = ref({ name: '', description: '', assigneeId: null })
const users = ref([])
const searchTerm = ref('')

async function fetchData() {
  loading.value = true
  errorMsg.value = ''
  try {
    items.value = await listSections()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Yuklashda xatolik'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.value = { name: '', description: '', assigneeId: null }
  showForm.value = true
}

function openEdit(item) {
  editingId.value = item.id
  form.value = {
    name: item.name || '',
    description: item.description || '',
    assigneeId: item.assigneeId ?? null,
  }
  showForm.value = true
}

async function submitForm() {
  loading.value = true
  errorMsg.value = ''
  try {
    const payload = {
      ...form.value,
      assigneeId: form.value.assigneeId ? Number(form.value.assigneeId) : null,
    }
    if (!payload.assigneeId)
      throw new Error("Bo'lim uchun mas'ul xodim (assigneeId) talab qilinadi")
    if (editingId.value) await updateSection(editingId.value, payload)
    else await createSection(payload)
    await fetchData()
    showForm.value = false
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || e.message || 'Saqlashda xatolik'
  } finally {
    loading.value = false
  }
}

async function removeItem(id) {
  if (!confirm("Haqiqatan o'chirmoqchimisiz?")) return
  loading.value = true
  errorMsg.value = ''
  try {
    await deleteSection(id)
    await fetchData()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || "O'chirishda xatolik"
  } finally {
    loading.value = false
  }
}

const filteredItems = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()
  if (!term) return items.value

  return items.value.filter((section) => {
    const name = section.name?.toLowerCase?.() || ''
    const description = section.description?.toLowerCase?.() || ''
    const checkerName = section.assignedChecker
      ? `${section.assignedChecker.firstName || ''} ${section.assignedChecker.lastName || ''}`
          .trim()
          .toLowerCase()
      : ''
    return [name, description, checkerName].some((field) => field.includes(term))
  })
})

onMounted(async () => {
  await fetchData()
  try {
    users.value = await listUsers({ role: 'CHECKER' })
  } catch (e) {}
})
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain wide>
      <SectionTitle first>Bo'limlar</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>

      <CardBox class="mb-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <FormField label="Qidirish">
            <FormControl v-model="searchTerm" placeholder="Bo'lim yoki mas'ul xodim" />
          </FormField>
          <BaseButton color="success" :disabled="loading" label="Yaratish" @click="openCreate" />
        </div>
      </CardBox>

      <CardBox has-table>
        <div class="overflow-x-auto">
          <table class="w-full table-auto">
            <thead>
              <tr>
                <th class="px-4 py-2 text-left">Nomi</th>
                <th class="px-4 py-2 text-left">Izoh</th>
                <th class="px-4 py-2 text-left">Mas'ul</th>
                <th class="px-4 py-2 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="4" class="px-4 py-6 text-center">Yuklanmoqda...</td>
              </tr>
              <tr v-else-if="!filteredItems.length">
                <td colspan="4" class="px-4 py-6 text-center">
                  {{ items.length ? "Mos bo'lim topilmadi" : "Ma'lumot topilmadi" }}
                </td>
              </tr>
              <tr
                v-for="it in filteredItems"
                :key="it.id"
                class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <td class="px-4 py-2">{{ it.name }}</td>
                <td class="px-4 py-2">{{ it.description }}</td>
                <td class="px-4 py-2">
                  <template v-if="it.assignedChecker">
                    {{ it.assignedChecker.firstName }} {{ it.assignedChecker.lastName }}
                  </template>
                  <template v-else>
                    {{ it.assignedCheckerId ?? '-' }}
                  </template>
                </td>
                <td class="px-4 py-2 text-right">
                  <BaseButton color="info" small label="Tahrirlash" @click="openEdit(it)" />
                  <BaseButton
                    color="danger"
                    small
                    outline
                    label="O'chirish"
                    class="ml-2"
                    @click="removeItem(it.id)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardBox>

      <CardBoxModal
        v-model="showForm"
        has-cancel
        :close-on-confirm="false"
        :confirm-disabled="loading"
        :button-label="loading ? 'Saqlanmoqda...' : editingId ? 'Saqlash' : 'Yaratish'"
        button="success"
        :title="editingId ? 'Bo\\'limni tahrirlash' : 'Bo\\'lim yaratish'"
        @confirm="submitForm"
        @cancel="showForm = false"
      >
        <form class="grid gap-4 md:grid-cols-2" @submit.prevent="submitForm">
          <FormField label="Nomi" class="md:col-span-2">
            <FormControl v-model="form.name" required placeholder="Masalan: Elektronika" />
          </FormField>
          <FormField label="Mas'ul xodim">
            <select
              v-model="form.assigneeId"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option :value="null" disabled>Tanlang...</option>
              <option v-for="u in users" :key="u.id" :value="u.id">
                {{ u.firstName }} {{ u.lastName }} ({{ u.email }})
              </option>
            </select>
          </FormField>
          <FormField label="Izoh" class="md:col-span-2">
            <FormControl v-model="form.description" placeholder="Qisqacha izoh" />
          </FormField>
          <button type="submit" class="hidden" />
        </form>
      </CardBoxModal>
    </SectionMain>
  </LayoutAuthenticated>
</template>
