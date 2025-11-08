<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import { listSections } from '@/services/sections'
import { listStores } from '@/services/stores'
import { listStalls } from '@/services/stalls'
import { listAttendances } from '@/services/attendances'
import { listContracts } from '@/services/contracts'
import PaginationControls from '@/components/PaginationControls.vue'
import { formatTashkentDate, getTashkentTodayISO, parseTashkentDate, startOfTashkentDay } from '@/utils/time'

const loading = ref(false)
const errorMsg = ref('')
const contractsWarning = ref('')

const sections = ref([])
const stores = ref([])
const stalls = ref([])
const attendanceMap = ref({}) // { [stallId]: 'PAID'|'UNPAID' }
const storePaidMap = ref({}) // { [storeId]: boolean }

const typeFilter = ref('both') // both | stores | stalls
const typeOptions = [
  { value: 'both', label: "Ikkalasi" },
  { value: 'stores', label: "Do'konlar" },
  { value: 'stalls', label: 'Rastalar' },
]
const selectedSectionId = ref(null)
const date = ref(getTashkentTodayISO())
const search = ref('')
const zoom = ref(1)
const zoomPercent = computed(() => Math.round(zoom.value * 100))
const storeCellSize = computed(() => `${Math.round(56 * zoom.value)}px`)
const stallCellSize = computed(() => `${Math.round(48 * zoom.value)}px`)

const NO_SECTION_KEY = '__no_section__'

function isStoreOccupied(store) {
  if (typeof store?.isOccupied === 'boolean') return store.isOccupied
  const cs = store?.contracts
  if (!Array.isArray(cs)) return false
  const today = startOfTashkentDay() || new Date()
  return cs.some((c) => {
    const active = c.isActive !== false
    const startOk = !c.issueDate || (parseTashkentDate(c.issueDate) || new Date(0)) <= today
    const endOk =
      !c.expiryDate || (parseTashkentDate(c.expiryDate) || new Date(8640000000000000)) >= today
    return active && startOk && endOk
  })
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.data)) return payload.data
  return []
}

async function fetchContractsForMap({ pageSize = 200, maxPages = 10 } = {}) {
  const aggregated = []
  let currentPage = 1
  while (currentPage <= maxPages) {
    const res = await listContracts({ page: currentPage, limit: pageSize })
    const chunk = toArray(res)
    aggregated.push(...chunk)
    if (chunk.length < pageSize) break
    currentPage += 1
  }
  return aggregated
}

async function fetchAll() {
  loading.value = true
  errorMsg.value = ''
  contractsWarning.value = ''
  try {
    const [secRes, stoRes, staRes, conRes] = await Promise.all([
      listSections(),
      // Backend defaults to only free; request all for the map
      listStores({ page: 1, limit: 1000, withContracts: true, onlyFree: false }),
      listStalls({ page: 1, limit: 1000 }),
      fetchContractsForMap().catch((err) => {
        const status = err?.response?.status
        if (status === 401 || status === 403) {
          contractsWarning.value =
            "Shartnomalar ma'lumotlarini yuklashga ruxsat yo'q, do'konlarning to'lov holati ko'rsatilmaydi."
          return null
        }
        throw err
      }),
    ])
    sections.value = toArray(secRes)
    stores.value = toArray(stoRes)
    stalls.value = toArray(staRes)
    // Build store -> paid map from contracts with any PAID transaction
    const paid = {}
    for (const c of toArray(conRes)) {
      const hasPaid = Array.isArray(c.transactions) && c.transactions.some((t) => t.status === 'PAID')
      if (hasPaid && c.storeId) paid[c.storeId] = true
    }
    storePaidMap.value = paid
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Yuklashda xatolik'
  } finally {
    loading.value = false
  }
}

async function fetchAttendanceForDate() {
  try {
    const res = await listAttendances({ dateFrom: date.value, dateTo: date.value, page: 1, limit: 5000 })
    const map = {}
    for (const a of res.data || []) map[a.stallId] = a.status
    attendanceMap.value = map
  } catch {}
}

onMounted(async () => {
  await fetchAll()
  await fetchAttendanceForDate()
})
watch(date, fetchAttendanceForDate)

