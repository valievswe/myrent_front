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
import PaginationControls from '@/components/PaginationControls.vue'
import { listTransactions } from '@/services/transactions'
import { listContracts } from '@/services/contracts'
import { listAttendances } from '@/services/attendances'
import { summarizeContractDebts, summarizeAttendanceDebts } from '@/utils/debt'
import { downloadXLSX } from '../utils/export'
import {
  formatTashkentDate,
  formatTashkentDateTime,
  getTashkentTodayISO,
  parseTashkentDate,
} from '@/utils/time'

const loading = ref(false)
const errorMsg = ref('')
const items = ref([])

const search = ref('')
const statusFilter = ref('all')
const methodFilter = ref('all')
const sourceFilter = ref('all')
const dateFrom = ref('')
const dateTo = ref('')

const page = ref(1)
const limit = ref(15)
const total = ref(0)

const expandedId = ref(null)

const statusOptions = ['PENDING', 'PAID', 'FAILED', 'CANCELLED']
const methodOptions = ['CASH', 'CLICK', 'PAYME']

function matchesDateRange(item) {
  if (!dateFrom.value && !dateTo.value) return true
  const created = parseTashkentDate(item.createdAt)
  if (!created) return false
  if (dateFrom.value) {
    const start = parseTashkentDate(dateFrom.value)
    if (start && created < start) return false
  }
  if (dateTo.value) {
    const end = parseTashkentDate(dateTo.value)
    if (end) {
      end.setHours(23, 59, 59, 999)
      if (created > end) return false
    }
  }
  return true
}

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase()

  return (items.value || []).filter((it) => {
    if (statusFilter.value !== 'all' && it.status !== statusFilter.value) return false
    if (methodFilter.value !== 'all' && it.paymentMethod !== methodFilter.value) return false

    if (sourceFilter.value === 'contract' && !it.contractId) return false
    if (sourceFilter.value === 'attendance' && !it.attendanceId) return false

    if (!matchesDateRange(it)) return false

    if (!q) return true
    const haystack = [
      it.transactionId,
      it.status,
      it.paymentMethod,
      it.contract?.owner?.fullName,
      it.contract?.store?.storeNumber,
      it.attendance?.Stall?.description,
      it.attendance?.Stall?.id,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
})

const totals = computed(() => {
  const summary = { total: 0, paid: 0, pending: 0, cancelled: 0, amount: 0, paidAmount: 0 }
  for (const it of filteredItems.value) {
    summary.total++
    summary.amount += Number(it.amount || 0)
    if (it.status === 'PAID') {
      summary.paid++
      summary.paidAmount += Number(it.amount || 0)
    } else if (it.status === 'PENDING') summary.pending++
    else if (it.status === 'CANCELLED') summary.cancelled++
  }
  return summary
})

const debtLoading = ref(false)
const debtError = ref('')
const contractDebtSummary = ref({
  expected: 0,
  paid: 0,
  debt: 0,
  contractsWithDebt: 0,
  totalContracts: 0,
})
const stallDebtSummary = ref({
  expected: 0,
  paid: 0,
  debt: 0,
  unpaidCount: 0,
  totalAttendances: 0,
})

async function fetchData() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await listTransactions({
      search: search.value,
      page: page.value,
      limit: limit.value,
      status: statusFilter.value !== 'all' ? statusFilter.value : undefined,
      paymentMethod: methodFilter.value !== 'all' ? methodFilter.value : undefined,
      source: sourceFilter.value !== 'all' ? sourceFilter.value : undefined,
      dateFrom: dateFrom.value || undefined,
      dateTo: dateTo.value || undefined,
    })
    items.value = res.data || []
    total.value = res.pagination?.total ?? items.value.length
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Yuklashda xatolik'
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  statusFilter.value = 'all'
  methodFilter.value = 'all'
  sourceFilter.value = 'all'
  dateFrom.value = ''
  dateTo.value = ''
  page.value = 1
  fetchData()
}

