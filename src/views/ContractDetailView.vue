<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import CardBoxModal from '@/components/CardBoxModal.vue'
import {
  getContract,
  refreshContract,
  listContractPayments,
  createContractPayments,
  updateContractPayment,
  deleteContractPayment,
} from '@/services/contracts'
import { formatTashkentDate, formatTashkentDateISO } from '@/utils/time'

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
const showPaymentModal = ref(false)
const paymentForm = ref({
  periodStart: '',
  months: 1,
  transactionId: '',
  notes: '',
})
const submittingPayment = ref(false)

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

function defaultPeriodStart() {
  const snapshot = paymentState.value.snapshot
  if (snapshot?.nextPeriodStart) {
    return formatTashkentDateISO(snapshot.nextPeriodStart)
  }
  return formatTashkentDateISO(new Date())
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
    if (!paymentForm.value.periodStart) {
      paymentForm.value.periodStart = defaultPeriodStart()
    }
  } catch (e) {
    paymentState.value.error = e?.response?.data?.message || "To'lov davrlarini yuklab bo'lmadi"
  } finally {
    paymentState.value.loading = false
  }
}

function openPaymentModal() {
  showPaymentModal.value = true
  paymentForm.value = {
    periodStart: defaultPeriodStart(),
    months: 1,
    transactionId: '',
    notes: '',
  }
}

async function submitPaymentForm() {
  if (!contractId.value) return
  submittingPayment.value = true
  paymentState.value.error = ''
  try {
    const payload = {
      periodStart: paymentForm.value.periodStart || undefined,
      months: Number(paymentForm.value.months) || 1,
      transactionId: paymentForm.value.transactionId
        ? Number(paymentForm.value.transactionId)
        : undefined,
      notes: paymentForm.value.notes || undefined,
    }
    const res = await createContractPayments(contractId.value, payload)
    applyPaymentResponse(res)
    showPaymentModal.value = false
  } catch (e) {
    paymentState.value.error = e?.response?.data?.message || 'Davrni qo\'shib bo\'lmadi'
  } finally {
    submittingPayment.value = false
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

async function handleStatusChange(payment, status) {
  if (!contractId.value) return
  try {
    const res = await updateContractPayment(contractId.value, payment.id, { status })
    applyPaymentResponse(res)
  } catch (e) {
    paymentState.value.error = e?.response?.data?.message || 'Holatni yangilab bo\'lmadi'
  }
}

async function handleDeletePayment(payment) {
  if (!contractId.value || !payment?.id) return
  if (!confirm("Ushbu to'lov davrini o'chirmoqchimisiz?")) return
  try {
    const res = await deleteContractPayment(contractId.value, payment.id)
    applyPaymentResponse(res)
  } catch (e) {
    paymentState.value.error = e?.response?.data?.message || "O'chirishda xatolik"
  }
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
        <BaseButton color="success" :disabled="paymentState.loading" label="To'lov davri qo'shish" @click="openPaymentModal" />
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
          <BaseButton color="success" small :disabled="paymentState.loading" label="Davr qo'shish" @click="openPaymentModal" />
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
              <th class="px-4 py-2 text-right">Amal</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!paymentState.items.length">
              <td colspan="6" class="px-4 py-6 text-center text-sm text-gray-500">Hozircha davrlar yo'q</td>
            </tr>
            <tr v-for="payment in paymentState.items" :key="payment.id" class="border-t border-gray-100 dark:border-gray-800">
              <td class="px-4 py-2 text-sm">
                <div>{{ formatDate(payment.periodStart) }}</div>
                <div class="text-xs text-gray-500">{{ formatDate(payment.periodEnd) }}</div>
              </td>
              <td class="px-4 py-2">
                <select
                  class="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                  :class="paymentStatusColor(payment.status)"
                  :value="payment.status"
                  @change="handleStatusChange(payment, $event.target.value)"
                >
                  <option value="PAID">To'langan</option>
                  <option value="PENDING">Jarayonda</option>
                  <option value="REVERSED">Bekor qilingan</option>
                </select>
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
              <td class="px-4 py-2 text-right">
                <BaseButton
                  color="danger"
                  small
                  outline
                  label="O'chirish"
                  @click="handleDeletePayment(payment)"
                />
              </td>
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

      <CardBoxModal
        v-model="showPaymentModal"
        has-cancel
        :title="'Yangi to\'lov davri'"
        button="success"
        :button-label="submittingPayment ? 'Saqlanmoqda...' : 'Saqlash'"
        :confirm-disabled="submittingPayment"
        :close-on-confirm="false"
        @confirm="submitPaymentForm"
        @cancel="showPaymentModal = false"
      >
        <form class="space-y-4" @submit.prevent="submitPaymentForm">
          <FormField label="Boshlanish sanasi (oy)">
            <FormControl type="date" v-model="paymentForm.periodStart" />
          </FormField>
          <FormField label="Qamrab olingan oylar">
            <FormControl type="number" min="1" max="12" v-model.number="paymentForm.months" />
          </FormField>
          <FormField label="Tranzaksiya ID (ixtiyoriy)">
            <FormControl v-model="paymentForm.transactionId" placeholder="Tranzaksiya identifikatori" />
          </FormField>
          <FormField label="Izoh">
            <FormControl v-model="paymentForm.notes" placeholder="Qo'shimcha izoh (ixtiyoriy)" />
          </FormField>
          <button type="submit" class="hidden" />
        </form>
      </CardBoxModal>
    </SectionMain>
  </LayoutAuthenticated>
</template>