function sectionKey(id) {
  if (id === null || id === undefined) return NO_SECTION_KEY
  return String(id)
}

function describeSection(sectionId, fallbackName) {
  if (sectionId === null || sectionId === undefined) {
    return {
      key: NO_SECTION_KEY,
      id: null,
      name: fallbackName || "Bo'lim biriktirilmagan",
      isFallback: true,
    }
  }
  return {
    key: String(sectionId),
    id: Number(sectionId),
    name: fallbackName || `Bo'lim #${sectionId}`,
    isFallback: true,
  }
}

const sectionsForDisplay = computed(() => {
  const base = (sections.value || []).map((sec) => ({
    key: sectionKey(sec.id),
    id: sec.id,
    name: sec.name || `Bo'lim #${sec.id}`,
    isFallback: false,
  }))
  const seen = new Set(base.map((sec) => sec.key))

  const ensure = (descriptor) => {
    if (!descriptor) return
    if (seen.has(descriptor.key)) return
    seen.add(descriptor.key)
    base.push(descriptor)
  }

  for (const store of stores.value || []) {
    const key = sectionKey(store.sectionId)
    if (seen.has(key)) continue
    const name =
      store?.Section?.name ||
      (store.sectionId === null || store.sectionId === undefined
        ? "Bo'lim biriktirilmagan (do'kon)"
        : `Bo'lim #${store.sectionId}`)
    ensure(describeSection(store.sectionId, name))
  }

  for (const stall of stalls.value || []) {
    const key = sectionKey(stall.sectionId)
    if (seen.has(key)) continue
    const name =
      stall?.Section?.name ||
      (stall.sectionId === null || stall.sectionId === undefined
        ? "Bo'lim biriktirilmagan (rasta)"
        : `Bo'lim #${stall.sectionId}`)
    ensure(describeSection(stall.sectionId, name))
  }

  return base.sort((a, b) => {
    if (a.isFallback !== b.isFallback) return a.isFallback ? 1 : -1
    if (a.id === null && b.id !== null) return 1
    if (a.id !== null && b.id === null) return -1
    if (a.id === b.id) return 0
    return String(a.name).localeCompare(String(b.name))
  })
})

const filteredSections = computed(() => {
  if (!selectedSectionId.value) return sectionsForDisplay.value
  return sectionsForDisplay.value.filter((s) => s.key === String(selectedSectionId.value))
})

const sectionPage = ref(1)
const sectionLimit = ref(3)
const paginatedSections = computed(() => {
  const list = filteredSections.value || []
  const start = (sectionPage.value - 1) * sectionLimit.value
  return list.slice(start, start + sectionLimit.value)
})

const sectionCards = computed(() =>
  (paginatedSections.value || []).map((sec) => {
    const storeList = filterStoresBySection(sec.key)
    const stallList = filterStallsBySection(sec.key)
    const storeBusy = storeList.filter((s) => isStoreOccupied(s)).length
    const storePaid = storeList.filter((s) => isStorePaid(s)).length
    const stallPaid = stallList.filter((st) => getAttendanceStatus(st.id) === 'PAID').length
    const stallUnpaid = stallList.filter((st) => getAttendanceStatus(st.id) === 'UNPAID').length
    const stallNone = Math.max(0, stallList.length - stallPaid - stallUnpaid)
    return {
      ...sec,
      storeList,
      stallList,
      stats: {
        store: {
          total: storeList.length,
          busy: storeBusy,
          free: Math.max(0, storeList.length - storeBusy),
          paid: storePaid,
        },
        stall: {
          total: stallList.length,
          paid: stallPaid,
          unpaid: stallUnpaid,
          none: stallNone,
        },
      },
    }
  }),
)

const overallSummary = computed(() => {
  const summary = {
    stores: 0,
    storesBusy: 0,
    storesFree: 0,
    storesPaid: 0,
    stalls: 0,
    stallsPaid: 0,
    stallsUnpaid: 0,
    stallsNone: 0,
  }
  for (const sec of sectionCards.value || []) {
    summary.stores += sec.stats.store.total
    summary.storesBusy += sec.stats.store.busy
    summary.storesFree += sec.stats.store.free
    summary.storesPaid += sec.stats.store.paid
    summary.stalls += sec.stats.stall.total
    summary.stallsPaid += sec.stats.stall.paid
    summary.stallsUnpaid += sec.stats.stall.unpaid
    summary.stallsNone += sec.stats.stall.none
  }
  return summary
})