async function exportXLSX() {
  loading.value = true
  try {
    const headers = ['ID', 'TransactionID', 'Summasi', 'Holati', 'Usul', 'Manba', 'Sana']
    const rows = []
    let p = 1
    while (true) {
      const res = await listTransactions({
        page: p,
        limit: 100,
        search: search.value || undefined,
      })
      const arr = res.data || []
      for (const it of arr) {
        const source = it.contract
          ? `Contract #${it.contractId} (${it.contract?.store?.storeNumber || ''})`
          : it.attendance
            ? `Attendance #${it.attendanceId} (Stall #${it.attendance?.stallId})`
            : '-'
        rows.push([
          it.id,
          it.transactionId,
          it.amount,
          it.status,
          it.paymentMethod,
          source,
          formatTashkentDateTime(it.createdAt, { withSeconds: true }) || '',
        ])
      }
      if (arr.length < 100) break
      p++
    }
    downloadXLSX(`transactions_${getTashkentTodayISO()}.xlsx`, headers, rows, 'Transactions')
  } finally {
    loading.value = false
  }
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString('ru-RU')
}

function transactionType(it) {
  if (it.contractId) return 'Shartnoma'
  if (it.attendanceId) return 'Rasta'
  return 'Boshqa'
}

function transactionSubject(it) {
  if (it.contract) {
    const store = it.contract?.store?.storeNumber || it.contract?.storeId || '-'
    return `${it.contract?.owner?.fullName || 'Ega'} • Do'kon ${store}`
  }
  if (it.attendance) {
    const stall = it.attendance?.Stall?.stallNumber || it.attendance?.stallId || '-'
    return `Rasta ${stall}`
  }
  return '-'
}

function transactionLocation(it) {
  if (it.contract?.store) {
    return it.contract.store.description || '-'
  }
  if (it.attendance?.Stall) {
    return it.attendance.Stall.description || '-'
  }
  return '-'
}

async function fetchAllContracts({ activeOnly = true, pageSize = 120, maxPages = 15 } = {}) {
  const results = []
  let currentPage = 1
  while (currentPage <= maxPages) {
    const res = await listContracts({
      page: currentPage,
      limit: pageSize,
      isActive: activeOnly ? true : undefined,
    })
    const chunk = res.data || []
    results.push(...chunk)
    if (chunk.length < pageSize) break
    currentPage++
  }
  return results
}

async function fetchAllAttendances({ pageSize = 200, maxPages = 25 } = {}) {
  const results = []
  let currentPage = 1
  while (currentPage <= maxPages) {
    const res = await listAttendances({ page: currentPage, limit: pageSize })
    const chunk = res.data || []
    results.push(...chunk)
    if (chunk.length < pageSize) break
    currentPage++
  }
  return results
}

async function refreshDebt() {
  debtLoading.value = true
  debtError.value = ''
  try {
    const [contracts, attendances] = await Promise.all([
      fetchAllContracts(),
      fetchAllAttendances(),
    ])
    contractDebtSummary.value = summarizeContractDebts(contracts, { asOf: new Date() })
    stallDebtSummary.value = summarizeAttendanceDebts(attendances)
  } catch (e) {
    debtError.value = e?.response?.data?.message || e.message || 'Qarzdorlikni hisoblashda xatolik'
  } finally {
    debtLoading.value = false
  }
}

let debounceId
let suppressPaginationFetch = false
let paginationTimer = null
watch(search, () => {
  page.value = 1
  suppressPaginationFetch = true
  if (debounceId) clearTimeout(debounceId)
  debounceId = setTimeout(() => {
    suppressPaginationFetch = false
    fetchData()
  }, 300)
})

watch(
  () => [statusFilter.value, methodFilter.value, sourceFilter.value],
  async () => {
    page.value = 1
    suppressPaginationFetch = true
    try {
      await fetchData()
    } finally {
      suppressPaginationFetch = false
    }
  }
)

watch(
  () => [dateFrom.value, dateTo.value],
  () => {
    if (debounceId) clearTimeout(debounceId)
    debounceId = setTimeout(() => {
      page.value = 1
      suppressPaginationFetch = true
      fetchData().finally(() => {
        suppressPaginationFetch = false
      })
    }, 200)
  }
)

watch([page, limit], () => {
  if (suppressPaginationFetch) return
  if (paginationTimer) clearTimeout(paginationTimer)
  paginationTimer = setTimeout(() => {
    fetchData()
  }, 0)
})

