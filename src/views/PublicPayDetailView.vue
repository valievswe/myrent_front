<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LayoutGuest from '@/layouts/LayoutGuest.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import {
  getPublicContract,
  getPublicStall,
  initiatePublicContractPayment,
} from '@/services/publicPayment'
import {
  normalizeContracts,
  normalizeStallResults,
  isContractEntryPaid as isContractPaid,
  isStallEntryPaid as isStallPaid,
  resolvePeriodLabel,
} from '@/utils/publicPayments'
import { formatTashkentDate, formatTashkentDateTime } from '@/utils/time'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const errorMsg = ref('')
const actionError = ref('')
const paymentBusy = ref(false)
const entry = ref(null)

const mode = computed(() => (route.query.mode === 'stall' ? 'stall' : 'contract'))

const isPaid = computed(() => {
  if (!entry.value) return false
  return mode.value === 'stall' ? isStallPaid(entry.value) : isContractPaid(entry.value)
})

function periodLabel(value) {
  return value?.payment?.label || resolvePeriodLabel(value) || "Joriy oy"
}

const entityLabel = computed(() => {
  if (!entry.value) return ''
  if (mode.value === 'stall') {
    return entry.value.stall?.stallNumber || `Rasta #${entry.value.id}`
  }
  return entry.value.store?.storeNumber || `Shartnoma #${entry.value.id}`
})

