<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import LineChart from '@/components/Charts/LineChart.vue'
import { getLedger, getMonthlyRollup, getContractsMonthlyStatus } from '@/services/reconciliation'
import { formatTashkentDate, formatTashkentDateTime } from '@/utils/time'
import * as XLSX from 'xlsx'

const loading = ref(false)
const ledger = ref({ rows: [], from: null, to: null })
const contracts = ref([])
const visibleLedger = ref(50)
const visibleContracts = ref(50)
const rollup = ref({ labels: [], series: [] })
const errorMsg = ref('')

const selectedMonth = ref('')
const filterType = ref('all')
const filterMethod = ref('')
const filterStatus = ref('all')

const statusOptions = ['all', 'PAID', 'PENDING', 'FAILED', 'CANCELLED', 'UNPAID']
const typeOptions = [
  { key: 'all', label: 'Jami' },
  { key: 'stall', label: 'Rasta' },
  { key: 'store', label: "Do'kon" },
]
const methodOptions = [
  { key: '', label: 'Barcha usullar' },
  { key: 'PAYME', label: 'Payme' },
  { key: 'CLICK', label: 'Click' },
  { key: 'CASH', label: 'Naqd/qo‘lda' },
]

const monthFormatter = new Intl.DateTimeFormat('uz-UZ', { year: 'numeric', month: 'long' })
const currency = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

const monthOptions = computed(() => {
  const now = new Date()
  const opts = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    opts.push({ key, label: monthFormatter.format(d) })
  }
  return opts
})

function parseMonthKey(key) {
  const [y, m] = String(key || '').split('-').map((v) => Number(v))
  const year = Number.isFinite(y) ? y : new Date().getFullYear()
  const monthIndex = Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : new Date().getMonth()
  return { year, monthIndex }
}

function currentMonthDefaults() {
  selectedMonth.value = monthOptions.value[0]?.key || ''
}
currentMonthDefaults()

function formatAmount(value) {
  const n = Number(value || 0)
  return currency.format(Number.isFinite(n) ? n : 0)
}

function statusLabel(status) {
  if (status === 'PAID') return "To'langan"
  if (status === 'PENDING') return 'Jarayonda'
  if (status === 'UNPAID') return "To'lanmagan"
  if (status === 'FAILED' || status === 'CANCELLED') return 'Bekor'
  return status || '-'
}

const ledgerTotals = computed(() => {
  const totals = { all: 0, PAYME: 0, CLICK: 0, CASH: 0 }
  for (const row of ledger.value.rows || []) {
    const amt = Number(row.amount || 0)
    totals.all += amt
    if (row.method && totals[row.method] !== undefined) totals[row.method] += amt
  }
  return totals
})

// With monthly-status semantics, we do not compute overpaid here.
const overpaidContracts = computed(() => [])
const overpaidContractsDetail = computed(() => [])

const chartData = computed(() => {
  const labels = rollup.value.labels || []
  const stall = (rollup.value.series || []).find((s) => s.key === 'stall')
  const store = (rollup.value.series || []).find((s) => s.key === 'store')
  return {
    labels,
    datasets: [
      {
        label: 'Rasta',
        data: Array.isArray(stall?.data) ? stall.data : [],
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.18)',
        fill: true,
        tension: 0.25,
      },
      {
        label: "Do'kon",
        data: Array.isArray(store?.data) ? store.data : [],
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56,189,248,0.18)',
        fill: true,
        tension: 0.25,
      },
    ],
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { usePointStyle: true } },
  },
  scales: {
    y: {
      ticks: {
        callback(v) {
          return formatAmount(v)
        },
      },
      grid: { color: 'rgba(148,163,184,0.2)' },
    },
    x: { grid: { display: false } },
  },
}

