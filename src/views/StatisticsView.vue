<script setup>
import { ref, onMounted, computed } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import LineChart from '@/components/Charts/LineChart.vue'
import { getDailyStatistics, getMonthlyStatistics, getCurrentMonthIncome } from '@/services/statistics'
import { listAttendances } from '@/services/attendances'
import { listContracts } from '@/services/contracts'
import { summarizeContractDebts, summarizeAttendanceDebts } from '@/utils/debt'

const loading = ref(false)
const errorMsg = ref('')

const dailyAll = ref({ count: 0, revenue: 0 })
const dailyStalls = ref({ count: 0, revenue: 0 })
const dailyStores = ref({ count: 0, revenue: 0 })

const monthlyAll = ref({ count: 0, revenue: 0 })
const monthlyStalls = ref({ count: 0, revenue: 0 })
const monthlyStores = ref({ count: 0, revenue: 0 })

const monthRevenueAll = ref({ revenue: 0 })
const monthRevenueStalls = ref({ revenue: 0 })
const monthRevenueStores = ref({ revenue: 0 })

const monthDays = ref([])
const stallsDaily = ref([]) // numbers per day
const storesDaily = ref([]) // numbers per day

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
const debtLoading = ref(false)
const debtError = ref('')

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function computeDailySeries(attendances = [], contracts = []) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const labels = []
  const length = daysInMonth(y, m)
  for (let i = 1; i <= length; i++) labels.push(String(i))
  monthDays.value = labels

  const stallsArr = new Array(length).fill(0)
  const storesArr = new Array(length).fill(0)

  for (const attendance of attendances) {
    if (!attendance || !attendance.date) continue
    const d = new Date(attendance.date)
    if (d.getFullYear() !== y || d.getMonth() !== m) continue
    const isPaid =
      attendance.status === 'PAID' ||
      attendance.transaction?.status === 'PAID'
    if (!isPaid) continue
    const day = d.getDate()
    const amount = Number((attendance.amount && attendance.amount.toString()) || 0)
    stallsArr[day - 1] += amount
  }

  for (const contract of contracts) {
    for (const tx of contract?.transactions || []) {
      if (tx.status !== 'PAID' || !tx.createdAt) continue
      const d = new Date(tx.createdAt)
      if (d.getFullYear() !== y || d.getMonth() !== m) continue
      const day = d.getDate()
      const amount = Number((tx.amount && tx.amount.toString()) || 0)
      storesArr[day - 1] += amount
    }
  }

  stallsDaily.value = stallsArr
  storesDaily.value = storesArr
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

async function fetchAllContracts({ pageSize = 120, maxPages = 15 } = {}) {
  const results = []
  let currentPage = 1
  while (currentPage <= maxPages) {
    const res = await listContracts({ page: currentPage, limit: pageSize })
    const chunk = res.data || []
    results.push(...chunk)
    if (chunk.length < pageSize) break
    currentPage++
  }
  return results
}

async function loadDetailedData() {
  debtLoading.value = true
  debtError.value = ''
  try {
    const [att, cons] = await Promise.all([fetchAllAttendances(), fetchAllContracts()])
    stallDebtSummary.value = summarizeAttendanceDebts(att)
    contractDebtSummary.value = summarizeContractDebts(cons, { asOf: new Date() })
    computeDailySeries(att, cons)
  } catch (e) {
    debtError.value = e?.response?.data?.message || e.message || 'Qarzdorlikni hisoblashda xatolik'
  } finally {
    debtLoading.value = false
  }
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString('ru-RU')
}

const chartData = computed(() => {
  return {
    labels: monthDays.value,
    datasets: [
      {
        label: 'Rastalar',
        fill: false,
        borderColor: '#FF3860',
        pointBackgroundColor: '#FF3860',
        data: stallsDaily.value,
        tension: 0.3,
      },
      {
        label: "Do'konlar",
        fill: false,
        borderColor: '#209CEE',
        pointBackgroundColor: '#209CEE',
        data: storesDaily.value,
        tension: 0.3,
      },
    ],
  }
})

