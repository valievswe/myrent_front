<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import CardBoxModal from '@/components/CardBoxModal.vue'
import { listStores, createStore, updateStore, deleteStore } from '@/services/stores'
import { listSections } from '@/services/sections'
import { downloadCSV } from '@/utils/export'

const items = ref([])
const loading = ref(false)
const errorMsg = ref('')
const total = ref(0)

const route = useRoute()
const router = useRouter()

const parsePositiveInt = (value, fallback) => {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const search = ref(typeof route.query.search === 'string' ? route.query.search : '')
const page = ref(parsePositiveInt(route.query.page, 1))
const limit = ref(parsePositiveInt(route.query.limit, 10))

const showForm = ref(false)
const editingId = ref(null)
const form = ref({ storeNumber: '', area: null, description: '', sectionId: null })
const sections = ref([])

const totalPages = computed(() => {
  const size = Math.max(1, limit.value || 1)
  const count = Math.ceil((total.value || 0) / size)
  return Number.isFinite(count) && count > 0 ? count : 1
})

const showingRange = computed(() => {
  if (!items.value.length) {
    return { start: 0, end: 0 }
  }
  const start = (page.value - 1) * (limit.value || 1) + 1
  const end = start + items.value.length - 1
  return { start, end }
})

let searchDebounceId = null
let syncingRoute = false
let initialLoad = true

const cleanupDebounce = () => {
  if (searchDebounceId) {
    clearTimeout(searchDebounceId)
    searchDebounceId = null
  }
}

const syncQuery = async () => {
  const nextQuery = { ...route.query }

  if (search.value?.trim()) nextQuery.search = search.value.trim()
  else delete nextQuery.search

  if (page.value > 1) nextQuery.page = String(page.value)
  else delete nextQuery.page

  if (limit.value !== 10) nextQuery.limit = String(limit.value)
  else delete nextQuery.limit

  const changed =
    nextQuery.search !== route.query.search ||
    nextQuery.page !== route.query.page ||
    nextQuery.limit !== route.query.limit

  if (!changed) return

  syncingRoute = true
  try {
    await router.replace({ query: nextQuery })
  } finally {
    syncingRoute = false
  }
}

async function fetchData() {
  loading.value = true
  errorMsg.value = ''
  try {
    // Backend defaults to only free; request all for full listing
    const res = await listStores({
      search: search.value,
      page: page.value,
      limit: limit.value,
      withContracts: true,
      onlyFree: false,
    })
    items.value = res.data
    total.value = Number(
      res.total ?? res.pagination?.total ?? res.meta?.total ?? items.value.length,
    )
    const maxPage = totalPages.value
    if (page.value > maxPage) {
      page.value = maxPage
    }
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
    await fetchData()
    showForm.value = false
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

function goToPrevPage() {
  if (page.value <= 1) return
  page.value -= 1
}

function goToNextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
}

function exportStoresCSV() {
  const headers = ["ID", "Do'kon", "Bo'lim", "Maydon (kv m)", 'Holati', 'Izoh']
  const rows = items.value.map((store) => [
    store.id,
    store.storeNumber ?? '',
    getSectionName(store.sectionId),
    store.area ?? '',
    store.isOccupied ? 'Band' : "Bo'sh",
    store.description ?? '',
  ])
  downloadCSV('stores.csv', headers, rows)
}

const getSectionName = (id) =>
  sections.value.find((s) => s.id === id)?.name || (id ?? '-')

const scheduleFetch = (delay = 0) => {
  cleanupDebounce()
  searchDebounceId = setTimeout(() => {
    syncQuery()
    fetchData()
  }, delay)
}

watch(
  () => [page.value, limit.value],
  () => {
    if (initialLoad) return
    if (limit.value < 1) {
      limit.value = 10
      return
    }
    scheduleFetch()
  },
)

watch(
  () => search.value,
  () => {
    if (initialLoad) return
    page.value = 1
    scheduleFetch(300)
  },
)

watch(
  () => route.query,
  (query) => {
    if (syncingRoute) return
    const nextSearch =
      typeof query.search === 'string'
        ? query.search
        : Array.isArray(query.search)
          ? query.search[0]
          : ''
    if (nextSearch !== search.value) {
      search.value = nextSearch
    }
    const nextPage = parsePositiveInt(query.page, 1)
    if (nextPage !== page.value) {
      page.value = nextPage
    }
    const nextLimit = parsePositiveInt(query.limit, 10)
    if (nextLimit !== limit.value) {
      limit.value = nextLimit
    }
  },
)

onMounted(async () => {
  try {
    sections.value = await listSections()
  } catch {}
  await fetchData()
  await syncQuery()
  initialLoad = false
})

onUnmounted(() => cleanupDebounce())
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain wide>
      <SectionTitle first>Do'konlar</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>

      <CardBox class="mb-4">
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div class="flex flex-1 flex-col gap-4 md:flex-row md:items-center">
            <FormField class="w-full md:max-w-sm" label="Qidirish">
              <FormControl v-model="search" placeholder="Do'kon raqami yoki izoh" />
            </FormField>
          </div>
          <div class="flex flex-shrink-0 flex-wrap gap-2">
            <BaseButton color="success" :disabled="loading" label="Yaratish" @click="openCreate" />
            <BaseButton
              color="info"
              outline
              :disabled="!items.length"
              label="Eksport CSV"
              @click="exportStoresCSV"
            />
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
                <td colspan="6" class="px-4 py-6 text-center">Yuklanmoqda...</td>
              </tr>
              <tr v-else-if="!items.length">
                <td colspan="6" class="px-4 py-6 text-center">Ma'lumot topilmadi</td>
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
                <td class="px-4 py-2">{{ getSectionName(it.sectionId) }}</td>
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
        <div class="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div class="text-sm text-slate-500">
            <template v-if="showingRange.start">
              Ko'rsatilmoqda {{ showingRange.start }}–{{ showingRange.end }} / {{ total }}
            </template>
            <template v-else>Jami: {{ total }}</template>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span>Sahifa hajmi</span>
              <select
                v-model.number="limit"
                class="rounded border border-gray-300 bg-white px-3 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                <option :value="10">10</option>
                <option :value="20">20</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
            </label>
            <div class="flex items-center gap-2">
              <BaseButton
                :disabled="page <= 1 || loading"
                label="Oldingi"
                @click="goToPrevPage"
              />
              <span class="text-sm text-slate-600 dark:text-slate-300">
                Sahifa {{ page }} / {{ totalPages }}
              </span>
              <BaseButton
                :disabled="page >= totalPages || loading"
                label="Keyingi"
                @click="goToNextPage"
              />
            </div>
          </div>
        </div>
      </CardBox>

      <CardBoxModal
        v-model="showForm"
        has-cancel
        :title="editingId ? \"Do'kon tahrirlash\" : \"Do'kon yaratish\""
        button="success"
        :button-label="loading ? 'Saqlanmoqda...' : editingId ? 'Saqlash' : 'Yaratish'"
        :confirm-disabled="loading"
        :close-on-confirm="false"
        @confirm="submitForm"
        @cancel="showForm = false"
      >
        <form class="grid gap-4 md:grid-cols-2" @submit.prevent="submitForm">
          <FormField label="Do'kon raqami">
            <FormControl v-model="form.storeNumber" required placeholder="Masalan: S001" />
          </FormField>
          <FormField label="Maydon (kv m)">
            <FormControl
              v-model.number="form.area"
              type="number"
              min="0"
              step="0.01"
              placeholder="Masalan: 50.5"
            />
          </FormField>
          <FormField class="md:col-span-2" label="Izoh">
            <FormControl v-model="form.description" placeholder="Qisqacha izoh" />
          </FormField>
          <FormField class="md:col-span-2" label="Bo'lim (ixtiyoriy)">
            <select
              v-model="form.sectionId"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option :value="null">Tanlang...</option>
              <option v-for="s in sections" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </FormField>
          <button type="submit" class="hidden" />
        </form>
      </CardBoxModal>
    </SectionMain>
  </LayoutAuthenticated>
</template>
