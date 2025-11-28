<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  mdiRefresh,
  mdiQrcode,
  mdiHistory,
  mdiFileExcelBox,
  mdiPencilOutline,
  mdiCreditCardOutline,
  mdiBankTransfer,
  mdiArchiveArrowDownOutline,
  mdiBackupRestore,
  mdiOpenInNew,
} from '@mdi/js'
import QRCode from 'qrcode'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import ActionMenu from '@/components/ActionMenu.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import CardBoxModal from '@/components/CardBoxModal.vue'
import PaginationControls from '@/components/PaginationControls.vue'
import {
  listContracts,
  createContract,
  updateContract,
  deleteContract,
  refreshContract,
  getContractHistory,
  manualContractPayment,
} from '@/services/contracts'
import { listOwners } from '@/services/owners'
import { listStores } from '@/services/stores'
import { downloadXLSX } from '../utils/export'
import {
  formatTashkentDate,
  formatTashkentDateISO,
  getTashkentTodayISO,
  parseTashkentDate,
  startOfTashkentDay,
} from '@/utils/time'

const router = useRouter()

// State
const items = ref([])
const loading = ref(false)
const errorMsg = ref('')
const page = ref(1)
const limit = ref(10)
const total = ref(0)
const statusFilter = ref('active')
const paidFilter = ref('all')

const owners = ref([])
const stores = ref([])
const ownerSearch = ref('')
const storeSearch = ref('')
const ownerOptions = ref([])
const storeOptions = ref([])
const storeInfoMsg = ref('')

const contractHistoryModal = ref({
  open: false,
  contractId: null,
  loading: false,
  limit: 30,
  items: [],
  total: 0,
  owner: null,
  store: null,
  summary: null,
})
const contractHistoryError = ref('')

const qrModal = ref({
  open: false,
  contractId: null,
  loading: false,
  provider: null,
  link: '',
  qrData: '',
  options: [],
})

const paymentConfirmModal = ref({
  open: false,
  contract: null,
  url: '',
  provider: '',
})

const manualPaymentModal = ref({
  open: false,
  contract: null,
  loading: false,
  error: '',
  form: {
    transferNumber: '',
    transferDate: getTashkentTodayISO(),
    amount: null,
    months: 1,
    startMonth: '',
    notes: '',
  },
})

const refreshingContractId = ref(null)

const SEARCH_MIN_LENGTH = 2
const searchTerm = ref('')
const searchResults = ref(null)
// Form state
const showForm = ref(false)
const editingId = ref(null)
const form = ref({
  ownerId: null,
  storeId: null,
  shopMonthlyFee: null,
  certificateNumber: '',
  issueDate: '',
  expiryDate: '',
  isActive: true,
})

// Computed
const searchActive = computed(() => (searchTerm.value || '').trim().length >= SEARCH_MIN_LENGTH)
const displayItems = computed(() => (searchActive.value ? searchResults.value || [] : items.value))
const displayTotal = computed(() => (searchActive.value ? displayItems.value.length : total.value))
const showShortSearchHint = computed(() => {
  const len = (searchTerm.value || '').trim().length
  return len > 0 && len < SEARCH_MIN_LENGTH
})

const currencyFormatter = new Intl.NumberFormat('uz-UZ', {
  style: 'currency',
  currency: 'UZS',
  maximumFractionDigits: 0,
})
const currencyFormatterWithFrac = new Intl.NumberFormat('uz-UZ', {
  style: 'currency',
  currency: 'UZS',
  maximumFractionDigits: 2,
})

const paymentConfirmContract = computed(() => paymentConfirmModal.value.contract)
const paymentConfirmStore = computed(() => {
  if (!paymentConfirmContract.value) return null
  return resolveStore(paymentConfirmContract.value)
})

function getMonthlyFee(contract) {
  const fee = Number(contract?.shopMonthlyFee)
  return Number.isFinite(fee) ? fee : 0
}

const manualComputedTotal = computed(() => {
  const fee = getMonthlyFee(manualPaymentModal.value.contract)
  const months = Number(manualPaymentModal.value.form.months) || 1
  return fee * months
})

// Helpers
function formatCurrency(value) {
  if (value === null || value === undefined) return '-'
  const num = Number(value)
  if (!Number.isFinite(num)) return value
  return currencyFormatter.format(num)
}

function formatCurrencyDetailed(value) {
  if (value === null || value === undefined) return '-'
  const num = Number(value)
  if (!Number.isFinite(num)) return value
  return currencyFormatterWithFrac.format(num)
}



function resolveStore(contract) {
  if (contract?.store) return contract.store
  return stores.value.find((s) => s.id === contract?.storeId) || null
}

function getPaymentUrl(contract) {
  const store = resolveStore(contract)
  if (!store) return ''
  return store.payme_payment_url || store.click_payment_url || ''
}

function getPaymentLinks(contract) {
  const store = resolveStore(contract)
  if (!store) return []
  if (store.payme_payment_url)
    return [{ type: 'payme', label: 'Payme', url: store.payme_payment_url }]
  if (store.click_payment_url)
    return [{ type: 'click', label: 'Click', url: store.click_payment_url }]
  return []
}

function currentMonthWindow() {
  const today = startOfTashkentDay() || new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = new Date(start)
  end.setMonth(end.getMonth() + 1)
  return { start, end }
}

function contractPaidThisMonth(contract) {
  if (contract?.paymentSnapshot) return Boolean(contract.paymentSnapshot.hasCurrentPeriodPaid)
  const window = currentMonthWindow()
  return (contract.transactions || []).some((tx) => {
    if (tx.status !== 'PAID' || !tx.createdAt) return false
    const date = parseTashkentDate(tx.createdAt)
    if (!date) return false
    return date >= window.start && date < window.end
  })
}

