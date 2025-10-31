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
import { listTransactions, updateTransaction, deleteTransaction } from '@/services/transactions'
import { listContracts } from '@/services/contracts'
import { listAttendances } from '@/services/attendances'
import { summarizeContractDebts, summarizeAttendanceDebts } from '@/utils/debt'
import { downloadCSV } from '../utils/export'

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
const hasNextPage = computed(() => page.value * limit.value < total.value)
const hasPrevPage = computed(() => page.value > 1)

const editingId = ref(null)
const showForm = ref(false)
const form = ref({
  transactionId: '',
  amount: '',
  status: 'PENDING',
  paymentMethod: 'CASH',
  contractId: null,
  attendanceId: null,
})

const expandedId = ref(null)

const statusOptions = ['PENDING', 'PAID', 'FAILED', 'CANCELLED']
const methodOptions = ['CASH', 'CLICK', 'PAYME']

function matchesDateRange(item) {
  if (!dateFrom.value && !dateTo.value) return true
  const created = item.createdAt ? new Date(item.createdAt) : null
  if (!created) return false
  if (dateFrom.value && created < new Date(dateFrom.value)) return false
  if (dateTo.value) {
    const end = new Date(dateTo.value)
    end.setHours(23, 59, 59, 999)
    if (created > end) return false
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
  fetchData()
}

function openEdit(item) {
  editingId.value = item.id
  form.value = {
    transactionId: item.transactionId || '',
    amount: Number(item.amount || 0),
    status: item.status || 'PENDING',
    paymentMethod: item.paymentMethod || 'CASH',
    contractId: item.contractId ?? null,
    attendanceId: item.attendanceId ?? null,
  }
  showForm.value = true
}

async function submitForm() {
  if (!editingId.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    const payload = {
      transactionId: form.value.transactionId || undefined,
      amount: form.value.amount ? Number(form.value.amount) : undefined,
      status: form.value.status,
      paymentMethod: form.value.paymentMethod,
      contractId: form.value.contractId || null,
      attendanceId: form.value.attendanceId || null,
    }
    await updateTransaction(editingId.value, payload)
    showForm.value = false
    await fetchData()
    await refreshDebt()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Saqlashda xatolik'
  } finally {
    loading.value = false
  }
}

async function removeItem(it) {
  if (!confirm("Haqiqatan o'chirmoqchimisiz?")) return
  loading.value = true
  errorMsg.value = ''
  try {
    await deleteTransaction(it.id)
    await fetchData()
    await refreshDebt()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || "O'chirishda xatolik"
  } finally {
    loading.value = false
  }
}

async function exportCSV() {
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
          it.createdAt ? it.createdAt.substring(0, 19).replace('T', ' ') : '',
        ])
      }
      if (arr.length < 100) break
      p++
    }
    downloadCSV(`transactions_${new Date().toISOString().substring(0, 10)}.csv`, headers, rows)
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
watch(search, () => {
  page.value = 1
  if (debounceId) clearTimeout(debounceId)
  debounceId = setTimeout(() => {
    fetchData()
  }, 300)
})

watch(
  () => [statusFilter.value, methodFilter.value, sourceFilter.value],
  () => {
    page.value = 1
    fetchData()
  }
)

watch(
  () => [dateFrom.value, dateTo.value],
  () => {
    if (debounceId) clearTimeout(debounceId)
    debounceId = setTimeout(() => {
      page.value = 1
      fetchData()
    }, 200)
  }
)

watch([page, limit], () => {
  fetchData()
})

