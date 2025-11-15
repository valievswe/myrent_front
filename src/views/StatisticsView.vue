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
const statsFilter = ref('all')
const statsFilterOptions = [
  { key: 'all', label: 'Jami' },
  { key: 'stall', label: 'Rasta' },
  { key: 'store', label: "Do'kon" },
]

const numberFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
const dateFormatter = new Intl.DateTimeFormat('uz-UZ', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const monthFormatter = new Intl.DateTimeFormat('uz-UZ', {
  month: 'long',
  year: 'numeric',
})

const todayLabel = computed(() => dateFormatter.format(new Date()))
const currentMonthLabel = computed(() => monthFormatter.format(new Date()))

function formatCount(value) {
  const numeric = Number(value || 0)
  return numberFormatter.format(Number.isFinite(numeric) ? numeric : 0)
}

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
  const numeric = Number(value || 0)
  return numberFormatter.format(Number.isFinite(numeric) ? numeric : 0)
}

const chartData = computed(() => {
  const datasets = []
  if (statsFilter.value === 'all' || statsFilter.value === 'stall') {
    datasets.push({
      label: 'Rastalar',
      fill: true,
      borderColor: '#fb7185',
      pointBackgroundColor: '#fb7185',
      backgroundColor: 'rgba(251,113,133,0.15)',
      borderWidth: 3,
      pointRadius: 2,
      data: stallsDaily.value,
      tension: 0.3,
    })
  }
  if (statsFilter.value === 'all' || statsFilter.value === 'store') {
    datasets.push({
      label: "Do'konlar",
      fill: true,
      borderColor: '#38bdf8',
      pointBackgroundColor: '#38bdf8',
      backgroundColor: 'rgba(56,189,248,0.15)',
      borderWidth: 3,
      pointRadius: 2,
      data: storesDaily.value,
      tension: 0.3,
    })
  }
  return {
    labels: monthDays.value,
    datasets,
  }
})

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { intersect: false, mode: 'index' },
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: { usePointStyle: true },
    },
    tooltip: {
      callbacks: {
        label(context) {
          const value = context.parsed.y ?? context.parsed
          return `${context.dataset.label}: ${formatAmount(value)} so'm`
        },
      },
    },
  },
  scales: {
    y: {
      grid: { color: 'rgba(148,163,184,0.2)' },
      ticks: {
        callback(value) {
          return formatAmount(value)
        },
      },
    },
    x: {
      grid: { display: false },
    },
  },
}))

const dailyCards = computed(() => [
  {
    key: 'all',
    title: "Bugun (Jami)",
    revenue: formatAmount(dailyAll.value.revenue),
    count: formatCount(dailyAll.value.count),
    accent: 'from-slate-100 to-slate-50',
  },
  {
    key: 'stall',
    title: "Bugun (Rastalar)",
    revenue: formatAmount(dailyStalls.value.revenue),
    count: formatCount(dailyStalls.value.count),
    accent: 'from-orange-50 to-amber-50',
  },
  {
    key: 'store',
    title: "Bugun (Do'konlar)",
    revenue: formatAmount(dailyStores.value.revenue),
    count: formatCount(dailyStores.value.count),
    accent: 'from-sky-50 to-blue-50',
  },
])

const monthlyCards = computed(() => [
  {
    key: 'all',
    title: "Joriy oy (Jami)",
    revenue: formatAmount(monthRevenueAll.value.revenue),
    count: formatCount(monthlyAll.value.count),
    accent: 'from-slate-100 to-slate-50',
  },
  {
    key: 'stall',
    title: "Joriy oy (Rastalar)",
    revenue: formatAmount(monthRevenueStalls.value.revenue),
    count: formatCount(monthlyStalls.value.count),
    accent: 'from-orange-50 to-amber-50',
  },
  {
    key: 'store',
    title: "Joriy oy (Do'konlar)",
    revenue: formatAmount(monthRevenueStores.value.revenue),
    count: formatCount(monthlyStores.value.count),
    accent: 'from-sky-50 to-blue-50',
  },
])

const filteredDailyCards = computed(() => {
  if (statsFilter.value === 'all') return dailyCards.value
  return dailyCards.value.filter((card) => card.key === statsFilter.value)
})

