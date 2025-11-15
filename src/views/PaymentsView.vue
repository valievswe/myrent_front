<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { mdiRefresh, mdiHistory, mdiFileExcelBox } from '@mdi/js'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import CardBoxModal from '@/components/CardBoxModal.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import FilterToolbar from '@/components/FilterToolbar.vue'
import { listContracts } from '@/services/contracts'
import { listAttendances, getAttendancePayUrl, refreshAttendance, getAttendanceHistory } from '@/services/attendances'
import { listSections } from '@/services/sections'
import { downloadCSV, downloadXLSX } from '../utils/export'
import { isContractActive } from '@/utils/contracts'
import {
  formatTashkentDate,
  formatTashkentDateISO,
  getTashkentTodayISO,
  parseTashkentDate,
  startOfTashkentDay,
} from '@/utils/time'

const contractLoading = ref(false)
const attendanceLoading = ref(false)
const contractError = ref('')
const attendanceError = ref('')

const contracts = ref([])
const totalContracts = ref(0)
const contractPage = ref(1)
const contractLimit = ref(20)
const contractSearch = ref('')
const contractStatus = ref('active')

const attendanceDate = ref(getTashkentTodayISO())
const attendanceStatus = ref('pending')
const attendanceItems = ref([])
const sections = ref([])
const attendanceRefreshState = ref({})
const attendanceHistoryModal = ref({
  open: false,
  stallId: null,
  loading: false,
  days: 30,
  items: [],
  total: 0,
})
const attendanceHistoryError = ref('')

function contractPaymentStatus(contract) {
  const tx = (contract.transactions || [])
    .slice()
    .sort(
      (a, b) =>
        (parseTashkentDate(b.createdAt)?.getTime() || 0) -
        (parseTashkentDate(a.createdAt)?.getTime() || 0),
    )
  const lastPaid = tx.find((t) => t.status === 'PAID')
  const pending = tx.find((t) => t.status === 'PENDING')

  if (pending) return 'pending'
  if (lastPaid) {
    const lastDate = parseTashkentDate(lastPaid.createdAt)
    const now = startOfTashkentDay() || new Date()
    const sameMonth =
      lastDate &&
      now &&
      lastDate.getFullYear() === now.getFullYear() &&
        lastDate.getMonth() === now.getMonth()
    return sameMonth ? 'paid' : 'overdue'
  }
  return isContractActive(contract) ? 'overdue' : 'inactive'
}

function lastPaidTransaction(contract) {
  return (contract.transactions || [])
    .filter((t) => t.status === 'PAID')
    .sort(
      (a, b) =>
        (parseTashkentDate(b.createdAt)?.getTime() || 0) -
        (parseTashkentDate(a.createdAt)?.getTime() || 0),
    )[0]
}

function lastPaidDate(contract) {
  const tx = lastPaidTransaction(contract)
  return tx ? formatTashkentDate(tx.createdAt) : '-'
}

