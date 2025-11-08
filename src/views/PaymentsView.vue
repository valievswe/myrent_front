<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import FilterToolbar from '@/components/FilterToolbar.vue'
import { listContracts } from '@/services/contracts'
import { listAttendances, getAttendancePayUrl } from '@/services/attendances'
import { listSections } from '@/services/sections'
import { downloadCSV } from '../utils/export'
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
    const { url } = await getAttendancePayUrl(attendance.id, )
    if (url) window.open(url, '_blank', 'noopener')
  } catch (e) {
    console.error(e)
    alert("To'lov havolasini olishda xatolik")
  }
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
                  <BaseButton
                    v-if="a.status === 'UNPAID'"
                    color="success"
                    small
                    label="To'lov havolasi"
                    @click="openPayLink(a)"
                  />
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
    </SectionMain>
  </LayoutAuthenticated>
</template>