async function fetchStats() {
  loading.value = true
  errorMsg.value = ''
  try {
    dailyAll.value = await getDailyStatistics()
    dailyStalls.value = await getDailyStatistics('stall')
    dailyStores.value = await getDailyStatistics('store')

    monthlyAll.value = await getMonthlyStatistics()
    monthlyStalls.value = await getMonthlyStatistics('stall')
    monthlyStores.value = await getMonthlyStatistics('store')

    monthRevenueAll.value = await getCurrentMonthIncome()
    monthRevenueStalls.value = await getCurrentMonthIncome('stall')
    monthRevenueStores.value = await getCurrentMonthIncome('store')
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Statistikani olishda xatolik'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await fetchStats()
  await loadDetailedData()
})
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain wide>
      <SectionTitle first>Statistika va To'lovlar Tahlili</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">{{ errorMsg }}</div>
      <div v-if="debtError" class="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-amber-700">
        {{ debtError }}
      </div>

      <div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <CardBox>
          <div class="p-6">
            <div class="text-sm text-gray-500">Bugun (Jami)</div>
            <div class="mt-1 text-3xl font-semibold md:text-4xl">{{ dailyAll.revenue }}</div>
            <div class="text-xs text-gray-500">Tranzaksiyalar: {{ dailyAll.count }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-6">
            <div class="text-sm text-gray-500">Bugun (Rastalar)</div>
            <div class="mt-1 text-3xl font-semibold md:text-4xl">{{ dailyStalls.revenue }}</div>
            <div class="text-xs text-gray-500">Tranzaksiyalar: {{ dailyStalls.count }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-6">
            <div class="text-sm text-gray-500">Bugun (Do'konlar)</div>
            <div class="mt-1 text-3xl font-semibold md:text-4xl">{{ dailyStores.revenue }}</div>
            <div class="text-xs text-gray-500">Tranzaksiyalar: {{ dailyStores.count }}</div>
          </div>
        </CardBox>
      </div>

      <div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <CardBox>
          <div class="p-6">
            <div class="text-sm text-gray-500">Joriy oy (Jami)</div>
            <div class="mt-1 text-3xl font-semibold md:text-4xl">{{ monthRevenueAll.revenue }}</div>
            <div class="text-xs text-gray-500">Tranzaksiyalar: {{ monthlyAll.count }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-6">
            <div class="text-sm text-gray-500">Joriy oy (Rastalar)</div>
            <div class="mt-1 text-3xl font-semibold md:text-4xl">{{ monthRevenueStalls.revenue }}</div>
            <div class="text-xs text-gray-500">Tranzaksiyalar: {{ monthlyStalls.count }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-6">
            <div class="text-sm text-gray-500">Joriy oy (Do'konlar)</div>
            <div class="mt-1 text-3xl font-semibold md:text-4xl">{{ monthRevenueStores.revenue }}</div>
            <div class="text-xs text-gray-500">Tranzaksiyalar: {{ monthlyStores.count }}</div>
          </div>
        </CardBox>
      </div>

      <CardBox class="mb-6">
        <div class="flex flex-col gap-6 p-6 md:flex-row md:items-start md:justify-between">
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
          <div class="flex items-center justify-end md:justify-center">
            <BaseButton
              color="info"
              :disabled="debtLoading"
              :label="debtLoading ? 'Hisoblanmoqda...' : 'Qarzdorlikni yangilash'"
              @click="loadDetailedData"
            />
          </div>
        </div>
      </CardBox>

      <CardBox>
        <div class="p-6">
          <div class="mb-3 text-sm font-medium">Joriy oy: kunlik tushum (Rasta vs Do'kon)</div>
          <div style="height: 320px">
            <LineChart :data="chartData" />
          </div>
        </div>
      </CardBox>
    </SectionMain>
  </LayoutAuthenticated>
</template>
