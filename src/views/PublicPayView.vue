<script setup>
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LayoutGuest from '@/layouts/LayoutGuest.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import { searchPublicContracts, getPublicStall, initiatePublicContractPayment } from '@/services/publicPayment'

const route = useRoute()
const router = useRouter()

const today = new Date().toISOString().substring(0, 10)

const mode = ref('store')

const storeForm = reactive({
  storeNumber: '',
  tin: '',
})

const storeResults = ref([])
const selectedContractId = ref(null)
const storeLoading = ref(false)
const storeError = ref('')
const contractPaymentBusy = ref(null)

const stallForm = reactive({
  stall: '',
  date: today,
})
const stallResult = ref(null)
const stallLoading = ref(false)
const stallError = ref('')
const stallPaymentBusy = ref(false)

function normalizeContracts(payload) {
  if (!payload) return []
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.contracts)
      ? payload.contracts
      : Array.isArray(payload?.data)
        ? payload.data
        : payload.contract || payload.payment || payload.store || payload.owner
          ? [payload]
          : []

  return source
    .map((item) => {
      const contract = item.contract || item
      const owner = item.owner || contract.owner || null
      const store = item.store || contract.store || null
      const payment = item.payment || contract.payment || {}

      const amount =
        payment.amountDue ??
        payment.amount ??
        item.amountDue ??
        item.amount ??
        contract.amountDue ??
        contract.shopMonthlyFee ??
        (typeof contract.shopMonthlyFee === 'object' && contract.shopMonthlyFee !== null
          ? contract.shopMonthlyFee.value ?? contract.shopMonthlyFee.toString?.()
          : undefined)

      const paymentUrl =
        item.paymentUrl ||
        payment.url ||
        payment.paymentUrl ||
        contract.paymentUrl ||
        store?.click_payment_url ||
        contract.store?.click_payment_url ||
        null

      return {
        id: contract.id,
        contract,
        owner,
        store,
        payment: {
          amountDue: amount !== undefined && amount !== null ? Number(amount) : null,
          currency:
            payment.currency ||
            item.currency ||
            (amount ? 'UZS' : null),
          dueDate: payment.dueDate || item.dueDate || contract.dueDate || null,
          label: payment.label || item.periodLabel || payment.periodLabel || null,
          outstandingBalance:
            payment.outstandingBalance ?? item.outstandingBalance ?? null,
        },
        paymentUrl,
      }
    })
    .filter((entry) => entry.id)
}

function normalizeStall(payload) {
  if (!payload) return null
  const stall = payload.stall || payload
  const payment = payload.payment || {}
  const attendance = payload.attendance || null

  const amount =
    payment.amountDue ??
    payment.amount ??
    payload.amountDue ??
    payload.amount ??
    stall.amount ??
    stall.dailyFee ??
    (typeof stall.dailyFee === 'object' && stall.dailyFee !== null
      ? stall.dailyFee.value ?? stall.dailyFee.toString?.()
      : undefined)

  const paymentUrl =
    payload.paymentUrl ||
    payment.url ||
    payment.paymentUrl ||
    stall.click_payment_url ||
    payload.click_payment_url ||
    null

  return {
    stall,
    payment: {
      amountDue: amount !== undefined && amount !== null ? Number(amount) : null,
      currency:
        payment.currency ||
        payload.currency ||
        (amount ? 'UZS' : null),
      date: payment.date || payload.date || stall.date || stallForm.date,
    },
    attendance,
    paymentUrl,
  }
}

function formatCurrency(amount, currency = 'UZS') {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return '-'
  }
  try {
    return new Intl.NumberFormat('uz-UZ', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(amount))
  } catch {
    return `${Number(amount).toLocaleString('uz-UZ')} ${currency}`
  }
}

function openUrl(url) {
  if (!url) return
  try {
    const target = typeof window !== 'undefined' ? window : null
    if (target && typeof target.open === 'function') {
      target.open(url, '_blank', 'noopener')
    }
  } catch (e) {
    console.error('Failed to open url', e)
  }
}

