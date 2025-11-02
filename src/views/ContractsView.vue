<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import { listContracts, createContract, updateContract, deleteContract } from '@/services/contracts'
import { listOwners } from '@/services/owners'
import { listStores } from '@/services/stores'
import { downloadCSV } from '../utils/export'

const items = ref([])
const loading = ref(false)
const errorMsg = ref('')
const page = ref(1)
const limit = ref(10)
const total = ref(0)
const statusFilter = ref('active')

const owners = ref([])
const stores = ref([])
const ownerSearch = ref('')
const storeSearch = ref('')
const ownerOptions = ref([])
const storeOptions = ref([])
const storeInfoMsg = ref('')

const SEARCH_MIN_LENGTH = 2
const searchTerm = ref('')
const searchResults = ref(null)

const searchActive = computed(() => (searchTerm.value || '').trim().length >= SEARCH_MIN_LENGTH)
const displayItems = computed(() => (searchActive.value ? searchResults.value || [] : items.value))
const displayTotal = computed(() => (searchActive.value ? displayItems.value.length : total.value))
const showShortSearchHint = computed(() => {
  const len = (searchTerm.value || '').trim().length
  return len > 0 && len < SEARCH_MIN_LENGTH
})

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

function openPayment(url) {
  const href = url || ''
  if (!href) return
  try {
    const target = typeof window !== 'undefined' ? window : globalThis
    if (target && typeof target.open === 'function') {
      target.open(href, '_blank', 'noopener')
    }
  } catch (e) {
    console.error('Failed to open payment url', e)
  }
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

async function fetchData() {
  loading.value = true
  errorMsg.value = ''
  try {
    const isActive = statusFilter.value === 'all' ? undefined : statusFilter.value === 'active'
    const res = await listContracts({ page: page.value, limit: limit.value, isActive })
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
    let pageCursor = 1
    let totalAvailable = Infinity

    while (pageCursor <= maxPages) {
      const res = await listContracts({ page: pageCursor, limit: chunkSize, isActive })
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
        owner.phone,
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
  } catch {}
  try {
    const s = await listStores({ page: 1, limit: 100, withContracts: true, onlyFree: false })
    stores.value = s.data
  } catch {}
}

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
  editingId.value = it.id
  form.value = {
    ownerId: it.ownerId ?? null,
    storeId: it.storeId ?? null,
    shopMonthlyFee: it.shopMonthlyFee ?? null,
    certificateNumber: it.certificateNumber || '',
    issueDate: it.issueDate ? it.issueDate.substring(0, 10) : '',
    expiryDate: it.expiryDate ? it.expiryDate.substring(0, 10) : '',
    isActive: typeof it.isActive === 'boolean' ? it.isActive : true,
  }
  showForm.value = true
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
    // refresh store options to reflect occupancy changes
    try {
      await fetchStoreOptions(storeSearch.value?.trim() || '')
    } catch {}
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || e.message || 'Saqlashda xatolik'
  } finally {
    loading.value = false
  }
}

