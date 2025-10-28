<script setup>
import { ref, onMounted, watch } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import { listStores, createStore, updateStore, deleteStore } from '@/services/stores'
import { listSections } from '@/services/sections'

const items = ref([])
const loading = ref(false)
const errorMsg = ref('')
const search = ref('')
const page = ref(1)
const limit = ref(10)
const total = ref(0)

const showForm = ref(false)
const editingId = ref(null)
const form = ref({ storeNumber: '', area: null, description: '', sectionId: null })
const sections = ref([])

async function fetchData() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await listStores({ search: search.value, page: page.value, limit: limit.value, withContracts: true })
    items.value = res.data
    total.value = res.total ?? items.value.length
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Yuklashda xatolik'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.value = { storeNumber: '', area: null, description: '', sectionId: null }
  showForm.value = true
}

function openEdit(item) {
  editingId.value = item.id
  form.value = {
    storeNumber: item.storeNumber || '',
    area: item.area ?? null,
    description: item.description || '',
    sectionId: item.sectionId ?? null,
  }
  showForm.value = true
}

async function submitForm() {
  loading.value = true
  errorMsg.value = ''
  try {
    // Ensure numeric fields are numbers
    const payload = {
      ...form.value,
      area: form.value.area ? Number(form.value.area) : null,
      sectionId: form.value.sectionId ? Number(form.value.sectionId) : undefined,
    }
    if (editingId.value) {
      await updateStore(editingId.value, payload)
    } else {
      await createStore(payload)
    }
    showForm.value = false
    await fetchData()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Saqlashda xatolik'
  } finally {
    loading.value = false
  }
}

async function removeItem(id) {
  if (!confirm("Haqiqatan o'chirmoqchimisiz?")) return
  loading.value = true
  errorMsg.value = ''
  try {
    await deleteStore(id)
    await fetchData()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || "O'chirishda xatolik"
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    sections.value = await listSections()
  } catch {}
  await fetchData()
})
let debounceId = null
watch(
  () => search.value,
  () => {
    page.value = 1
    if (debounceId) clearTimeout(debounceId)
    debounceId = setTimeout(() => {
      fetchData()
    }, 300)
  },
)
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitle first>Do'konlar</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>

      <CardBox class="mb-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <FormField label="Qidirish">
            <FormControl v-model="search" placeholder="Do'kon raqami yoki izoh" />
          </FormField>
          <div class="flex gap-2">
            <BaseButton color="success" :disabled="loading" label="Yaratish" @click="openCreate" />
          </div>
        </div>
      </CardBox>

      <CardBox has-table>
        <div class="overflow-x-auto">
          <table class="w-full table-auto">
            <thead>
              <tr>
                <th class="px-4 py-2 text-left">Do'kon raqami</th>
                <th class="px-4 py-2 text-left">Maydon (kv m)</th>
                <th class="px-4 py-2 text-left">Izoh</th>
                <th class="px-4 py-2 text-left">Holati</th>
                <th class="px-4 py-2 text-left">Bo'lim</th>
                <th class="px-4 py-2 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="5" class="px-4 py-6 text-center">Yuklanmoqda...</td>
              </tr>
              <tr v-else-if="!items.length">
                <td colspan="5" class="px-4 py-6 text-center">Ma'lumot topilmadi</td>
              </tr>
              <tr
                v-for="it in items"
                :key="it.id"
                class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <td class="px-4 py-2">{{ it.storeNumber }}</td>
                <td class="px-4 py-2">{{ it.area }}</td>
                <td class="px-4 py-2">{{ it.description }}</td>
                <td class="px-4 py-2">
                  <span
                    :class="it.isOccupied ? 'text-red-600' : 'text-green-600'"
                  >
                    {{ it.isOccupied ? 'Band' : "Bo'sh" }}
                  </span>
                </td>
                <td class="px-4 py-2">{{ sections.find((s) => s.id === it.sectionId)?.name || it.sectionId }}</td>
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
        <div class="flex items-center justify-between px-4 py-3">
          <div>Jami: {{ total }}</div>
          <div class="flex items-center gap-2">
            <BaseButton
              :disabled="page <= 1 || loading"
              label="Oldingi"
              @click="(page--, fetchData())"
            />
            <span>Sahifa {{ page }}</span>
            <BaseButton
              :disabled="items.length < limit || loading"
              label="Keyingi"
              @click="(page++, fetchData())"
            />
          </div>
        </div>
      </CardBox>

      <CardBox v-if="showForm" class="mt-4" is-form @submit.prevent="submitForm">
        <SectionTitle>
          {{ editingId ? "Do'kon tahrirlash" : "Do'kon yaratish" }}
        </SectionTitle>
        <div class="grid gap-4 md:grid-cols-2">
          <FormField label="Do'kon raqami">
            <FormControl v-model="form.storeNumber" required placeholder="Masalan: S001" />
          </FormField>
          <FormField label="Maydon (kv m)">
            <FormControl
              v-model="form.area"
              type="number"
              min="0"
              step="0.01"
              placeholder="Masalan: 50.5"
            />
          </FormField>
          <FormField label="Izoh">
            <FormControl v-model="form.description" placeholder="Qisqacha izoh" />
          </FormField>
          <FormField label="Bo'lim (ixtiyoriy)">
            <select
              v-model="form.sectionId"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option :value="null">Tanlang...</option>
              <option v-for="s in sections" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
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
