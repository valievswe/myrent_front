<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import CardBoxModal from '@/components/CardBoxModal.vue'
import { useRouter } from 'vue-router'
import { listSections } from '@/services/sections'
import { listStores } from '@/services/stores'
import { listStalls, updateStall } from '@/services/stalls'
import {
  listAttendances,
  createAttendance,
  deleteAttendance,
  getAttendancePayUrl,
} from '@/services/attendances'
import { listContracts } from '@/services/contracts'
import { listSaleTypes } from '@/services/saleTypes'
import PaginationControls from '@/components/PaginationControls.vue'
import { getTashkentTodayISO, parseTashkentDate, startOfTashkentDay } from '@/utils/time'

const router = useRouter()
const loading = ref(false)
const errorMsg = ref('')
const contractsWarning = ref('')

const sections = ref([])
const stores = ref([])
const stalls = ref([])
const saleTypes = ref([])
const attendanceMap = ref({}) // { [stallId]: attendanceRecord }
const storePaidMap = ref({}) // { [storeId]: boolean }
const stallModalOpen = ref(false)
const activeStall = ref(null)
const attendanceModalOpen = ref(false)
const attendanceForm = ref({ date: getTashkentTodayISO() })
const attendanceSaving = ref(false)
const attendanceModalError = ref('')
const stallEditModalOpen = ref(false)
const stallEditForm = ref({
  stallNumber: '',
  area: '',
  sectionId: null,
  saleTypeId: null,
  description: '',
})
// Sale type combobox state
const saleTypeDropdownOpen = ref(false)

function pickSaleType(st) {
  stallEditForm.value.saleTypeId = st ? st.id : null
  saleTypeSearch.value = st ? st.name : ''
  saleTypeDropdownOpen.value = false
}
const stallEditSaving = ref(false)
const stallEditModalError = ref('')
const payLoading = ref(false)
const undoAttendanceLoading = ref(false)
const postPaymentRefreshInProgress = ref(false)