async function removeItem(id) {
  if (!confirm("Shartnomani arxivga yuborilsinmi?")) return
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

onMounted(async () => {
  await preloadRefs()
  await fetchData()
  // Preload options for search selects
  try { await fetchOwnerOptions(ownerSearch.value?.trim() || '') } catch {}
  try { await fetchStoreOptions(storeSearch.value?.trim() || '') } catch {}
})
watch(statusFilter, async () => {
  page.value = 1
  if (searchActive.value) await runSearch()
  else await fetchData()
})


function isStoreOccupied(s) {
  if (typeof s?.isOccupied === 'boolean') return s.isOccupied
  if (!s?.contracts || !Array.isArray(s.contracts)) return false
  const today = new Date()
  return s.contracts.some((c) => {
    const active = c.isActive !== false
    const startOk = !c.issueDate || new Date(c.issueDate) <= today
    const endOk = !c.expiryDate || new Date(c.expiryDate) >= today
    return active && startOk && endOk
  })
}
let ownerDebounceId
let storeDebounceId
async function fetchOwnerOptions(q) {
  try {
    const res = await listOwners({ search: q, page: 1, limit: 20 })
    ownerOptions.value = res.data
  } catch {}
}
async function fetchStoreOptions(q) {
  try {
    const res = await listStores({ search: q, page: 1, limit: 20, onlyFree: true })
    storeOptions.value = res.data || []
    const qq = (q || '').toLowerCase()
    const occupiedMatches = (stores.value || []).filter(
      (s) => isStoreOccupied(s) && ((s.storeNumber || '').toLowerCase().includes(qq) || (s.description || '').toLowerCase().includes(qq)),
    )
    if (qq && occupiedMatches.length) {
      const nums = occupiedMatches.slice(0, 3).map((s) => s.storeNumber || s.id).join(', ')
      const more = occupiedMatches.length > 3 ? ` va yana ${occupiedMatches.length - 3} ta` : ''
      storeInfoMsg.value = `Qidiruvga mos do'kon(lar) band: ${nums}${more}`
    } else {
      storeInfoMsg.value = ''
    }
  } catch {}
}

watch(ownerSearch, (q) => {
  if (ownerDebounceId) clearTimeout(ownerDebounceId)
  ownerDebounceId = setTimeout(() => fetchOwnerOptions(q?.trim() || ''), 250)
})
watch(storeSearch, (q) => {
  if (storeDebounceId) clearTimeout(storeDebounceId)
  storeDebounceId = setTimeout(() => fetchStoreOptions(q?.trim() || ''), 250)
})

let searchDebounceId
watch(searchTerm, (q) => {
  if (searchDebounceId) clearTimeout(searchDebounceId)
  searchDebounceId = setTimeout(() => {
    const term = (q || '').trim()
    if (term.length >= SEARCH_MIN_LENGTH) runSearch()
    else searchResults.value = null
  }, 300)
})

const filteredStores = computed(() => {
  const q = storeSearch.value.trim().toLowerCase()
  const list = (stores.value || []).filter((s) => !isStoreOccupied(s))
  if (!q) return list
  return list.filter(
    (s) =>
      (s.storeNumber || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q),
  )
})

async function exportContractsCSV() {
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
      "Tranzaksiya soni",
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
        const last = paid.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
        const totalPaid = paid.reduce((sum, t) => sum + Number((t.amount && t.amount.toString()) || 0), 0)
        rows.push([
          c.id,
          c.owner?.fullName || c.ownerId,
          c.store?.storeNumber || c.storeId,
          c.shopMonthlyFee ?? '',
          c.issueDate ? c.issueDate.substring(0, 10) : '',
          c.expiryDate ? c.expiryDate.substring(0, 10) : '',
          c.isActive ? 'Ha' : "Yo'q",
          tx.length,
          last?.createdAt ? last.createdAt.substring(0, 10) : '',
          totalPaid,
        ])
      }
      if (arr.length < 100) break
      p++
    }
    downloadCSV(`contracts_${new Date().toISOString().substring(0,10)}.csv`, headers, rows)
  } finally {
    loading.value = false
  }
}

