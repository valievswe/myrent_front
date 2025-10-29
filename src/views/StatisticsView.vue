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

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function ymd(d) {
  const dt = new Date(d)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const da = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

async function buildDailySeries() {
  // Compute current month daily revenue for stalls and stores
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const start = new Date(y, m, 1)
  const end = new Date(y, m, daysInMonth(y, m))
  const labels = []
  const length = daysInMonth(y, m)
  for (let i = 1; i <= length; i++) labels.push(String(i))
  monthDays.value = labels

  const stallsArr = new Array(length).fill(0)
  const storesArr = new Array(length).fill(0)

  try {
    // Stalls: sum PAID attendances by date
    const att = await listAttendances({ dateFrom: ymd(start), dateTo: ymd(end), page: 1, limit: 5000 })
    for (const a of att.data || []) {
      if (a.status !== 'PAID') continue
      const d = new Date(a.date)
      const day = d.getDate()
      const amount = Number((a.amount && a.amount.toString()) || 0)
      stallsArr[day - 1] += amount
    }
  } catch {}

  try {
    // Stores: flatten contract transactions in this month
    const cons = await listContracts({ page: 1, limit: 1000 })
    for (const c of cons.data || []) {
      for (const t of c.transactions || []) {
        if (t.status !== 'PAID' || !t.createdAt) continue
        const d = new Date(t.createdAt)
        if (d.getMonth() !== m || d.getFullYear() !== y) continue
        const day = d.getDate()
        const amount = Number((t.amount && t.amount.toString()) || 0)
        storesArr[day - 1] += amount
      }
    }
  } catch {}

  stallsDaily.value = stallsArr
  storesDaily.value = storesArr
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
  await buildDailySeries()
})
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitle first>Statistika va To'lovlar Tahlili</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">{{ errorMsg }}</div>

      <div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <CardBox>
          <div class="p-4">
            <div class="text-sm text-gray-500">Bugun (Jami)</div>
            <div class="mt-1 text-2xl font-semibold">{{ dailyAll.revenue }}</div>
            <div class="text-xs text-gray-500">Tranzaksiyalar: {{ dailyAll.count }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-4">
            <div class="text-sm text-gray-500">Bugun (Rastalar)</div>
            <div class="mt-1 text-2xl font-semibold">{{ dailyStalls.revenue }}</div>
            <div class="text-xs text-gray-500">Tranzaksiyalar: {{ dailyStalls.count }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-4">
            <div class="text-sm text-gray-500">Bugun (Do'konlar)</div>
            <div class="mt-1 text-2xl font-semibold">{{ dailyStores.revenue }}</div>
            <div class="text-xs text-gray-500">Tranzaksiyalar: {{ dailyStores.count }}</div>
          </div>
        </CardBox>
      </div>

      <div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <CardBox>
          <div class="p-4">
            <div class="text-sm text-gray-500">Joriy oy (Jami)</div>
            <div class="mt-1 text-2xl font-semibold">{{ monthRevenueAll.revenue }}</div>
            <div class="text-xs text-gray-500">Tranzaksiyalar: {{ monthlyAll.count }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-4">
            <div class="text-sm text-gray-500">Joriy oy (Rastalar)</div>
            <div class="mt-1 text-2xl font-semibold">{{ monthRevenueStalls.revenue }}</div>
            <div class="text-xs text-gray-500">Tranzaksiyalar: {{ monthlyStalls.count }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="p-4">
            <div class="text-sm text-gray-500">Joriy oy (Do'konlar)</div>
            <div class="mt-1 text-2xl font-semibold">{{ monthRevenueStores.revenue }}</div>
            <div class="text-xs text-gray-500">Tranzaksiyalar: {{ monthlyStores.count }}</div>
          </div>
        </CardBox>
      </div>

      <CardBox>
        <div class="p-4">
          <div class="mb-3 text-sm font-medium">Joriy oy: kunlik tushum (Rasta vs Do'kon)</div>
          <div style="height: 280px">
            <LineChart :data="chartData" />
          </div>
        </div>
      </CardBox>
    </SectionMain>
  </LayoutAuthenticated>
</template>