watch(
  () => filteredSections.value.length,
  () => {
    const totalPages = Math.max(1, Math.ceil((filteredSections.value.length || 0) / sectionLimit.value))
    if (sectionPage.value > totalPages) sectionPage.value = totalPages
    if (sectionPage.value < 1) sectionPage.value = 1
  },
)

watch(
  () => sectionLimit.value,
  () => {
    const totalPages = Math.max(1, Math.ceil((filteredSections.value.length || 0) / sectionLimit.value))
    if (sectionPage.value > totalPages) sectionPage.value = totalPages
  },
)

watch(
  () => [selectedSectionId.value, typeFilter.value, search.value],
  () => {
    sectionPage.value = 1
  },
)

function gridStyle(itemsCount, cellSize) {
  const cols = Math.min(12, Math.max(2, Math.ceil(Math.sqrt(itemsCount || 1))))
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(${cellSize}, 1fr))`,
  }
}

const normSearch = computed(() => (search.value || '').trim().toLowerCase())

function matchesSection(itemSectionId, filterKey) {
  if (!filterKey) return true
  if (filterKey === NO_SECTION_KEY) return itemSectionId === null || itemSectionId === undefined
  return String(itemSectionId) === String(filterKey) || Number(itemSectionId) === Number(filterKey)
}

function filterStoresBySection(sectionId) {
  const q = normSearch.value
  return (stores.value || [])
    .filter((s) => matchesSection(s.sectionId, sectionId))
    .filter((s) => !q || (s.storeNumber || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q))
}
function filterStallsBySection(sectionId) {
  const q = normSearch.value
  return (stalls.value || [])
    .filter((s) => matchesSection(s.sectionId, sectionId))
    .filter((s) => !q || (s.description || '').toLowerCase().includes(q) || String(s.id).includes(q))
}

function storeColor(s) {
  if (isStorePaid(s)) return 'bg-green-500'
  if (isStoreOccupied(s)) return 'bg-red-500'
  return 'bg-gray-400'
}
function stallColor(st) {
  const stStatus = attendanceMap.value[st.id]
  if (stStatus === 'PAID') return 'bg-green-500'
  if (stStatus === 'UNPAID') return 'bg-red-500'
  return 'bg-gray-400'
}

function isStorePaid(store) {
  return !!(storePaidMap.value && storePaidMap.value[store?.id])
}
function getAttendanceStatus(stallId) {
  return (attendanceMap.value && attendanceMap.value[stallId]) || null
}

function openStore(it) {
  try {
    alert(
      `Do'kon: ${it.storeNumber || `#${it.id}`}\nBo'lim: ${
        it.sectionId ?? '-'
      }\nHolat: ${isStoreOccupied(it) ? 'Band' : "Bo'sh"}\nTo'lov: ${
        isStorePaid(it) ? "To'langan" : "To'lanmagan"
      }`,
    )
  } catch {}
}
function openStall(it) {
  const stStatus = attendanceMap.value[it.id] || '-'
  try {
    alert(
      `Rasta: ${it.stallNumber || `#${it.id}`}\nID: #${it.id}\nBo'lim: ${
        it.sectionId ?? '-'
      }\nBugun: ${stStatus}`,
    )
  } catch {}
}

function storeTooltip(store) {
  const status = isStoreOccupied(store) ? 'Band' : "Bo'sh"
  const payment = isStorePaid(store) ? "To'langan" : "To'lanmagan"
  return `Do'kon: ${store.storeNumber || `#${store.id}`}\nID: #${store.id}\nHolat: ${status}\nTo'lov: ${payment}`
}

function stallTooltip(stall) {
  const paidStatus = getAttendanceStatus(stall.id) || '-'
  return `Rasta: ${stall.stallNumber || `#${stall.id}`}\nID: #${stall.id}\nBugun: ${paidStatus}\nIzoh: ${stall.description || '-'}`
}
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain wide>
      <SectionTitle first>Raqamli Xarita (Bo'limlar, Do'konlar, Rastalar)</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">{{ errorMsg }}</div>
      <div v-else-if="contractsWarning" class="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-amber-700">
        {{ contractsWarning }}
      </div>
      <div
        v-else-if="!loading && !sectionsForDisplay.length"
        class="mb-3 rounded border border-gray-200 bg-gray-50 p-3 text-gray-700"
      >
        Bo'lim yoki do'kon ma'lumotlari topilmadi. Iltimos avval bo'lim va do'konlarni yarating.
      </div>

      <CardBox class="mb-4">
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <FormField label="Turi">
            <div class="flex flex-wrap gap-2">
              <label
                v-for="opt in typeOptions"
                :key="opt.value"
                class="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium transition"
                :class="typeFilter === opt.value
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-400 dark:bg-emerald-500/10 dark:text-emerald-100'
                  : 'border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300'"
              >
                <input type="radio" class="sr-only" :value="opt.value" v-model="typeFilter" />
                <span>{{ opt.label }}</span>
              </label>
            </div>
          </FormField>
          <FormField label="Bo'lim">
            <select
              v-model="selectedSectionId"
              class="w-full rounded border border-gray-300 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option :value="null">Barchasi</option>
              <option v-for="s in sectionsForDisplay" :key="s.key" :value="s.key">{{ s.name }}</option>
            </select>
          </FormField>
          <FormField label="Sana (Rasta holati)">
            <FormControl v-model="date" type="date" />
          </FormField>
          <FormField label="Qidirish">
            <FormControl v-model="search" placeholder="Do'kon raqami yoki rasta izohi" />
          </FormField>
          <FormField label="Masshtab">
            <div class="flex items-center gap-3">
              <input
                type="range"
                min="0.75"
                max="1.5"
                step="0.05"
                v-model.number="zoom"
                class="h-2 w-full accent-emerald-500"
              />
              <div class="text-xs text-gray-500 dark:text-gray-400">{{ zoomPercent }}%</div>
            </div>
          </FormField>
        </div>
      </CardBox>

      <CardBox class="mb-4">
        <div class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div class="flex items-center gap-2">
            <span class="inline-block h-3 w-3 rounded-sm bg-green-500"></span>
            <span>Do'kon: To'langan</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="inline-block h-3 w-3 rounded-sm bg-red-500"></span>
            <span>Do'kon: To'lanmagan</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="inline-block h-3 w-3 rounded-sm bg-slate-500"></span>
            <span>Do'kon: Bo'sh</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="inline-block h-3 w-3 rounded-sm bg-gray-400"></span>
            <span>Rasta: Bugun yo'q</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="inline-block h-3 w-3 rounded-sm bg-red-500"></span>
            <span>Rasta: UNPAID</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="inline-block h-3 w-3 rounded-sm bg-green-500"></span>
            <span>Rasta: PAID</span>
          </div>
        </div>
      </CardBox>

      <CardBox class="mb-4">
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-lg border border-slate-200 p-4 text-slate-700 dark:border-slate-700 dark:text-slate-200">
            <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Do'konlar</div>
            <div class="text-2xl font-semibold">{{ overallSummary.stores }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Tanlangan bo'limlarda</div>
          </div>
          <div class="rounded-lg border border-slate-200 p-4 text-slate-700 dark:border-slate-700 dark:text-slate-200">
            <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Band / Bo'sh</div>
            <div class="text-2xl font-semibold text-amber-600">{{ overallSummary.storesBusy }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Bo'sh: {{ overallSummary.storesFree }}</div>
          </div>
          <div class="rounded-lg border border-slate-200 p-4 text-slate-700 dark:border-slate-700 dark:text-slate-200">
            <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">To'langan do'konlar</div>
            <div class="text-2xl font-semibold text-emerald-600">{{ overallSummary.storesPaid }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Jami: {{ overallSummary.stores }}</div>
          </div>
          <div class="rounded-lg border border-slate-200 p-4 text-slate-700 dark:border-slate-700 dark:text-slate-200">
            <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Rastalar</div>
            <div class="text-2xl font-semibold text-sky-600">{{ overallSummary.stalls }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">
              PAID: {{ overallSummary.stallsPaid }}, UNPAID: {{ overallSummary.stallsUnpaid }}, Yo'q:
              {{ overallSummary.stallsNone }}
            </div>
          </div>
        </div>
      </CardBox>

      <div v-if="!loading && !sectionCards.length" class="rounded border border-dashed border-gray-300 p-6 text-center text-gray-500 dark:border-gray-700">
        Tanlangan filtr bo'yicha bo'lim topilmadi.
      </div>
      <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div
          v-for="card in sectionCards"
          :key="card.key"
          class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="text-lg font-semibold text-slate-800 dark:text-slate-100">{{ card.name }}</div>
              <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                ID: {{ card.id ?? '—' }}
              </div>
            </div>
            <div class="flex flex-wrap gap-2 text-xs font-medium text-slate-600 dark:text-slate-200">
              <span class="rounded-full border border-slate-200 px-3 py-1 dark:border-slate-600">
                Do'kon: {{ card.storeList.length }}
              </span>
              <span class="rounded-full border border-slate-200 px-3 py-1 dark:border-slate-600">
                Rasta: {{ card.stallList.length }}
              </span>
            </div>
          </div>
          <div class="space-y-5">
            <div v-if="typeFilter === 'both' || typeFilter === 'stores'">
              <div class="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                <span>Do'konlar ({{ card.stats.store.total }})</span>
                <span class="text-xs font-normal text-gray-500 dark:text-gray-400">
                  Bo'sh: {{ card.stats.store.free }} · Band: {{ card.stats.store.busy }} · To'langan: {{ card.stats.store.paid }}
                </span>
              </div>
              <div
                v-if="card.storeList.length"
                class="grid gap-2"
                :style="gridStyle(card.storeList.length, storeCellSize)"
              >
                <div
                  v-for="s in card.storeList"
                  :key="s.id"
                  class="flex cursor-pointer flex-col items-center justify-center rounded-lg px-2 text-center text-xs font-semibold text-white shadow-sm transition hover:shadow-md"
                  :class="storeColor(s)"
                  :style="{ minHeight: storeCellSize }"
                  :title="storeTooltip(s)"
                  @click="openStore(s)"
                >
                  <div class="text-[11px] font-semibold">
                    {{ s.storeNumber || `#${s.id}` }}
                  </div>
                  <div class="text-[10px] text-white/80">ID: #{{ s.id }}</div>
                </div>
              </div>
              <div
                v-else
                class="rounded border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-500 dark:border-gray-700"
              >
                Bu bo'limda do'kon mavjud emas
              </div>
            </div>

            <div v-if="typeFilter === 'both' || typeFilter === 'stalls'">
              <div class="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                <span>Rastalar ({{ card.stats.stall.total }})</span>
                <span class="text-xs font-normal text-gray-500 dark:text-gray-400">
                  PAID: {{ card.stats.stall.paid }} · UNPAID: {{ card.stats.stall.unpaid }} · Yo'q: {{ card.stats.stall.none }}
                </span>
              </div>
              <div
                v-if="card.stallList.length"
                class="grid gap-2"
                :style="gridStyle(card.stallList.length, stallCellSize)"
              >
                <div
                  v-for="st in card.stallList"
                  :key="st.id"
                  class="flex cursor-pointer flex-col items-center justify-center rounded-lg px-2 text-center text-xs font-semibold text-white shadow-sm transition hover:shadow-md"
                  :class="stallColor(st)"
                  :style="{ minHeight: stallCellSize }"
                  :title="stallTooltip(st)"
                  @click="openStall(st)"
                >
                  <div class="text-[11px] font-semibold">
                    {{ st.stallNumber || `#${st.id}` }}
                  </div>
                  <div class="text-[10px] text-white/80">ID: #{{ st.id }}</div>
                </div>
              </div>
              <div
                v-else
                class="rounded border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-500 dark:border-gray-700"
              >
                Bu bo'limda rasta mavjud emas
              </div>
            </div>
          </div>
        </div>
      </div>
      <PaginationControls
        v-model:page="sectionPage"
        v-model:limit="sectionLimit"
        :total="filteredSections.length"
        :disabled="loading"
        :limit-options="[1, 3, 5, 10]"
      />
    </SectionMain>
  </LayoutAuthenticated>
</template>
