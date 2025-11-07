<script setup>
import { ref, onMounted, watch } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import CardBoxModal from '@/components/CardBoxModal.vue'
import PaginationControls from '@/components/PaginationControls.vue'
import { listSaleTypes, createSaleType, updateSaleType, deleteSaleType } from '@/services/saleTypes'

const items = ref([])
const loading = ref(false)
const errorMsg = ref('')
const search = ref('')
const page = ref(1)
const limit = ref(10)
const total = ref(0)

const showForm = ref(false)
const editingId = ref(null)
const form = ref({ name: '', description: '', tax: null })

async function fetchData() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await listSaleTypes({
      search: search.value || undefined,
      page: page.value,
      limit: limit.value,
    })
    items.value = res.data || []
    total.value = Number(res.pagination?.total ?? items.value.length)
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Yuklashda xatolik'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.value = { name: '', description: '', tax: null }
  showForm.value = true
}

function openEdit(item) {
  editingId.value = item.id
  form.value = { name: item.name || '', description: item.description || '', tax: item.tax ?? null }
  showForm.value = true
}

async function submitForm() {
  loading.value = true
  errorMsg.value = ''
  try {
    const payload = { ...form.value, tax: form.value.tax ? Number(form.value.tax) : 0 }
    if (editingId.value) await updateSaleType(editingId.value, payload)
    else await createSaleType(payload)
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
    await deleteSaleType(id)
    await fetchData()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || "O'chirishda xatolik"
  } finally {
    loading.value = false
  }
}

let searchTimer = null
let suppressPaginationFetch = false
let paginationTimer = null
watch(
  () => search.value,
  () => {
    page.value = 1
    suppressPaginationFetch = true
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      suppressPaginationFetch = false
      fetchData()
    }, 250)
  },
)
watch(
  () => [page.value, limit.value],
  () => {
    if (suppressPaginationFetch) return
    if (paginationTimer) clearTimeout(paginationTimer)
    paginationTimer = setTimeout(() => {
      fetchData()
    }, 0)
  },
)

onMounted(fetchData)
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain wide>
      <SectionTitle first>Sotuv turlari</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>

      <CardBox class="mb-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <FormField class="w-full md:max-w-xl" label="Qidirish">
            <FormControl v-model="search" placeholder="Nomi yoki izoh bo'yicha qidirish" />
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
                <th class="px-4 py-2 text-left">Presskurant narxi (1 kv m)</th>
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
                <td class="px-4 py-2">{{ it.tax }}</td>
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
        <PaginationControls
          v-model:page="page"
          v-model:limit="limit"
          :total="total"
          :disabled="loading"
        />
      </CardBox>

      <CardBoxModal
        v-model="showForm"
        has-cancel
        :close-on-confirm="false"
        :confirm-disabled="loading"
        button="success"
        :button-label="loading ? 'Saqlanmoqda...' : editingId ? 'Saqlash' : 'Yaratish'"
        :title="editingId ? 'Sotuv turini tahrirlash' : 'Sotuv turi yaratish'"
        @confirm="submitForm"
        @cancel="showForm = false"
      >
        <form class="grid gap-4 md:grid-cols-2" @submit.prevent="submitForm">
          <FormField label="Nomi">
            <FormControl v-model="form.name" required placeholder="Masalan: Oziq-ovqat" />
          </FormField>
          <FormField label="Presskurant narxi (1 kv m)">
            <FormControl
              v-model="form.tax"
              type="number"
              step="0.01"
              min="0"
              placeholder="Masalan: 150000"
            />
          </FormField>
          <FormField label="Izoh">
            <FormControl v-model="form.description" placeholder="Qisqacha izoh" />
          </FormField>
          <button type="submit" class="hidden" />
        </form>
      </CardBoxModal>
    </SectionMain>
  </LayoutAuthenticated>
</template>