async function submitStoreSearch(updateUrl = true, options = {}) {
  const { suppressEmptyError = false } = options
  const storeNumber = storeForm.storeNumber?.trim()
  const tin = storeForm.tin?.trim()
  if (!storeNumber && !tin) {
    storeError.value = suppressEmptyError ? '' : "Do'kon raqami yoki STIR kiriting"
    storeResults.value = []
    selectedContractId.value = null
    return
  }

  storeLoading.value = true
  storeError.value = ''
  selectedContractId.value = null
  try {
    const data = await searchPublicContracts({ storeNumber, tin })
    const normalized = normalizeContracts(data)
    storeResults.value = normalized
    if (!normalized.length) {
      storeError.value = 'Mos shartnoma topilmadi'
    } else {
      selectedContractId.value = normalized[0].id
    }
    if (updateUrl) {
      router.replace({
        query: {
          mode: 'store',
          storeNumber: storeNumber || undefined,
          tin: tin || undefined,
        },
      })
    }
  } catch (e) {
    storeError.value = e?.response?.data?.message || e.message || 'Qidiruvda xatolik'
    storeResults.value = []
  } finally {
    storeLoading.value = false
  }
}

async function fetchStall(updateUrl = true) {
  const stall = stallForm.stall?.trim()
  if (!stall) {
    stallError.value = 'Rasta raqamini kiriting'
    stallResult.value = null
    return
  }

  stallLoading.value = true
  stallError.value = ''
  try {
    const data = await getPublicStall(stall, { date: stallForm.date || undefined })
    const normalized = normalizeStall(data)
    stallResult.value = normalized
    if (!normalized) stallError.value = "Rasta bo'yicha ma'lumot topilmadi"
    if (updateUrl) {
      router.replace({
        query: {
          mode: 'stall',
          stall,
          date: stallForm.date || undefined,
        },
      })
    }
  } catch (e) {
    stallError.value = e?.response?.data?.message || e.message || "Rastani olishda xatolik"
    stallResult.value = null
  } finally {
    stallLoading.value = false
  }
}

async function openContractPayment(entry) {
  const contractId = entry?.id
  if (!contractId) return

  if (entry.paymentUrl) {
    openUrl(entry.paymentUrl)
    return
  }

  contractPaymentBusy.value = contractId
  storeError.value = ''
  try {
    const res = await initiatePublicContractPayment(contractId)
    const url = res?.paymentUrl || res?.url || res?.click_payment_url
    if (!url) throw new Error('To\'lov havolasi topilmadi')
    entry.paymentUrl = url
    openUrl(url)
  } catch (e) {
    storeError.value = e?.response?.data?.message || e.message || "To'lov havolasini olishda xatolik"
  } finally {
    contractPaymentBusy.value = null
  }
}

async function openStallPayment() {
  const entry = stallResult.value
  if (!entry) return
  if (entry.paymentUrl) {
    openUrl(entry.paymentUrl)
    return
  }

  stallPaymentBusy.value = true
  stallError.value = ''
  try {
    const res = await getPublicStall(stallForm.stall?.trim(), {
      date: stallForm.date || undefined,
    })
    const normalized = normalizeStall(res)
    stallResult.value = normalized
    const url = normalized?.paymentUrl
    if (!url) throw new Error('To\'lov havolasi topilmadi')
    openUrl(url)
  } catch (e) {
    stallError.value = e?.response?.data?.message || e.message || "To'lov havolasini olishda xatolik"
  } finally {
    stallPaymentBusy.value = false
  }
}

function switchMode(nextMode) {
  mode.value = nextMode
  storeError.value = ''
  stallError.value = ''
  if (nextMode === 'store') {
    router.replace({
      query: {
        mode: 'store',
        storeNumber: storeForm.storeNumber || undefined,
        tin: storeForm.tin || undefined,
      },
    })
  } else {
    router.replace({
      query: {
        mode: 'stall',
        stall: stallForm.stall || undefined,
        date: stallForm.date || undefined,
      },
    })
  }
}

