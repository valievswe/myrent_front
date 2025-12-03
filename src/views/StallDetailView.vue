<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import { getStall, getStallHistory } from '@/services/stalls'
import { formatTashkentDate } from '@/utils/time'

const route = useRoute()
const router = useRouter()
const stallId = computed(() => Number(route.params.id))

const stall = ref(null)
const loading = ref(true)
const errorMsg = ref('')

const historyState = ref({
  loading: false,
  items: [],
  summary: null,
  days: 30,
})

const daysOptions = [15, 30, 60, 90]

function sectionName() {
  return stall.value?.Section?.name || '-'
}

function saleTypeName() {
  if (!stall.value?.SaleType) return '-'
  return `${stall.value.SaleType.name} (${stall.value.SaleType.tax || 0})`
}

async function loadStall() {
  if (!stallId.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await getStall(stallId.value)
    stall.value = data
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Rastani yuklab bo\'lmadi'
  } finally {
    loading.value = false
  }
}

async function loadHistory() {
  if (!stallId.value) return
  historyState.value.loading = true
  try {
    const data = await getStallHistory(stallId.value, { days: historyState.value.days })
    historyState.value.items = data.items || []
    historyState.value.summary = data.summary || null
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Tarixni yuklab bo\'lmadi'
  } finally {
    historyState.value.loading = false
  }
}

function handleDaysChange(value) {
  historyState.value.days = Number(value) || 30
  loadHistory()
}

function formatDate(value) {
  return formatTashkentDate(value) || '-'
}

function statusLabel(status, transactionStatus) {
  if (status === 'PAID' || transactionStatus === 'PAID') return "To'langan"
  if (status === 'PENDING' || transactionStatus === 'PENDING') return 'Jarayonda'
  if (status === 'FAILED' || transactionStatus === 'FAILED') return 'Bekor'
  return "To'lanmagan"
}

function navigateBack() {
  router.push({ name: 'stalls' })
}

onMounted(async () => {
  await loadStall()
  await loadHistory()
})
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain wide>
      <SectionTitle first>Rasta tafsilotlari</SectionTitle>

      <div class="mb-4 flex flex-wrap gap-2">
        <BaseButton color="info" outline label="Orqaga" @click="navigateBack" />
        <BaseButton color="info" :disabled="historyState.loading" label="Tarixni yangilash" @click="loadHistory" />
      </div>

      <div v-if="errorMsg" class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>

      <CardBox v-if="stall" class="mb-4">
        <h2 class="mb-2 text-lg font-semibold">Asosiy ma'lumotlar</h2>
        <div class="grid gap-4 md:grid-cols-3">
          <div>
            <p class="text-sm text-gray-500">Rasta raqami</p>
            <p class="font-medium">{{ stall.stallNumber || '-' }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">Bo'lim</p>
            <p class="font-medium">{{ sectionName() }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">Sotuv turi</p>
            <p class="font-medium">{{ saleTypeName() }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">Maydon</p>
            <p class="font-medium">{{ stall.area || 0 }} m²</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">Kunlik to'lov</p>
            <p class="font-medium">{{ stall.dailyFee || 0 }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">Izoh</p>
            <p class="font-medium">{{ stall.description || '-' }}</p>
          </div>
        </div>
      </CardBox>

      <CardBox class="mb-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-lg font-semibold">Kunlik to'lovlar</h2>
          <FormField label="Kunlar">
            <select
              class="rounded border border-gray-300 bg-white px-3 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
              :value="historyState.days"
              @change="handleDaysChange($event.target.value)"
            >
              <option v-for="days in daysOptions" :key="days" :value="days">
                {{ days }} kun
              </option>
            </select>
          </FormField>
        </div>
        <div v-if="historyState.summary" class="mt-4 grid gap-4 md:grid-cols-4">
          <div>
            <p class="text-sm text-gray-500">To'langan kunlar</p>
            <p class="text-lg font-semibold text-emerald-600">{{ historyState.summary.paidDays }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">To'lanmagan kunlar</p>
            <p class="text-lg font-semibold text-red-600">{{ historyState.summary.unpaidDays }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">To'langan summa</p>
            <p class="text-lg font-semibold text-emerald-600">{{ historyState.summary.paidAmount }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">Qoldiq summa</p>
            <p class="text-lg font-semibold text-red-600">{{ historyState.summary.unpaidAmount }}</p>
          </div>
        </div>
      </CardBox>

      <CardBox has-table>
        <table class="w-full table-auto text-sm">
          <thead>
            <tr>
              <th class="px-4 py-2 text-left">Sana</th>
              <th class="px-4 py-2 text-left">Summasi</th>
              <th class="px-4 py-2 text-left">Holati</th>
              <th class="px-4 py-2 text-left">Tranzaksiya</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="historyState.loading">
              <td colspan="4" class="px-4 py-6 text-center text-gray-500">Yuklanmoqda...</td>
            </tr>
            <tr v-else-if="!historyState.items.length">
              <td colspan="4" class="px-4 py-6 text-center text-gray-500">Ma'lumot yo'q</td>
            </tr>
            <tr v-for="item in historyState.items" :key="item.id" class="border-t border-gray-100 dark:border-gray-800">
              <td class="px-4 py-2">{{ formatDate(item.date) }}</td>
              <td class="px-4 py-2">{{ item.amount }}</td>
              <td class="px-4 py-2">
                <span
                  class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold"
                  :class="item.status === 'PAID' || item.transaction?.status === 'PAID'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200'"
                >
                  <span v-if="item.status === 'PAID' || item.transaction?.status === 'PAID'">✔</span>
                  <span v-else>✕</span>
                  {{ statusLabel(item.status, item.transaction?.status) }}
                </span>
              </td>
              <td class="px-4 py-2">
                <div v-if="item.transaction">
                  <div class="font-semibold">{{ item.transaction.transactionId }}</div>
                  <div class="text-xs text-gray-500">{{ formatDate(item.transaction.createdAt) }}</div>
                </div>
                <span v-else class="text-xs text-gray-500">Biriktirilmagan</span>
              </td>
            </tr>
          </tbody>
        </table>
      </CardBox>
    </SectionMain>
  </LayoutAuthenticated>
</template>
