<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import LineChart from '@/components/Charts/LineChart.vue'
import {
  getDailyStatistics,
  getMonthlyStatisticsByMonth,
  getMonthlyDetails,
  getStatisticsTotals,
  getStatisticsSeries,
  getMonthlySeries,
} from '@/services/statistics'
import { listAttendances } from '@/services/attendances'
import { listContracts } from '@/services/contracts'
import { listSections } from '@/services/sections'
import { summarizeContractDebts, summarizeAttendanceDebts } from '@/utils/debt'
import { startOfTashkentDay, parseTashkentDate, getTashkentTodayISO, formatTashkentDate } from '@/utils/time'
import { getPublicStall } from '@/services/publicPayment'
import { normalizeStallResults } from '@/utils/publicPayments'

const loading = ref(false)
const errorMsg = ref('')

const dailyAll = ref({ count: 0, revenue: 0 })
const dailyStalls = ref({ count: 0, revenue: 0 })
const dailyStores = ref({ count: 0, revenue: 0 })

const monthlyAll = ref({ count: 0, revenue: 0 })
const monthlyStalls = ref({ count: 0, revenue: 0 })
const monthlyStores = ref({ count: 0, revenue: 0 })

const monthDetails = ref({
  month: '',
  totals: { count: 0, revenue: 0 },
  stall: { count: 0, revenue: 0 },
  store: { count: 0, revenue: 0 },
  methods: {
    CASH: { count: 0, revenue: 0 },
    PAYME: { count: 0, revenue: 0 },
    CLICK: { count: 0, revenue: 0 },
  },
})

const monthDays = ref([])
const stallsDaily = ref([]) // numbers per day
const storesDaily = ref([]) // numbers per day
const sectionDailySummary = ref([])
const sections = ref([])
const allAttendances = ref([])
const allContracts = ref([])

// Filtered series and totals
const seriesLabels = ref([])
const stallsSeries = ref([])
const storesSeries = ref([])
const monthlySeriesLabels = ref([])
const monthlySeriesStalls = ref([])
const monthlySeriesStores = ref([])
const filteredTotals = ref({ count: 0, revenue: 0 })
const filteredCashTotals = ref({ count: 0, revenue: 0 })
const filteredBankTotals = ref({ count: 0, revenue: 0 })
const filtersLoading = ref(false)
const filtersError = ref('')

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
const sectionSummaryLoading = ref(false)
const statsFilter = ref('all')
const statsFilterOptions = [
  { key: 'all', label: 'Jami' },
  { key: 'stall', label: 'Rasta' },
  { key: 'store', label: "Do'kon" },
]

const activeTab = ref('general')
const checkStallNumber = ref('')
const checkStallDate = ref(getTashkentTodayISO())
const checkStallResult = ref(null)
const checkStallLoading = ref(false)
const checkStallError = ref('')

const tabs = [
  { key: 'general', label: 'Umumiy' },
  { key: 'stalls', label: 'Rastalar Tahlili' },
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
const selectedMonthLabel = computed(() => {
  const { year, monthIndex } = parseMonthKey(selectedMonth.value)
  return monthFormatter.format(new Date(year, monthIndex, 1))
})

// Filters
const filterType = ref('all') // all|stall|store
const filterMethod = ref('') // PAYME|CLICK|CASH|''
const filterStatus = ref('PAID')
const filterFrom = ref('')
const filterTo = ref('')
const filterGroupBy = ref('daily')

const selectedMonth = ref('')
const monthOptions = computed(() => {
  const now = new Date()
  const opts = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    opts.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: monthFormatter.format(d),
    })
  }
  return opts
})

function parseMonthKey(key) {
  const [y, m] = String(key || '').split('-').map((v) => Number(v))
  const year = Number.isFinite(y) ? y : new Date().getFullYear()
  const monthIndex = Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : new Date().getMonth()
  return { year, monthIndex }
}

function setMonthRangeFromSelection(key) {
  const { year, monthIndex } = parseMonthKey(key)
  const fromDate = new Date(year, monthIndex, 1)
  const toDate = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)
  filterFrom.value = fromDate.toISOString()
  filterTo.value = toDate.toISOString()
}

// initialize defaults
;(function initDefaultMonth() {
  selectedMonth.value = monthOptions.value[0]?.key || ''
  setMonthRangeFromSelection(selectedMonth.value)
})()

function formatCount(value) {
  const numeric = Number(value || 0)
  return numberFormatter.format(Number.isFinite(numeric) ? numeric : 0)
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function computeDailySeries(attendances = [], contracts = [], monthKey = selectedMonth.value) {
  const { year, monthIndex } = parseMonthKey(monthKey)
  const labels = []
  const length = daysInMonth(year, monthIndex)
  for (let i = 1; i <= length; i++) labels.push(String(i))
  monthDays.value = labels

  const stallsArr = new Array(length).fill(0)
  const storesArr = new Array(length).fill(0)

  for (const attendance of attendances) {
    if (!attendance || !attendance.date) continue
    const d = parseTashkentDate(attendance.date)
    if (!d || d.getFullYear() !== year || d.getMonth() !== monthIndex) continue
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
      const d = parseTashkentDate(tx.createdAt)
      if (!d || d.getFullYear() !== year || d.getMonth() !== monthIndex) continue
      const day = d.getDate()
      const amount = Number((tx.amount && tx.amount.toString()) || 0)
      storesArr[day - 1] += amount
    }
  }

  stallsDaily.value = stallsArr
  storesDaily.value = storesArr
}