const typeFilter = ref('both') // both | stores | stalls
const typeOptions = [
  { value: 'both', label: 'Ikkalasi' },
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
const saleTypeSearch = ref('')
const SALE_TYPE_RESULTS_LIMIT = 20
const persistedFilters = loadMapFilters()
if (persistedFilters) {
  if (persistedFilters.type && ['both', 'stores', 'stalls'].includes(persistedFilters.type)) {
    typeFilter.value = persistedFilters.type
  }
  if (Object.prototype.hasOwnProperty.call(persistedFilters, 'sectionId')) {
    selectedSectionId.value = persistedFilters.sectionId
  }
}
const filteredSaleTypeOptions = computed(() => {
  const list = saleTypes.value || []
  const term = saleTypeSearch.value.trim().toLowerCase()
  if (!term) return list.slice(0, SALE_TYPE_RESULTS_LIMIT)
  return list
    .filter((st) => (st.name || '').toLowerCase().includes(term))
    .slice(0, SALE_TYPE_RESULTS_LIMIT)
})
const selectedSaleTypeName = computed(() => {
  const selected = (saleTypes.value || []).find((st) => st.id === stallEditForm.value.saleTypeId)
  return selected?.name || ''
})

const NO_SECTION_KEY = '__no_section__'
const MAP_FILTERS_STORAGE_KEY = 'map-view-filters-v1'

const integerAmountFormatter = new Intl.NumberFormat('uz-UZ', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const fractionAmountFormatter = new Intl.NumberFormat('uz-UZ', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function normalizeDecimal(value) {
  if (value === null || value === undefined) return null
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return null
  return Math.round(num * 100) / 100
}

function formatAmountDisplay(value) {
  const normalized = normalizeDecimal(value)
  if (normalized === null) return '—'
  const formatter = Number.isInteger(normalized) ? integerAmountFormatter : fractionAmountFormatter
  return formatter.format(normalized)
}

function loadMapFilters() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(MAP_FILTERS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function persistMapFilters(filters) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MAP_FILTERS_STORAGE_KEY, JSON.stringify(filters))
  } catch {
    // Ignored: localStorage unavailable
  }
}

function buildStorePaidLookup(contractPayload) {
  const paid = {}
  for (const c of toArray(contractPayload)) {
    const hasPaid = Array.isArray(c.transactions) && c.transactions.some((t) => t.status === 'PAID')
    if (hasPaid && c.storeId) paid[c.storeId] = true
  }
  return paid
}

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

async function fetchPaginated(listFn, { baseParams = {}, pageSize = 500, maxPages = 20 } = {}) {
  const aggregated = []
  let currentPage = 1
  while (currentPage <= maxPages) {
    const res = await listFn({ ...baseParams, page: currentPage, limit: pageSize })
    const chunk = toArray(res)
    aggregated.push(...chunk)
    if (chunk.length < pageSize) break
    currentPage += 1
  }
  return aggregated
}

async function fetchContractsForMap({ pageSize = 200, maxPages = 10 } = {}) {
  return fetchPaginated(listContracts, { pageSize, maxPages })
}

async function fetchAll() {
  loading.value = true
  errorMsg.value = ''
  contractsWarning.value = ''
  try {
    const [secRes, stoRes, staRes, conRes] = await Promise.all([
      listSections(),
      // Backend defaults to only free; request all for the map
      fetchPaginated(listStores, {
        baseParams: { withContracts: true, onlyFree: false },
        pageSize: 500,
        maxPages: 50,
      }),
      fetchPaginated(listStalls, {
        pageSize: 1000,
        maxPages: 50,
      }),
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
    stores.value = stoRes
    stalls.value = staRes
    // Build store -> paid map from contracts with any PAID transaction
    storePaidMap.value = buildStorePaidLookup(conRes)
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Yuklashda xatolik'
  } finally {
    loading.value = false
  }
}

async function refreshStorePaidStatus() {
  try {
    const conRes = await fetchContractsForMap()
    storePaidMap.value = buildStorePaidLookup(conRes)
  } catch (e) {
    const status = e?.response?.status
    if (status === 401 || status === 403) {
      contractsWarning.value =
        "Shartnomalar ma'lumotlarini yuklashga ruxsat yo'q, do'konlarning to'lov holati ko'rsatilmaydi."
      return
    }
    console.error('Failed to refresh store payments', e)
  }
}

async function fetchSaleTypesList() {
  try {
    const res = await listSaleTypes({ page: 1, limit: 500 })
    saleTypes.value = res.data || []
  } catch (e) {
    console.error('Failed to load sale types', e)
  }
}

async function fetchAttendanceForDate() {
  try {
    const res = await listAttendances({
      dateFrom: date.value,
      dateTo: date.value,
      page: 1,
      limit: 5000,
    })
    const map = {}
    for (const a of res.data || []) {
      if (!a?.stallId) continue
      map[a.stallId] = a
    }
    attendanceMap.value = map
  } catch {}
}

async function refreshAfterPayment() {
  if (postPaymentRefreshInProgress.value) return
  postPaymentRefreshInProgress.value = true
  try {
    await Promise.all([fetchAttendanceForDate(), refreshStorePaidStatus()])
  } catch (e) {
    console.error('Failed to refresh data after payment', e)
  } finally {
    postPaymentRefreshInProgress.value = false
  }
}

function schedulePostPaymentRefresh() {
  refreshAfterPayment()
  if (typeof window !== 'undefined') {
    window.setTimeout(() => {
      refreshAfterPayment()
    }, 4000)
  }
}

const responsiveSectionLimit = () => {
  if (typeof window === 'undefined') return 1
  const width = window.innerWidth
  if (width < 640) return 1
  if (width < 1024) return 2
  return 3
}

const sectionPage = ref(1)
const sectionLimit = ref(responsiveSectionLimit())

const handleResize = () => {
  sectionLimit.value = responsiveSectionLimit()
}

onMounted(async () => {
  await Promise.all([fetchAll(), fetchSaleTypesList(), fetchAttendanceForDate()])
  if (typeof window !== 'undefined') {
    handleResize()
    window.addEventListener('resize', handleResize)
  }
})
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleResize)
  }
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
    const aHasId = typeof a.id === 'number' && Number.isFinite(a.id)
    const bHasId = typeof b.id === 'number' && Number.isFinite(b.id)
    if (aHasId && bHasId) return a.id - b.id
    if (aHasId) return -1
    if (bHasId) return 1
    if (a.id === b.id) return 0
    return String(a.name).localeCompare(String(b.name))
  })
})