const filteredContracts = computed(() => {
  const q = contractSearch.value.trim().toLowerCase()
  return (contracts.value || []).filter((c) => {
    if (contractStatus.value === 'active' && !isContractActive(c)) return false
    if (contractStatus.value === 'archived' && isContractActive(c)) return false
    if (contractStatus.value === 'pending' && contractPaymentStatus(c) !== 'pending') return false
    if (contractStatus.value === 'overdue' && contractPaymentStatus(c) !== 'overdue') return false
    if (contractStatus.value === 'paid' && contractPaymentStatus(c) !== 'paid') return false

    if (!q) return true
    const haystack = [
      c.owner?.fullName,
      c.owner?.tin,
      c.store?.storeNumber,
      c.certificateNumber,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
})

const contractSummary = computed(() => {
  const summary = { total: 0, paid: 0, pending: 0, overdue: 0, inactive: 0, monthly: 0 }
  for (const c of filteredContracts.value) {
    summary.total++
    summary.monthly += Number(c.shopMonthlyFee || 0)
    const status = contractPaymentStatus(c)
    if (status === 'paid') summary.paid++
    else if (status === 'pending') summary.pending++
    else if (status === 'overdue') summary.overdue++
    else if (status === 'inactive') summary.inactive++
  }
  return summary
})

function attendanceState(a) {
  if (!a) return 'unknown'
  if (a.status === 'PAID') return 'paid'
  if (a.status === 'UNPAID') return 'pending'
  return 'unknown'
}

const filteredAttendances = computed(() => {
  return (attendanceItems.value || []).filter((a) => {
    if (attendanceStatus.value === 'pending') return attendanceState(a) === 'pending'
    if (attendanceStatus.value === 'paid') return attendanceState(a) === 'paid'
    return true
  })
})

const attendanceSummary = computed(() => {
  const summary = { total: 0, pending: 0, paid: 0, amountPending: 0, amountPaid: 0 }
  for (const a of attendanceItems.value || []) {
    summary.total++
    const amount = Number(a.amount || 0)
    if (attendanceState(a) === 'paid') {
      summary.paid++
      summary.amountPaid += amount
    } else if (attendanceState(a) === 'pending') {
      summary.pending++
      summary.amountPending += amount
    }
  }
  return summary
})

const attendanceHistorySummary = computed(() => {
  const items = attendanceHistoryModal.value.items || []
  return items.reduce(
    (acc, item) => {
      const numeric = Number(item.amount || 0)
      if (item.status === 'PAID') {
        acc.paid++
        acc.amountPaid += numeric
      } else {
        acc.unpaid++
        acc.amountUnpaid += numeric
      }
      return acc
    },
    { paid: 0, unpaid: 0, amountPaid: 0, amountUnpaid: 0 },
  )
})

async function fetchContracts() {
  contractLoading.value = true
  contractError.value = ''
  try {
    const res = await listContracts({
      page: contractPage.value,
      limit: contractLimit.value,
      isActive: contractStatus.value === 'archived' ? false : undefined,
    })
    contracts.value = res.data || []
    totalContracts.value = res.pagination?.total ?? contracts.value.length
  } catch (e) {
    contractError.value = e?.response?.data?.message || 'Shartnomalarni olishda xatolik'
  } finally {
    contractLoading.value = false
  }
}

async function fetchAttendances() {
  attendanceLoading.value = true
  attendanceError.value = ''
  try {
    const res = await listAttendances({
      dateFrom: attendanceDate.value,
      dateTo: attendanceDate.value,
      page: 1,
      limit: 500,
    })
    attendanceItems.value = res.data || []
  } catch (e) {
    attendanceError.value = e?.response?.data?.message || 'Rasta to\'lovlarini olishda xatolik'
  } finally {
    attendanceLoading.value = false
  }
}

async function exportContractsCSV() {
  contractLoading.value = true
  try {
    const headers = ['ID', 'Ega', "Do'kon", 'Oylik fee', 'Holati', "Oxirgi to'lov"]
    const rows = filteredContracts.value.map((c) => {
      const status = contractPaymentStatus(c)
      const lastPaid = lastPaidTransaction(c)
      return [
        c.id,
        c.owner?.fullName || c.ownerId,
        c.store?.storeNumber || c.storeId,
        c.shopMonthlyFee ?? '',
        status,
        lastPaid ? formatTashkentDateISO(lastPaid.createdAt) : '',
      ]
    })
    downloadCSV(`contract_payments_${getTashkentTodayISO()}.csv`, headers, rows)
  } finally {
    contractLoading.value = false
  }
}

async function exportAttendancesCSV() {
  attendanceLoading.value = true
  try {
    const headers = ['ID', 'Sana', 'Rasta', 'Holati', 'Summasi']
    const rows = filteredAttendances.value.map((a) => [
      a.id,
      formatTashkentDateISO(a.date) || '',
      a.stallId,
      a.status,
      a.amount ?? '',
    ])
    downloadCSV(`attendance_payments_${attendanceDate.value}.csv`, headers, rows)
  } finally {
    attendanceLoading.value = false
  }
}

async function preloadSections() {
  try {
    sections.value = await listSections()
  } catch (e) {
    console.error(e)
  }
}

async function openPayLink(attendance) {
  try {
    const { url } = await getAttendancePayUrl(attendance.id)
    if (url) window.open(url, '_blank', 'noopener')
  } catch (e) {
    console.error(e)
    alert("To'lov havolasini olishda xatolik")
  }
}

function updateAttendanceInList(updated) {
  const idx = attendanceItems.value.findIndex((item) => item.id === updated.id)
  if (idx !== -1) {
    attendanceItems.value[idx] = updated
  }
}

async function refreshSingleAttendance(attendance) {
  if (!attendance?.id) return
  if (attendanceRefreshState.value[attendance.id]) return
  attendanceRefreshState.value = { ...attendanceRefreshState.value, [attendance.id]: true }
  try {
    const fresh = await refreshAttendance(attendance.id)
    if (fresh) updateAttendanceInList(fresh)
  } catch (e) {
    console.error(e)
    alert("Statusni yangilashda xatolik")
  } finally {
    const clone = { ...attendanceRefreshState.value }
    delete clone[attendance.id]
    attendanceRefreshState.value = clone
  }
}

async function openAttendanceHistory(attendance) {
  if (!attendance?.id) return
  attendanceHistoryModal.value.open = true
  attendanceHistoryModal.value.loading = true
  attendanceHistoryModal.value.stallId = attendance.stallId
  attendanceHistoryError.value = ''
  try {
    const history = await getAttendanceHistory(attendance.id, { days: attendanceHistoryModal.value.days })
    attendanceHistoryModal.value.items = history.items || []
    attendanceHistoryModal.value.total = history.total || history.items?.length || 0
    attendanceHistoryModal.value.days = history.days || attendanceHistoryModal.value.days
  } catch (e) {
    attendanceHistoryError.value = e?.response?.data?.message || 'Tarixni yuklashda xatolik'
    attendanceHistoryModal.value.items = []
  } finally {
    attendanceHistoryModal.value.loading = false
  }
}

function downloadAttendanceHistory() {
  const items = attendanceHistoryModal.value.items || []
  if (!items.length) return
  const headers = ["Sana", "Rasta", "Holati", "Summasi"]
  const rows = items.map((item) => [
    formatTashkentDate(item.date) || '',
    item.stallId,
    item.status,
    item.amount ?? '',
  ])
  downloadXLSX(`stall_${attendanceHistoryModal.value.stallId}_history.xlsx`, headers, rows, 'History')
}

function sectionNameForAttendance(a) {
  const id = a?.Stall?.sectionId
  if (!id) return '-'
  const sec = sections.value.find((s) => s.id === id)
  return sec ? sec.name : `#${id}`
}

let searchDebounce
watch(contractSearch, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    contractPage.value = 1
    fetchContracts()
  }, 250)
})