function outstandingLabel(contract) {
  const snap = contract?.paymentSnapshot
  if (!snap) return contractPaidThisMonth(contract) ? "Joriy oy to'langan" : "To'lov kutilmoqda"
  if (snap.monthsAhead > 0) return `${snap.monthsAhead} oy oldindan`
  if (snap.monthsAhead === 0 && snap.hasCurrentPeriodPaid) return "Joriy oy to'langan"
  return "To'lov kutilmoqda"
}
function isContractExpired(contract) {
  if (!contract?.expiryDate) return false
  const exp = parseTashkentDate(contract.expiryDate)
  if (!exp) return false
  const today = startOfTashkentDay() || new Date()
  return exp < today
}
// Derive last paid and next due dates (fallbacks when snapshot not present)
function getLastPaidDate(contract) {
  if (contract?.paymentSnapshot?.paidThrough) return contract.paymentSnapshot.paidThrough
  const paidTx = (contract?.transactions || []).filter((tx) => tx.status === 'PAID')
  if (!paidTx.length) return null
  const latest = paidTx.reduce((acc, tx) => {
    const ts = parseTashkentDate(tx.createdAt)
    if (!acc) return ts
    if (ts && (!acc || ts > acc)) return ts
    return acc
  }, null)
  return latest
}

function contractActions(contract) {
  const paid = contractPaidThisMonth(contract)
  const paymentUrlAvailable = Boolean(getPaymentUrl(contract))
  const items = [
    { label: 'Batafsil', icon: mdiOpenInNew, onClick: () => goToContractDetail(contract) },
    {
      label: "Onlayn to'lov",
      icon: mdiCreditCardOutline,
      hint: paid ? "Joriy oy to'langan" : '',
      disabled: !paymentUrlAvailable || !contract.isActive || paid,
      onClick: () => handleContractPayment(contract),
    },
    {
      label: "Qo'lda to'lov",
      icon: mdiBankTransfer,
      hint: 'Bank kvitansiyasi',
      disabled: paid || !contract.isActive,
      onClick: () => openManualPayment(contract),
    },
    {
      label: 'Holatni yangilash',
      icon: mdiRefresh,
      disabled: refreshingContractId.value === contract.id || loading.value,
      onClick: () => refreshSingleContract(contract),
    },
    { label: 'To\'lov tarixi', icon: mdiHistory, onClick: () => openContractHistory(contract) },
    {
      label: 'QR',
      icon: mdiQrcode,
      disabled: !getPaymentLinks(contract).length,
      onClick: () => openQrCode(contract),
    },
  ]

  if (contract.isActive) {
    items.push({
      label: 'Arxivlash',
      icon: mdiArchiveArrowDownOutline,
      danger: true,
      onClick: () => removeItem(contract.id),
    })
  } else {
    items.push({
      label: 'Tiklash',
      icon: mdiBackupRestore,
      onClick: () => restoreItem(contract.id),
    })
  }
  if (!paid) {
    items.push({
      label: 'Tahrirlash',
      icon: mdiPencilOutline,
      onClick: () => openEdit(contract),
    })
  }
  return items
}

function getNextDueDate(contract) {
  if (contract?.paymentSnapshot?.nextPeriodStart) return contract.paymentSnapshot.nextPeriodStart
  const base = getLastPaidDate(contract)
  if (!base) return null
  const copy = new Date(base)
  copy.setMonth(copy.getMonth() + 1)
  return copy
}

function statusBadge(contract) {
  if (!contract?.isActive) return 'Arxiv'
  return contractPaidThisMonth(contract) ? "Faol (to'langan)" : 'Faol'
}

// Navigation
function goToContractDetail(contract) {
  if (!contract?.id) return
  router.push({ name: 'contract-detail', params: { id: contract.id } })
}

// Payment flow
function openPayment(url) {
  const href = url || ''
  if (!href) return
  try {
    const target = typeof window !== 'undefined' ? window : globalThis
    if (target && typeof target.open === 'function') target.open(href, '_blank', 'noopener')
  } catch (e) {
    console.error('Failed to open payment url', e)
  }
}

function handleContractPayment(contract) {
  if (contractPaidThisMonth(contract)) {
    alert("Bu oy uchun to'lov allaqachon amalga oshirilgan")
    return
  }
  const url = getPaymentUrl(contract)
  if (!url) {
    alert("To'lov havolasi topilmadi")
    return
  }
  const link = getPaymentLinks(contract)[0]
  paymentConfirmModal.value.contract = contract
  paymentConfirmModal.value.url = url
  paymentConfirmModal.value.provider = link?.label || "onlayn to'lov"
  paymentConfirmModal.value.open = true
}

function resetPaymentConfirmModal() {
  paymentConfirmModal.value.open = false
  paymentConfirmModal.value.contract = null
  paymentConfirmModal.value.url = ''
  paymentConfirmModal.value.provider = ''
}

function refreshContractsAfterPayment() {
  if (typeof window !== 'undefined') window.setTimeout(fetchData, 4000)
  else fetchData()
}

function confirmContractPayment() {
  const url = paymentConfirmModal.value.url
  if (!url) return
  resetPaymentConfirmModal()
  openPayment(url)
  refreshContractsAfterPayment()
}

// Data fetching
async function fetchData() {
  loading.value = true
  errorMsg.value = ''
  try {
    const isActive = statusFilter.value === 'all' ? undefined : statusFilter.value === 'active'
    const paid = paidFilter.value === 'all' ? undefined : paidFilter.value
    const res = await listContracts({ page: page.value, limit: limit.value, isActive, paid })
    items.value = res.data
    total.value = res.pagination?.total ?? items.value.length
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Yuklashda xatolik'
  } finally {
    loading.value = false
  }
}