const amountText = computed(() => {
  const amount = entry.value?.payment?.amountDue
  if (amount === null || amount === undefined) return '-'
  try {
    return new Intl.NumberFormat('uz-UZ', {
      style: 'currency',
      currency: entry.value?.payment?.currency || 'UZS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(amount))
  } catch {
    return `${Number(amount).toLocaleString('uz-UZ')} ${entry.value?.payment?.currency || ''}`
  }
})

const paidAtText = computed(() => {
  if (!entry.value) return ''
  return formatTashkentDateTime(entry.value.payment?.paidAt, { withSeconds: true })
})

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

async function loadDetails() {
  loading.value = true
  errorMsg.value = ''
  actionError.value = ''
  entry.value = null
  try {
    if (mode.value === 'stall') {
      const stallId = route.query.stall
      if (!stallId) throw new Error('Rasta identifikatori berilmagan')
      const date = route.query.date
      const data = await getPublicStall(stallId, { date })
      const normalized = normalizeStallResults(data, { fallbackDate: date })
      entry.value = normalized[0] || null
    } else {
      const contractId = route.query.contractId || route.query.id
      if (!contractId) throw new Error('Shartnoma identifikatori berilmagan')
      const data = await getPublicContract(contractId)
      const normalized = normalizeContracts(data)
      entry.value = normalized[0] || null
    }
    if (!entry.value) throw new Error("Ma'lumot topilmadi")
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || e.message || "Ma'lumotni olishda xatolik"
  } finally {
    loading.value = false
  }
}

async function openContractPayment() {
  if (!entry.value) return
  if (isContractPaid(entry.value)) return
  actionError.value = ''
  paymentBusy.value = true
  try {
    if (entry.value.paymentUrl) {
      openUrl(entry.value.paymentUrl)
      return
    }
    const res = await initiatePublicContractPayment(entry.value.id)
    const url = res?.paymentUrl || res?.url || res?.click_payment_url
    if (!url) throw new Error("To'lov havolasi topilmadi")
    entry.value.paymentUrl = url
    openUrl(url)
  } catch (e) {
    actionError.value = e?.response?.data?.message || e.message || "To'lov havolasini olishda xatolik"
  } finally {
    paymentBusy.value = false
  }
}

async function openStallPayment() {
  if (!entry.value) return
  if (isStallPaid(entry.value)) return
  if (!entry.value.attendance?.id) {
    actionError.value = "Tanlangan rasta uchun online to'lov yaratilmagan. Iltimos ma'muriyatga murojaat qiling."
    return
  }
  actionError.value = ''
  paymentBusy.value = true
  try {
    if (entry.value.paymentUrl) {
      openUrl(entry.value.paymentUrl)
      return
    }
    const stallId = route.query.stall
    const date = route.query.date
    const data = await getPublicStall(stallId, { date })
    const normalized = normalizeStallResults(data, { fallbackDate: date })
    const refreshed = normalized[0] || null
    if (refreshed) entry.value = refreshed
    const url = refreshed?.paymentUrl
    if (!url) throw new Error("To'lov havolasi topilmadi")
    openUrl(url)
  } catch (e) {
    actionError.value = e?.response?.data?.message || e.message || "To'lov havolasini olishda xatolik"
  } finally {
    paymentBusy.value = false
  }
}

function goBack() {
  router.push({ name: 'public-pay' })
}

onMounted(loadDetails)
watch(
  () => route.query,
  () => {
    loadDetails()
  },
)
</script>

<template>
  <LayoutGuest>
    <div class="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 px-3 py-6 sm:px-4 sm:py-10">
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-5 sm:gap-6">
        <div class="text-center">
          <h1 class="text-2xl font-semibold text-slate-800 dark:text-slate-100 sm:text-3xl">To'lov tafsilotlari</h1>
          <p class="mt-2 text-slate-600 dark:text-slate-300">
            Barcha vaqtlar Toshkent (GMT+5) bo'yicha ko'rsatiladi.
          </p>
        </div>

        <CardBox>
          <div v-if="loading" class="py-10 text-center text-sm text-slate-500">
            Ma'lumotlar yuklanmoqda...
          </div>
          <div v-else-if="errorMsg" class="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {{ errorMsg }}
          </div>
          <div v-else-if="!entry" class="py-10 text-center text-sm text-slate-500">
            Ma'lumot topilmadi.
          </div>
          <div v-else class="space-y-6">
            <div
              class="rounded border px-4 py-3"
              :class="
                isPaid
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20'
                  : 'border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-950/20'
              "
            >
              <p class="text-sm font-semibold uppercase tracking-wide">
                {{ isPaid ? "To'lov tasdiqlandi" : "To'lov kutilmoqda" }}
              </p>
              <p class="mt-1 text-2xl font-semibold text-slate-800 dark:text-slate-100">
                {{ amountText }}
              </p>
              <p class="text-sm text-slate-500 dark:text-slate-300">
                {{ periodLabel(entry) }}
              </p>
              <p v-if="isPaid && paidAtText" class="text-sm text-emerald-600 dark:text-emerald-300">
                Tasdiq vaqti: {{ paidAtText }} (Toshkent)
              </p>
              <p v-else-if="entry.payment?.dueDate" class="text-sm text-amber-600 dark:text-amber-300">
                To'lov muddati: {{ formatTashkentDate(entry.payment?.dueDate) }} (Toshkent)
              </p>
            </div>

            <div class="grid gap-3 sm:gap-4 md:grid-cols-2">
              <div class="rounded border border-slate-200 px-4 py-3 dark:border-slate-700">
                <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Obyekt</div>
                <div class="text-lg font-semibold text-slate-800 dark:text-slate-100">{{ entityLabel }}</div>
                <p v-if="mode === 'contract' && entry.owner" class="text-sm text-slate-500 dark:text-slate-300">
                  {{ entry.owner.fullName }}
                </p>
                <p v-if="mode === 'stall' && entry.stall?.description" class="text-sm text-slate-500 dark:text-slate-300">
                  {{ entry.stall.description }}
                </p>
              </div>
              <div class="rounded border border-slate-200 px-4 py-3 dark:border-slate-700">
                <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Ma'lumot</div>
                <ul class="text-sm text-slate-600 dark:text-slate-300">
                  <li v-if="entry.payment?.date">
                    Sana: {{ formatTashkentDate(entry.payment.date) }} (Toshkent)
                  </li>
                  <li v-if="entry.payment?.status">
                    Status: {{ entry.payment.status }}
                  </li>
                  <li v-if="entry.payment?.currency">
                    Valyuta: {{ entry.payment.currency }}
                  </li>
                </ul>
              </div>
            </div>

            <div v-if="actionError" class="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {{ actionError }}
            </div>

            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
                <BaseButton color="info" label="Bosh sahifaga qaytish" @click="goBack" class="w-full sm:w-auto" />
                <BaseButton
                  v-if="!isPaid"
                  color="success"
                  :label="paymentBusy ? 'Havola tayyorlanmoqda...' : 'To\'lovni boshlash'"
                  :disabled="paymentBusy"
                  @click="mode === 'stall' ? openStallPayment() : openContractPayment()"
                  class="w-full sm:w-auto"
                />
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 sm:text-right">
                Savollar uchun bozor ma'muriyatiga murojaat qiling.
              </p>
            </div>
          </div>
        </CardBox>
      </div>
    </div>
  </LayoutGuest>
</template>