watch([contractPage, contractLimit], fetchContracts)
watch(contractStatus, () => {
  contractPage.value = 1
  fetchContracts()
})
watch([attendanceDate], fetchAttendances)

onMounted(async () => {
  await preloadSections()
  await fetchContracts()
  await fetchAttendances()
})
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitle first>To'lovlar holati</SectionTitle>

      <div v-if="contractError" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ contractError }}
      </div>

      <div class="mb-4 grid gap-4 md:grid-cols-4">
        <CardBox>
          <div class="p-4">
            <div class="text-xs text-gray-500">Faol shartnomalar</div>
            <div class="text-2xl font-semibold">{{ contractSummary.total }}</div>
            <div class="text-xs text-gray-400">Oylik majburiyat: {{ contractSummary.monthly }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-4">
            <div class="text-xs text-green-600">Bu oyda to'langan</div>
            <div class="text-2xl font-semibold text-green-600">{{ contractSummary.paid }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-4">
            <div class="text-xs text-amber-600">Kutilmoqda</div>
            <div class="text-2xl font-semibold text-amber-600">{{ contractSummary.pending }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-4">
            <div class="text-xs text-red-600">Muddati o'tgan</div>
            <div class="text-2xl font-semibold text-red-600">{{ contractSummary.overdue }}</div>
          </div>
        </CardBox>
      </div>

      <CardBox class="mb-4">
        <FilterToolbar>
          <FormField label="Shartnoma holati" class="min-w-[200px]">
            <select
              v-model="contractStatus"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="active">Faol</option>
              <option value="archived">Arxivlangan</option>
              <option value="pending">To'lov kutilmoqda</option>
              <option value="overdue">Muddati o'tgan</option>
              <option value="paid">Bu oyda to'langan</option>
            </select>
          </FormField>

          <FormField label="Qidirish" class="min-w-[220px]">
            <FormControl v-model="contractSearch" placeholder="Ega, do'kon, STIR" />
          </FormField>

          <template #actions>
            <BaseButton outline color="info" :disabled="contractLoading" label="Eksport" @click="exportContractsCSV" />
          </template>
        </FilterToolbar>
      </CardBox>

      <CardBox has-table>
        <div class="overflow-x-auto">
          <table class="w-full table-auto">
            <thead>
              <tr>
                <th class="px-4 py-2 text-left">Shartnoma</th>
                <th class="px-4 py-2 text-left">Do'kon</th>
                <th class="px-4 py-2 text-left">Oylik</th>
                <th class="px-4 py-2 text-left">Holati</th>
                <th class="px-4 py-2 text-left">Oxirgi to'lov</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="contractLoading">
                <td colspan="5" class="px-4 py-6 text-center">Yuklanmoqda...</td>
              </tr>
              <tr v-else-if="!filteredContracts.length">
                <td colspan="5" class="px-4 py-6 text-center">Ma'lumot topilmadi</td>
              </tr>
              <tr
                v-for="c in filteredContracts"
                :key="c.id"
                class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <td class="px-4 py-2">
                  <div class="font-medium">{{ c.owner?.fullName || c.ownerId }}</div>
                  <div class="text-xs text-gray-500">
                    STIR: {{ c.owner?.tin }} • #{{ c.id }}
                  </div>
                </td>
                <td class="px-4 py-2">
                  <div class="font-medium">{{ c.store?.storeNumber || c.storeId }}</div>
                  <div class="text-xs text-gray-500">{{ c.store?.description || '-' }}</div>
                </td>
                <td class="px-4 py-2">{{ c.shopMonthlyFee ?? '-' }}</td>
                <td class="px-4 py-2">
                  <span
                    :class="[
                      'rounded-full px-3 py-1 text-xs font-semibold',
                      contractPaymentStatus(c) === 'paid'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : contractPaymentStatus(c) === 'pending'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : contractPaymentStatus(c) === 'overdue'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                    ]"
                  >
                    {{
                      contractPaymentStatus(c) === 'paid'
                        ? "Bu oy to'langan"
                        : contractPaymentStatus(c) === 'pending'
                          ? "To'lov kutilmoqda"
                          : contractPaymentStatus(c) === 'overdue'
                            ? "Muddati o'tgan"
                            : 'Faol emas'
                    }}
                  </span>
                </td>
                <td class="px-4 py-2">
                  {{ lastPaidDate(c) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-between px-4 py-3">
          <div>Jami: {{ totalContracts }}</div>
          <div class="flex items-center gap-2">
            <BaseButton
              :disabled="contractPage <= 1 || contractLoading"
              label="Oldingi"
              @click="contractPage--"
            />
            <span>Sahifa {{ contractPage }}</span>
            <BaseButton
              :disabled="contracts.length < contractLimit || contractLoading"
              label="Keyingi"
              @click="contractPage++"
            />
          </div>
        </div>
      </CardBox>

      <div v-if="attendanceError" class="mt-6 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ attendanceError }}
      </div>

      <SectionTitle class="mt-10">Kunlik rasta to'lovlari</SectionTitle>

      <CardBox class="mb-4">
        <FilterToolbar>
          <FormField label="Sana">
            <FormControl v-model="attendanceDate" type="date" />
          </FormField>
          <FormField label="Holati" class="w-44">
            <select
              v-model="attendanceStatus"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="pending">To'lanmagan</option>
              <option value="paid">To'langan</option>
              <option value="all">Barchasi</option>
            </select>
          </FormField>
          <template #actions>
            <BaseButton
              outline
              color="info"
              :disabled="attendanceLoading"
              label="Eksport"
              @click="exportAttendancesCSV"
            />
          </template>
        </FilterToolbar>
      </CardBox>

      <CardBox has-table>
        <div class="overflow-x-auto">
          <table class="w-full table-auto">
            <thead>
              <tr>
                <th class="px-4 py-2 text-left">Rasta</th>
                <th class="px-4 py-2 text-left">Bo'lim</th>
                <th class="px-4 py-2 text-left">Summasi</th>
                <th class="px-4 py-2 text-left">Holati</th>
                <th class="px-4 py-2 text-left">Sana</th>
                <th class="px-4 py-2 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="attendanceLoading">
                <td colspan="6" class="px-4 py-6 text-center">Yuklanmoqda...</td>
              </tr>
              <tr v-else-if="!filteredAttendances.length">
                <td colspan="6" class="px-4 py-6 text-center">Ma'lumot topilmadi</td>
              </tr>
              <tr
                v-for="a in filteredAttendances"
                :key="a.id"
                class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <td class="px-4 py-2">
                  <div class="font-medium">Rasta #{{ a.stallId }}</div>
                  <div class="text-xs text-gray-500">{{ a.Stall?.description || '-' }}</div>
                </td>
                <td class="px-4 py-2">{{ sectionNameForAttendance(a) }}</td>
                <td class="px-4 py-2">{{ a.amount ?? '-' }}</td>
                <td class="px-4 py-2">
                  <span
                    :class="[
                      'rounded-full px-3 py-1 text-xs font-semibold',
                      a.status === 'PAID'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                    ]"
                  >
                    {{ a.status }}
                  </span>
                </td>
                <td class="px-4 py-2">{{ formatTashkentDate(a.date) || '-' }}</td>
                <td class="px-4 py-2 text-right">
                  <div class="flex flex-wrap justify-end gap-2">
                    <BaseButton
                      small
                      outline
                      :icon="mdiRefresh"
                      :disabled="attendanceRefreshState[a.id] || attendanceLoading"
                      title="Statusni yangilash"
                      @click="refreshSingleAttendance(a)"
                    />
                    <BaseButton
                      small
                      outline
                      :icon="mdiHistory"
                      label="Tarix"
                      @click="openAttendanceHistory(a)"
                    />
                    <BaseButton
                      v-if="a.status === 'UNPAID'"
                      color="success"
                      small
                      label="To'lov havolasi"
                      @click="openPayLink(a)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between px-4 py-3">
          <div>
            Jami: {{ attendanceSummary.total }} | To'lanmagan: {{ attendanceSummary.pending }} |
            To'langan: {{ attendanceSummary.paid }}
          </div>
        </div>
      </CardBox>

      <CardBoxModal
        v-model="attendanceHistoryModal.open"
        button="info"
        button-label="Yopish"
        :confirm-disabled="attendanceHistoryModal.loading"
        :has-cancel="false"
        :title="`Rasta #${attendanceHistoryModal.stallId || ''} — oxirgi ${attendanceHistoryModal.days} kun`"
      >
        <template v-if="attendanceHistoryError">
          <div class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {{ attendanceHistoryError }}
          </div>
        </template>
        <template v-else>
          <div class="flex flex-wrap items-center gap-3 text-sm">
            <div class="rounded-lg bg-green-50 px-3 py-2 text-green-700">
              To'langan: {{ attendanceHistorySummary.paid }} ta —
              {{ attendanceHistorySummary.amountPaid.toLocaleString('ru-RU') }} so'm
            </div>
            <div class="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
              To'lanmagan: {{ attendanceHistorySummary.unpaid }} ta —
              {{ attendanceHistorySummary.amountUnpaid.toLocaleString('ru-RU') }} so'm
            </div>
            <BaseButton
              :icon="mdiFileExcelBox"
              label="XLSX"
              small
              outline
              :disabled="attendanceHistoryModal.loading || !attendanceHistoryModal.items.length"
              @click="downloadAttendanceHistory"
            />
          </div>
          <div v-if="attendanceHistoryModal.loading" class="py-6 text-center text-sm text-gray-500">
            Yuklanmoqda...
          </div>
          <div v-else class="overflow-x-auto">
            <table class="mt-4 w-full text-sm">
              <thead>
                <tr>
                  <th class="px-2 py-1 text-left">Sana</th>
                  <th class="px-2 py-1 text-left">Holati</th>
                  <th class="px-2 py-1 text-left">Summasi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!attendanceHistoryModal.items.length">
                  <td colspan="3" class="px-2 py-4 text-center text-gray-500">Tarix topilmadi</td>
                </tr>
                <tr v-for="item in attendanceHistoryModal.items" :key="item.id">
                  <td class="px-2 py-1">{{ formatTashkentDate(item.date) || '-' }}</td>
                  <td class="px-2 py-1">
                    <span
                      :class="[
                        'rounded-full px-2 py-0.5 text-xs font-semibold',
                        item.status === 'PAID'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700',
                      ]"
                    >
                      {{ item.status }}
                    </span>
                  </td>
                  <td class="px-2 py-1">{{ item.amount ?? '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </CardBoxModal>
    </SectionMain>
  </LayoutAuthenticated>
</template>
