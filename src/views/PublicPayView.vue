<script setup>
import { ref, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LayoutGuest from '@/layouts/LayoutGuest.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import { searchPublicContracts, getPublicStall } from '@/services/publicPayment'
import {
  normalizeContracts,
  normalizeStallResults,
} from '@/utils/publicPayments'
import { formatTashkentDate, getTashkentTodayISO } from '@/utils/time'

const route = useRoute()
const router = useRouter()

const today = getTashkentTodayISO()

const mode = ref('store')

const storeForm = reactive({
  storeNumber: '',
  tin: '',
})

const storeResults = ref([])
const storeLoading = ref(false)
const storeError = ref('')
const resultsRef = ref(null)

const stallForm = reactive({
  stall: '',
  date: today,
})
const stallResults = ref([])
const stallLoading = ref(false)
const stallError = ref('')
function blurActiveElement() {
  const target = typeof document !== 'undefined' ? document.activeElement : null
  if (target && typeof target.blur === 'function') target.blur()
}

function scrollResultsIntoView() {
  nextTick(() => {
    const el = resultsRef.value
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })
}

function openContractDetails(entry) {
  const contractId = entry?.id
  if (!contractId) return
  router.push({
    name: 'public-pay-detail',
    query: { contractId, mode: 'contract' },
  })
}

function openStallDetails(entry) {
  const stallId = entry?.stall?.stallNumber || entry?.id
  if (!stallId) return
  router.push({
    name: 'public-pay-detail',
    query: { mode: 'stall', stall: stallId, date: entry?.payment?.date || stallForm.date || undefined },
  })
}

async function submitStoreSearch(updateUrl = true, options = {}) {
  const { suppressEmptyError = false } = options
  const storeNumber = storeForm.storeNumber?.trim()
  const tin = storeForm.tin?.trim()
  if (!storeNumber && !tin) {
    storeError.value = suppressEmptyError ? '' : "Do'kon raqami yoki STIR kiriting"
    storeResults.value = []
    return
  }

  storeLoading.value = true
  storeError.value = ''
  try {
    const data = await searchPublicContracts({ storeNumber, tin, fields: 'min' })
    const normalized = normalizeContracts(data)
    storeResults.value = normalized
    if (!normalized.length) {
      storeError.value = 'Mos shartnoma topilmadi'
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
    blurActiveElement()
    if (storeResults.value.length) scrollResultsIntoView()
  }
}

async function fetchStall(updateUrl = true) {
  const stall = stallForm.stall?.trim()
  if (!stall) {
    stallError.value = 'Rasta raqamini kiriting'
    stallResults.value = []
    return
  }

  stallLoading.value = true
  stallError.value = ''
  try {
    const data = await getPublicStall(stall, { date: stallForm.date || undefined, fields: 'min' })
    const normalized = normalizeStallResults(data, { fallbackDate: stallForm.date })
    stallResults.value = normalized
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
  } finally {
    stallLoading.value = false
    blurActiveElement()
    if (stallResults.value.length) scrollResultsIntoView()
  }
}

function switchMode(nextMode) {
  mode.value = nextMode
  storeError.value = ''
  stallError.value = ''
  if (nextMode === 'store') {
    stallResults.value = []
    router.replace({
      query: {
        mode: 'store',
        storeNumber: storeForm.storeNumber || undefined,
        tin: storeForm.tin || undefined,
      },
    })
  } else {
    storeResults.value = []
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
      return
    }
    storeAutoSearchTimer = setTimeout(() => {
      submitStoreSearch(false, { suppressEmptyError: true })
    }, 400)
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
    <div class="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 px-3 py-6 sm:px-4 sm:py-10">
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-5 sm:gap-6">
        <div class="text-center">
          <h1 class="text-2xl font-semibold text-slate-800 dark:text-slate-100 sm:text-3xl">Ijara To'lovi</h1>
          <p class="mt-2 text-base text-slate-900 dark:text-slate-200 sm:text-2xl">
            Do'kon yoki rasta bo'yicha to'lov summasini tekshiring va to'lovni amalga oshiring.
          </p>
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
                  class="w-full sm:w-auto"
                />
              </div>
            </form>

            <div v-if="storeError" class="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {{ storeError }}
            </div>

            <div v-if="storeLoading" class="text-center text-sm text-slate-500">Ma'lumotlar yuklanmoqda...</div>

            <div
              v-if="!storeLoading && storeResults.length"
              ref="resultsRef"
              class="space-y-2 sm:space-y-3"
            >
              <CardBox
                v-for="entry in storeResults"
                :key="entry.id"
                class="cursor-pointer border transition-shadow hover:border-info-200 hover:shadow"
                @click="openContractDetails(entry)"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-base font-semibold text-slate-800 dark:text-slate-100">
                      {{ entry.store?.storeNumber || `Shartnoma #${entry.id}` }}
                    </p>
                    <p class="truncate text-sm text-slate-500 dark:text-slate-300">
                      {{ entry.owner?.fullName || "Ega ma'lumoti" }}
                    </p>
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
                  class="w-full sm:w-auto"
                />
              </div>
            </form>

            <div v-if="stallError" class="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {{ stallError }}
            </div>

            <div v-if="stallLoading" class="text-center text-sm text-slate-500">Ma'lumotlar yuklanmoqda...</div>

            <div
              v-if="!stallLoading && stallResults.length"
              ref="resultsRef"
              class="space-y-2 sm:space-y-3"
            >
              <CardBox
                v-for="(entry, idx) in stallResults"
                :key="entry.id"
                class="cursor-pointer border transition-shadow hover:border-info-200 hover:shadow"
                @click="openStallDetails(entry)"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-base font-semibold text-slate-800 dark:text-slate-100">
                      Rasta: {{ entry.stall?.stallNumber || entry.id }}
                    </p>
                    <p v-if="entry.payment?.date" class="truncate text-sm text-slate-500 dark:text-slate-300">
                      Sana: {{ formatTashkentDate(entry.payment.date) || entry.payment.date }}
                    </p>
                  </div>
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