async function runSearch() {
  const term = (searchTerm.value || '').trim()
  if (term.length < SEARCH_MIN_LENGTH) {
    searchResults.value = null
    return
  }
  errorMsg.value = ''
  loading.value = true
  try {
    const matches = []
    const chunkSize = 100
    const maxPages = 20
    const isActive = statusFilter.value === 'all' ? undefined : statusFilter.value === 'active'
    const paid = paidFilter.value === 'all' ? undefined : paidFilter.value
    let pageCursor = 1
    let totalAvailable = Infinity
    while (pageCursor <= maxPages) {
      const res = await listContracts({ page: pageCursor, limit: chunkSize, isActive, paid })
      const data = res.data || []
      matches.push(...data)
      const reportedTotal = res.pagination?.total ?? res.total ?? null
      if (reportedTotal !== null && reportedTotal !== undefined) totalAvailable = reportedTotal
      if (data.length < chunkSize || matches.length >= totalAvailable) break
      pageCursor += 1
    }
    const norm = term.toLowerCase()
    const filtered = matches.filter((c) => {
      const owner = c.owner || owners.value.find((o) => o.id === c.ownerId) || {}
      const store = c.store || stores.value.find((s) => s.id === c.storeId) || {}
      const fields = [
        owner.fullName,
        owner.tin,
        owner.phoneNumber,
        store.storeNumber,
        store.description,
        c.certificateNumber,
        c.issueDate,
        c.expiryDate,
        String(c.ownerId),
        String(c.storeId),
      ]
      return fields.some((field) => field && field.toString().toLowerCase().includes(norm))
    })
    searchResults.value = filtered
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Shartnoma qidirishda xatolik'
    searchResults.value = []
  } finally {
    loading.value = false
  }
}

async function preloadRefs() {
  try {
    const o = await listOwners({ page: 1, limit: 100 })
    owners.value = o.data
  } catch (e) { void e }
  try {
    const s = await listStores({ page: 1, limit: 100, withContracts: true, onlyFree: false })
    stores.value = s.data
  } catch (e) { void e }
}

// CRUD
function openCreate() {
  editingId.value = null
  form.value = {
    ownerId: null,
    storeId: null,
    shopMonthlyFee: null,
    certificateNumber: '',
    issueDate: '',
    expiryDate: '',
    isActive: true,
  }
  showForm.value = true
}

function openEdit(it) {
  if (contractPaidThisMonth(it)) {
    alert("Bu oy to'lov qilinganligi uchun tahrirlash vaqtincha bloklangan")
    return
  }
  editingId.value = it.id
  form.value = {
    ownerId: it.ownerId ?? null,
    storeId: it.storeId ?? null,
    shopMonthlyFee: it.shopMonthlyFee ?? null,
    certificateNumber: it.certificateNumber || '',
    issueDate: formatTashkentDateISO(it.issueDate) || '',
    expiryDate: formatTashkentDateISO(it.expiryDate) || '',
    isActive: typeof it.isActive === 'boolean' ? it.isActive : true,
  }
  showForm.value = true
}
function selectOwner(o) {
  form.value.ownerId = o?.id ?? null
  ownerSearch.value = o ? `${o.fullName} (${o.tin})` : ''
  ownerOptions.value = []
}
function clearOwner() {
  form.value.ownerId = null
  ownerSearch.value = ''
  ownerOptions.value = []
}
function selectStore(s) {
  form.value.storeId = s?.id ?? null
  storeSearch.value = s ? `${s.storeNumber}` : ''
  storeOptions.value = []
}
function clearStore() {
  form.value.storeId = null
  storeSearch.value = ''
  storeOptions.value = []
}

async function submitForm() {
  loading.value = true
  errorMsg.value = ''
  try {
    const payload = {
      ownerId: form.value.ownerId ? Number(form.value.ownerId) : null,
      storeId: form.value.storeId ? Number(form.value.storeId) : null,
      shopMonthlyFee: form.value.shopMonthlyFee ? Number(form.value.shopMonthlyFee) : undefined,
      certificateNumber: form.value.certificateNumber || undefined,
      issueDate: form.value.issueDate || undefined,
      expiryDate: form.value.expiryDate || undefined,
      isActive: form.value.isActive,
    }
    if (!payload.ownerId || !payload.storeId) throw new Error("Ega va Do'kon majburiy")
    if (editingId.value) await updateContract(editingId.value, payload)
    else await createContract(payload)
    showForm.value = false
    await fetchData()
    try {
      await fetchStoreOptions(storeSearch.value?.trim() || '')
    } catch (e) { void e }
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || e.message || 'Saqlashda xatolik'
  } finally {
    loading.value = false
  }
}

async function removeItem(id) {
  if (!confirm('Shartnomani arxivga yuborilsinmi?')) return
  loading.value = true
  errorMsg.value = ''
  try {
    await deleteContract(id)
    await fetchData()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || "O'chirishda xatolik"
  } finally {
    loading.value = false
  }
}

async function restoreItem(id) {
  loading.value = true
  errorMsg.value = ''
  try {
    await updateContract(id, { isActive: true })
    await fetchData()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Tiklashda xatolik'
  } finally {
    loading.value = false
  }
}