async function loadData() {
  loading.value = true
  errorMsg.value = ''
  try {
    const { year, monthIndex } = parseMonthKey(selectedMonth.value)
    const month = monthIndex + 1
    const params = {
      month,
      year,
      type: filterType.value,
      method: filterMethod.value || undefined,
      status: filterStatus.value === 'all' ? undefined : filterStatus.value,
    }
    const [ledgerRes, monthlyStatus, rollupRes] = await Promise.all([
      getLedger(params),
      getContractsMonthlyStatus({ year, month }),
      getMonthlyRollup({ months: 12, type: filterType.value, method: filterMethod.value || undefined }),
    ])
    ledger.value = ledgerRes || { rows: [] }
    // Transform monthly status into rows compatible with table
    const paidRows = (monthlyStatus?.paid || []).map((p) => ({
      contractId: p.contractId,
      storeNumber: p.storeNumber,
      sectionName: p.sectionName,
      expected: Number(p.monthlyFee || 0),
      paid: Number(p.amount || p.monthlyFee || 0),
      unpaid: 0,
      overpaid: false,
      lastPaymentAt: p.lastPaymentAt || null,
      lastPaymentMethod: p.lastPaymentMethod || null,
    }))
    const unpaidRows = (monthlyStatus?.unpaid || []).map((u) => ({
      contractId: u.contractId,
      storeNumber: u.storeNumber,
      sectionName: u.sectionName,
      expected: Number(u.monthlyFee || 0),
      paid: 0,
      unpaid: Number(u.debt || u.monthlyFee || 0),
      overpaid: false,
      lastPaymentAt: null,
      lastPaymentMethod: null,
    }))
    contracts.value = [...unpaidRows, ...paidRows]
    rollup.value = rollupRes || { labels: [], series: [] }
    visibleLedger.value = 50
    visibleContracts.value = 50
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || e.message || "Hisob-kitob ma'lumotlari olinmadi"
    ledger.value = { rows: [] }
    contracts.value = []
    rollup.value = { labels: [], series: [] }
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
watch([selectedMonth, filterType, filterMethod, filterStatus], loadData)

function exportLedger() {
  const rows = ledger.value.rows || []
  const contractsData = contracts.value || []

  const makeLedgerRows = (list) =>
    list.map((row) => ({
      Sana: formatTashkentDate(row.date),
      Turi: row.type,
      ID: row.contractId || row.stallId || '',
      "Bo'lim": row.sectionName || '',
      "Raqam": row.type === 'store' ? (row.storeNumber || '') : (row.stallNumber || ''),
      Holat: statusLabel(row.status),
      Usul: row.method || '',
      Summa: Number(row.amount || 0),
      Manba: row.source,
      "To'lov vaqti": formatTashkentDateTime(row.paidAt),
    }))

  const makeContractRows = (list) =>
    list.map((c) => ({
      Shartnoma: c.contractId,
      "Do'kon": c.storeNumber,
      "Bo'lim": c.sectionName || '',
      "Oylik ijara": Number(c.expected || 0),
      "To'langan": Number(c.paid || 0),
      "Qoplanmagan": Number(c.unpaid || 0),
      Holat: c.overpaid ? 'Ortiqcha' : c.unpaid > 0 ? "To'lanmagan" : "To'langan",
      "Oxirgi to'lov": formatTashkentDateTime(c.lastPaymentAt),
      Usul: c.lastPaymentMethod || '',
    }))

  const stallPaid = makeLedgerRows(rows.filter((r) => r.type === 'stall' && r.status === 'PAID'))
  const stallUnpaid = makeLedgerRows(rows.filter((r) => r.type === 'stall' && r.status !== 'PAID'))
  const storePaid = makeLedgerRows(rows.filter((r) => r.type === 'store' && r.status === 'PAID'))
  const storeUnpaid = makeLedgerRows(rows.filter((r) => r.type === 'store' && r.status !== 'PAID'))

  const contractPaid = makeContractRows(contractsData.filter((c) => !c.unpaid || c.unpaid <= 0))
  const contractUnpaid = makeContractRows(contractsData.filter((c) => c.unpaid > 0))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stallPaid), "Rasta To'langan")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stallUnpaid), "Rasta To'lanmagan")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(storePaid), "Do'kon To'langan")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(storeUnpaid), "Do'kon To'lanmagan")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(contractPaid), "Shartnoma To'langan")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(contractUnpaid), "Shartnoma To'lanmagan")
  XLSX.writeFile(wb, 'hisob-kitob.xlsx')
}
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitle first>Hisob-kitob</SectionTitle>
      <p class="mb-4 text-sm text-slate-600 dark:text-slate-300">
        Tashkent vaqti bo'yicha to'lovlarni aniqlashtirish: oylar kesimida daftarcha, shartnoma yig'indisi va usul bo'yicha ajratma.
      </p>

      <div class="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <label class="text-xs text-slate-500 dark:text-slate-300">Oy</label>
          <select v-model="selectedMonth" class="rounded border px-3 py-2 text-sm dark:bg-slate-900">
            <option v-for="opt in monthOptions" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
          </select>
        </div>
        <div>
          <label class="text-xs text-slate-500 dark:text-slate-300">Turi</label>
          <select v-model="filterType" class="rounded border px-3 py-2 text-sm dark:bg-slate-900">
            <option v-for="opt in typeOptions" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
          </select>
        </div>
        <div>
          <label class="text-xs text-slate-500 dark:text-slate-300">Usul</label>
          <select v-model="filterMethod" class="rounded border px-3 py-2 text-sm dark:bg-slate-900">
            <option v-for="opt in methodOptions" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
          </select>
        </div>
        <div>
          <label class="text-xs text-slate-500 dark:text-slate-300">Holat</label>
          <select v-model="filterStatus" class="rounded border px-3 py-2 text-sm dark:bg-slate-900">
            <option v-for="st in statusOptions" :key="st" :value="st">{{ st }}</option>
          </select>
        </div>
        <BaseButton :disabled="loading" color="info" :label="loading ? 'Yuklanmoqda...' : 'Yangilash'" @click="loadData" />
        <BaseButton :disabled="!ledger.rows?.length" color="success" outline label="Excel (XLSX)" @click="exportLedger" />
      </div>

      <div v-if="errorMsg" class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-400/50 dark:bg-red-950/30">
        {{ errorMsg }}
      </div>

      <div v-if="overpaidContracts.length" class="mb-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-500/50 dark:bg-amber-900/30 dark:text-amber-50">
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-2 text-amber-800 dark:text-amber-100">
            <span class="text-lg">⚠</span>
            <div>
              <div class="font-semibold">{{ overpaidContracts.length }} ta shartnomada ortiqcha to'lov</div>
              <div class="text-xs text-amber-700 dark:text-amber-200">Iltimos, bank ma'lumotlari bilan solishtiring.</div>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <router-link
              v-for="c in overpaidContractsDetail"
              :key="c.id"
              :to="`/contracts/${c.id}`"
              class="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[12px] font-semibold text-amber-800 shadow-sm ring-1 ring-amber-200 hover:bg-white dark:bg-amber-800/50 dark:text-amber-50 dark:ring-amber-400"
            >
              <span>#{{ c.id }} ({{ c.storeNumber || '-' }})</span>
              <span class="text-amber-600 dark:text-amber-100">+{{ formatAmount(c.overAmount) }}</span>
            </router-link>
          </div>
        </div>
      </div>

      <div class="mb-4 grid gap-3 md:grid-cols-4">
        <CardBox>
          <div class="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900">
            <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Jami tushum</div>
            <div class="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">{{ formatAmount(ledgerTotals.all) }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-300">Usullar bo'yicha ajratilgan</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900">
            <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Payme</div>
            <div class="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{{ formatAmount(ledgerTotals.PAYME) }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900">
            <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Click</div>
            <div class="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{{ formatAmount(ledgerTotals.CLICK) }}</div>
          </div>
        </CardBox>
        <CardBox>
          <div class="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900">
            <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">Naqd / qo'lda</div>
            <div class="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{{ formatAmount(ledgerTotals.CASH) }}</div>
          </div>
        </CardBox>
      </div>

      <CardBox class="mb-6">
        <div class="flex items-center justify-between border-b border-slate-100 px-6 pb-3 pt-4 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:text-slate-100">
          <span>Kunlik daftar (Tashkent TZ)</span>
          <span class="text-xs text-slate-500 dark:text-slate-300">{{ ledger?.rows?.length || 0 }} qator</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full table-auto text-sm">
            <thead>
              <tr class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <th class="px-4 py-2">Sana</th>
                <th class="px-4 py-2">Turi</th>
                <th class="px-4 py-2">ID</th>
                <th class="px-4 py-2">Bo'lim</th>
                <th class="px-4 py-2">Raqam</th>
                <th class="px-4 py-2">Usul</th>
                <th class="px-4 py-2">Holat</th>
                <th class="px-4 py-2 text-right">Summa</th>
                <th class="px-4 py-2">Manba</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="8" class="px-4 py-3 text-center text-slate-500 dark:text-slate-300">Yuklanmoqda...</td>
              </tr>
              <tr v-else-if="!ledger.rows?.length">
                <td colspan="8" class="px-4 py-3 text-center text-slate-500 dark:text-slate-300">Ma'lumot yo'q</td>
              </tr>
              <tr
                v-for="row in ledger.rows?.slice(0, visibleLedger)"
                :key="`${row.source}-${row.id}`"
                class="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/70"
              >
                <td class="px-4 py-2 text-slate-700 dark:text-slate-100">
                  <div>{{ formatTashkentDate(row.paidAt || row.date) }}</div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">{{ formatTashkentDateTime(row.paidAt) }}</div>
                </td>
                <td class="px-4 py-2 capitalize text-slate-700 dark:text-slate-100">{{ row.type }}</td>
                <td class="px-4 py-2 text-slate-700 dark:text-slate-100">
                  <router-link
                    v-if="row.type === 'store' && row.contractId"
                    class="text-sky-600 underline dark:text-sky-300"
                    :to="`/contracts/${row.contractId}`"
                  >
                    #{{ row.contractId }}
                  </router-link>
                  <router-link
                    v-else-if="row.type === 'stall' && row.stallId"
                    class="text-sky-600 underline dark:text-sky-300"
                    :to="`/stalls/${row.stallId}`"
                  >
                    #{{ row.stallId }}
                  </router-link>
                  <span v-else>-</span>
                </td>
                <td class="px-4 py-2 text-slate-700 dark:text-slate-100">{{ row.sectionName || '-' }}</td>
                <td class="px-4 py-2 text-slate-700 dark:text-slate-100">
                  <span v-if="row.type === 'store'">{{ row.storeNumber || '-' }}</span>
                  <span v-else>{{ row.stallNumber || '-' }}</span>
                </td>
                <td class="px-4 py-2 text-slate-700 dark:text-slate-100">{{ row.method || '-' }}</td>
                <td class="px-4 py-2">
                  <span
                    class="rounded-full px-2 py-1 text-[11px] font-semibold"
                    :class="row.status === 'PAID'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200'
                      : row.status === 'PENDING'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200'"
                  >
                    {{ statusLabel(row.status) }}
                  </span>
                </td>
                <td class="px-4 py-2 text-right font-semibold text-slate-900 dark:text-slate-50">{{ formatAmount(row.amount) }}</td>
                <td class="px-4 py-2 text-slate-700 dark:text-slate-100">{{ row.source }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="(ledger.rows?.length || 0) > visibleLedger" class="p-4 text-center">
          <BaseButton color="info" outline label="Ko'proq ko'rish" @click="visibleLedger += 50" />
        </div>
      </CardBox>

      <CardBox class="mb-6">
        <div class="flex items-center justify-between border-b border-slate-100 px-6 pb-3 pt-4 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:text-slate-100">
          <span>Shartnoma yig'indisi (oylik ijara)</span>
          <span class="text-xs text-slate-500 dark:text-slate-300">{{ contracts.length }} ta shartnoma</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full table-auto text-sm">
            <thead>
              <tr class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <th class="px-4 py-2">Shartnoma</th>
                <th class="px-4 py-2">Do'kon</th>
                <th class="px-4 py-2">Bo'lim</th>
                <th class="px-4 py-2 text-right">Oylik ijara</th>
                <th class="px-4 py-2 text-right">To'langan</th>
                <th class="px-4 py-2 text-right">Qoplanmagan</th>
                <th class="px-4 py-2">Holat</th>
                <th class="px-4 py-2">Oxirgi to'lov</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="8" class="px-4 py-3 text-center text-slate-500 dark:text-slate-300">Yuklanmoqda...</td>
              </tr>
              <tr v-else-if="!contracts.length">
                <td colspan="8" class="px-4 py-3 text-center text-slate-500 dark:text-slate-300">Ma'lumot yo'q</td>
              </tr>
              <tr
                v-for="c in contracts.slice(0, visibleContracts)"
                :key="c.contractId"
                class="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/70"
              >
                <td class="px-4 py-2 text-slate-700 dark:text-slate-100">
                  <router-link :to="`/contracts/${c.contractId}`" class="text-sky-600 underline dark:text-sky-300">
                    #{{ c.contractId }}
                  </router-link>
                </td>
                <td class="px-4 py-2 text-slate-700 dark:text-slate-100">{{ c.storeNumber }}</td>
                <td class="px-4 py-2 text-slate-700 dark:text-slate-100">{{ c.sectionName || '-' }}</td>
                <td class="px-4 py-2 text-right text-slate-700 dark:text-slate-100">{{ formatAmount(c.expected) }}</td>
                <td class="px-4 py-2 text-right text-slate-700 dark:text-slate-100">{{ formatAmount(c.paid) }}</td>
                <td class="px-4 py-2 text-right text-slate-700 dark:text-slate-100">{{ formatAmount(c.unpaid) }}</td>
                <td class="px-4 py-2">
                  <span
                    class="rounded-full px-2 py-1 text-[11px] font-semibold"
                    :class="c.overpaid
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200'
                      : c.unpaid > 0
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200'"
                  >
                    {{ c.overpaid ? 'Ortiqcha' : c.unpaid > 0 ? 'Qoplanmagan' : "To'langan" }}
                  </span>
                </td>
                <td class="px-4 py-2 text-slate-700 dark:text-slate-100">
                  <div>{{ formatTashkentDate(c.lastPaymentAt) }}</div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">{{ c.lastPaymentMethod || '-' }}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="contracts.length > visibleContracts" class="p-4 text-center">
          <BaseButton color="info" outline label="Ko'proq ko'rish" @click="visibleContracts += 50" />
        </div>
      </CardBox>

      <CardBox>
        <div class="p-6">
          <div class="mb-3 flex items-center justify-between">
            <div>
              <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Oylik trend (so'nggi 12 oy)</div>
              <div class="text-xs text-slate-500 dark:text-slate-300">Rasta va do'kon tushumlari</div>
            </div>
          </div>
          <div style="height: 320px">
            <LineChart :data="chartData" :options="chartOptions" />
          </div>
        </div>
      </CardBox>

    </SectionMain>
  </LayoutAuthenticated>
</template>