const filteredSections = computed(() => {
  if (!selectedSectionId.value) return sectionsForDisplay.value
  return sectionsForDisplay.value.filter((s) => s.key === String(selectedSectionId.value))
})

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
  [selectedSectionId, typeFilter],
  ([sectionId, type]) => {
    persistMapFilters({ sectionId, type })
  },
  { immediate: false },
)

watch(
  () => filteredSections.value.length,
  () => {
    const totalPages = Math.max(
      1,
      Math.ceil((filteredSections.value.length || 0) / sectionLimit.value),
    )
    if (sectionPage.value > totalPages) sectionPage.value = totalPages
    if (sectionPage.value < 1) sectionPage.value = 1
  },
)

watch(
  () => sectionLimit.value,
  () => {
    const totalPages = Math.max(
      1,
      Math.ceil((filteredSections.value.length || 0) / sectionLimit.value),
    )
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
    .filter(
      (s) =>
        !q ||
        (s.storeNumber || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q),
    )
}
function filterStallsBySection(sectionId) {
  const q = normSearch.value
  return (stalls.value || [])
    .filter((s) => matchesSection(s.sectionId, sectionId))
    .filter(
      (s) => !q || (s.description || '').toLowerCase().includes(q) || String(s.id).includes(q),
    )
}

function selectSaleTypeOption(option) {
  if (!option) {
    stallEditForm.value.saleTypeId = null
    saleTypeSearch.value = ''
    return
  }
  stallEditForm.value.saleTypeId = option.id
  saleTypeSearch.value = option.name || ''
}

function clearSaleTypeSelection() {
  stallEditForm.value.saleTypeId = null
  saleTypeSearch.value = ''
}

function storeColor(s) {
  if (isStorePaid(s)) return 'bg-green-500'
  if (isStoreOccupied(s)) return 'bg-red-500'
  return 'bg-gray-400'
}
function stallColor(st) {
  const stStatus = getAttendanceStatus(st.id)
  if (stStatus === 'PAID') return 'bg-green-500'
  if (stStatus === 'UNPAID') return 'bg-red-500'
  return 'bg-gray-400'
}

function isStorePaid(store) {
  return !!(storePaidMap.value && storePaidMap.value[store?.id])
}
function getAttendanceEntry(stallId) {
  if (!attendanceMap.value) return null
  return attendanceMap.value[stallId] || null
}

function getAttendanceStatus(stallId) {
  return getAttendanceEntry(stallId)?.status || null
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
  activeStall.value = it
  stallModalOpen.value = true
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

const activeStallSection = computed(() => {
  if (!activeStall.value) return null
  return (sections.value || []).find((sec) => sec.id === activeStall.value.sectionId) || null
})
const activeStallDailyFeeDisplay = computed(() => formatAmountDisplay(activeStall.value?.dailyFee))
const activeAttendanceEntry = computed(() => {
  if (!activeStall.value) return null
  return getAttendanceEntry(activeStall.value.id)
})

const activeStallAttendance = computed(() => {
  return activeAttendanceEntry.value?.status || null
})

const canPay = computed(() => Boolean(activeAttendanceEntry.value))
const canUndoAttendance = computed(() => {
  if (!activeAttendanceEntry.value) return false
  const status = String(activeAttendanceEntry.value.status || '').toUpperCase()
  return status !== 'PAID'
})

function closeStallModal() {
  stallModalOpen.value = false
  activeStall.value = null
}

function handleMakeAttendance() {
  if (!activeStall.value) return
  attendanceForm.value = {
    date: date.value || getTashkentTodayISO(),
  }
  attendanceModalError.value = ''
  attendanceModalOpen.value = true
}

async function handleUndoAttendance() {
  if (!activeAttendanceEntry.value || !canUndoAttendance.value || undoAttendanceLoading.value)
    return
  const confirmed =
    typeof window === 'undefined'
      ? true
      : window.confirm('Ushbu sana uchun davomatni bekor qilasizmi?')
  if (!confirmed) return
  undoAttendanceLoading.value = true
  try {
    await deleteAttendance(activeAttendanceEntry.value.id)
    await fetchAttendanceForDate()
  } catch (e) {
    alert(e?.response?.data?.message || "Davomatni bekor qilib bo'lmadi")
  } finally {
    undoAttendanceLoading.value = false
  }
}

function openStallEditModal() {
  if (!activeStall.value) return
  stallEditForm.value = {
    stallNumber: activeStall.value.stallNumber || '',
    area: activeStall.value.area ?? '',
    sectionId: activeStall.value.sectionId ?? null,
    saleTypeId: activeStall.value.saleTypeId ?? activeStall.value.SaleType?.id ?? null,
    description: activeStall.value.description || '',
  }
  saleTypeSearch.value = activeStall.value.SaleType?.name || ''
  stallEditModalError.value = ''
  stallEditModalOpen.value = true
}

// Keep combobox input in sync with selected saleTypeId
watch(
  () => stallEditForm.value.saleTypeId,
  (id) => {
    const st = (saleTypes.value || []).find((s) => s.id === Number(id))
    saleTypeSearch.value = st ? st.name : ''
  },
)

function resolvePaymentType() {
  if (typeof window === 'undefined') return 'click'
  return window.location.hostname === 'myrent.uz' ? 'payme' : 'click'
}

async function submitAttendanceModal() {
  if (!activeStall.value) return
  if (!attendanceForm.value.date) {
    attendanceModalError.value = 'Sana tanlang'
    return
  }
  attendanceSaving.value = true
  attendanceModalError.value = ''
  try {
    await createAttendance({
      stallId: activeStall.value.id,
      date: attendanceForm.value.date,
    })
    attendanceModalOpen.value = false
    await fetchAttendanceForDate()
  } catch (e) {
    attendanceModalError.value =
      e?.response?.data?.message || e?.message || "Davomatni yaratib bo'lmadi"
  } finally {
    attendanceSaving.value = false
  }
}

function applyUpdatedStall(updated) {
  if (!updated) return
  activeStall.value = updated
  stalls.value = (stalls.value || []).map((s) => (s.id === updated.id ? updated : s))
  if (stallEditModalOpen.value) {
    saleTypeSearch.value = updated?.SaleType?.name || ''
  }
}

async function submitStallEdit() {
  if (!activeStall.value) return
  stallEditSaving.value = true
  stallEditModalError.value = ''
  try {
    const payload = {
      stallNumber: stallEditForm.value.stallNumber?.trim() || null,
      area: stallEditForm.value.area !== '' ? Number(stallEditForm.value.area) : null,
      saleTypeId: stallEditForm.value.saleTypeId ? Number(stallEditForm.value.saleTypeId) : null,
      sectionId: stallEditForm.value.sectionId ? Number(stallEditForm.value.sectionId) : null,
      description: stallEditForm.value.description?.trim() || null,
    }
    const updated = await updateStall(activeStall.value.id, payload)
    applyUpdatedStall(updated)
    stallEditModalOpen.value = false
  } catch (e) {
    stallEditModalError.value = e?.response?.data?.message || "Rasta ma'lumotlarini saqlab bo'lmadi"
  } finally {
    stallEditSaving.value = false
  }
}

async function handlePay() {
  if (!activeAttendanceEntry.value) {
    alert('Avval ushbu sana uchun davomat kiriting')
    return
  }
  payLoading.value = true
  try {
    const paymentType = resolvePaymentType()
    const { url } = await getAttendancePayUrl(activeAttendanceEntry.value.id, paymentType)
    if (url && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener')
      schedulePostPaymentRefresh()
    } else {
      alert("To'lov havolasi topilmadi")
    }
  } catch (e) {
    alert(e?.response?.data?.message || "To'lov havolasini olishda xatolik")
  } finally {
    payLoading.value = false
  }
}
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain wide>
      <SectionTitle first>Raqamli Xarita (Bo'limlar, Do'konlar, Rastalar)</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>
      <div
        v-else-if="contractsWarning"
        class="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-amber-700"
      >
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
                :class="
                  typeFilter === opt.value
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-400 dark:bg-emerald-500/10 dark:text-emerald-100'
                    : 'border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300'
                "
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
              <option v-for="s in sectionsForDisplay" :key="s.key" :value="s.key">
                {{ s.name }}
              </option>
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
          <div
            class="rounded-lg border border-slate-200 p-4 text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            <div class="text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Do'konlar
            </div>
            <div class="text-2xl font-semibold">{{ overallSummary.stores }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Tanlangan bo'limlarda</div>
          </div>
          <div
            class="rounded-lg border border-slate-200 p-4 text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            <div class="text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Band / Bo'sh
            </div>
            <div class="text-2xl font-semibold text-amber-600">{{ overallSummary.storesBusy }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">
              Bo'sh: {{ overallSummary.storesFree }}
            </div>
          </div>
          <div
            class="rounded-lg border border-slate-200 p-4 text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            <div class="text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">
              To'langan do'konlar
            </div>
            <div class="text-2xl font-semibold text-emerald-600">
              {{ overallSummary.storesPaid }}
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-400">
              Jami: {{ overallSummary.stores }}
            </div>
          </div>
          <div
            class="rounded-lg border border-slate-200 p-4 text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            <div class="text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Rastalar
            </div>
            <div class="text-2xl font-semibold text-sky-600">{{ overallSummary.stalls }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">
              PAID: {{ overallSummary.stallsPaid }}, UNPAID: {{ overallSummary.stallsUnpaid }},
              Yo'q:
              {{ overallSummary.stallsNone }}
            </div>
          </div>
        </div>
      </CardBox>

      <div
        v-if="!loading && !sectionCards.length"
        class="rounded border border-dashed border-gray-300 p-6 text-center text-gray-500 dark:border-gray-700"
      >
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
              <div class="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {{ card.name }}
              </div>
              <div class="text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">
                ID: {{ card.id ?? '—' }}
              </div>
            </div>
            <div
              class="flex flex-wrap gap-2 text-xs font-medium text-slate-600 dark:text-slate-200"
            >
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
              <div
                class="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                <span>Do'konlar ({{ card.stats.store.total }})</span>
                <span class="text-xs font-normal text-gray-500 dark:text-gray-400">
                  Bo'sh: {{ card.stats.store.free }} · Band: {{ card.stats.store.busy }} ·
                  To'langan: {{ card.stats.store.paid }}
                </span>
              </div>
              <div v-if="card.storeList.length" class="overflow-x-auto">
                <div class="grid gap-2" :style="gridStyle(card.storeList.length, storeCellSize)">
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
              </div>
              <div
                v-else
                class="rounded border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-500 dark:border-gray-700"
              >
                Bu bo'limda do'kon mavjud emas
              </div>
            </div>

            <div v-if="typeFilter === 'both' || typeFilter === 'stalls'">
              <div
                class="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                <span>Rastalar ({{ card.stats.stall.total }})</span>
                <span class="text-xs font-normal text-gray-500 dark:text-gray-400">
                  PAID: {{ card.stats.stall.paid }} · UNPAID: {{ card.stats.stall.unpaid }} · Yo'q:
                  {{ card.stats.stall.none }}
                </span>
              </div>
              <div v-if="card.stallList.length" class="overflow-x-auto">
                <div class="grid gap-2" :style="gridStyle(card.stallList.length, stallCellSize)">
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
    <CardBoxModal
      v-model="stallModalOpen"
      title="Rasta tafsilotlari"
      button="light"
      button-label="Yopish"
      has-cancel
      @cancel="closeStallModal"
      @confirm="closeStallModal"
    >
      <div v-if="activeStall" class="space-y-3 text-sm text-gray-700 dark:text-gray-200">
        <div>
          <div class="text-base font-semibold">
            {{ activeStall.stallNumber || `#${activeStall.id}` }}
          </div>
          <div class="text-xs text-gray-500">ID: #{{ activeStall.id }}</div>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <div class="text-xs text-gray-500 uppercase dark:text-gray-400">Bo'lim</div>
            <div>{{ activeStallSection?.name || `Bo'lim #${activeStall.sectionId || '-'}` }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500 uppercase dark:text-gray-400">Maydon</div>
            <div>{{ activeStall.area }} m²</div>
          </div>
          <div>
            <div class="text-xs text-gray-500 uppercase dark:text-gray-400">Sotuv turi</div>
            <div>{{ activeStall.SaleType?.name || '-' }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500 uppercase dark:text-gray-400">Kunlik to'lov</div>
            <div>{{ activeStallDailyFeeDisplay }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500 uppercase dark:text-gray-400">Bugungi holat</div>
            <div>{{ activeStallAttendance || "Ma'lumot yo'q" }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500 uppercase dark:text-gray-400">Izoh</div>
            <div>{{ activeStall.description || '-' }}</div>
          </div>
        </div>
        <div class="flex flex-col gap-3 sm:flex-row">
          <BaseButton
            label="Davomat kiritish"
            color="info"
            class="flex-1"
            @click="handleMakeAttendance"
          />
          <BaseButton
            label="To'lov sahifasi"
            :color="canPay ? 'success' : 'warning'"
            class="flex-1"
            :disabled="!canPay || payLoading"
            @click="handlePay"
          />
          <BaseButton
            v-if="canUndoAttendance"
            label="Davomatni bekor qilish"
            color="warning"
            outline
            class="flex-1"
            :disabled="undoAttendanceLoading"
            @click="handleUndoAttendance"
          />
        </div>
        <p v-if="!canPay" class="text-xs text-amber-600">
          Avval {{ date }} sanasi uchun davomat kiriting.
        </p>
        <div class="border-t border-dashed border-gray-200 pt-3 dark:border-gray-700">
          <BaseButton
            label="Rastani tahrirlash"
            color="lightDark"
            class="w-full"
            @click="openStallEditModal"
          />
        </div>
      </div>
      <div v-else class="text-sm text-gray-500">Rasta tanlanmagan.</div>
    </CardBoxModal>
    <CardBoxModal
      v-model="attendanceModalOpen"
      title="Davomat kiritish"
      button="info"
      button-label="Saqlash"
      has-cancel
      :confirm-disabled="attendanceSaving"
      :close-on-confirm="false"
      @confirm="submitAttendanceModal"
      @cancel="attendanceModalOpen = false"
    >
      <div class="space-y-4">
        <FormField label="Sana">
          <FormControl v-model="attendanceForm.date" type="date" />
        </FormField>
        <p class="text-xs text-gray-500">
          Davomat {{ activeStall?.stallNumber || '' }} rastasi uchun yaratiladi.
        </p>
        <p
          v-if="attendanceModalError"
          class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {{ attendanceModalError }}
        </p>
      </div>
    </CardBoxModal>
    <CardBoxModal
      v-model="stallEditModalOpen"
      title="Rastani tahrirlash"
      button="primary"
      button-label="Saqlash"
      has-cancel
      :confirm-disabled="stallEditSaving"
      :close-on-confirm="false"
      @confirm="submitStallEdit"
      @cancel="stallEditModalOpen = false"
    >
      <div class="space-y-4">
        <FormField label="Rasta raqami">
          <FormControl v-model="stallEditForm.stallNumber" placeholder="Masalan, P1-001" />
        </FormField>
        <FormField label="Maydon (m²)">
          <FormControl v-model="stallEditForm.area" type="number" step="0.01" min="0" />
        </FormField>
        <FormField label="Bo'lim">
          <select
            v-model="stallEditForm.sectionId"
            class="w-full rounded border border-gray-300 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option :value="null">Tanlanmagan</option>
            <option v-for="sec in sections" :key="sec.id" :value="sec.id">
              {{ sec.name || `Bo'lim #${sec.id}` }}
            </option>
          </select>
        </FormField>
        <FormField label="Sotuv turi">
          <div class="relative">
            <FormControl
              v-model="saleTypeSearch"
              placeholder="Sotuv turini qidiring..."
              @focus="saleTypeDropdownOpen = true"
              @input="saleTypeDropdownOpen = true"
              @blur="
                setTimeout(() => {
                  saleTypeDropdownOpen = false
                }, 150)
              "
            />
            <div
              v-if="saleTypeDropdownOpen"
              class="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded border border-gray-300 bg-white shadow dark:border-gray-700 dark:bg-gray-900"
            >
              <div
                v-if="stallEditForm.saleTypeId"
                class="cursor-pointer px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                @mousedown.prevent
                @click="pickSaleType(null)"
              >
                Tanlovni tozalash
              </div>
              <div
                v-for="st in filteredSaleTypeOptions"
                :key="st.id"
                class="cursor-pointer px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                @mousedown.prevent
                @click="pickSaleType(st)"
              >
                {{ st.name }}
              </div>
              <div v-if="!filteredSaleTypeOptions.length" class="p-2 text-sm text-gray-500">
                Topilmadi
              </div>
            </div>
          </div>
        </FormField>
        <FormField label="Izoh">
          <FormControl
            v-model="stallEditForm.description"
            type="textarea"
            rows="3"
            placeholder="Izoh..."
          />
        </FormField>
        <p
          v-if="stallEditModalError"
          class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {{ stallEditModalError }}
        </p>
      </div>
    </CardBoxModal>
  </LayoutAuthenticated>
</template>