onMounted(async () => {
  await fetchData()
  await refreshDebt()
})
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain wide>
      <SectionTitle first>Tranzaksiyalar</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>
      <div v-if="debtError" class="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-amber-700">
        {{ debtError }}
      </div>

      <div class="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardBox>
          <div class="p-6">
            <div class="text-xs text-gray-500">Jami</div>
            <div class="text-3xl font-semibold md:text-4xl">{{ totals.total }}</div>
            <div class="text-xs text-gray-500">Umumiy summa: {{ totals.amount }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-6">
            <div class="text-xs text-green-600">To'langan</div>
            <div class="text-3xl font-semibold text-green-600 md:text-4xl">{{ totals.paid }}</div>
            <div class="text-xs text-green-600">Summasi: {{ totals.paidAmount }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-6">
            <div class="text-xs text-amber-600">Kutilmoqda</div>
            <div class="text-3xl font-semibold text-amber-600 md:text-4xl">{{ totals.pending }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-6">
            <div class="text-xs text-red-600">Bekor qilingan</div>
            <div class="text-3xl font-semibold text-red-600 md:text-4xl">{{ totals.cancelled }}</div>
          </div>
        </CardBox>
      </div>

      <CardBox class="mb-4">
        <div class="flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between">
          <div class="flex-1">
            <div class="text-xs uppercase tracking-wide text-gray-500">Do'kon shartnomalari</div>
            <div class="mt-1 text-3xl font-semibold text-red-600 md:text-4xl">
              {{ formatAmount(contractDebtSummary.debt) }}
            </div>
            <div class="mt-1 text-xs text-gray-500">
              Majburiyat: {{ formatAmount(contractDebtSummary.expected) }} —
              To'langan: {{ formatAmount(contractDebtSummary.paid) }}
            </div>
            <div class="text-xs text-gray-500">
              Qarzdor shartnomalar: {{ contractDebtSummary.contractsWithDebt }} / {{ contractDebtSummary.totalContracts }}
            </div>
          </div>
          <div class="flex-1">
            <div class="text-xs uppercase tracking-wide text-gray-500">Rasta yig'imlari</div>
            <div class="mt-1 text-3xl font-semibold text-red-600 md:text-4xl">
              {{ formatAmount(stallDebtSummary.debt) }}
            </div>
            <div class="mt-1 text-xs text-gray-500">
              Majburiyat: {{ formatAmount(stallDebtSummary.expected) }} —
              To'langan: {{ formatAmount(stallDebtSummary.paid) }}
            </div>
            <div class="text-xs text-gray-500">
              To'lanmagan qatnovlar: {{ stallDebtSummary.unpaidCount }} / {{ stallDebtSummary.totalAttendances }}
            </div>
          </div>
          <div class="flex items-center justify-end lg:justify-center">
            <BaseButton
              color="info"
              :disabled="debtLoading"
              :label="debtLoading ? 'Hisoblanmoqda...' : 'Qarzdorlikni yangilash'"
              @click="refreshDebt"
            />
          </div>
        </div>
      </CardBox>

      <CardBox class="mb-4">
        <FilterToolbar>
          <FormField label="Qidirish" class="w-full min-w-[240px] flex-1 md:max-w-2xl">
            <FormControl v-model="search" placeholder="ID, do'kon, rasta, mijoz..." />
          </FormField>

          <FormField label="Holati" class="w-40">
            <select
              v-model="statusFilter"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="all">Barchasi</option>
              <option v-for="opt in statusOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </FormField>

          <FormField label="Usul" class="w-40">
            <select
              v-model="methodFilter"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="all">Barchasi</option>
              <option v-for="opt in methodOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </FormField>

          <FormField label="Manba" class="w-44">
            <select
              v-model="sourceFilter"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="all">Barchasi</option>
              <option value="contract">Shartnoma</option>
              <option value="attendance">Rasta</option>
            </select>
          </FormField>

          <FormField label="Sana dan" class="w-40">
            <FormControl v-model="dateFrom" type="date" />
          </FormField>

          <FormField label="Sana gacha" class="w-40">
            <FormControl v-model="dateTo" type="date" />
          </FormField>

          <template #actions>
            <BaseButton outline color="info" label="Filtrlarni tozalash" @click="resetFilters" />
            <BaseButton color="info" :disabled="loading" label="XLSX eksport" @click="exportXLSX" />
          </template>
        </FilterToolbar>
      </CardBox>

      <CardBox has-table>
        <div class="overflow-x-auto">
          <table class="w-full table-auto">
            <thead>
              <tr>
                <th class="px-4 py-2 text-left">ID</th>
                <th class="px-4 py-2 text-left">Tranzaksiya</th>
                <th class="px-4 py-2 text-left">Turi / Mijoz</th>
                <th class="px-4 py-2 text-left">Summasi</th>
                <th class="px-4 py-2 text-left">Holati</th>
                <th class="px-4 py-2 text-left">Usul</th>
                <th class="px-4 py-2 text-left">Sana</th>
                <th class="px-4 py-2 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="8" class="px-4 py-6 text-center">Yuklanmoqda...</td>
              </tr>
              <tr v-else-if="!filteredItems.length">
                <td colspan="8" class="px-4 py-6 text-center">Ma'lumot topilmadi</td>
              </tr>
              <template v-else v-for="it in filteredItems" :key="it.id">
                <tr class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td class="px-4 py-2">{{ it.id }}</td>
                  <td class="px-4 py-2">
                    <div class="font-medium">{{ it.transactionId }}</div>
                    <div class="text-xs text-gray-500">#{{ it.contractId || it.attendanceId || '-' }}</div>
                  </td>
                  <td class="px-4 py-2">
                    <div class="flex flex-col gap-1">
                      <span
                        class="inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                        :class="
                          it.contractId
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                            : it.attendanceId
                              ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-200'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300'
                        "
                      >
                        {{ transactionType(it) }}
                      </span>
                      <div class="font-semibold">{{ transactionSubject(it) }}</div>
                      <div class="text-xs text-gray-500">{{ transactionLocation(it) }}</div>
                    </div>
                  </td>
                  <td class="px-4 py-2">
                    <div class="font-semibold">{{ Number(it.amount || 0).toLocaleString() }}</div>
                    <div class="text-xs text-gray-500" v-if="it.contract?.shopMonthlyFee">
                      Oylik: {{ Number(it.contract.shopMonthlyFee || 0).toLocaleString() }}
                    </div>
                  </td>
                  <td class="px-4 py-2">
                    <span
                      :class="[
                        'rounded-full px-3 py-1 text-xs font-semibold',
                        it.status === 'PAID'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : it.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                      ]"
                    >
                      {{ it.status }}
                    </span>
                  </td>
                  <td class="px-4 py-2">{{ it.paymentMethod }}</td>
                  <td class="px-4 py-2">
                    {{ formatTashkentDateTime(it.createdAt, { withSeconds: true }) || '-' }}
                  </td>
                  <td class="px-4 py-2">
                    <div class="flex flex-wrap justify-end gap-2">
                      <BaseButton
                        color="info"
                        small
                        outline
                        label="Batafsil"
                        @click="toggleExpand(it.id)"
                      />
                    </div>
                  </td>
                </tr>
                <tr v-if="expandedId === it.id" class="bg-gray-50 text-sm dark:bg-gray-800/60">
                  <td colspan="8" class="px-4 py-3">
                    <div class="flex flex-wrap gap-6">
                      <div>
                        <div class="text-xs font-semibold uppercase text-gray-500">Yaratilgan</div>
                        <div>{{ formatTashkentDateTime(it.createdAt, { withSeconds: true }) || '-' }}</div>
                      </div>
                      <div>
                        <div class="text-xs font-semibold uppercase text-gray-500">Yangilangan</div>
                        <div>{{ formatTashkentDateTime(it.updatedAt, { withSeconds: true }) || '-' }}</div>
                      </div>
                      <div v-if="it.contract">
                        <div class="text-xs font-semibold uppercase text-gray-500">Shartnoma</div>
                        <div>
                          {{ it.contract.owner?.fullName || '' }} •
                          {{ it.contract.store?.storeNumber || '' }}
                        </div>
                      </div>
                      <div v-if="it.attendance">
                        <div class="text-xs font-semibold uppercase text-gray-500">Attendance</div>
                        <div>
                          Stall #{{ it.attendance.stallId }} •
                          {{ formatTashkentDate(it.attendance.date) || '' }}
                        </div>
                      </div>
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

    </SectionMain>
  </LayoutAuthenticated>
</template>