function applyQuery(auto = false) {
  const { mode: queryMode, storeNumber, tin, stall, date } = route.query
  if (queryMode === 'store' || queryMode === 'stall') mode.value = queryMode
  if (typeof storeNumber === 'string') storeForm.storeNumber = storeNumber
  if (typeof tin === 'string') storeForm.tin = tin
  if (typeof stall === 'string') stallForm.stall = stall
  if (typeof date === 'string') stallForm.date = date

  if (auto) {
    if (mode.value === 'stall' && stallForm.stall) {
      fetchStall(false)
    } else if (mode.value === 'store' && (storeForm.storeNumber || storeForm.tin)) {
      submitStoreSearch(false)
    }
  }
}

onMounted(() => applyQuery(true))
watch(
  () => route.query,
  () => applyQuery(false),
)

let storeAutoSearchTimer = null
watch(
  () => [storeForm.storeNumber, storeForm.tin, mode.value],
  ([storeNumber, tin, currentMode]) => {
    if (currentMode !== 'store') return
    if (storeAutoSearchTimer) {
      clearTimeout(storeAutoSearchTimer)
      storeAutoSearchTimer = null
    }
    const hasInput = !!storeNumber?.trim() || !!tin?.trim()
    if (!hasInput) {
      storeError.value = ''
      storeResults.value = []
      selectedContractId.value = null
      return
    }
    storeAutoSearchTimer = setTimeout(() => {
      submitStoreSearch(false, { suppressEmptyError: true })
    }, 350)
  },
  { immediate: false }
)

onUnmounted(() => {
  if (storeAutoSearchTimer) {
    clearTimeout(storeAutoSearchTimer)
    storeAutoSearchTimer = null
  }
})
</script>

