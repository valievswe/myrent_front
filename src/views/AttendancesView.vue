<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import {
  listAttendances,
  createAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendancePayUrl,
} from '@/services/attendances'
import { listStalls } from '@/services/stalls'
import { listSections } from '@/services/sections'
import { listSaleTypes } from '@/services/saleTypes'
import { downloadCSV } from '../utils/export'

const items = ref([])
const loading = ref(false)
const errorMsg = ref('')
const page = ref(1)
const limit = ref(10)
const total = ref(0)

const showForm = ref(false)
const editingId = ref(null)
const form = ref({ date: new Date().toISOString().substring(0, 10), stallId: null })
const stalls = ref([])
const stallSearch = ref('')
const stallOptions = ref([])
const selectedStallObj = ref(null)
const selectedStall = computed(
  () => selectedStallObj.value || stalls.value.find((s) => s.id === Number(form.value.stallId)),
)
const suggestedAmount = computed(() => {
  const s = selectedStall.value
  if (!s) return null
  const area = Number(s.area) || 0
  const tax = s.SaleType ? Number(s.SaleType.tax) || 0 : 0
  return area * tax
})

async function fetchData() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await listAttendances({ page: page.value, limit: limit.value })
    items.value = res.data
    total.value = res.total ?? items.value.length
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Yuklashda xatolik'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // Optional preload of some stalls; search will handle large lists dynamically
  try {
    stalls.value = (await listStalls({ page: 1, limit: 50 })).data || []
  } catch {}
  await fetchData()
})

function openCreate() {
  editingId.value = null
  form.value = { date: new Date().toISOString().substring(0, 10), stallId: null }
  stallSearch.value = ''
  stallOptions.value = []
  selectedStallObj.value = null
  showForm.value = true
}

function openEdit(it) {
  editingId.value = it.id
  form.value = { date: it.date?.substring(0, 10) || '', stallId: it.stallId }
  stallSearch.value = `#${it.stallId}`
  stallOptions.value = []
  selectedStallObj.value = stalls.value.find((s) => s.id === Number(it.stallId)) || null
  showForm.value = true
}

async function submitForm() {
  loading.value = true
  errorMsg.value = ''
  try {
    const payload = {
      date: form.value.date,
      stallId: form.value.stallId ? Number(form.value.stallId) : null,
    }
    if (!payload.date || !payload.stallId) throw new Error('Sana va Rasta majburiy')
    if (!suggestedAmount.value || suggestedAmount.value <= 0)
      throw new Error("Rasta to'lovi aniqlanmadi")
    if (editingId.value) await updateAttendance(editingId.value, payload)
    else await createAttendance(payload)
    showForm.value = false
    await fetchData()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || e.message || 'Saqlashda xatolik'
  } finally {
    loading.value = false
  }
}

async function removeItem(it) {
  if (!confirm("Haqiqatan o'chirmoqchimisiz?")) return
  loading.value = true
  errorMsg.value = ''
  try {
    await deleteAttendance(it.id)
    await fetchData()
    try {
      await loadAttendancesForDate()
    } catch {}
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || "O'chirishda xatolik"
  } finally {
    loading.value = false
  }
}

async function pay(it) {
  try {
    const hostname = window.location.hostname;
    const paymentType = hostname === "myrent.uz" ? "payme" : "click";

    const { url } = await getAttendancePayUrl(it.id, paymentType)

    if (url) {
      window.open(url, '_blank', 'noopener')
    } else {
      alert('To‘lov havolasi topilmadi')
    }
  } catch (e) {
    console.error(e)
    alert('To‘lov havolasini olishda xatolik yuz berdi')
  }
}

let stallDebounceId
async function fetchStallOptions(q) {
  try {
    const res = await listStalls({ search: q, page: 1, limit: 20 })
    stallOptions.value = res.data || []
  } catch {}
}
watch(stallSearch, (q) => {
  if (stallDebounceId) clearTimeout(stallDebounceId)
  stallDebounceId = setTimeout(() => fetchStallOptions((q || '').trim()), 250)
})