const filteredMonthlyCards = computed(() => {
  if (statsFilter.value === 'all') return monthlyCards.value
  return monthlyCards.value.filter((card) => card.key === statsFilter.value)
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

      <div class="mb-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-lg dark:from-slate-800 dark:via-slate-900 dark:to-black">
        <div class="text-xs uppercase tracking-wide text-white/80 dark:text-white/80">Bugungi holat</div>
        <div class="mt-2 text-3xl font-semibold md:text-4xl">{{ todayLabel }}</div>
        <div class="mt-6 grid gap-4 md:grid-cols-2">
          <div class="rounded-xl bg-white/10 p-4 text-white backdrop-blur dark:bg-white/5">
            <div class="text-sm text-white/70">To'langan rastalar</div>
            <div class="mt-3 text-4xl font-bold md:text-5xl">{{ formatCount(dailyStalls.count) }}</div>
            <div class="text-xs text-white/70">Jami tushum: {{ formatAmount(dailyStalls.revenue) }} so'm</div>
          </div>
          <div class="rounded-xl bg-white/10 p-4 text-white backdrop-blur dark:bg-white/5">
            <div class="text-sm text-white/70">To'langan do'konlar</div>
            <div class="mt-3 text-4xl font-bold md:text-5xl">{{ formatCount(dailyStores.count) }}</div>
            <div class="text-xs text-white/70">Jami tushum: {{ formatAmount(dailyStores.revenue) }} so'm</div>
          </div>
        </div>
      </div>

      <div class="mb-4 flex flex-wrap items-center gap-3">
        <div class="text-sm font-medium text-slate-600 dark:text-slate-200">Filtr:</div>
        <div class="flex flex-wrap gap-2">
          <BaseButton
            v-for="option in statsFilterOptions"
            :key="option.key"
            small
            :color="statsFilter === option.key ? 'primary' : 'info'"
            :outline="statsFilter !== option.key"
            :label="option.label"
            @click="statsFilter = option.key"
          />
        </div>
      </div>

      <div class="mb-6 grid gap-4 md:grid-cols-3">
        <CardBox v-for="card in filteredDailyCards" :key="card.title">
          <div
            class="rounded-xl bg-gradient-to-r p-5 dark:border dark:border-slate-700 dark:bg-slate-800"
            :class="card.accent"
          >
            <div class="text-sm font-medium text-gray-600 dark:text-gray-300">{{ card.title }}</div>
            <div class="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100 md:text-4xl">
              {{ card.revenue }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-300">Tranzaksiyalar: {{ card.count }}</div>
          </div>
        </CardBox>
      </div>

      <div class="mb-6 grid gap-4 md:grid-cols-3">
        <CardBox v-for="card in filteredMonthlyCards" :key="card.title">
          <div
            class="rounded-xl bg-gradient-to-r p-5 dark:border dark:border-slate-700 dark:bg-slate-800"
            :class="card.accent"
          >
            <div class="flex items-center justify-between text-sm font-medium text-gray-500 dark:text-gray-300">
              <span>{{ card.title }}</span>
              <span class="text-xs uppercase text-gray-400 dark:text-gray-300">{{ currentMonthLabel }}</span>
            </div>
            <div class="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100 md:text-4xl">{{ card.revenue }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-300">Tranzaksiyalar: {{ card.count }}</div>
          </div>
        </CardBox>
      </div>

      <CardBox class="mb-6">
        <div class="grid gap-6 p-6 md:grid-cols-3">
          <div class="space-y-2">
            <div class="text-xs uppercase tracking-wide text-gray-500">Do'kon shartnomalari</div>
            <div class="text-3xl font-semibold text-red-600 md:text-4xl">
              {{ formatAmount(contractDebtSummary.debt) }}
            </div>
            <div class="text-xs text-gray-500">
              Majburiyat: {{ formatAmount(contractDebtSummary.expected) }} —
              To'langan: {{ formatAmount(contractDebtSummary.paid) }}
            </div>
            <div class="text-xs text-gray-500">
              Qarzdor shartnomalar: {{ contractDebtSummary.contractsWithDebt }} / {{ contractDebtSummary.totalContracts }}
            </div>
          </div>
          <div class="space-y-2">
            <div class="text-xs uppercase tracking-wide text-gray-500">Rasta yig'imlari</div>
            <div class="text-3xl font-semibold text-red-600 md:text-4xl">
              {{ formatAmount(stallDebtSummary.debt) }}
            </div>
            <div class="text-xs text-gray-500">
              Majburiyat: {{ formatAmount(stallDebtSummary.expected) }} —
              To'langan: {{ formatAmount(stallDebtSummary.paid) }}
            </div>
            <div class="text-xs text-gray-500">
              To'lanmagan qatnovlar: {{ stallDebtSummary.unpaidCount }} / {{ stallDebtSummary.totalAttendances }}
            </div>
          </div>
          <div class="flex items-center justify-center">
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
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="text-sm font-semibold">Joriy oy: kunlik tushum (Rasta vs Do'kon)</div>
              <div class="text-xs text-gray-500">{{ currentMonthLabel }}</div>
            </div>
            <div class="text-xs text-gray-500">Kunlar kesimida umumiy tushum</div>
          </div>
          <div style="height: 360px">
            <LineChart :data="chartData" :options="chartOptions" />
          </div>
        </div>
      </CardBox>
    </SectionMain>
  </LayoutAuthenticated>
</template>