async function fetchFilteredStats() {
  filtersLoading.value = true
  filtersError.value = ''
  try {
    const params = {
      from: filterFrom.value || undefined,
      to: filterTo.value || undefined,
      type: filterType.value || 'all',
      method: filterMethod.value || undefined,
      status: filterStatus.value || 'PAID',
      groupBy: filterGroupBy.value || 'daily',
    }
    const [tot, cashTot, paymeTot, clickTot, ser] = await Promise.all([
      getStatisticsTotals(params),
      getStatisticsTotals({ ...params, method: 'CASH' }),
      getStatisticsTotals({ ...params, method: 'PAYME' }),
      getStatisticsTotals({ ...params, method: 'CLICK' }),
      getStatisticsSeries(params),
    ])
    filteredTotals.value = tot || { count: 0, revenue: 0 }
    filteredCashTotals.value = cashTot || { count: 0, revenue: 0 }
    filteredBankTotals.value = {
      count: (paymeTot?.count || 0) + (clickTot?.count || 0),
      revenue: (paymeTot?.revenue || 0) + (clickTot?.revenue || 0),
    }
    const labels = Array.isArray(ser?.labels) ? ser.labels : []
    seriesLabels.value = labels
    const stall = (ser?.series || []).find((s) => s.key === 'stall')
    const store = (ser?.series || []).find((s) => s.key === 'store')
    stallsSeries.value = Array.isArray(stall?.data) ? stall.data : new Array(labels.length).fill(0)
    storesSeries.value = Array.isArray(store?.data) ? store.data : new Array(labels.length).fill(0)
  } catch (e) {
    filtersError.value = e?.response?.data?.message || e.message || 'Filtrlangan statistika olinmadi'
    seriesLabels.value = []
    stallsSeries.value = []
    storesSeries.value = []
  } finally {
    filtersLoading.value = false
  }
}

async function fetchMonthStats() {
  const { year, monthIndex } = parseMonthKey(selectedMonth.value)
  const monthNumber = monthIndex + 1
  const [all, stalls, stores, details] = await Promise.all([
    getMonthlyStatisticsByMonth(year, monthNumber),
    getMonthlyStatisticsByMonth(year, monthNumber, 'stall'),
    getMonthlyStatisticsByMonth(year, monthNumber, 'store'),
    getMonthlyDetails(year, monthNumber),
  ])
  monthlyAll.value = all || { count: 0, revenue: 0 }
  monthlyStalls.value = stalls || { count: 0, revenue: 0 }
  monthlyStores.value = stores || { count: 0, revenue: 0 }
  monthDetails.value = details || monthDetails.value
}

async function fetchMonthlySeriesChart() {
  try {
    const res = await getMonthlySeries({ months: 12, type: filterType.value || 'all' })
    const labels = Array.isArray(res?.labels) ? res.labels : []
    monthlySeriesLabels.value = labels
    const stall = (res?.series || []).find((s) => s.key === 'stall')
    const store = (res?.series || []).find((s) => s.key === 'store')
    monthlySeriesStalls.value = Array.isArray(stall?.data) ? stall.data : new Array(labels.length).fill(0)
    monthlySeriesStores.value = Array.isArray(store?.data) ? store.data : new Array(labels.length).fill(0)
  } catch (e) {
    monthlySeriesLabels.value = []
    monthlySeriesStalls.value = []
    monthlySeriesStores.value = []
  }
}