function selectStall(s) {
  form.value.stallId = s?.id ?? null
  stallSearch.value = s ? `#${s.id} - ${s.description || ''}` : ''
  selectedStallObj.value = s || null
  stallOptions.value = []
}
function clearStall() {
  form.value.stallId = null
  stallSearch.value = ''
  selectedStallObj.value = null
  stallOptions.value = []
}

// --- Bulk by date: robust daily workflow ---
const bulkDate = ref(new Date().toISOString().substring(0, 10))
const stallSearchBulk = ref('')
const stallsBulk = ref([])
const stallPage = ref(1)
const stallLimit = ref(10)
const stallTotal = ref(0)
const selectedStallIds = ref(new Set())
const attendanceByStall = ref({}) // { [stallId]: attendance }
const bulkLoading = ref(false)
const sections = ref([])
const saleTypes = ref([])
const selectedSectionId = ref(null)
const selectedSaleTypeId = ref(null)
const displayedStalls = computed(() => {
  let list = stallsBulk.value || []
  if (selectedSectionId.value)
    list = list.filter((s) => Number(s.sectionId) === Number(selectedSectionId.value))
  if (selectedSaleTypeId.value)
    list = list.filter((s) => Number(s.saleTypeId) === Number(selectedSaleTypeId.value))
  return list
})

function computedFeeFor(stall) {
  const area = Number(stall.area) || 0
  const tax = stall.SaleType ? Number(stall.SaleType.tax) || 0 : 0
  return area * tax
}

async function loadAttendancesForDate() {
  try {
    const res = await listAttendances({
      dateFrom: bulkDate.value,
      dateTo: bulkDate.value,
      page: 1,
      limit: 5000,
    })
    const map = {}
    for (const a of res.data || []) map[a.stallId] = a
    attendanceByStall.value = map
  } catch (e) {
    console.error(e)
  }
}
async function loadStallsBulk() {
  bulkLoading.value = true
  try {
    const res = await listStalls({
      search: stallSearchBulk.value,
      page: stallPage.value,
      limit: stallLimit.value,
    })
    stallsBulk.value = res.data || []
    stallTotal.value = res.pagination?.total ?? res.total ?? stallsBulk.value.length
  } catch (e) {
    console.error(e)
  } finally {
    bulkLoading.value = false
  }
}
async function selectAllAcrossFiltered() {
  bulkLoading.value = true
  try {
    const res = await listStalls({ search: stallSearchBulk.value, page: 1, limit: 5000 })
    let list = res.data || []
    if (selectedSectionId.value)
      list = list.filter((s) => Number(s.sectionId) === Number(selectedSectionId.value))
    if (selectedSaleTypeId.value)
      list = list.filter((s) => Number(s.saleTypeId) === Number(selectedSaleTypeId.value))
    const set = new Set(selectedStallIds.value)
    for (const it of list) set.add(it.id)
    selectedStallIds.value = set
  } catch (e) {
    console.error(e)
  } finally {
    bulkLoading.value = false
  }
}
function statusForStall(stall) {
  const a = attendanceByStall.value[stall.id]
  return a ? a.status : null
}
function isSelected(stall) {
  return selectedStallIds.value.has(stall.id)
}
function toggleSelect(stall) {
  const set = selectedStallIds.value
  if (set.has(stall.id)) set.delete(stall.id)
  else set.add(stall.id)
  selectedStallIds.value = new Set(set)
}
function selectAllPage() {
  const set = new Set(selectedStallIds.value)
  for (const s of stallsBulk.value) set.add(s.id)
  selectedStallIds.value = set
}
function clearSelected() {
  selectedStallIds.value = new Set()
}
// History per stall
const historyByStall = ref({}) // { [stallId]: attendance[] }
const historyOpen = ref({}) // { [stallId]: boolean }
const historyLoading = ref({})
async function loadHistory(stallId) {
  historyLoading.value = { ...historyLoading.value, [stallId]: true }
  try {
    const res = await listAttendances({ stallId, page: 1, limit: 30 })
    historyByStall.value = {
      ...historyByStall.value,
      [stallId]: (res.data || []).sort((a, b) => new Date(b.date) - new Date(a.date)),
    }
  } catch (e) {
    console.error(e)
  } finally {
    historyLoading.value = { ...historyLoading.value, [stallId]: false }
  }
}
async function toggleHistory(stall) {
  const id = stall.id
  const open = !!historyOpen.value[id]
  historyOpen.value = { ...historyOpen.value, [id]: !open }
  if (!open && !historyByStall.value[id]) await loadHistory(id)
}
async function createOne(stall) {
  try {
    await createAttendance({ date: bulkDate.value, stallId: stall.id })
    await loadAttendancesForDate()
  } catch (e) {
    alert(e?.response?.data?.message || e.message || 'Yaratishda xatolik')
  }
}
async function bulkCreate() {
  const ids = Array.from(selectedStallIds.value)
  const toCreate = ids.filter((id) => !attendanceByStall.value[id])
  if (!toCreate.length) return
  bulkLoading.value = true
  try {
    for (const id of toCreate) {
      await createAttendance({ date: bulkDate.value, stallId: id })
    }
    await loadAttendancesForDate()
  } catch (e) {
    alert(e?.response?.data?.message || e.message || 'Mass yaratishda xatolik')
  } finally {
    bulkLoading.value = false
  }
}

