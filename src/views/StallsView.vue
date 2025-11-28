<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { mdiPencilOutline, mdiDeleteOutline, mdiEyeOutline } from '@mdi/js'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import ActionMenu from '@/components/ActionMenu.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import CardBoxModal from '@/components/CardBoxModal.vue'
import PaginationControls from '@/components/PaginationControls.vue'
import { listStalls, createStall, updateStall, deleteStall } from '@/services/stalls'
import { listAttendances } from '@/services/attendances'
import { listSaleTypes } from '@/services/saleTypes'
import { listSections } from '@/services/sections'
import { downloadCSV } from '@/utils/export'
import { formatTashkentDate } from '@/utils/time'

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

const saleTypes = ref([])
const sections = ref([])

const showForm = ref(false)
const editingId = ref(null)
const form = ref({
  area: null,
  saleTypeId: null,
  sectionId: null,
  description: '',
  stallNumber: '',
})
const expandedStallId = ref(null)
const attendanceMap = ref({})

const selectedSaleType = computed(() =>
  saleTypes.value.find((s) => s.id === Number(form.value.saleTypeId)),
)
const computedFee = computed(() => {
  const area = Number(form.value.area) || 0
  const price = selectedSaleType.value ? Number(selectedSaleType.value.tax) || 0 : 0
  return area * price
})

const totalPages = computed(() => {
  const size = Math.max(1, limit.value || 1)
  const count = Math.ceil((total.value || 0) / size)
  return Number.isFinite(count) && count > 0 ? count : 1
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
    const res = await listStalls({ search: search.value, page: page.value, limit: limit.value })
    items.value = res.data
    total.value = Number(
      res.pagination?.total ?? res.meta?.total ?? res.total ?? items.value.length,
    )

    const maxPage = totalPages.value
    if (page.value > maxPage) {
      page.value = maxPage
    }

    if (expandedStallId.value && !items.value.some((it) => it.id === expandedStallId.value)) {
      expandedStallId.value = null
    }
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Yuklashda xatolik'
  } finally {
    loading.value = false
  }
}

async function preloadRefs() {
  try {
    const res = await listSaleTypes({ limit: 500 })
    saleTypes.value = Array.isArray(res) ? res : res.data || []
  } catch {}
  try {
    sections.value = await listSections()
  } catch {}
}

function openCreate() {
  editingId.value = null
  form.value = { area: null, saleTypeId: null, sectionId: null, description: '', stallNumber: '' }
  showForm.value = true
}

function openEdit(item) {
  editingId.value = item.id
  form.value = {
    area: item.area ?? null,
    saleTypeId: item.saleTypeId ?? null,
    sectionId: item.sectionId ?? null,
    description: item.description || '',
    stallNumber: item.stallNumber || '',
  }
  showForm.value = true
}

async function submitForm() {
  loading.value = true
  errorMsg.value = ''
  try {
    const payload = {
      area: form.value.area ? Number(form.value.area) : null,
      saleTypeId: form.value.saleTypeId ? Number(form.value.saleTypeId) : null,
      sectionId: form.value.sectionId ? Number(form.value.sectionId) : null,
      description: form.value.description || undefined,
      stallNumber: form.value.stallNumber || undefined,
    }
    if (!payload.area || !payload.saleTypeId || !payload.sectionId || !payload.stallNumber) {
      throw new Error("Maydon, Sotuv turi, Bo'lim va Rasta raqami majburiy")
    }
    if (editingId.value) await updateStall(editingId.value, payload)
    else await createStall(payload)
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
    await deleteStall(id)
    await fetchData()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || "O'chirishda xatolik"
  } finally {
    loading.value = false
  }
}

async function toggleAttendance(it) {
  expandedStallId.value = expandedStallId.value === it.id ? null : it.id
  if (expandedStallId.value && !attendanceMap.value[it.id]) {
    try {
      const res = await listAttendances({ stallId: it.id, page: 1, limit: 10 })
      attendanceMap.value = { ...attendanceMap.value, [it.id]: res.data }
    } catch (e) {
      console.error(e)
    }
  }
}

function goToStallDetail(stall) {
  if (!stall?.id) return
  router.push({ name: 'stall-detail', params: { id: stall.id } })
}


const getSectionName = (id) => sections.value.find((s) => s.id === id)?.name || (id ?? '-')
const getSaleType = (id) => saleTypes.value.find((s) => s.id === id)

function exportStallsCSV() {
  const headers = [
    'ID',
    'Rasta',
    "Bo'lim",
    'Sotuv turi',
    'Maydon (kv m)',
    'Presskurant',
    "Hisoblangan to'lov",
    'Izoh',
  ]
  const rows = items.value.map((stall) => {
    const saleType = getSaleType(stall.saleTypeId)
    const rate = saleType ? Number(saleType.tax) || 0 : 0
    const area = Number(stall.area) || 0
    return [
      stall.id,
      stall.stallNumber ?? '',
      getSectionName(stall.sectionId),
      saleType ? saleType.name : stall.saleTypeId ?? '',
      area,
      rate,
      area * rate,
      stall.description ?? '',
    ]
  })
  downloadCSV('stalls.csv', headers, rows)
}

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
  await preloadRefs()
  await fetchData()
  await syncQuery()
  initialLoad = false
})

