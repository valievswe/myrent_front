<script setup>
import { ref, onMounted } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import { listUsers } from '@/services/users'
import { listSections, createSection, updateSection, deleteSection } from '@/services/sections'

const items = ref([])
const loading = ref(false)
const errorMsg = ref('')

const showForm = ref(false)
const editingId = ref(null)
const form = ref({ name: '', description: '', assigneeId: null })
const users = ref([])

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
    showForm.value = false
    await fetchData()
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

onMounted(async () => {
  await fetchData()
  try {
    users.value = await listUsers({ role: 'CHECKER' })
  } catch (e) {}
})
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitle first>Bo'limlar</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>

      <CardBox class="mb-4">
        <div class="flex items-center justify-end">
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
              <tr v-else-if="!items.length">
                <td colspan="4" class="px-4 py-6 text-center">Ma'lumot topilmadi</td>
              </tr>
              <tr
                v-for="it in items"
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

      <CardBox v-if="showForm" class="mt-4" is-form @submit.prevent="submitForm">
        <SectionTitle>
          {{ editingId ? "Bo'limni tahrirlash" : "Bo'lim yaratish" }}
        </SectionTitle>
        <div class="grid gap-4 md:grid-cols-2">
          <FormField label="Nomi">
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
          <FormField label="Izoh">
            <FormControl v-model="form.description" placeholder="Qisqacha izoh" />
          </FormField>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <BaseButton
              color="success"
              :disabled="loading"
              :label="editingId ? 'Saqlash' : 'Yaratish'"
              type="submit"
            />
            <BaseButton
              color="info"
              outline
              label="Bekor qilish"
              :disabled="loading"
              @click="showForm = false"
            />
          </div>
        </template>
      </CardBox>
    </SectionMain>
  </LayoutAuthenticated>
</template>
