<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import {
  getContract,
  refreshContract,
  listContractPayments,
} from '@/services/contracts'
import { formatTashkentDate } from '@/utils/time'

const route = useRoute()
const router = useRouter()
const contractId = computed(() => Number(route.params.id))

const contract = ref(null)
const loading = ref(true)
const errorMsg = ref('')

const paymentState = ref({
  loading: false,
  error: '',
  items: [],
  snapshot: null,
})
function ownerName() {
  const c = contract.value
  if (!c) return '-'
  return c.owner?.fullName || c.ownerId
}

function storeNumber() {
  const c = contract.value
  if (!c) return '-'
  return c.store?.storeNumber || c.storeId
}

function paymentStatusColor(status) {
  if (status === 'PAID') return 'text-emerald-600'
  if (status === 'PENDING') return 'text-amber-600'
  if (status === 'REVERSED') return 'text-red-500'
  return 'text-gray-500'
}

function paymentStatusLabel(status) {
  switch (status) {
    case 'PAID':
      return "To'langan"
    case 'PENDING':
      return 'Jarayonda'
    case 'REVERSED':
      return 'Bekor qilingan'
    default:
      return status
  }
}

function applyPaymentResponse(payload) {
  paymentState.value.items = payload?.items || []
  paymentState.value.snapshot = payload?.snapshot || null
}

async function loadContract() {
  if (!contractId.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await getContract(contractId.value)
    contract.value = data
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Shartnomani yuklab bo\'lmadi'
  } finally {
    loading.value = false
  }
}

async function loadPayments() {
  if (!contractId.value) return
  paymentState.value.loading = true
  paymentState.value.error = ''
  try {
    const res = await listContractPayments(contractId.value)
    applyPaymentResponse(res)
  } catch (e) {
    paymentState.value.error = e?.response?.data?.message || "To'lov davrlarini yuklab bo'lmadi"
  } finally {
    paymentState.value.loading = false
  }
}

async function refreshData() {
  if (!contractId.value) return
  try {
    loading.value = true
    const fresh = await refreshContract(contractId.value)
    contract.value = fresh
    await loadPayments()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Holatni yangilab bo\'lmadi'
  } finally {
    loading.value = false
  }
}

function formatDate(value) {
  return formatTashkentDate(value) || '-'
}

function navigateBack() {
  router.push({ name: 'contracts' })
}

