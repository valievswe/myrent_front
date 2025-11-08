<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LayoutGuest from '@/layouts/LayoutGuest.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import {
  getPublicContract,
  getPublicStall,
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

async function loadDetails() {
  loading.value = true
  errorMsg.value = ''
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
    <div class="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 py-10 px-4">
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div class="text-center">
          <h1 class="text-3xl font-semibold text-slate-800 dark:text-slate-100">To'lov tasdig'i</h1>
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
            Tasdiqlash uchun ma'lumot topilmadi.
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

            <div class="grid gap-4 md:grid-cols-2">
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

            <div class="flex flex-wrap items-center justify-between gap-3">
              <BaseButton color="info" label="Bosh sahifaga qaytish" @click="goBack" />
              <p class="text-xs text-slate-500 dark:text-slate-400">
                Savollar uchun bozor ma'muriyatiga murojaat qiling.
              </p>
            </div>
          </div>
        </CardBox>
      </div>
    </div>
  </LayoutGuest>
</template>