function replaceContractInstance(updated) {
  const idx = items.value.findIndex((it) => it.id === updated.id)
  if (idx !== -1) items.value[idx] = updated
  if (Array.isArray(searchResults.value)) {
    const sIdx = searchResults.value.findIndex((it) => it.id === updated.id)
    if (sIdx !== -1) searchResults.value[sIdx] = updated
  }
}

async function refreshSingleContract(contract) {
  if (!contract?.id) return
  refreshingContractId.value = contract.id
  try {
    const fresh = await refreshContract(contract.id)
    if (fresh) replaceContractInstance(fresh)
  } catch (e) {
    console.error(e)
    alert('Shartnoma holatini yangilashda xatolik')
  } finally {
    refreshingContractId.value = null
  }
}

function openManualPayment(contract) {
  if (!contract?.id) return
  manualPaymentModal.value.open = true
  manualPaymentModal.value.contract = contract
  manualPaymentModal.value.error = ''
  manualPaymentModal.value.form = {
    transferNumber: '',
    transferDate: getTashkentTodayISO(),
    amount: null,
    months: 1,
    startMonth: '',
    notes: '',
  }
}

async function submitManualPayment() {
  const modal = manualPaymentModal.value
  if (!modal.contract?.id) return
  modal.loading = true
  modal.error = ''
  try {
    const payload = {
      transferNumber: modal.form.transferNumber,
      transferDate: modal.form.transferDate || undefined,
      months: modal.form.months ? Number(modal.form.months) : undefined,
      startMonth: modal.form.startMonth || undefined,
      notes: modal.form.notes || undefined,
    }
    await manualContractPayment(modal.contract.id, payload)
    modal.open = false
    await refreshSingleContract(modal.contract)
  } catch (e) {
    modal.error = e?.response?.data?.message || e.message || 'Qo\'lda to\'lovda xatolik'
  } finally {
    modal.loading = false
  }
}

function closeManualPaymentModal() {
  manualPaymentModal.value.open = false
}

async function openContractHistory(contract) {
  contractHistoryModal.value.open = true
  contractHistoryModal.value.loading = true
  contractHistoryModal.value.contractId = contract.id
  contractHistoryModal.value.owner = null
  contractHistoryModal.value.store = null
  contractHistoryModal.value.summary = null
  contractHistoryError.value = ''
  try {
    const history = await getContractHistory(contract.id, {
      limit: contractHistoryModal.value.limit,
    })
    contractHistoryModal.value.items = history.transactions || []
    contractHistoryModal.value.total = history.total || history.transactions?.length || 0
    contractHistoryModal.value.owner = history.owner || null
    contractHistoryModal.value.store = history.store || null
    contractHistoryModal.value.summary = history.summary || null
  } catch (e) {
    contractHistoryError.value = e?.response?.data?.message || 'Tarixni yuklashda xatolik'
    contractHistoryModal.value.items = []
    contractHistoryModal.value.owner = null
    contractHistoryModal.value.store = null
    contractHistoryModal.value.summary = null
  } finally {
    contractHistoryModal.value.loading = false
  }
}

const contractHistorySummary = computed(() => {
  if (contractHistoryModal.value.summary) return contractHistoryModal.value.summary
  const items = contractHistoryModal.value.items || []
  return items.reduce(
    (acc, tx) => {
      const numeric = Number((tx.amount && tx.amount.toString()) || 0)
      if (tx.status === 'PAID') {
        acc.paid++
        acc.amountPaid += numeric
      } else {
        acc.pending++
      }
      return acc
    },
    { paid: 0, pending: 0, amountPaid: 0 },
  )
})

async function exportContractsXLSX() {
  loading.value = true
  try {
    const headers = [
      'ID',
      'Ega',
      "Do'kon",
      'Oylik',
      'Berilgan',
      'Tugash',
      'Faol',
      'Tranzaksiya soni',
      "Oxirgi to'lov sana",
      'Jami tolangan',
    ]
    const rows = []
    let p = 1
    const isActive = statusFilter.value === 'all' ? undefined : statusFilter.value === 'active'
    while (true) {
      const res = await listContracts({ page: p, limit: 100, isActive })
      const arr = res.data || []
      for (const c of arr) {
        const tx = c.transactions || []
        const paid = tx.filter((t) => t.status === 'PAID')
        const last = paid.sort(
          (a, b) =>
            (parseTashkentDate(b.createdAt)?.getTime() || 0) -
            (parseTashkentDate(a.createdAt)?.getTime() || 0),
        )[0]
        const totalPaid = paid.reduce(
          (sum, t) => sum + Number((t.amount && t.amount.toString()) || 0),
          0,
        )
        rows.push([
          c.id,
          c.owner?.fullName || c.ownerId,
          c.store?.storeNumber || c.storeId,
          c.shopMonthlyFee ?? '',
          formatTashkentDateISO(c.issueDate) || '',
          formatTashkentDateISO(c.expiryDate) || '',
          c.isActive ? 'Ha' : "Yo'q",
          tx.length,
          last ? formatTashkentDateISO(last.createdAt) : '',
          totalPaid,
        ])
      }
      if (arr.length < 100) break
      p++
    }
    downloadXLSX(`contracts_${getTashkentTodayISO()}.xlsx`, headers, rows, 'Contracts')
  } finally {
    loading.value = false
  }
}

