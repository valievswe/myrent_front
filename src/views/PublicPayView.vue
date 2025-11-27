<script setup>
import { ref, reactive, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LayoutGuest from '@/layouts/LayoutGuest.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import { searchPublicContracts, getPublicStall, initiatePublicContractPayment } from '@/services/publicPayment'
import {
  normalizeContracts,
  normalizeStallResults,
  isContractEntryPaid as isContractPaid,
  isStallEntryPaid as isStallPaid,
  resolvePeriodLabel,
} from '@/utils/publicPayments'
import { formatTashkentDate, formatTashkentDateTime, getTashkentTodayISO } from '@/utils/time'

const route = useRoute()
const router = useRouter()

const today = getTashkentTodayISO()

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
const stallResults = ref([])
const selectedStallIndex = ref(-1)
const stallLoading = ref(false)
const stallError = ref('')
const stallPaymentBusy = ref(null)
const activeStallEntry = computed(() => stallResults.value[selectedStallIndex.value] || null)

function periodLabel(entry) {
  return entry?.payment?.label || resolvePeriodLabel(entry) || "Joriy oy"
}

function paidTimestamp(entry) {
  return entry?.payment?.paidAt || entry?.transaction?.createdAt || null
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
    stallResults.value = []
    selectedStallIndex.value = 0
    return
  }

  stallLoading.value = true
  stallError.value = ''
  try {
    const data = await getPublicStall(stall, { date: stallForm.date || undefined })
    const normalized = normalizeStallResults(data, { fallbackDate: stallForm.date })
    stallResults.value = normalized
    selectedStallIndex.value = normalized.length ? 0 : -1
    if (!normalized.length) {
      stallError.value = "Rasta bo'yicha ma'lumot topilmadi"
    }
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
    stallResults.value = []
    selectedStallIndex.value = 0
  } finally {
    stallLoading.value = false
  }
}