async function exportAttendancesCSV() {
  bulkLoading.value = true
  try {
    const headers = ['Sana', 'RastaID', 'Izoh', 'Maydon', 'Presskurant', 'Hisoblangan', 'Holat']
    const rows = []
    let p = 1
    const dateStr = bulkDate.value
    while (true) {
      const res = await listAttendances({ dateFrom: dateStr, dateTo: dateStr, page: p, limit: 200 })
      const arr = res.data || []
      for (const a of arr) {
        rows.push([
          a.date ? a.date.substring(0, 10) : '',
          a.stallId,
          a.Stall?.description || '',
          a.Stall?.area ?? '',
          a.Stall?.SaleType?.tax ?? '',
          a.amount ?? '',
          a.status,
        ])
      }
      if (arr.length < 200) break
      p++
    }
    downloadCSV(`attendances_${dateStr}.csv`, headers, rows)
  } catch (e) {
    console.error(e)
    alert('Eksportda xatolik')
  } finally {
    bulkLoading.value = false
  }
}

watch([bulkDate, stallSearchBulk, stallPage, stallLimit], async () => {
  await loadAttendancesForDate()
  await loadStallsBulk()
})
onMounted(async () => {
  try {
    sections.value = await listSections()
  } catch {}
  try {
    saleTypes.value = await listSaleTypes()
  } catch {}
  await loadAttendancesForDate()
  await loadStallsBulk()
})
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitle first>Kunlik Rasta To'lovlari (Attendance)</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>

      <CardBox class="mb-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div class="flex gap-3">
            <FormField label="Sana">
              <FormControl v-model="bulkDate" type="date" />
            </FormField>
            <FormField label="Qidirish (rasta)">
              <FormControl v-model="stallSearchBulk" placeholder="Izoh yoki boshqa maydonlar" />
            </FormField>
          </div>
          <div class="flex gap-2">
            <BaseButton
              color="success"
              :disabled="bulkLoading"
              label="Tanlanganlarga yaratish"
              @click="bulkCreate"
            />
            <BaseButton
              color="info"
              outline
              :disabled="!selectedStallIds.size"
              label="Tanlovni tozalash"
              @click="clearSelected"
            />
            <BaseButton
              color="info"
              outline
              :disabled="bulkLoading"
              label="Eksport (Kun)"
              @click="exportAttendancesCSV"
            />
          </div>
        </div>
      </CardBox>

      <CardBox has-table>
        <div class="px-4 py-3">
          <div class="flex flex-wrap items-center gap-3">
            <div class="text-sm text-gray-600 dark:text-gray-300">Filtrlar:</div>
            <select
              v-model="selectedSectionId"
              class="w-56 rounded border px-2 py-1 text-sm dark:bg-gray-900 dark:text-gray-100"
            >
              <option :value="null">Bo'lim: barchasi</option>
              <option v-for="sec in sections" :key="sec.id" :value="sec.id">{{ sec.name }}</option>
            </select>
            <select
              v-model="selectedSaleTypeId"
              class="w-56 rounded border px-2 py-1 text-sm dark:bg-gray-900 dark:text-gray-100"
            >
              <option :value="null">Sotuv turi: barchasi</option>
              <option v-for="st in saleTypes" :key="st.id" :value="st.id">{{ st.name }}</option>
            </select>
            <BaseButton
              color="info"
              outline
              :disabled="!displayedStalls.length"
              label="Sahifadagi barchasini belgilash"
              @click="selectAllPage"
            />
            <BaseButton
              color="info"
              :disabled="bulkLoading"
              label="Filtrlangan (hammasi) belgilash"
              @click="selectAllAcrossFiltered"
            />
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full table-auto">
            <thead>
              <tr>
                <th class="px-4 py-2 text-left">
                  <input
                    type="checkbox"
                    @change="
                      ($event) => ($event.target.checked ? selectAllPage() : clearSelected())
                    "
                  />
                </th>
                <th class="px-4 py-2 text-left">Rasta</th>
                <th class="px-4 py-2 text-left">Maydon (kv m)</th>
                <th class="px-4 py-2 text-left">Presskurant</th>
                <th class="px-4 py-2 text-left">Hisoblangan</th>
                <th class="px-4 py-2 text-left">Holat ({{ bulkDate }})</th>
                <th class="px-4 py-2 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="bulkLoading">
                <td colspan="7" class="px-4 py-6 text-center">Yuklanmoqda...</td>
              </tr>
              <tr v-else-if="!stallsBulk.length">
                <td colspan="7" class="px-4 py-6 text-center">Ma'lumot topilmadi</td>
              </tr>
              <template v-for="s in displayedStalls" :key="s.id">
                <tr class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td class="px-4 py-2">
                    <input
                      type="checkbox"
                      :checked="isSelected(s)"
                      @change="() => toggleSelect(s)"
                    />
                  </td>
                  <td class="px-4 py-2">#{{ s.id }} - {{ s.description || '' }}</td>
                  <td class="px-4 py-2">{{ s.area }}</td>
                  <td class="px-4 py-2">{{ s.SaleType?.tax }}</td>
                  <td class="px-4 py-2">{{ computedFeeFor(s) }}</td>
                  <td class="px-4 py-2">
                    <span v-if="statusForStall(s) === 'PAID'" class="text-green-600">PAID</span>
                    <span v-else-if="statusForStall(s) === 'UNPAID'" class="text-red-600"
                      >UNPAID</span
                    >
                    <span v-else class="text-gray-500">-</span>
                  </td>
                  <td class="px-4 py-2 text-right">
                    <template v-if="!attendanceByStall[s.id]">
                      <BaseButton color="success" small label="Yaratish" @click="createOne(s)" />
                    </template>
                    <template v-else-if="attendanceByStall[s.id]?.status === 'UNPAID'">
                      <BaseButton
                        color="success"
                        small
                        outline
                        label="To'lov"
                        class="ml-2"
                        @click="pay(attendanceByStall[s.id])"
                      />
                      <BaseButton
                        color="danger"
                        small
                        outline
                        label="O'chirish"
                        class="ml-2"
                        @click="removeItem(attendanceByStall[s.id])"
                      />
                    </template>
                    <template v-else-if="attendanceByStall[s.id]?.status === 'PAID'">
                      <span class="text-green-600">To'langan</span>
                    </template>
                    <template v-else>
                      <span class="text-gray-500">-</span>
                    </template>
                    <BaseButton
                      color="info"
                      small
                      outline
                      label="Tarix"
                      class="ml-2"
                      @click="toggleHistory(s)"
                    />
                  </td>
                </tr>
                <tr v-if="historyOpen[s.id]" class="bg-gray-50 dark:bg-gray-800/50">
                  <td colspan="7" class="px-4 py-2">
                    <div class="mb-2 text-sm font-medium">Rasta to'lov tarixi (#{{ s.id }})</div>
                    <div v-if="historyLoading[s.id]" class="text-xs text-gray-500">
                      Yuklanmoqda...
                    </div>
                    <div
                      v-else-if="!(historyByStall[s.id] || []).length"
                      class="text-xs text-gray-500"
                    >
                      Tarix yo'q
                    </div>
                    <div v-else class="overflow-x-auto">
                      <table class="w-full text-sm">
                        <thead>
                          <tr>
                            <th class="px-2 py-1 text-left">Sana</th>
                            <th class="px-2 py-1 text-left">Summasi</th>
                            <th class="px-2 py-1 text-left">Holat</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="a in historyByStall[s.id] || []" :key="a.id">
                            <td class="px-2 py-1">{{ a.date ? a.date.substring(0, 10) : '-' }}</td>
                            <td class="px-2 py-1">{{ a.amount }}</td>
                            <td class="px-2 py-1">
                              <span
                                :class="
                                  a.status === 'PAID'
                                    ? 'text-green-600'
                                    : a.status === 'UNPAID'
                                      ? 'text-red-600'
                                      : 'text-gray-600'
                                "
                                >{{ a.status }}</span
                              >
                            </td>
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
        <div class="flex items-center justify-between px-4 py-3">
          <div>Jami: {{ displayedStalls.length }} (umumiy: {{ stallTotal }})</div>
          <div class="flex items-center gap-2">
            <BaseButton
              :disabled="stallPage <= 1 || bulkLoading"
              label="Oldingi"
              @click="(stallPage--, loadStallsBulk())"
            />
            <span>Sahifa {{ stallPage }}</span>
            <BaseButton
              :disabled="stallsBulk.length < stallLimit || bulkLoading"
              label="Keyingi"
              @click="(stallPage++, loadStallsBulk())"
            />
          </div>
        </div>
      </CardBox>

      <CardBox v-if="showForm" class="mt-4" is-form @submit.prevent="submitForm">
        <SectionTitle>{{
          editingId ? 'Attendance tahrirlash' : 'Attendance yaratish'
        }}</SectionTitle>
        <div class="grid gap-4 md:grid-cols-2">
          <FormField label="Sana">
            <FormControl v-model="form.date" type="date" />
          </FormField>
          <FormField label="Rasta">
            <div class="relative">
              <FormControl
                v-model="stallSearch"
                placeholder="Qidirish: rasta ID yoki izoh"
                @focus="fetchStallOptions((stallSearch || '').trim())"
              />
              <div
                v-if="stallSearch && stallOptions.length"
                class="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-gray-300 bg-white shadow dark:border-gray-700 dark:bg-gray-900"
              >
                <div
                  v-for="s in stallOptions"
                  :key="s.id"
                  class="cursor-pointer px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                  @click="selectStall(s)"
                >
                  #{{ s.id }} - {{ s.description || '' }}
                  <span class="text-xs text-gray-500">
                    ({{ s.area }} m2{{ s.SaleType ? `, ${s.SaleType.tax}` : '' }})
                  </span>
                </div>
                <div v-if="!stallOptions.length" class="px-3 py-2 text-sm text-gray-500">
                  Natija yo'q
                </div>
              </div>
            </div>
            <div v-if="form.stallId" class="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Tanlangan: {{ stallSearch }}
              <BaseButton
                small
                outline
                color="info"
                label="Tozalash"
                class="ml-2"
                @click="clearStall"
              />
            </div>
          </FormField>
          <FormField label="Summasi (hisoblangan)">
            <div class="rounded border border-gray-200 p-2 dark:border-gray-700">
              {{ suggestedAmount ?? '-' }}
            </div>
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