async function exportContractTransactionsXLSX() {
  loading.value = true
  try {
    const headers = ['ContractID', 'Ega', "Do'kon", 'Sana', 'Summasi', 'Holat']
    const rows = []
    let p = 1
    const isActive = statusFilter.value === 'all' ? undefined : statusFilter.value === 'active'
    while (true) {
      const res = await listContracts({ page: p, limit: 100, isActive })
      const arr = res.data || []
      for (const c of arr) {
        for (const t of c.transactions || []) {
          rows.push([
            c.id,
            c.owner?.fullName || c.ownerId,
            c.store?.storeNumber || c.storeId,
            formatTashkentDateISO(t.createdAt) || '',
            t.amount ?? '',
            t.status,
          ])
        }
      }
      if (arr.length < 100) break
      p++
    }
    downloadXLSX(
      `contract_transactions_${getTashkentTodayISO()}.xlsx`,
      headers,
      rows,
      'Transactions',
    )
  } finally {
    loading.value = false
  }
}
function downloadContractHistory() {
  const items = contractHistoryModal.value.items || []
  if (!items.length) return
  const headers = ['Sana', 'Summasi', 'Holat', "To'lov ID", 'Ega', "Do'kon"]
  const rows = items.map((tx) => [
    formatTashkentDate(tx.createdAt) || '',
    tx.amount ?? '',
    tx.status,
    tx.transactionId || tx.id,
    contractHistoryModal.value.owner?.fullName || '',
    contractHistoryModal.value.store?.storeNumber || '',
  ])
  downloadXLSX(
    `contract_${contractHistoryModal.value.contractId}_history.xlsx`,
    headers,
    rows,
    'Tarix',
  )
}
async function openQrCode(contract, provider) {
  const options = getPaymentLinks(contract)
  if (!options.length) {
    alert("To'lov havolasi topilmadi")
    return
  }
  const selected = provider
    ? options.find((opt) => opt.type === provider) || options[0]
    : options[0]
  qrModal.value.open = true
  qrModal.value.loading = true
  qrModal.value.contractId = contract.id
  qrModal.value.provider = selected.type
  qrModal.value.link = selected.url
  qrModal.value.options = options
  qrModal.value.qrData = ''
  try {
    const dataUrl = await QRCode.toDataURL(selected.url, { width: 320, margin: 1 })
    qrModal.value.qrData = dataUrl
  } catch (e) {
    console.error(e)
    alert('QR kod yaratishda xatolik')
  } finally {
    qrModal.value.loading = false
  }
}

async function selectQrProvider(type) {
  const option = qrModal.value.options.find((opt) => opt.type === type)
  if (!option) return
  qrModal.value.loading = true
  qrModal.value.provider = type
  qrModal.value.link = option.url
  try {
    const dataUrl = await QRCode.toDataURL(option.url, { width: 320, margin: 1 })
    qrModal.value.qrData = dataUrl
  } catch (e) {
    console.error(e)
    alert('QR kod yaratishda xatolik')
  } finally {
    qrModal.value.loading = false
  }
}

// Watchers
onMounted(async () => {
  await preloadRefs()
  await fetchData()
  try {
    await fetchOwnerOptions(ownerSearch.value?.trim() || '')
  } catch (e) { void e }
  try {
    await fetchStoreOptions(storeSearch.value?.trim() || '')
  } catch (e) { void e }
})

watch(paidFilter, async () => {
  page.value = 1
  if (searchActive.value) await runSearch()
  else await fetchData()
})

watch(statusFilter, async () => {
  page.value = 1
  if (searchActive.value) await runSearch()
  else await fetchData()
})

// store search debounce id (declared once below with watcher)
async function fetchOwnerOptions(q) {
  try {
    const res = await listOwners({ search: q, page: 1, limit: 20 })
    ownerOptions.value = res.data
  } catch (e) { void e }
}
async function fetchStoreOptions(q) {
  try {
    const res = await listStores({ search: q, page: 1, limit: 20, onlyFree: true })
    storeOptions.value = res.data || []
    const qq = (q || '').toLowerCase()
    const occupiedMatches = (stores.value || []).filter(
      (s) =>
        isStoreOccupied(s) &&
        ((s.storeNumber || '').toLowerCase().includes(qq) ||
          (s.description || '').toLowerCase().includes(qq)),
    )
    if (qq && occupiedMatches.length) {
      const nums = occupiedMatches
        .slice(0, 3)
        .map((s) => s.storeNumber || s.id)
        .join(', ')
      const more = occupiedMatches.length > 3 ? ` va yana ${occupiedMatches.length - 3} ta` : ''
      storeInfoMsg.value = `Qidiruvga mos do'kon(lar) band: ${nums}${more}`
    } else {
      storeInfoMsg.value = ''
    }
  } catch (e) { void e }
}
 
let ownerDebounceId
watch(ownerSearch, (q) => {
  if (ownerDebounceId) clearTimeout(ownerDebounceId)
  ownerDebounceId = setTimeout(() => fetchOwnerOptions(q?.trim() || ''), 250)
})

let storeDebounceId
watch(storeSearch, (q) => {
  if (storeDebounceId) clearTimeout(storeDebounceId)
  storeDebounceId = setTimeout(() => fetchStoreOptions(q?.trim() || ''), 250)
})

function handlePageChange(newPage) {
  if (loading.value || page.value === newPage) return
  page.value = newPage
  fetchData()
}
function handleLimitChange(newLimit) {
  if (loading.value || limit.value === newLimit) return
  limit.value = newLimit
  page.value = 1
  fetchData()
}

let searchDebounceId
watch(searchTerm, (q) => {
  if (searchDebounceId) clearTimeout(searchDebounceId)
  searchDebounceId = setTimeout(() => {
    const term = (q || '').trim()
    if (term.length >= SEARCH_MIN_LENGTH) runSearch()
    else searchResults.value = null
  }, 300)
})