<template>
  <LayoutGuest>
    <div class="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 py-10 px-4">
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div class="text-center">
          <h1 class="text-3xl font-semibold text-slate-800 dark:text-slate-100">Ijara To'lovi</h1>
          <p class="mt-2 text-2xl text-slate-900 dark:text-slate-200">Do'kon yoki rasta bo'yicha to'lov summasini tekshiring va Click orqali to'lovni amalga oshiring.</p>
        </div>

        <CardBox>
          <div class="flex flex-wrap items-center justify-center gap-3 pb-6">
            <BaseButton
              :color="mode === 'store' ? 'info' : 'contrast'"
              :outline="mode !== 'store'"
              label="Do'kon bo'yicha"
              @click="switchMode('store')"
            />
            <BaseButton
              :color="mode === 'stall' ? 'info' : 'contrast'"
              :outline="mode !== 'stall'"
              label="Rasta bo'yicha"
              @click="switchMode('stall')"
            />
          </div>

          <div v-if="mode === 'store'" class="space-y-6">
            <form class="grid gap-4 md:grid-cols-2" @submit.prevent="submitStoreSearch()">
              <FormField label="Do'kon raqami">
                <FormControl
                  v-model="storeForm.storeNumber"
                  placeholder="Masalan: A-27"
                />
              </FormField>

              <FormField label="STIR (ixtiyoriy)">
                <FormControl
                  v-model="storeForm.tin"
                  placeholder="Masalan: 305123456"
                />
              </FormField>

              <div class="md:col-span-2 flex justify-end">
                <BaseButton
                  type="submit"
                  color="info"
                  :label="storeLoading ? 'Qidirilmoqda...' : 'Shartnomani topish'"
                  :disabled="storeLoading"
                />
              </div>
            </form>

            <div v-if="storeError" class="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {{ storeError }}
            </div>

            <div v-if="storeLoading" class="text-center text-sm text-slate-500">Ma'lumotlar yuklanmoqda...</div>

            <div v-if="!storeLoading && storeResults.length" class="space-y-4">
              <CardBox
                v-for="entry in storeResults"
                :key="entry.id"
                :class="[
                  'border transition-shadow',
                  selectedContractId === entry.id ? 'border-info-500 shadow-lg' : 'border-transparent',
                ]"
                @click="selectedContractId = entry.id"
              >
                <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 class="text-xl font-semibold text-slate-700 dark:text-slate-100">
                      {{ entry.store?.storeNumber || `Shartnoma #${entry.id}` }}
                    </h2>
                    <p class="text-sm text-slate-500 dark:text-slate-300">
                      {{ entry.owner?.fullName || "Ega ma'lumoti" }} <span v-if="entry.owner?.tin">({{ entry.owner?.tin }})</span>
                    </p>
                    <p v-if="entry.store?.description" class="text-sm text-slate-500 dark:text-slate-400">
                      {{ entry.store.description }}
                    </p>
                  </div>

                  <div class="flex flex-col items-end gap-2 text-right">
                    <div class="text-lg font-semibold text-info-600 dark:text-info-400">
                      {{ formatCurrency(entry.payment.amountDue, entry.payment.currency || 'UZS') }}
                    </div>
                    <p v-if="entry.payment.label" class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      {{ entry.payment.label }}
                    </p>
                    <p v-if="entry.payment.dueDate" class="text-xs text-slate-500 dark:text-slate-400">
                      To'lov muddati: {{ entry.payment.dueDate }}
                    </p>
                    <p v-if="entry.payment.outstandingBalance" class="text-xs text-red-500">
                      Qarzdorlik: {{ formatCurrency(entry.payment.outstandingBalance, entry.payment.currency || 'UZS') }}
                    </p>
                    <BaseButton
                      color="success"
                      :label="contractPaymentBusy === entry.id ? 'Havola tayyorlanmoqda...' : 'To\'lovni boshlash'"
                      :disabled="contractPaymentBusy === entry.id"
                      @click.stop.prevent="openContractPayment(entry)"
                    />
                  </div>
                </div>
              </CardBox>
            </div>
          </div>

          <div v-else class="space-y-6">
            <form class="grid gap-4 md:grid-cols-2" @submit.prevent="fetchStall()">
              <FormField label="Rasta raqami">
                <FormControl
                  v-model="stallForm.stall"
                  placeholder="Masalan: ST-105"
                  required
                />
              </FormField>

              <FormField label="Sana (ixtiyoriy)">
                <FormControl
                  v-model="stallForm.date"
                  type="date"
                  :max="today"
                />
              </FormField>

              <div class="md:col-span-2 flex justify-end">
                <BaseButton
                  type="submit"
                  color="info"
                  :label="stallLoading ? 'Hisoblanmoqda...' : 'To\'lovni ko\'rish'"
                  :disabled="stallLoading"
                />
              </div>
            </form>

            <div v-if="stallError" class="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {{ stallError }}
            </div>

            <div v-if="stallLoading" class="text-center text-sm text-slate-500">Ma'lumotlar yuklanmoqda...</div>

            <CardBox v-if="!stallLoading && stallResult" class="border border-info-100 shadow-md">
              <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 class="text-xl font-semibold text-slate-700 dark:text-slate-100">
                    Rasta: {{ stallResult.stall?.stallNumber || stallResult.stall?.id }}
                  </h2>
                  <p v-if="stallResult.stall?.description" class="text-sm text-slate-500 dark:text-slate-400">
                    {{ stallResult.stall.description }}
                  </p>
                  <p v-if="stallResult.attendance?.status" class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">
                    Holati: {{ stallResult.attendance.status }}
                  </p>
                </div>

                <div class="flex flex-col items-end gap-2 text-right">
                  <div class="text-lg font-semibold text-info-600 dark:text-info-400">
                    {{ formatCurrency(stallResult.payment.amountDue, stallResult.payment.currency || 'UZS') }}
                  </div>
                  <p v-if="stallResult.payment.date" class="text-xs text-slate-500 dark:text-slate-400">
                    Sana: {{ stallResult.payment.date }}
                  </p>
                  <BaseButton
                    color="success"
                    :label="stallPaymentBusy ? 'Havola tayyorlanmoqda...' : 'To\'lovni boshlash'"
                    :disabled="stallPaymentBusy"
                    @click.stop.prevent="openStallPayment"
                  />
                </div>
              </div>
            </CardBox>
          </div>
        </CardBox>

        <div class="mx-auto max-w-3xl text-slate-900 dark:text-slate-200">
          <p>
            Savollar tug'ilsa, iltimos bozordagi axborot markaziga murojaat qiling. To'lov Click orqali amalga oshiriladi va tranzaksiya to'g'risida SMS orqali ma'lumot yuboriladi.
          </p>
        </div>
      </div>
    </div>
  </LayoutGuest>
</template>