onMounted(async () => {
  await fetchData()
  await refreshDebt()
})
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitle first>Tranzaksiyalar</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>
      <div v-if="debtError" class="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-amber-700">
        {{ debtError }}
      </div>

      <div class="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardBox>
          <div class="p-4">
            <div class="text-xs text-gray-500">Jami</div>
            <div class="text-2xl font-semibold">{{ totals.total }}</div>
            <div class="text-xs text-gray-500">Umumiy summa: {{ totals.amount }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-4">
            <div class="text-xs text-green-600">To'langan</div>
            <div class="text-2xl font-semibold text-green-600">{{ totals.paid }}</div>
            <div class="text-xs text-green-600">Summasi: {{ totals.paidAmount }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-4">
            <div class="text-xs text-amber-600">Kutilmoqda</div>
            <div class="text-2xl font-semibold text-amber-600">{{ totals.pending }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-4">
            <div class="text-xs text-red-600">Bekor qilingan</div>
            <div class="text-2xl font-semibold text-red-600">{{ totals.cancelled }}</div>
          </div>
        </CardBox>
      </div>

      <CardBox class="mb-4">
        <div class="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="flex-1">
            <div class="text-xs uppercase tracking-wide text-gray-500">Do'kon shartnomalari</div>
            <div class="mt-1 text-2xl font-semibold text-red-600">
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
            <div class="mt-1 text-2xl font-semibold text-red-600">
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
          <FormField label="Qidirish" class="min-w-[220px]">
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
            <BaseButton color="info" :disabled="loading" label="Eksport CSV" @click="exportCSV" />
          </template>
        </FilterToolbar>
      </CardBox>

      <CardBox has-table>
        <div class="overflow-x-auto">
          <table class="w-full table-auto">
            <thead>
              <tr>
                <th class="px-4 py-2 text-left">ID</th>
                <th class="px-4 py-2 text-left">Transaction ID</th>
                <th class="px-4 py-2 text-left">Summasi</th>
                <th class="px-4 py-2 text-left">Holati</th>
                <th class="px-4 py-2 text-left">Usul</th>
                <th class="px-4 py-2 text-left">Manba</th>
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
                  <td class="px-4 py-2">{{ Number(it.amount || 0).toLocaleString() }}</td>
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
                    <div v-if="it.contract">
                      <div class="font-medium">Shartnoma #{{ it.contractId }}</div>
                      <div class="text-xs text-gray-500">
                        {{ it.contract?.owner?.fullName || '' }} • {{ it.contract?.store?.storeNumber || '' }}
                      </div>
                    </div>
                    <div v-else-if="it.attendance">
                      <div class="font-medium">Attendance #{{ it.attendanceId }}</div>
                      <div class="text-xs text-gray-500">
                        Rasta #{{ it.attendance?.stallId }} •
                        {{ it.attendance?.date ? it.attendance.date.substring(0, 10) : '' }}
                      </div>
                    </div>
                    <div v-else class="text-xs text-gray-500">-</div>
                  </td>
                  <td class="px-4 py-2">
                    {{ it.createdAt ? it.createdAt.substring(0, 19).replace('T', ' ') : '-' }}
                  </td>
                  <td class="px-4 py-2 text-right">
                    <BaseButton
                      color="info"
                      small
                      outline
                      label="Batafsil"
                      class="mr-2"
                      @click="toggleExpand(it.id)"
                    />
                    <BaseButton color="info" small label="Tahrirlash" class="mr-2" @click="openEdit(it)" />
                    <BaseButton
                      color="danger"
                      small
                      outline
                      label="O'chirish"
                      @click="removeItem(it)"
                    />
                  </td>
                </tr>
                <tr v-if="expandedId === it.id" class="bg-gray-50 text-sm dark:bg-gray-800/60">
                  <td colspan="8" class="px-4 py-3">
                    <div class="flex flex-wrap gap-6">
                      <div>
                        <div class="text-xs font-semibold uppercase text-gray-500">Yaratilgan</div>
                        <div>{{ it.createdAt }}</div>
                      </div>
                      <div>
                        <div class="text-xs font-semibold uppercase text-gray-500">Yangilangan</div>
                        <div>{{ it.updatedAt }}</div>
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
                          {{ it.attendance.date ? it.attendance.date.substring(0, 10) : '' }}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-between px-4 py-3">
          <div>Jami: {{ total }}</div>
          <div class="flex items-center gap-2">
            <BaseButton :disabled="!hasPrevPage || loading" label="Oldingi" @click="page--" />
            <span>Sahifa {{ page }}</span>
            <BaseButton :disabled="!hasNextPage || loading" label="Keyingi" @click="page++" />
          </div>
        </div>
      </CardBox>

      <CardBox v-if="showForm" class="mt-4" is-form @submit.prevent="submitForm">
        <SectionTitle>{{ `Tranzaksiya #${editingId} tahrirlash` }}</SectionTitle>
        <div class="grid gap-4 md:grid-cols-2">
          <FormField label="Transaction ID">
            <FormControl v-model="form.transactionId" placeholder="T2001..." />
          </FormField>
          <FormField label="Summasi">
            <FormControl v-model.number="form.amount" type="number" min="0" step="0.01" />
          </FormField>
          <FormField label="Holati">
            <select
              v-model="form.status"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option v-for="opt in statusOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </FormField>
          <FormField label="To'lov usuli">
            <select
              v-model="form.paymentMethod"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option v-for="opt in methodOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </FormField>
          <FormField label="Contract ID (ixtiyoriy)">
            <FormControl v-model.number="form.contractId" type="number" min="1" />
          </FormField>
          <FormField label="Attendance ID (ixtiyoriy)">
            <FormControl v-model.number="form.attendanceId" type="number" min="1" />
          </FormField>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <BaseButton color="success" :disabled="loading" label="Saqlash" type="submit" />
            <BaseButton color="info" outline label="Bekor qilish" :disabled="loading" @click="showForm = false" />
          </div>
        </template>
      </CardBox>
    </SectionMain>
  </LayoutAuthenticated>
</template>