onUnmounted(() => cleanupDebounce())
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain wide>
      <SectionTitle first>Rastalar</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>

      <CardBox class="mb-4">
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div class="flex flex-1 flex-col gap-4 md:flex-row md:items-center">
            <FormField class="w-full md:max-w-sm" label="Qidirish">
              <FormControl v-model="search" placeholder="Rasta raqami yoki izoh" />
            </FormField>
          </div>
          <div class="flex flex-shrink-0 flex-wrap gap-2">
            <BaseButton color="success" :disabled="loading" label="Yaratish" @click="openCreate" />
            <BaseButton
              color="info"
              outline
              :disabled="!items.length"
              label="Eksport CSV"
              @click="exportStallsCSV"
            />
          </div>
        </div>
      </CardBox>

      <CardBox has-table>
        <div class="overflow-x-auto">
          <table class="w-full table-auto">
            <thead>
              <tr>
                <th class="px-4 py-2 text-left">Rasta raqami</th>
                <th class="px-4 py-2 text-left">Bo'lim</th>
                <th class="px-4 py-2 text-left">Sotuv turi</th>
                <th class="px-4 py-2 text-left">Maydon (kv m)</th>
                <th class="px-4 py-2 text-left">Presskurant (1 kv m)</th>
                <th class="px-4 py-2 text-left">Hisoblangan to'lov</th>
                <th class="px-4 py-2 text-left">Izoh</th>
                <th class="px-4 py-2 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="8" class="px-4 py-6 text-center">Yuklanmoqda...</td>
              </tr>
              <tr v-else-if="!items.length">
                <td colspan="8" class="px-4 py-6 text-center">Ma'lumot topilmadi</td>
              </tr>
              <template v-for="it in items" :key="it.id">
                <tr class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td class="px-4 py-2">{{ it.stallNumber }}</td>
                  <td class="px-4 py-2">{{ getSectionName(it.sectionId) }}</td>
                  <td class="px-4 py-2">{{ getSaleType(it.saleTypeId)?.name || it.saleTypeId }}</td>
                  <td class="px-4 py-2">{{ it.area }}</td>
                <td class="px-4 py-2">{{ getSaleType(it.saleTypeId)?.tax }}</td>
                <td class="px-4 py-2">
                  {{ (Number(it.area) || 0) * (Number(getSaleType(it.saleTypeId)?.tax) || 0) }}
                </td>
                <td class="px-4 py-2">{{ it.description }}</td>
                <td class="px-4 py-2 text-right">
                  <ActionMenu
                    :items="[
                      { label: 'Ko‘rish', icon: mdiEyeOutline, onClick: () => goToStallDetail(it) },
                      { label: 'Tahrirlash', icon: mdiPencilOutline, onClick: () => openEdit(it) },
                      { label: 'Attendance', icon: mdiEyeOutline, onClick: () => toggleAttendance(it) },
                      { label: `O'chirish`, icon: mdiDeleteOutline, danger: true, onClick: () => removeItem(it.id) },
                    ]"
                  />
                </td>
              </tr>
                <tr v-if="expandedStallId === it.id">
                  <td colspan="8" class="bg-gray-50 px-4 py-3 dark:bg-gray-800">
                    <div class="mb-2 text-sm font-semibold">So'nggi attendance</div>
                    <div v-if="!attendanceMap[it.id]?.length" class="text-sm text-gray-500">
                      Ma'lumot yo'q
                    </div>
                    <div v-else>
                      <table class="w-full table-auto text-sm">
                        <thead>
                          <tr>
                            <th class="px-2 py-1 text-left">Sana</th>
                            <th class="px-2 py-1 text-left">Summasi</th>
                            <th class="px-2 py-1 text-left">Holati</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="a in attendanceMap[it.id]" :key="a.id">
                            <td class="px-2 py-1">{{ formatTashkentDate(a.date) || '-' }}</td>
                            <td class="px-2 py-1">{{ a.amount }}</td>
                            <td class="px-2 py-1">{{ a.status }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              </template>
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
        :title="editingId ? 'Rastani tahrirlash' : 'Rasta yaratish'"
        button="success"
        :button-label="loading ? 'Saqlanmoqda...' : editingId ? 'Saqlash' : 'Yaratish'"
        :confirm-disabled="loading"
        :close-on-confirm="false"
        @confirm="submitForm"
        @cancel="showForm = false"
      >
        <form class="grid gap-4 md:grid-cols-2" @submit.prevent="submitForm">
          <FormField label="Bo'lim">
            <select
              v-model="form.sectionId"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option :value="null" disabled>Tanlang...</option>
              <option v-for="s in sections" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </FormField>

          <FormField label="Sotuv turi">
            <select
              v-model="form.saleTypeId"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option :value="null" disabled>Tanlang...</option>
              <option v-for="st in saleTypes" :key="st.id" :value="st.id">
                {{ st.name }} - {{ st.tax }}
              </option>
            </select>
          </FormField>

          <FormField label="Maydon (kv m)">
            <FormControl
              v-model.number="form.area"
              type="number"
              min="0"
              step="0.01"
              placeholder="Masalan: 12"
            />
          </FormField>

          <FormField label="Rasta raqami">
            <FormControl v-model="form.stallNumber" placeholder="Masalan: A-12 yoki 103" />
          </FormField>

          <FormField class="md:col-span-2" label="Izoh">
            <FormControl v-model="form.description" placeholder="Qisqacha izoh" />
          </FormField>

          <div class="rounded border border-gray-200 p-3 text-sm md:col-span-2 dark:border-gray-700">
            Hisoblangan to'lov: <b>{{ computedFee || 0 }}</b>
          </div>

          <button type="submit" class="hidden" />
        </form>
      </CardBoxModal>
    </SectionMain>
  </LayoutAuthenticated>
</template>