onMounted(async () => {
  await loadContract()
  await loadPayments()
})
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain wide>
      <SectionTitle first>Shartnoma tafsilotlari</SectionTitle>

      <div class="mb-4 flex flex-wrap gap-2">
        <BaseButton color="info" outline label="Orqaga" @click="navigateBack" />
        <BaseButton color="info" :disabled="loading" label="Yangilash" @click="refreshData" />
      </div>

      <div v-if="errorMsg" class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>

      <CardBox v-if="contract" class="mb-4">
        <h2 class="mb-2 text-lg font-semibold">Asosiy ma'lumotlar</h2>
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <p class="text-sm text-gray-500">Ega</p>
            <p class="font-medium">{{ ownerName() }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">Do'kon</p>
            <p class="font-medium">{{ storeNumber() }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">Oylik to'lov</p>
            <p class="font-medium">{{ contract.shopMonthlyFee || '-' }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">Holati</p>
            <p class="font-medium">{{ contract.isActive ? 'Faol' : 'Arxivlangan' }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">Berilgan sana</p>
            <p class="font-medium">{{ formatDate(contract.issueDate) }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">Muddati</p>
            <p class="font-medium">{{ formatDate(contract.expiryDate) }}</p>
          </div>
        </div>
      </CardBox>

      <CardBox class="mb-4">
        <h2 class="mb-2 text-lg font-semibold">To'lov holati</h2>
        <div v-if="paymentState.snapshot" class="grid gap-4 md:grid-cols-3">
          <div>
            <p class="text-sm text-gray-500">Oxirgi to'lov</p>
            <p class="font-semibold text-emerald-600">{{ formatDate(paymentState.snapshot.paidThrough) }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">Navbatdagi oy</p>
            <p class="font-semibold">{{ formatDate(paymentState.snapshot.nextPeriodStart) }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">Oldindan qoplangan oylar</p>
            <p class="font-semibold">
              {{ paymentState.snapshot.monthsAhead || 0 }} oy
            </p>
          </div>
        </div>
        <div v-else class="text-sm text-gray-500">
          Hozircha davrlar haqida ma'lumot yo'q.
        </div>
        <div v-if="paymentState.error" class="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
          {{ paymentState.error }}
        </div>
      </CardBox>

      <CardBox class="mb-4" has-table>
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-semibold">To'lov davrlari</h2>
          <div class="text-sm text-gray-500">
            Faqat tasdiqlangan elektron to'lovlar bu jadvalni yangilaydi.
          </div>
        </div>
        <div v-if="paymentState.loading" class="p-4 text-center text-sm text-gray-500">
          Yuklanmoqda...
        </div>
        <table v-else class="w-full table-auto">
          <thead>
            <tr>
              <th class="px-4 py-2 text-left">Davr</th>
              <th class="px-4 py-2 text-left">Holati</th>
              <th class="px-4 py-2 text-left">Summa</th>
              <th class="px-4 py-2 text-left">Tranzaksiya</th>
              <th class="px-4 py-2 text-left">Izoh</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!paymentState.items.length">
              <td colspan="5" class="px-4 py-6 text-center text-sm text-gray-500">Hozircha davrlar yo'q</td>
            </tr>
            <tr v-for="payment in paymentState.items" :key="payment.id" class="border-t border-gray-100 dark:border-gray-800">
              <td class="px-4 py-2 text-sm">
                <div>{{ formatDate(payment.periodStart) }}</div>
                <div class="text-xs text-gray-500">{{ formatDate(payment.periodEnd) }}</div>
              </td>
              <td class="px-4 py-2">
                <span
                  :class="[
                    'rounded-full px-3 py-1 text-xs font-semibold',
                    payment.status === 'PAID'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                      : payment.status === 'PENDING'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200',
                  ]"
                >
                  {{ paymentStatusLabel(payment.status) }}
                </span>
              </td>
              <td class="px-4 py-2 text-sm">{{ payment.amount ?? contract?.shopMonthlyFee ?? '-' }}</td>
              <td class="px-4 py-2 text-sm">
                <div v-if="payment.transaction">
                  <div class="font-semibold">{{ payment.transaction.transactionId }}</div>
                  <div class="text-xs text-gray-500">{{ formatDate(payment.transaction.createdAt) }}</div>
                </div>
                <div v-else class="text-xs text-gray-500">Biriktirilmagan</div>
              </td>
              <td class="px-4 py-2 text-sm">{{ payment.notes || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </CardBox>

      <CardBox v-if="contract?.transactions?.length" has-table class="mb-4">
        <h2 class="mb-2 text-lg font-semibold">Tranzaksiyalar</h2>
        <div class="overflow-x-auto">
          <table class="w-full table-auto text-sm">
            <thead>
              <tr>
                <th class="px-4 py-2 text-left">ID</th>
                <th class="px-4 py-2 text-left">Summasi</th>
                <th class="px-4 py-2 text-left">Holati</th>
                <th class="px-4 py-2 text-left">Usul</th>
                <th class="px-4 py-2 text-left">Sana</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tx in contract.transactions" :key="tx.id" class="border-t border-gray-100 dark:border-gray-800">
                <td class="px-4 py-2 font-semibold">{{ tx.transactionId }}</td>
                <td class="px-4 py-2">{{ tx.amount }}</td>
                <td class="px-4 py-2">{{ tx.status }}</td>
                <td class="px-4 py-2">{{ tx.paymentMethod }}</td>
                <td class="px-4 py-2">{{ formatDate(tx.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardBox>
    </SectionMain>
  </LayoutAuthenticated>
</template>
