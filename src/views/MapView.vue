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

const loading = ref(false)
const errorMsg = ref('')
const contractsWarning = ref('')

const sections = ref([])
const stores = ref([])
const stalls = ref([])
const attendanceMap = ref({}) // { [stallId]: 'PAID'|'UNPAID' }
const storePaidMap = ref({}) // { [storeId]: boolean }

const typeFilter = ref('both') // both | stores | stalls
const selectedSectionId = ref(null)
const date = ref(new Date().toISOString().substring(0, 10))
const search = ref('')
const zoom = ref(1)

const NO_SECTION_KEY = '__no_section__'

function isStoreOccupied(store) {
  if (typeof store?.isOccupied === 'boolean') return store.isOccupied
  const cs = store?.contracts
  if (!Array.isArray(cs)) return false
  const today = new Date()
  return cs.some((c) => {
    const active = c.isActive !== false
    const startOk = !c.issueDate || new Date(c.issueDate) <= today
    const endOk = !c.expiryDate || new Date(c.expiryDate) >= today
    return active && startOk && endOk
  })
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.data)) return payload.data
  return []
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
      listContracts({ page: 1, limit: 1000 }).catch((err) => {
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

function computeGrid(itemsCount) {
  const cols = Math.min(12, Math.max(4, Math.ceil(Math.sqrt(itemsCount || 1))))
  const style = { gridTemplateColumns: `repeat(${cols}, var(--block-size))` }
  return { cols, style }
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
  return isStoreOccupied(s) ? 'bg-red-500' : 'bg-green-500'
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
  // minimal: just alert; could open side panel later
  try {
    alert(`Do'kon: ${it.storeNumber}\nBo'lim: ${it.sectionId}\nHolat: ${isStoreOccupied(it) ? 'Band' : "Bo'sh"}\nTo'lov: ${isStorePaid(it) ? "To'langan" : 'Kutilmoqda'}`)
  } catch {}
}
function openStall(it) {
  const stStatus = attendanceMap.value[it.id] || '-'
  try {
    alert(`Rasta #${it.id}\nBo'lim: ${it.sectionId}\nBugun: ${stStatus}`)
  } catch {}
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
        <div class="flex flex-wrap items-end gap-3">
          <FormField label="Turi">
            <div class="flex items-center gap-2">
              <label class="flex items-center gap-1 text-sm"><input type="radio" value="both" v-model="typeFilter" /> Ikkalasi</label>
              <label class="flex items-center gap-1 text-sm"><input type="radio" value="stores" v-model="typeFilter" /> Do'konlar</label>
              <label class="flex items-center gap-1 text-sm"><input type="radio" value="stalls" v-model="typeFilter" /> Rastalar</label>
            </div>
          </FormField>
          <FormField label="Bo'lim">
            <select v-model="selectedSectionId" class="w-56 rounded border px-2 py-1 text-sm dark:bg-gray-900 dark:text-gray-100">
              <option :value="null">Barchasi</option>
              <option v-for="s in sectionsForDisplay" :key="s.key" :value="s.key">{{ s.name }}</option>
            </select>
          </FormField>
          <FormField label="Sana (Rasta holati)">
            <FormControl v-model="date" type="date" />
          </FormField>
          <FormField label="Qidirish">
            <FormControl v-model="search" placeholder="Do'kon raqami yoki Rasta izohi" />
          </FormField>
          <FormField label="Masshtab">
            <input type="range" min="0.75" max="1.5" step="0.05" v-model.number="zoom" />
          </FormField>
        </div>
      </CardBox>

      <CardBox class="mb-4">
      <div class="flex items-center gap-6 px-4 py-2 text-sm">
        <div class="font-semibold">Afsona</div>
        <div class="flex items-center gap-2">
          <span class="h-3 w-3 rounded-sm bg-green-500 inline-block"></span>
          <span>Do'kon: Bo'sh</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="h-3 w-3 rounded-sm bg-red-500 inline-block"></span>
          <span>Do'kon: Band</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="h-3 w-3 rounded-sm bg-gray-400 inline-block"></span>
          <span>Rasta: Bugun yo'q</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="h-3 w-3 rounded-sm bg-red-500 inline-block"></span>
          <span>Rasta: UNPAID</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="h-3 w-3 rounded-sm bg-green-500 inline-block"></span>
          <span>Rasta: PAID</span>
        </div>
      </div>
      </CardBox>

      <div class="flex flex-col gap-6">
        <div
          v-for="sec in paginatedSections"
          :key="sec.key"
          class="rounded border border-gray-200 p-4 dark:border-gray-700"
          :style="{ transform: `scale(${zoom})`, transformOrigin: 'top left' }"
        >
          <div class="mb-3 flex items-center justify-between">
            <div class="text-lg font-semibold">{{ sec.name }}</div>
            <div class="text-sm text-gray-500">
              ID: {{ sec.id ?? '—' }}
            </div>
          </div>
          <div class="space-y-4">
            <div v-if="typeFilter === 'both' || typeFilter === 'stores'">
              <div class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <template v-if="filterStoresBySection(sec.key).length">
                  <span>Do'konlar: {{ filterStoresBySection(sec.key).length }}</span>
                  <span class="ml-3 text-xs text-gray-500">
                    Bo'sh: {{ filterStoresBySection(sec.key).filter(s => !isStoreOccupied(s)).length }},
                    Band: {{ filterStoresBySection(sec.key).filter(s => isStoreOccupied(s)).length }},
                    To'langan: {{ filterStoresBySection(sec.key).filter(s => isStorePaid(s)).length }}
                  </span>
                </template>
                <template v-else>Do'konlar (0)</template>
              </div>
              <div class="grid gap-2" :style="computeGrid(filterStoresBySection(sec.key).length).style" style="--block-size: 56px">
                <div
                  v-for="s in filterStoresBySection(sec.key)"
                  :key="s.id"
                  class="flex h-14 w-14 cursor-pointer items-center justify-center rounded text-xs text-white"
                  :class="storeColor(s)"
                  :title="`#${s.id} ${s.storeNumber || ''}\nHolat: ${isStoreOccupied(s) ? 'Band' : 'Bo\'sh'}\nTo'lov: ${isStorePaid(s) ? 'To\'langan' : 'Kutilmoqda'}`"
                  @click="openStore(s)"
                >
                  {{ s.storeNumber || s.id }}
                </div>
              </div>
            </div>

            <div v-if="typeFilter === 'both' || typeFilter === 'stalls'">
              <div class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <template v-if="filterStallsBySection(sec.key).length">
                  <span>Rastalar: {{ filterStallsBySection(sec.key).length }}</span>
                  <span class="ml-3 text-xs text-gray-500">
                    PAID: {{ filterStallsBySection(sec.key).filter(st => getAttendanceStatus(st.id) === 'PAID').length }},
                    UNPAID: {{ filterStallsBySection(sec.key).filter(st => getAttendanceStatus(st.id) === 'UNPAID').length }},
                    Yo'q: {{ filterStallsBySection(sec.key).filter(st => !getAttendanceStatus(st.id)).length }}
                  </span>
                </template>
                <template v-else>Rastalar (0)</template>
              </div>
              <div class="grid gap-2" :style="computeGrid(filterStallsBySection(sec.key).length).style" style="--block-size: 48px">
                <div
                  v-for="st in filterStallsBySection(sec.key)"
                  :key="st.id"
                  class="flex h-12 w-12 cursor-pointer items-center justify-center rounded text-xs text-white"
                  :class="stallColor(st)"
                  :title="`#${st.id} ${st.description || ''}\nBugun: ${getAttendanceStatus(st.id) || '-'}`"
                  @click="openStall(st)"
                >
                  #{{ st.id }}
                </div>
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

<style scoped>
.grid {
  display: grid;
}
</style>