async function fetchAllAttendances({ pageSize = 200, maxPages = 50 } = {}) {
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

async function fetchAllContracts({ pageSize = 200, maxPages = 25 } = {}) {
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

async function loadSectionsList() {
  if (sections.value.length) return sections.value
  try {
    const res = await listSections()
    sections.value = Array.isArray(res) ? res : res?.data || []
  } catch (e) {
    console.error("Bo'limlar ro'yxatini olishda xatolik", e)
  }
  return sections.value
}

async function loadDetailedData() {
  debtLoading.value = true
  sectionSummaryLoading.value = true
  debtError.value = ''
  try {
    const [att, cons, sec] = await Promise.all([
      fetchAllAttendances(),
      fetchAllContracts(),
      loadSectionsList(),
    ])
    allAttendances.value = att
    allContracts.value = cons
    stallDebtSummary.value = summarizeAttendanceDebts(att)
    contractDebtSummary.value = summarizeContractDebts(cons, { asOf: new Date() })
    computeDailySeries(att, cons, selectedMonth.value)
    computeSectionDaily(att, cons, sec)
  } catch (e) {
    debtError.value = e?.response?.data?.message || e.message || 'Qarzdorlikni hisoblashda xatolik'
  } finally {
    debtLoading.value = false
    sectionSummaryLoading.value = false
  }
}

function computeSectionDaily(attendances = [], contracts = [], sectionList = []) {
  const start = startOfTashkentDay()
  const end = start ? new Date(start) : null
  if (end) end.setDate(end.getDate() + 1)

  const sectionNameMap = new Map()
  for (const sec of sectionList || []) {
    const id = Number(sec?.id)
    if (Number.isFinite(id)) sectionNameMap.set(id, sec.name || `Bo'lim #${id}`)
  }

  const buckets = new Map()
  const labelFor = (id, fallback) => {
    if (id === 'unknown') return fallback || 'Aniqlanmagan'
    const numeric = Number(id)
    if (Number.isFinite(numeric) && sectionNameMap.has(numeric)) return sectionNameMap.get(numeric)
    return fallback || `Bo'lim #${id ?? '-'}`
  }

  const ensureBucket = (sectionId, fallbackName) => {
    const key = sectionId ?? 'unknown'
    if (!buckets.has(key)) {
      buckets.set(key, {
        id: key,
        name: labelFor(sectionId, fallbackName),
        stallRevenue: 0,
        storeRevenue: 0,
        stallCount: 0,
        storeCount: 0,
      })
    }
    return buckets.get(key)
  }

  const isToday = (value) => {
    if (!start || !end || !value) return false
    const date = parseTashkentDate(value)
    return date && date >= start && date < end
  }

  const toNumber = (value) => {
    const num = Number(value)
    return Number.isFinite(num) ? num : 0
  }

  for (const attendance of attendances || []) {
    if (!attendance) continue
    if (!isToday(attendance.date)) continue
    const isPaid =
      attendance.status === 'PAID' ||
      attendance.transaction?.status === 'PAID' ||
      attendance.Transaction?.status === 'PAID'
    if (!isPaid) continue
    const sectionId =
      attendance.Stall?.sectionId ??
      attendance.sectionId ??
      attendance.stall?.sectionId ??
      'unknown'
    const sectionName = attendance.Stall?.Section?.name || attendance.sectionName
    const bucket = ensureBucket(sectionId, sectionName)
    bucket.stallRevenue += toNumber(attendance.amount)
    bucket.stallCount += 1
  }

  for (const contract of contracts || []) {
    if (!contract?.transactions?.length) continue
    const sectionId =
      contract.Store?.sectionId ?? contract.store?.sectionId ?? contract.sectionId ?? 'unknown'
    const sectionName = contract.Store?.Section?.name || contract.Store?.sectionName
    for (const tx of contract.transactions) {
      if (tx.status !== 'PAID' || !isToday(tx.createdAt)) continue
      const bucket = ensureBucket(sectionId, sectionName)
      bucket.storeRevenue += toNumber(tx.amount)
      bucket.storeCount += 1
    }
  }

  sectionDailySummary.value = Array.from(buckets.values())
    .map((bucket) => ({
      ...bucket,
      name: labelFor(bucket.id, bucket.name),
      totalRevenue: bucket.stallRevenue + bucket.storeRevenue,
      totalCount: bucket.stallCount + bucket.storeCount,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue || String(a.name).localeCompare(b.name))
}

function formatAmount(value) {
  const numeric = Number(value || 0)
  return numberFormatter.format(Number.isFinite(numeric) ? numeric : 0)
}

const chartData = computed(() => {
  const datasets = []
  const useFiltered = seriesLabels.value.length > 0
  if (statsFilter.value === 'all' || statsFilter.value === 'stall') {
    datasets.push({
      label: 'Rastalar',
      fill: true,
      borderColor: '#fb7185',
      pointBackgroundColor: '#fb7185',
      backgroundColor: 'rgba(251,113,133,0.15)',
      borderWidth: 3,
      pointRadius: 2,
      data: useFiltered ? stallsSeries.value : stallsDaily.value,
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
      data: useFiltered ? storesSeries.value : storesDaily.value,
      tension: 0.3,
    })
  }
  return {
    labels: useFiltered ? seriesLabels.value : monthDays.value,
    datasets,
  }
})

const monthlyChartData = computed(() => {
  const datasets = []
  if (statsFilter.value === 'all' || statsFilter.value === 'stall') {
    datasets.push({
      label: 'Rasta (oylik)',
      fill: true,
      borderColor: '#fb7185',
      pointBackgroundColor: '#fb7185',
      backgroundColor: 'rgba(251,113,133,0.15)',
      borderWidth: 3,
      pointRadius: 2,
      data: monthlySeriesStalls.value,
      tension: 0.25,
    })
  }
  if (statsFilter.value === 'all' || statsFilter.value === 'store') {
    datasets.push({
      label: "Do'kon (oylik)",
      fill: true,
      borderColor: '#38bdf8',
      pointBackgroundColor: '#38bdf8',
      backgroundColor: 'rgba(56,189,248,0.15)',
      borderWidth: 3,
      pointRadius: 2,
      data: monthlySeriesStores.value,
      tension: 0.25,
    })
  }
  return {
    labels: monthlySeriesLabels.value,
    datasets,
  }
})

const monthMethodRows = computed(() => [
  {
    key: 'CASH',
    label: 'Naqd (CASH)',
    revenue: formatAmount(monthDetails.value.methods?.CASH?.revenue),
    count: formatCount(monthDetails.value.methods?.CASH?.count),
  },
  {
    key: 'PAYME',
    label: 'Payme',
    revenue: formatAmount(monthDetails.value.methods?.PAYME?.revenue),
    count: formatCount(monthDetails.value.methods?.PAYME?.count),
  },
  {
    key: 'CLICK',
    label: 'Click',
    revenue: formatAmount(monthDetails.value.methods?.CLICK?.revenue),
    count: formatCount(monthDetails.value.methods?.CLICK?.count),
  },
])

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
    accent: 'from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900',
  },
  {
    key: 'stall',
    title: "Bugun (Rastalar)",
    revenue: formatAmount(dailyStalls.value.revenue),
    count: formatCount(dailyStalls.value.count),
    accent: 'from-orange-50 to-amber-50 dark:from-amber-900 dark:to-amber-950',
  },
  {
    key: 'store',
    title: "Bugun (Do'konlar)",
    revenue: formatAmount(dailyStores.value.revenue),
    count: formatCount(dailyStores.value.count),
    accent: 'from-sky-50 to-blue-50 dark:from-sky-900 dark:to-slate-900',
  },
])

const monthlyCards = computed(() => [
  {
    key: 'all',
    title: "Tanlangan oy (Jami)",
    revenue: formatAmount(monthlyAll.value.revenue),
    count: formatCount(monthlyAll.value.count),
    accent: 'from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900',
  },
  {
    key: 'stall',
    title: "Tanlangan oy (Rastalar)",
    revenue: formatAmount(monthlyStalls.value.revenue),
    count: formatCount(monthlyStalls.value.count),
    accent: 'from-orange-50 to-amber-50 dark:from-amber-900 dark:to-amber-950',
  },
  {
    key: 'store',
    title: "Tanlangan oy (Do'konlar)",
    revenue: formatAmount(monthlyStores.value.revenue),
    count: formatCount(monthlyStores.value.count),
    accent: 'from-sky-50 to-blue-50 dark:from-sky-900 dark:to-slate-900',
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

const sectionDailyTotals = computed(() =>
  sectionDailySummary.value.reduce(
    (acc, sec) => ({
      stallRevenue: acc.stallRevenue + (sec.stallRevenue || 0),
      storeRevenue: acc.storeRevenue + (sec.storeRevenue || 0),
      totalRevenue: acc.totalRevenue + (sec.totalRevenue || 0),
      totalCount: acc.totalCount + (sec.totalCount || 0),
    }),
    { stallRevenue: 0, storeRevenue: 0, totalRevenue: 0, totalCount: 0 },
  ),
)

function coveragePercent(paid, expected) {
  const pay = Number(paid || 0)
  const need = Number(expected || 0)
  if (!Number.isFinite(pay) || !Number.isFinite(need) || need <= 0) return 0
  return Math.min(100, Math.round((pay / need) * 100))
}

const coverageCards = computed(() => {
  const stallCover = coveragePercent(stallDebtSummary.value.paid, stallDebtSummary.value.expected)
  const storeCover = coveragePercent(contractDebtSummary.value.paid, contractDebtSummary.value.expected)
  const combinedPaid = (stallDebtSummary.value.paid || 0) + (contractDebtSummary.value.paid || 0)
  const combinedExpected =
    (stallDebtSummary.value.expected || 0) + (contractDebtSummary.value.expected || 0)
  const combinedCover = coveragePercent(combinedPaid, combinedExpected)
  return [
    {
      key: 'stall',
      title: 'Rasta qoplama',
      subtitle: "Kunlik yig'imlar",
      percent: stallCover,
      amount: formatAmount(stallDebtSummary.value.paid),
      accent: 'from-amber-50 to-orange-100 dark:from-amber-900 dark:to-amber-950',
    },
    {
      key: 'store',
      title: "Do'kon qoplama",
      subtitle: "Oylik ijara",
      percent: storeCover,
      amount: formatAmount(contractDebtSummary.value.paid),
      accent: 'from-sky-50 to-blue-100 dark:from-sky-900 dark:to-slate-900',
    },
    {
      key: 'all',
      title: 'Umumiy qoplama',
      subtitle: 'Rasta + do‘kon',
      percent: combinedCover,
      amount: formatAmount(combinedPaid),
      accent: 'from-emerald-50 to-emerald-100 dark:from-emerald-900 dark:to-emerald-950',
    },
  ]
})

const insightCards = computed(() => {
  const avgTicket =
    dailyAll.value.count > 0 ? dailyAll.value.revenue / dailyAll.value.count : dailyAll.value.revenue
  const { year, monthIndex } = parseMonthKey(selectedMonth.value)
  const monthLength = daysInMonth(year, monthIndex)
  const monthlyAvg = (monthlyAll.value.revenue || 0) / Math.max(1, monthLength)
  const totalDebt = (contractDebtSummary.value.debt || 0) + (stallDebtSummary.value.debt || 0)
  return [
    {
      key: 'avg-ticket',
      title: "Bugungi o'rtacha chek",
      value: formatAmount(avgTicket),
      hint: 'Jami tushum / tranzaksiya',
    },
    {
      key: 'monthly-avg',
      title: "Oylik kunlik o'rtacha",
      value: formatAmount(monthlyAvg),
      hint: 'Hozirgacha tushum / kunlar soni',
    },
    {
      key: 'debt',
      title: 'Jami qarzdorlik',
      value: formatAmount(totalDebt),
      hint: "Rasta va do'konlarni qo'shib",
      tone: 'danger',
    },
  ]
})

const leadingSection = computed(() => sectionDailySummary.value[0] || null)

async function fetchStats() {
  loading.value = true
  errorMsg.value = ''
  try {
    dailyAll.value = await getDailyStatistics()
    dailyStalls.value = await getDailyStatistics('stall')
    dailyStores.value = await getDailyStatistics('store')
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Statistikani olishda xatolik'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await fetchStats()
  await fetchMonthStats()
  await loadDetailedData()
  await fetchFilteredStats()
  await fetchMonthlySeriesChart()
})

// Debounce filters
let filterDebounce
watch([filterFrom, filterTo, filterType, filterMethod, filterStatus, filterGroupBy], () => {
  if (filterDebounce) clearTimeout(filterDebounce)
  filterDebounce = setTimeout(() => {
    fetchFilteredStats()
    fetchMonthlySeriesChart()
  }, 350)
})

watch(selectedMonth, (key) => {
  setMonthRangeFromSelection(key)
  fetchMonthStats()
  fetchFilteredStats()
})

async function checkStallStatus() {
  const stall = checkStallNumber.value?.trim()
  if (!stall) return
  checkStallLoading.value = true
  checkStallError.value = ''
  checkStallResult.value = null
  try {
    // Mimic the "Second Page" stall check
    const data = await getPublicStall(stall, { date: checkStallDate.value, fields: 'min' })
    const normalized = normalizeStallResults(data, { fallbackDate: checkStallDate.value })
    checkStallResult.value = normalized[0] || null
    if (!checkStallResult.value) {
      checkStallError.value = "Rasta bo'yicha ma'lumot topilmadi"
    }
  } catch (e) {
    checkStallError.value = e?.response?.data?.message || 'Tekshirishda xatolik'
  } finally {
    checkStallLoading.value = false
  }
}
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain wide>
      <SectionTitle first>Statistika va To'lovlar Tahlili</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">{{ errorMsg }}</div>
      <div v-if="debtError" class="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-amber-700">
        {{ debtError }}
      </div>

      <div class="mb-6 flex space-x-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          @click="activeTab = tab.key"
          :class="[
            'flex-1 rounded-lg py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2',
            activeTab === tab.key
              ? 'bg-white text-slate-900 shadow dark:bg-slate-600 dark:text-white'
              : 'text-slate-700 hover:bg-white/[0.12] hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
          ]"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- GENERAL DASHBOARD TAB -->
      <div v-show="activeTab === 'general'">
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
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <label class="text-slate-600 dark:text-slate-300">Oy</label>
          <select v-model="selectedMonth" class="rounded border px-2 py-1 text-sm dark:bg-slate-900">
            <option v-for="opt in monthOptions" :key="opt.key" :value="opt.key">
              {{ opt.label }}
            </option>
          </select>
          <label class="text-slate-600 dark:text-slate-300">Turi</label>
          <select v-model="filterType" class="rounded border px-2 py-1 text-sm dark:bg-slate-900">
            <option value="all">Jami</option>
            <option value="stall">Rasta</option>
            <option value="store">Do'kon</option>
          </select>
          <label class="text-slate-600 dark:text-slate-300">Usul</label>
          <select v-model="filterMethod" class="rounded border px-2 py-1 text-sm dark:bg-slate-900">
            <option value="">Barchasi</option>
            <option value="PAYME">Payme</option>
            <option value="CLICK">Click</option>
            <option value="CASH">Naqd</option>
          </select>
          <label class="text-slate-600 dark:text-slate-300">Holat</label>
          <select v-model="filterStatus" class="rounded border px-2 py-1 text-sm dark:bg-slate-900">
            <option value="PAID">PAID</option>
            <option value="UNPAID">UNPAID</option>
          </select>
          <label class="text-slate-600 dark:text-slate-300">Guruh</label>
          <select v-model="filterGroupBy" class="rounded border px-2 py-1 text-sm dark:bg-slate-900">
            <option value="daily">Kunlik</option>
            <option value="weekly">Haftalik</option>
            <option value="monthly">Oylik</option>
          </select>
        </div>
      </div>

      <div v-if="filtersError" class="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-amber-700">{{ filtersError }}</div>
      <div class="mb-2 text-xs text-slate-500">Filtrlangan jami: {{ formatAmount(filteredTotals.revenue) }} so'm, tranzaksiya: {{ formatCount(filteredTotals.count) }}</div>
      <div class="mb-4 grid gap-3 md:grid-cols-3">
        <div class="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div class="text-slate-500 dark:text-slate-300">Naqd (CASH)</div>
          <div class="mt-1 text-2xl font-semibold">{{ formatAmount(filteredCashTotals.revenue) }}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400">Tranzaksiya: {{ formatCount(filteredCashTotals.count) }}</div>
        </div>
        <div class="rounded-lg border border-sky-200 bg-white p-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div class="text-slate-500 dark:text-slate-300">Bank (Payme + Click)</div>
          <div class="mt-1 text-2xl font-semibold">{{ formatAmount(filteredBankTotals.revenue) }}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400">Tranzaksiya: {{ formatCount(filteredBankTotals.count) }}</div>
        </div>
        <div class="rounded-lg border border-emerald-200 bg-white p-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div class="text-slate-500 dark:text-slate-300">Jami (Filtr)</div>
          <div class="mt-1 text-2xl font-semibold">{{ formatAmount(filteredTotals.revenue) }}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400">Tranzaksiya: {{ formatCount(filteredTotals.count) }}</div>
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
              <span class="text-xs uppercase text-gray-400 dark:text-gray-300">{{ selectedMonthLabel }}</span>
            </div>
            <div class="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100 md:text-4xl">{{ card.revenue }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-300">Tranzaksiyalar: {{ card.count }}</div>
          </div>
        </CardBox>
      </div>

      <CardBox class="mb-6">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 pb-3 pt-4 dark:border-slate-700">
          <div>
            <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Tanlangan oy bo'yicha to'lovlar</div>
            <div class="text-xs text-slate-500 dark:text-slate-300">{{ selectedMonthLabel }}</div>
          </div>
          <div class="text-sm text-slate-600 dark:text-slate-200">
            Jami: {{ formatAmount(monthDetails.totals?.revenue) }} so'm · {{ formatCount(monthDetails.totals?.count) }} trx
          </div>
        </div>
        <div class="grid gap-4 p-6 md:grid-cols-3">
          <div class="rounded-xl border border-slate-100 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-800">
            <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Jami tushum</div>
            <div class="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">{{ formatAmount(monthDetails.totals?.revenue) }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-300">Tranzaksiyalar: {{ formatCount(monthDetails.totals?.count) }}</div>
          </div>
          <div class="rounded-xl border border-slate-100 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-800">
            <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Rasta vs Do'kon</div>
            <table class="mt-3 w-full text-sm">
              <thead>
                <tr class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  <th class="pb-1">Turi</th>
                  <th class="pb-1">Tushum</th>
                  <th class="pb-1 text-right">Tranzaksiya</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-t border-slate-100 dark:border-slate-700">
                  <td class="py-2 text-amber-700 dark:text-amber-300">Rasta</td>
                  <td class="py-2 font-semibold text-slate-900 dark:text-slate-100">{{ formatAmount(monthDetails.stall?.revenue) }}</td>
                  <td class="py-2 text-right text-slate-600 dark:text-slate-300">{{ formatCount(monthDetails.stall?.count) }}</td>
                </tr>
                <tr class="border-t border-slate-100 dark:border-slate-700">
                  <td class="py-2 text-sky-700 dark:text-sky-300">Do'kon</td>
                  <td class="py-2 font-semibold text-slate-900 dark:text-slate-100">{{ formatAmount(monthDetails.store?.revenue) }}</td>
                  <td class="py-2 text-right text-slate-600 dark:text-slate-300">{{ formatCount(monthDetails.store?.count) }}</td>
                </tr>
                <tr class="border-t border-slate-200 font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100">
                  <td class="py-2">Jami</td>
                  <td class="py-2">{{ formatAmount((monthDetails.stall?.revenue || 0) + (monthDetails.store?.revenue || 0)) }}</td>
                  <td class="py-2 text-right">{{ formatCount((monthDetails.stall?.count || 0) + (monthDetails.store?.count || 0)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="rounded-xl border border-slate-100 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-800">
            <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">To'lov usuli</div>
            <div class="mt-2 space-y-2">
              <div
                v-for="method in monthMethodRows"
                :key="method.key"
                class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-700"
              >
                <div class="text-slate-600 dark:text-slate-200">{{ method.label }}</div>
                <div class="text-right">
                  <div class="font-semibold text-slate-900 dark:text-slate-100">{{ method.revenue }}</div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-300">{{ method.count }} trx</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardBox>

      <CardBox class="mb-6">
        <div class="grid gap-4 md:grid-cols-3">
          <div
            v-for="card in insightCards"
            :key="card.key"
            class="rounded-xl border border-slate-100 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-800"
          >
            <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">
              {{ card.title }}
            </div>
            <div
              class="mt-2 text-3xl font-semibold md:text-4xl"
              :class="card.tone === 'danger' ? 'text-rose-500 dark:text-rose-300' : 'text-slate-900 dark:text-slate-100'"
            >
              {{ card.value }}
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-300">{{ card.hint }}</div>
          </div>
        </div>
      </CardBox>

      <CardBox class="mb-6">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 pb-4 pt-5 dark:border-slate-700">
          <div>
            <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Qoplama ko'rsatkichlari</div>
            <div class="text-xs text-slate-500 dark:text-slate-300">Majburiyat va to'lovlar balansi</div>
          </div>
          <div v-if="leadingSection" class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            Eng faol bo'lim: {{ leadingSection.name }} ({{ formatAmount(leadingSection.totalRevenue) }} so'm)
          </div>
        </div>
        <div class="grid gap-4 p-6 md:grid-cols-3">
          <div
            v-for="card in coverageCards"
            :key="card.key"
            class="rounded-xl border border-slate-100 bg-gradient-to-r p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            :class="card.accent"
          >
            <div class="flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-100">
              <span>{{ card.title }}</span>
              <span class="text-xs text-slate-500 dark:text-slate-300">{{ card.subtitle }}</span>
            </div>
            <div class="mt-2 flex items-baseline gap-2">
              <span class="text-3xl font-bold text-slate-900 dark:text-slate-100">{{ card.percent }}%</span>
              <span class="text-xs text-slate-500 dark:text-slate-300">To'langan</span>
            </div>
            <div class="mt-3 h-2 w-full rounded-full bg-white/60 dark:bg-slate-700">
              <div
                class="h-2 rounded-full bg-slate-900 transition-all dark:bg-slate-200"
                :style="{ width: `${card.percent}%` }"
              />
            </div>
            <div class="mt-2 text-xs text-slate-600 dark:text-slate-200">To'langan: {{ card.amount }} so'm</div>
          </div>
        </div>
      </CardBox>

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

      <CardBox class="mb-6">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 pb-3 pt-4 dark:border-slate-700">
          <div>
            <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Bo'limlar kesimida bugungi to'lovlar</div>
            <div class="text-xs text-slate-500 dark:text-slate-300">Rasta va do'kon tushumlari jamlanmasi</div>
          </div>
          <BaseButton small color="info" :disabled="sectionSummaryLoading" :label="sectionSummaryLoading ? 'Yangilanmoqda...' : 'Hisobotni yangilash'" @click="loadDetailedData" />
        </div>
        <div class="overflow-x-auto">
          <table class="w-full table-auto text-sm">
            <thead>
              <tr class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <th class="px-4 py-2">Bo'lim</th>
                <th class="px-4 py-2">Rasta tushumi</th>
                <th class="px-4 py-2">Do'kon tushumi</th>
                <th class="px-4 py-2">Jami</th>
                <th class="px-4 py-2 text-right">Tranzaksiyalar</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="sectionSummaryLoading">
                <td colspan="5" class="px-4 py-4 text-center text-slate-500 dark:text-slate-300">Hisoblanmoqda...</td>
              </tr>
              <tr v-else-if="!sectionDailySummary.length">
                <td colspan="5" class="px-4 py-4 text-center text-slate-500 dark:text-slate-300">Bugungi to'lovlar hali yo'q</td>
              </tr>
              <tr
                v-for="section in sectionDailySummary"
                v-else
                :key="section.id"
                class="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/80"
              >
                <td class="px-4 py-2 font-semibold text-slate-800 dark:text-slate-100">
                  {{ section.name }}
                  <span class="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                    {{ section.totalCount }} trx
                  </span>
                </td>
                <td class="px-4 py-2 text-amber-600 dark:text-amber-300">
                  {{ formatAmount(section.stallRevenue) }} so'm
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">Rasta: {{ section.stallCount }}</div>
                </td>
                <td class="px-4 py-2 text-sky-600 dark:text-sky-300">
                  {{ formatAmount(section.storeRevenue) }} so'm
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">Do'kon: {{ section.storeCount }}</div>
                </td>
                <td class="px-4 py-2 font-semibold text-emerald-600 dark:text-emerald-300">
                  {{ formatAmount(section.totalRevenue) }} so'm
                </td>
                <td class="px-4 py-2 text-right text-slate-700 dark:text-slate-200">
                  {{ section.totalCount }}
                </td>
              </tr>
              <tr v-if="sectionDailySummary.length" class="bg-slate-50 font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                <td class="px-4 py-2">Jami</td>
                <td class="px-4 py-2 text-amber-700 dark:text-amber-300">
                  {{ formatAmount(sectionDailyTotals.stallRevenue) }} so'm
                </td>
                <td class="px-4 py-2 text-sky-700 dark:text-sky-300">
                  {{ formatAmount(sectionDailyTotals.storeRevenue) }} so'm
                </td>
                <td class="px-4 py-2 text-emerald-700 dark:text-emerald-300">
                  {{ formatAmount(sectionDailyTotals.totalRevenue) }} so'm
                </td>
                <td class="px-4 py-2 text-right">{{ sectionDailyTotals.totalCount }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardBox>

      <CardBox>
        <div class="p-6">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="text-sm font-semibold">Joriy oy: kunlik tushum (Rasta vs Do'kon)</div>
              <div class="text-xs text-gray-500">{{ selectedMonthLabel }}</div>
            </div>
            <div class="text-xs text-gray-500">Kunlar kesimida umumiy tushum</div>
          </div>
          <div style="height: 360px">
            <LineChart :data="chartData" :options="chartOptions" />
          </div>
        </div>
      </CardBox>

      <CardBox class="mt-6">
        <div class="p-6">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="text-sm font-semibold">Oylik trend: so'nggi 12 oy</div>
              <div class="text-xs text-gray-500">Rasta va do'kon tushumlari</div>
            </div>
            <div class="text-xs text-gray-500">Oylik kesimda jamlangan</div>
          </div>
          <div style="height: 320px">
            <LineChart :data="monthlyChartData" :options="chartOptions" />
          </div>
        </div>
      </CardBox>
      </div>

      <!-- STALLS ANALYSIS TAB -->
      <div v-show="activeTab === 'stalls'">
        <div class="grid gap-6 md:grid-cols-2">
          <!-- QUICK CHECK WIDGET -->
          <CardBox class="h-full">
            <div class="mb-4 border-b border-slate-100 pb-2 dark:border-slate-700">
              <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-100">Tezkor Rasta Tekshiruvi</h3>
              <p class="text-sm text-slate-500">Rasta raqami bo'yicha to'lov holatini tekshirish</p>
            </div>
            
            <form @submit.prevent="checkStallStatus" class="space-y-4">
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Rasta raqami</label>
                  <input
                    v-model="checkStallNumber"
                    type="text"
                    required
                    placeholder="A-101"
                    class="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label class="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Sana</label>
                  <input
                    v-model="checkStallDate"
                    type="date"
                    required
                    class="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800"
                  />
                </div>
              </div>
              <div class="flex justify-end">
                <BaseButton
                  type="submit"
                  color="info"
                  :label="checkStallLoading ? 'Tekshirilmoqda...' : 'Tekshirish'"
                  :disabled="checkStallLoading"
                />
              </div>
            </form>

            <div v-if="checkStallError" class="mt-4 rounded bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-300">
              {{ checkStallError }}
            </div>

            <div v-if="checkStallResult" class="mt-4 rounded border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <div class="flex items-start justify-between">
                <div>
                  <div class="text-lg font-bold text-slate-800 dark:text-slate-100">
                    {{ checkStallResult.stall?.stallNumber }}
                  </div>
                  <div class="text-sm text-slate-500">
                    {{ checkStallResult.stall?.description || "Izoh yo'q" }}
                  </div>
                </div>
                <div
                  class="rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wide"
                  :class="checkStallResult.payment?.isPaid ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'"
                >
                  {{ checkStallResult.payment?.status }}
                </div>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div class="text-xs text-slate-500">To'lov summasi</div>
                  <div class="font-semibold">{{ formatAmount(checkStallResult.payment?.amountDue) }}</div>
                </div>
                <div>
                  <div class="text-xs text-slate-500">Sana</div>
                  <div>{{ checkStallResult.payment?.date }}</div>
                </div>
              </div>
            </div>
          </CardBox>

          <!-- STALLS TODAY OVERVIEW -->
          <CardBox class="h-full">
            <div class="mb-4 border-b border-slate-100 pb-2 dark:border-slate-700">
              <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-100">Bugungi Rasta Hisoboti</h3>
              <p class="text-sm text-slate-500">{{ todayLabel }}</p>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div class="rounded-lg bg-emerald-50 p-4 text-center dark:bg-emerald-900/20">
                <div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{{ formatCount(dailyStalls.count) }}</div>
                <div class="text-xs uppercase text-emerald-600/80 dark:text-emerald-400/80">To'langan</div>
              </div>
              <div class="rounded-lg bg-slate-50 p-4 text-center dark:bg-slate-800">
                <div class="text-2xl font-bold text-slate-700 dark:text-slate-300">{{ formatAmount(dailyStalls.revenue) }}</div>
                <div class="text-xs uppercase text-slate-500">Jami Tushum</div>
              </div>
            </div>

            <div class="mt-6">
              <h4 class="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Bo'limlar Qoplami</h4>
              <div class="max-h-60 overflow-y-auto pr-1">
                <div v-for="sec in sectionDailySummary" :key="sec.id" class="mb-3 flex items-center justify-between text-sm">
                  <span class="truncate pr-2 text-slate-600 dark:text-slate-400">{{ sec.name }}</span>
                  <div class="flex items-center gap-3">
                    <span class="font-medium">{{ formatCount(sec.stallCount) }} ta</span>
                    <span class="w-20 text-right text-xs text-slate-400">{{ formatAmount(sec.stallRevenue) }}</span>
                  </div>
                </div>
                <div v-if="!sectionDailySummary.length" class="text-center text-sm text-slate-400">
                  Ma'lumot yo'q
                </div>
              </div>
            </div>
          </CardBox>
        </div>

        <CardBox class="mt-6">
           <div class="p-6">
            <h3 class="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">Batafsil Hisobot (Jadval)</h3>
             <div class="overflow-x-auto">
               <table class="w-full table-auto text-sm">
                 <thead>
                   <tr class="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                     <th class="px-4 py-2">Rasta</th>
                     <th class="px-4 py-2">Bo'lim</th>
                     <th class="px-4 py-2">Sana</th>
                     <th class="px-4 py-2">Summa</th>
                     <th class="px-4 py-2">Holat</th>
                   </tr>
                 </thead>
                 <tbody>
                    <tr v-for="att in allAttendances.slice(0, 10)" :key="att.id" class="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                      <td class="px-4 py-2 font-medium">{{ att.stall?.stallNumber || att.stallNumber || '-' }}</td>
                      <td class="px-4 py-2 text-slate-500">{{ att.stall?.Section?.name || '-' }}</td>
                      <td class="px-4 py-2">{{ formatTashkentDate(att.date) }}</td>
                      <td class="px-4 py-2">{{ formatAmount(att.amount) }}</td>
                      <td class="px-4 py-2">
                        <span class="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          {{ att.status }}
                        </span>
                      </td>
                    </tr>
                    <tr v-if="allAttendances.length === 0">
                      <td colspan="5" class="p-4 text-center text-slate-500">Bugun uchun to'lovlar yuklanmagan</td>
                    </tr>
                 </tbody>
               </table>
               <div v-if="allAttendances.length > 10" class="mt-2 text-center text-xs text-slate-400">
                 So'nggi 10 tasi ko'rsatilgan. To'liq ro'yxat uchun "Attendances" bo'limiga o'ting.
               </div>
             </div>
           </div>
        </CardBox>
      </div>
    </SectionMain>
  </LayoutAuthenticated>
</template>