async function exportContractTransactionsCSV() {
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
        for (const t of (c.transactions || [])) {
          rows.push([
            c.id,
            c.owner?.fullName || c.ownerId,
            c.store?.storeNumber || c.storeId,
            t.createdAt ? t.createdAt.substring(0, 10) : '',
            t.amount ?? '',
            t.status,
          ])
        }
      }
      if (arr.length < 100) break
      p++
    }
    downloadCSV(`contract_transactions_${new Date().toISOString().substring(0,10)}.csv`, headers, rows)
  } finally {
    loading.value = false
  }
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
          <div class="flex flex-wrap gap-3 items-end">
            <FormField label="Holati">
              <select v-model="statusFilter" class="rounded border px-2 py-1 text-sm dark:bg-gray-900 dark:text-gray-100">
                <option value="active">Faol</option>
                <option value="archived">Arxivlangan</option>
                <option value="all">Barchasi</option>
              </select>
            </FormField>
            <FormField label="Qidirish (kamida 2 belgi)">
              <div class="space-y-1">
                <FormControl
                  v-model="searchTerm"
                  placeholder="Ega, do'kon, guvohnoma yoki STIR"
                />
                <div v-if="showShortSearchHint" class="text-xs text-gray-500">
                  Kamida {{ SEARCH_MIN_LENGTH }} ta belgi kiriting
                </div>
              </div>
            </FormField>
            <BaseButton color="info" outline :disabled="loading" label="Eksport (Shartnomalar)" @click="exportContractsCSV" />
            <BaseButton color="info" outline :disabled="loading" label="Eksport (Tranzaksiyalar)" @click="exportContractTransactionsCSV" />
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
                <th class="px-4 py-2 text-left">Ega</th>
                <th class="px-4 py-2 text-left">Do'kon</th>
                <th class="px-4 py-2 text-left">Oylik to'lov</th>
                <th class="px-4 py-2 text-left">Berilgan</th>
                <th class="px-4 py-2 text-left">Muddati</th>
                <th class="px-4 py-2 text-left">Holati</th>
                <th class="px-4 py-2 text-left">To'lov</th>
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
                  <td class="px-4 py-2">
                    {{ it.owner?.fullName || owners.find((o) => o.id === it.ownerId)?.fullName || it.ownerId }}
                  </td>
                  <td class="px-4 py-2">
                    {{ it.store?.storeNumber || stores.find((s) => s.id === it.storeId)?.storeNumber || it.storeId }}
                  </td>
                  <td class="px-4 py-2">{{ it.shopMonthlyFee }}</td>
                  <td class="px-4 py-2">{{ it.issueDate ? it.issueDate.substring(0, 10) : '-' }}</td>
                  <td class="px-4 py-2">
                    {{ it.expiryDate ? it.expiryDate.substring(0, 10) : '-' }}
                  </td>
                  <td class="px-4 py-2">{{ it.isActive ? 'Faol' : 'Faol emas' }}</td>
                  <td class="px-4 py-2">
                    <span :class="(it.transactions || []).some(t => t.status === 'PAID') ? 'text-green-600' : 'text-red-600'">
                      {{ (it.transactions || []).some(t => t.status === 'PAID') ? "To'langan" : 'Kutilmoqda' }}
                    </span>
                  </td>
                  <td class="px-4 py-2">
                    <div class="flex flex-wrap justify-end gap-2">
                      <BaseButton
                        color="success"
                        small
                        outline
                        label="To'lov"
                        :disabled="!getPaymentUrl(it) || !it.isActive"
                        @click="openPayment(getPaymentUrl(it))"
                      />
                      <BaseButton color="info" small label="Tahrirlash" @click="openEdit(it)" />
                      <BaseButton
                        color="info"
                        small
                        outline
                        label="Tarix"
                        @click="it._showHistory = !it._showHistory"
                      />
                      <template v-if="it.isActive">
                        <BaseButton
                          color="warning"
                          small
                          outline
                          label="Arxivlash"
                          @click="removeItem(it.id)"
                        />
                      </template>
                      <template v-else>
                        <BaseButton
                          color="success"
                          small
                          outline
                          label="Tiklash"
                          @click="restoreItem(it.id)"
                        />
                      </template>
                    </div>
                  </td>
                </tr>
                <tr v-if="it._showHistory" class="bg-gray-50 dark:bg-gray-800/50">
                  <td colspan="8" class="px-4 py-2">
                    <div class="text-sm font-medium mb-2">To'lov tarixi</div>
                    <div v-if="!(it.transactions || []).length" class="text-xs text-gray-500">Tarix yo'q</div>
                    <div v-else class="overflow-x-auto">
                      <table class="w-full text-sm">
                        <thead>
                          <tr>
                            <th class="px-2 py-1 text-left">Sana</th>
                            <th class="px-2 py-1 text-left">Summasi</th>
                            <th class="px-2 py-1 text-left">Holat</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="t in (it.transactions || []).slice().sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))" :key="t.id">
                            <td class="px-2 py-1">{{ t.createdAt ? t.createdAt.substring(0,10) : '-' }}</td>
                            <td class="px-2 py-1">{{ t.amount }}</td>
                            <td class="px-2 py-1">
                              <span :class="t.status === 'PAID' ? 'text-green-600' : 'text-red-600'">{{ t.status }}</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between px-4 py-3">
          <div>Jami: {{ displayTotal }}</div>
          <div v-if="searchActive" class="text-sm text-gray-600 dark:text-gray-300">
            Qidiruv natijalari ko'rsatilmoqda
          </div>
          <div v-else class="flex items-center gap-2">
            <BaseButton
              :disabled="page <= 1 || loading"
              label="Oldingi"
              @click="(page--, fetchData())"
            />
            <span>Sahifa {{ page }}</span>
            <BaseButton
              :disabled="items.length < limit || loading"
              label="Keyingi"
              @click="(page++, fetchData())"
            />
          </div>
        </div>
      </CardBox>

      <CardBox v-if="showForm" class="mt-4" is-form @submit.prevent="submitForm">
        <SectionTitle>{{
          editingId ? 'Shartnomani tahrirlash' : 'Shartnoma yaratish'
        }}</SectionTitle>
        <div class="grid gap-4 md:grid-cols-2">
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
                  {{ o.fullName }} ({{ o.tin }}) <span class="text-xs text-gray-500">{{ o.phone || '' }}</span>
                </div>
                <div v-if="!ownerOptions.length" class="px-3 py-2 text-sm text-gray-500">Natija yo'q</div>
              </div>
            </div>
            <div v-if="form.ownerId" class="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Tanlangan: {{ ownerSearch }}
              <BaseButton small outline color="info" label="Tozalash" class="ml-2" @click="clearOwner" />
            </div>
          </FormField>
          <FormField label="Do'kon">
            <div class="relative">
              <FormControl
                v-model="storeSearch"
                placeholder="Qidirish: raqam yoki izoh"
                @focus="fetchStoreOptions(storeSearch?.trim() || '')"
              />
              <div v-if="storeInfoMsg && storeSearch" class="mt-1 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
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
                  {{ s.storeNumber }} <span class="text-xs text-gray-500">{{ s.description || '' }}</span>
                </div>
                <div v-if="!storeOptions.length" class="px-3 py-2 text-sm text-gray-500">Natija yo'q</div>
              </div>
            </div>
            <div v-if="form.storeId" class="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Tanlangan: {{ storeSearch }}
              <BaseButton small outline color="info" label="Tozalash" class="ml-2" @click="clearStore" />
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
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <BaseButton
              color="success"
              :disabled="loading"
              :label="editingId ? 'Saqlash' : 'Yaratish'"
              type="submit"
            />
            <BaseButton
              color="info"
              outline
              label="Bekor qilish"
              :disabled="loading"
              @click="showForm = false"
            />
          </div>
        </template>
      </CardBox>
    </SectionMain>
  </LayoutAuthenticated>
</template>