async function openContractPayment(entry) {
  const contractId = entry?.id
  if (!contractId) return
  if (isContractPaid(entry)) {
    storeError.value = "Bu shartnoma bo'yicha to'lov allaqachon tasdiqlangan."
    return
  }

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

async function openStallPayment(entry = activeStallEntry.value) {
  if (!entry) return
  if (isStallPaid(entry)) {
    stallError.value = "Bu rasta bugun uchun allaqachon to'langan"
    return
  }
  if (!entry.attendance?.id) {
    stallError.value = "Tanlangan rasta uchun online to'lov yaratilmagan. Iltimos ma'muriyatga murojaat qiling."
    return
  }

  if (entry.paymentUrl) {
    openUrl(entry.paymentUrl)
    return
  }

  stallPaymentBusy.value = entry.attendance.id
  stallError.value = ''
  try {
    const targetAttendanceId = entry.attendance.id
    await fetchStall(false)
    const refreshedIndex = stallResults.value.findIndex(
      (s) => s.attendance?.id === targetAttendanceId,
    )
    if (refreshedIndex >= 0) {
      selectedStallIndex.value = refreshedIndex
    }
    const refreshedEntry =
      refreshedIndex >= 0 ? stallResults.value[refreshedIndex] : activeStallEntry.value
    const url = refreshedEntry?.paymentUrl
    if (!url) throw new Error("To'lov havolasi topilmadi")
    openUrl(url)
  } catch (e) {
    stallError.value = e?.response?.data?.message || e.message || "To'lov havolasini olishda xatolik"
  } finally {
    stallPaymentBusy.value = null
  }
}

function switchMode(nextMode) {
  mode.value = nextMode
  storeError.value = ''
  stallError.value = ''
  if (nextMode === 'store') {
    stallResults.value = []
    selectedStallIndex.value = -1
    router.replace({
      query: {
        mode: 'store',
        storeNumber: storeForm.storeNumber || undefined,
        tin: storeForm.tin || undefined,
      },
    })
  } else {
    storeResults.value = []
    selectedContractId.value = null
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

watch(
  () => stallResults.value.length,
  (len) => {
    if (!len) {
      selectedStallIndex.value = -1
    } else if (selectedStallIndex.value < 0 || selectedStallIndex.value >= len) {
      selectedStallIndex.value = 0
    }
  },
)
</script>

<template>
  <LayoutGuest>
    <div class="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 py-10 px-4">
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div class="text-center">
          <h1 class="text-3xl font-semibold text-slate-800 dark:text-slate-100">Ijara To'lovi</h1>
          <p class="mt-2 text-2xl text-slate-900 dark:text-slate-200">Do'kon yoki rasta bo'yicha to'lov summasini tekshiring va to'lovni amalga oshiring.</p>
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
                    <span v-if="entry.expired" class="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200">Muddat tugagan</span>
                    <span
                      :class="[
                        'rounded-full px-3 py-1 text-xs font-semibold',
                        isContractPaid(entry)
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
                      ]"
                    >
                      {{ isContractPaid(entry) ? "Bu oy to'langan" : "To'lov talab etiladi" }}
                    </span>
                    <div class="text-2xl font-semibold text-info-600 dark:text-info-300">
                      {{ formatCurrency(entry.payment.amountDue, entry.payment.currency || 'UZS') }}
                    </div>
                    <p class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      {{ periodLabel(entry) }}
                    </p>
                    <p v-if="entry.payment.outstandingBalance" class="text-xs text-red-500">
                      Qarzdorlik: {{ formatCurrency(entry.payment.outstandingBalance, entry.payment.currency || 'UZS') }}
                    </p>
                    <p
                      v-if="entry.payment.dueDate && !isContractPaid(entry)"
                      class="text-xs text-amber-600 dark:text-amber-400"
                    >
                      To'lov muddati: {{ formatTashkentDate(entry.payment.dueDate) }} (Toshkent)
                    </p>
                    <p
                      v-if="isContractPaid(entry) && paidTimestamp(entry)"
                      class="text-xs text-emerald-600 dark:text-emerald-300"
                    >
                      Tasdiq: {{ formatTashkentDateTime(paidTimestamp(entry)) }} (Toshkent)
                    </p>
                    <BaseButton
                      v-if="!isContractPaid(entry)"
                      color="success"
                      :label="contractPaymentBusy === entry.id ? 'Havola tayyorlanmoqda...' : 'To\'lovni boshlash'"
                      :disabled="contractPaymentBusy === entry.id"
                      @click.stop.prevent="openContractPayment(entry)"
                    />
                    <p v-else class="text-xs text-emerald-600 dark:text-emerald-300">
                      To'lov qabul qilingan va tasdiqlangan.
                    </p>
                  </div>
                </div>
                <div
                  class="mt-4 rounded border px-4 py-3 text-sm"
                  :class="
                    isContractPaid(entry)
                      ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20'
                      : 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30'
                  "
                >
                  <p class="font-medium">
                    {{ periodLabel(entry) }}
                  </p>
                  <p v-if="isContractPaid(entry)">
                    Ushbu davr uchun to'lov qabul qilingan. Agar qo'shimcha kvitansiya kerak bo'lsa, ma'muriyatga murojaat qiling.
                  </p>
                  <p v-else>
                    Onlayn to'lovni amalga oshirish uchun yuqoridagi tugmadan foydalaning yoki bozor kassasiga murojaat qiling.
                  </p>
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

            <div v-if="!stallLoading && stallResults.length" class="space-y-4">
              <CardBox
                v-for="(entry, idx) in stallResults"
                :key="entry.id"
                :class="[
                  'border transition-shadow',
                  selectedStallIndex === idx ? 'border-info-500 shadow-lg' : 'border-transparent',
                ]"
                @click="selectedStallIndex = idx"
              >
                <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 class="text-xl font-semibold text-slate-700 dark:text-slate-100">
                      Rasta: {{ entry.stall?.stallNumber || entry.id }}
                    </h2>
                    <p v-if="entry.stall?.description" class="text-sm text-slate-500 dark:text-slate-400">
                      {{ entry.stall.description }}
                    </p>
                    <p class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      Holati: {{ entry.payment?.status || 'NO_ATTENDANCE' }}
                    </p>
                    <p v-if="entry.attendance?.date" class="text-xs text-slate-400">
                      Sana: {{ formatTashkentDate(entry.attendance.date) || entry.attendance.date }}
                    </p>
                  </div>

                  <div class="flex flex-col items-end gap-2 text-right">
                    <span v-if="entry.expired" class="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200">Muddat tugagan</span>
                    <span
                      :class="[
                        'rounded-full px-3 py-1 text-xs font-semibold',
                        isStallPaid(entry)
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
                      ]"
                    >
                      {{ isStallPaid(entry) ? "To'lov tasdiqlangan" : "To'lov talab etiladi" }}
                    </span>
                    <div class="text-lg font-semibold text-info-600 dark:text-info-400">
                      {{ formatCurrency(entry.payment?.amountDue, entry.payment?.currency || 'UZS') }}
                    </div>
                    <p v-if="entry.payment?.date" class="text-xs text-slate-500 dark:text-slate-400">
                      To'lov kuni: {{ formatTashkentDate(entry.payment.date) || entry.payment.date }}
                    </p>
                    <p
                      v-if="isStallPaid(entry) && paidTimestamp(entry)"
                      class="text-xs text-emerald-600 dark:text-emerald-300"
                    >
                      Tasdiq: {{ formatTashkentDateTime(paidTimestamp(entry)) }} (Toshkent)
                    </p>
                    <p
                      v-if="!entry.paymentUrl && !isStallPaid(entry)"
                      class="text-xs text-amber-600"
                    >
                      Online havola tayyor emas. Iltimos ma'muriyat bilan bog'laning.
                    </p>
                    <BaseButton
                      v-if="!isStallPaid(entry)"
                      color="success"
                      :label="
                        stallPaymentBusy === entry.attendance?.id
                          ? 'Havola tayyorlanmoqda...'
                          : entry.paymentUrl
                            ? 'To\'lovni boshlash'
                            : 'Havola talab qilish'
                      "
                      :disabled="stallPaymentBusy !== null"
                      @click.stop.prevent="openStallPayment(entry)"
                    />
                    <p v-else class="text-xs text-emerald-600 dark:text-emerald-300">
                      To'lov qabul qilingan.
                    </p>
                  </div>
                </div>
                <div
                  class="mt-4 rounded border px-4 py-3 text-sm"
                  :class="
                    isStallPaid(entry)
                      ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20'
                      : 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30'
                  "
                >
                  <p class="font-medium">Kunlik to'lov ma'lumotlari</p>
                  <p v-if="isStallPaid(entry)">
                    Ushbu sana uchun to'lov amalga oshirildi va tasdiqlandi. Qayta to'lov talab qilinmaydi.
                  </p>
                  <p v-else>
                    Bugungi yig'imni onlayn to'lash uchun yuqoridagi tugmadan foydalaning yoki ma'muriyatga murojaat qiling.
                  </p>
                </div>
              </CardBox>
            </div>
          </div>
        </CardBox>

        <div class="mx-auto max-w-3xl text-slate-900 dark:text-slate-200">
          <p>
            Savollar tug'ilsa, iltimos bozor ma'muriyatiga murojaat qiling
          </p>
        </div>
      </div>
    </div>
  </LayoutGuest>
</template>