function isStoreOccupied(s) {
  if (typeof s?.isOccupied === 'boolean') return s.isOccupied
  if (!s?.contracts || !Array.isArray(s.contracts)) return false
  const today = startOfTashkentDay() || new Date()
  return s.contracts.some((c) => {
    const active = c.isActive !== false
    const startOk = !c.issueDate || (parseTashkentDate(c.issueDate) || new Date(0)) <= today
    const endOk =
      !c.expiryDate || (parseTashkentDate(c.expiryDate) || new Date(8640000000000000)) >= today
    return active && startOk && endOk
  })
}
</script>
<template>
  <LayoutAuthenticated>
    <SectionMain wide>
      <SectionTitle first>Shartnomalar (Ega - Do'kon)</SectionTitle>
      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>
      <CardBox class="mb-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div class="flex flex-wrap items-end gap-3">
            <FormField label="Holati">
              <select
                v-model="statusFilter"
                class="rounded border px-2 py-1 text-sm dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="active">Faol</option>
                <option value="archived">Arxivlangan</option>
                <option value="all">Barchasi</option>
              </select>
            </FormField>
            <FormField label="To'lov holati">
              <select
                v-model="paidFilter"
                class="rounded border px-2 py-1 text-sm dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="all">Barchasi</option>
                <option value="paid">To'langan</option>
                <option value="unpaid">To'lanmagan</option>
              </select>
            </FormField>
            <FormField class="w-full md:max-w-2xl" label="Qidirish (kamida 2 belgi)">
              <div class="space-y-1">
                <FormControl v-model="searchTerm" placeholder="Ega, do'kon, guvohnoma yoki STIR" />
                <div v-if="showShortSearchHint" class="text-xs text-gray-500">
                  Kamida {{ SEARCH_MIN_LENGTH }} ta belgi kiriting
                </div>
              </div>
            </FormField>
            <BaseButton
              color="info"
              outline
              :disabled="loading"
              label="XLSX (Shartnomalar)"
              @click="exportContractsXLSX"
            />
            <BaseButton
              color="info"
              outline
              :disabled="loading"
              label="XLSX (Tranzaksiyalar)"
              @click="exportContractTransactionsXLSX"
            />
          </div>
          <div class="flex items-center justify-end">
            <BaseButton color="success" :disabled="loading" label="Yaratish" @click="openCreate" />
          </div>
        </div>
      </CardBox>
      <CardBox has-table>
        <div class="overflow-x-auto">
          <table class="w-full table-auto">
            <thead>
              <tr>
                <th class="px-4 py-2 text-left">Shartnoma / Ega</th>
                <th class="px-4 py-2 text-left">Do'kon</th>
                <th class="px-4 py-2 text-left">Oylik to'lov</th>
                <th class="px-4 py-2 text-left">Oxirgi to'lov</th>
                <th class="px-4 py-2 text-left">Navbatdagi</th>
                <th class="px-4 py-2 text-left">Holat</th>
                <th class="px-4 py-2 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="8" class="px-4 py-6 text-center">Yuklanmoqda...</td>
              </tr>
              <tr v-else-if="!displayItems.length">
                <td colspan="8" class="px-4 py-6 text-center">
                  {{ searchActive ? "Qidiruv bo'yicha natija topilmadi" : "Ma'lumot topilmadi" }}
                </td>
              </tr>
              <template v-else v-for="it in displayItems" :key="it.id">
                <tr class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td class="px-4 py-2 align-top">
                    <div class="text-sm font-semibold text-gray-500">Shartnoma #{{ it.id }}</div>
                    <div class="font-medium">
                      {{
                        it.owner?.fullName ||
                        owners.find((o) => o.id === it.ownerId)?.fullName ||
                        it.ownerId
                      }}
                    </div>
                    <div class="text-xs text-gray-500">
                      {{
                        it.owner?.tin || owners.find((o) => o.id === it.ownerId)?.tin || "TIN yo'q"
                      }}
                    </div>
                    <div class="text-xs text-gray-500" v-if="it.owner?.phoneNumber">
                      Tel: {{ it.owner.phoneNumber }}
                    </div>
                  </td>
                  <td class="px-4 py-2 align-top">
                    <div class="font-medium">
                      {{
                        it.store?.storeNumber ||
                        stores.find((s) => s.id === it.storeId)?.storeNumber ||
                        it.storeId
                      }}
                    </div>
                    <div class="text-xs text-gray-500">
                      {{
                        it.store?.description ||
                        stores.find((s) => s.id === it.storeId)?.description ||
                        "Izoh yo'q"
                      }}
                    </div>
                  </td>
                  <td class="px-4 py-2 align-top font-semibold">
                    {{ formatCurrency(it.shopMonthlyFee) }}
                  </td>
                  <td class="px-4 py-2 align-top">
                    {{ formatTashkentDate(getLastPaidDate(it)) || '-' }}
                  </td>
                  <td class="px-4 py-2 align-top">
                    {{ formatTashkentDate(getNextDueDate(it)) || '-' }}
                  </td>
                  <td class="px-4 py-2 align-top">
                    <div
                      :class="[
                        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                        contractPaidThisMonth(it)
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
                      ]"
                    >
                      {{ statusBadge(it) }}
                    </div>
                    <div class="text-xs text-gray-500">{{ outstandingLabel(it) }}</div>
                    <div
                      v-if="isContractExpired(it)"
                      class="mt-1 inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-200"
                    >
                      Muddat tugagan
                    </div>
                  </td>
                  <td class="px-4 py-2 align-top text-right">
                    <ActionMenu :items="contractActions(it)" />
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <PaginationControls
          v-if="!searchActive"
          :page="page"
          :limit="limit"
          :total="displayTotal"
          :disabled="loading"
          @update:page="handlePageChange"
          @update:limit="handleLimitChange"
        />
        <div
          v-else
          class="border-t border-gray-100 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-300"
        >
          Qidiruv natijalari ko'rsatilmoqda ({{ displayTotal }})
        </div>
      </CardBox>
      <CardBoxModal
        v-model="paymentConfirmModal.open"
        has-cancel
        button="success"
        button-label="Davom etish"
        :confirm-disabled="!paymentConfirmModal.url"
        title="To'lovni tasdiqlash"
        @confirm="confirmContractPayment"
        @cancel="resetPaymentConfirmModal"
      >
        <p class="text-sm text-gray-700 dark:text-gray-200">
          Shartnoma #{{ paymentConfirmContract?.id || 'РІР‚вЂќ' }} bo'yicha onlayn to'lov sahifasiga
          o'tishni tasdiqlaysizmi?
        </p>
        <div
          class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <div class="font-semibold">
            {{
              paymentConfirmStore?.storeNumber ||
              paymentConfirmContract?.storeId ||
              "Do'kon aniqlanmadi"
            }}
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-300">
            {{ contractHistoryModal.store?.description || "Izoh yo'q" }}
          </div>
          <div class="mt-2 text-xs">
            Oylik to'lov:
            <strong>{{ formatCurrency(paymentConfirmContract?.shopMonthlyFee) }}</strong>
          </div>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          Davom etish tugmasi {{ paymentConfirmModal.provider || "onlayn to'lov" }} sahifasini yangi
          oynada ochadi.
        </p>
      </CardBoxModal>
      <CardBoxModal
        v-model="manualPaymentModal.open"
        has-cancel
        :close-on-confirm="false"
        :confirm-disabled="manualPaymentModal.loading"
        :button-label="manualPaymentModal.loading ? 'Saqlanmoqda...' : 'Saqlash'"
        title="Qo'lda to'lov"
        @confirm="submitManualPayment"
        @cancel="closeManualPaymentModal"
      >
        <div class="space-y-3">
          <div
            v-if="manualPaymentModal.error"
            class="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200"
          >
            {{ manualPaymentModal.error }}
          </div>
          <FormField label="Kvitansiya raqami">
            <FormControl
              v-model="manualPaymentModal.form.transferNumber"
              placeholder="Misol: TR-2024-0001"
              required
            />
          </FormField>
          <FormField label="To'lov sanasi">
            <FormControl v-model="manualPaymentModal.form.transferDate" type="date" />
          </FormField>
          <FormField label="Oylar soni">
            <FormControl
              v-model.number="manualPaymentModal.form.months"
              type="number"
              min="1"
              step="1"
              placeholder="1"
            />
          </FormField>
          <div class="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            Hisoblanadigan summa: <strong>{{ formatCurrencyDetailed(manualComputedTotal) }}</strong>
          </div>
          <FormField label="Boshlanish oyi (ixtiyoriy, YYYY-MM)">
            <FormControl v-model="manualPaymentModal.form.startMonth" placeholder="2025-01" />
          </FormField>
          <FormField label="Izoh (ixtiyoriy)">
            <FormControl v-model="manualPaymentModal.form.notes" placeholder="Izoh kiriting" />
          </FormField>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Oylik to'lov x ${manualPaymentModal.form.months || 1} oy = {{ formatCurrencyDetailed(manualComputedTotal) }}.
          </p>
        </div>
      </CardBoxModal>
      <CardBoxModal
        v-model="contractHistoryModal.open"
        button="info"
        button-label="Yopish"
        :confirm-disabled="contractHistoryModal.loading"
        :has-cancel="false"
        :title="`Shartnoma #${contractHistoryModal.contractId || ''} вЂ” so'nggi to'lovlar`"
      >
        <template v-if="contractHistoryError">
          <div class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {{ contractHistoryError }}
          </div>
        </template>
        <template v-else>
          <div class="space-y-3 text-sm">
            <div
              v-if="contractHistoryModal.owner || contractHistoryModal.store"
              class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <div class="font-semibold">
                {{ contractHistoryModal.owner?.fullName || "Ega noma'lum" }}
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-300">
                Do'kon: {{ contractHistoryModal.store?.storeNumber || '-' }} вЂў
                {{ contractHistoryModal.store?.description || "Izoh yo'q" }}
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <div
                class="rounded-lg bg-green-50 px-3 py-2 text-green-700 dark:bg-green-900/20 dark:text-green-300"
              >
                To'langan: {{ contractHistorySummary.paid || 0 }} ta вЂ”
                {{ (contractHistorySummary.amountPaid || 0).toLocaleString('ru-RU') }} so'm
              </div>
              <div
                class="rounded-lg bg-amber-50 px-3 py-2 text-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
              >
                Kutilmoqda: {{ contractHistorySummary.pending || 0 }} ta
              </div>
              <BaseButton
                small
                outline
                :icon="mdiFileExcelBox"
                label="XLSX"
                :disabled="contractHistoryModal.loading || !contractHistoryModal.items.length"
                @click="downloadContractHistory"
              />
            </div>
          </div>
          <div v-if="contractHistoryModal.loading" class="py-6 text-center text-sm text-gray-500">
            Yuklanmoqda...
          </div>
          <div v-else class="overflow-x-auto">
            <table class="mt-4 w-full text-sm">
              <thead>
                <tr>
                  <th class="px-2 py-1 text-left">Sana</th>
                  <th class="px-2 py-1 text-left">Summasi</th>
                  <th class="px-2 py-1 text-left">Holat</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!contractHistoryModal.items.length">
                  <td colspan="3" class="px-2 py-4 text-center text-gray-500">Tarix topilmadi</td>
                </tr>
                <tr v-for="tx in contractHistoryModal.items" :key="tx.id">
                  <td class="px-2 py-1">{{ formatTashkentDate(tx.createdAt) || '-' }}</td>
                  <td class="px-2 py-1">{{ tx.amount ?? '-' }}</td>
                  <td class="px-2 py-1">
                    <span :class="tx.status === 'PAID' ? 'text-green-600' : 'text-amber-600'">
                      {{ tx.status }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </CardBoxModal>
      <CardBoxModal
        v-model="qrModal.open"
        button="info"
        button-label="Yopish"
        :confirm-disabled="qrModal.loading"
        :has-cancel="false"
        title="QR orqali to'lov"
      >
        <template v-if="!qrModal.options.length">
          <div class="text-sm text-gray-500">To'lov havolasi topilmadi</div>
        </template>
        <template v-else>
          <div class="flex flex-wrap gap-2">
            <BaseButton
              v-for="option in qrModal.options"
              :key="option.type"
              :label="option.label"
              :color="qrModal.provider === option.type ? 'success' : 'info'"
              small
              outline
              @click="selectQrProvider(option.type)"
            />
          </div>
          <div v-if="qrModal.loading" class="py-6 text-center text-sm text-gray-500">
            QR tayyorlanmoqda...
          </div>
          <div v-else class="flex flex-col items-center gap-3 pt-4">
            <img
              v-if="qrModal.qrData"
              :src="qrModal.qrData"
              alt="QR Code"
              class="h-48 w-48 rounded-lg border border-gray-200 p-2"
            />
            <div class="text-center text-xs break-all text-gray-600">{{ qrModal.link }}</div>
            <BaseButton
              color="success"
              small
              label="Havolani ochish"
              :href="qrModal.link"
              target="_blank"
            />
          </div>
        </template>
      </CardBoxModal>
      <CardBoxModal
        v-model="showForm"
        has-cancel
        :close-on-confirm="false"
        :confirm-disabled="loading"
        button="success"
        :button-label="loading ? 'Saqlanmoqda...' : editingId ? 'Saqlash' : 'Yaratish'"
        :title="editingId ? 'Shartnomani tahrirlash' : 'Shartnoma yaratish'"
        @confirm="submitForm"
        @cancel="showForm = false"
      >
        <form class="grid gap-4 md:grid-cols-2" @submit.prevent="submitForm">
          <FormField label="Ega">
            <div class="relative">
              <FormControl
                v-model="ownerSearch"
                placeholder="Qidirish: ism, STIR, tel"
                @focus="fetchOwnerOptions(ownerSearch?.trim() || '')"
              />
              <div
                v-if="ownerOptions.length && ownerSearch"
                class="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-gray-300 bg-white shadow dark:border-gray-700 dark:bg-gray-900"
              >
                <div
                  v-for="o in ownerOptions"
                  :key="o.id"
                  class="cursor-pointer px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                  @click="selectOwner(o)"
                >
                  {{ o.fullName }} ({{ o.tin }})
                  <span class="text-xs text-gray-500">{{ o.phone || '' }}</span>
                </div>
                <div v-if="!ownerOptions.length" class="px-3 py-2 text-sm text-gray-500">
                  Natija yo'q
                </div>
              </div>
            </div>
            <div v-if="form.ownerId" class="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Tanlangan: {{ ownerSearch }}
              <BaseButton
                small
                outline
                color="info"
                label="Tozalash"
                class="ml-2"
                @click="clearOwner"
              />
            </div>
          </FormField>
          <FormField label="Do'kon">
            <div class="relative">
              <FormControl
                v-model="storeSearch"
                placeholder="Qidirish: raqam yoki izoh"
                @focus="fetchStoreOptions(storeSearch?.trim() || '')"
              />
              <div
                v-if="storeInfoMsg && storeSearch"
                class="mt-1 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"
              >
                {{ storeInfoMsg }}
              </div>
              <div
                v-if="storeOptions.length && storeSearch"
                class="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-gray-300 bg-white shadow dark:border-gray-700 dark:bg-gray-900"
              >
                <div
                  v-for="s in storeOptions"
                  :key="s.id"
                  class="cursor-pointer px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                  @click="selectStore(s)"
                >
                  {{ s.storeNumber }}
                  <span class="text-xs text-gray-500">{{ s.description || '' }}</span>
                </div>
                <div v-if="!storeOptions.length" class="px-3 py-2 text-sm text-gray-500">
                  Natija yo'q
                </div>
              </div>
            </div>
            <div v-if="form.storeId" class="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Tanlangan: {{ storeSearch }}
              <BaseButton
                small
                outline
                color="info"
                label="Tozalash"
                class="ml-2"
                @click="clearStore"
              />
            </div>
          </FormField>
          <FormField label="Oylik to'lov">
            <FormControl
              v-model="form.shopMonthlyFee"
              type="number"
              min="0"
              step="0.01"
              placeholder="Masalan: 500000"
            />
          </FormField>
          <FormField label="Guvohnoma raqami">
            <FormControl v-model="form.certificateNumber" placeholder="Masalan: C-001" />
          </FormField>
          <FormField label="Berilgan sana">
            <FormControl v-model="form.issueDate" type="date" />
          </FormField>
          <FormField label="Tugash sanasi">
            <FormControl v-model="form.expiryDate" type="date" />
          </FormField>
          <FormField label="Faol">
            <input type="checkbox" v-model="form.isActive" class="h-5 w-5" />
          </FormField>
          <button type="submit" class="hidden" />
        </form>
      </CardBoxModal>
    </SectionMain>
  </LayoutAuthenticated>
</template>
