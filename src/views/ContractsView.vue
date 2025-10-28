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

const items = ref([])
const loading = ref(false)
const errorMsg = ref('')
const page = ref(1)
const limit = ref(10)
const total = ref(0)

const owners = ref([])
const stores = ref([])
const ownerSearch = ref('')
const storeSearch = ref('')
const ownerOptions = ref([])
const storeOptions = ref([])

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

async function fetchData() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await listContracts({ page: page.value, limit: limit.value })
    items.value = res.data
    total.value = res.pagination?.total ?? items.value.length
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Yuklashda xatolik'
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
    const s = await listStores({ page: 1, limit: 100, withContracts: true })
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
  if (!confirm("Haqiqatan o'chirmoqchimisiz?")) return
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

onMounted(async () => {
  await preloadRefs()
  await fetchData()
  // Preload options for search selects
  try { await fetchOwnerOptions(ownerSearch.value?.trim() || '') } catch {}
  try { await fetchStoreOptions(storeSearch.value?.trim() || '') } catch {}
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
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitle first>Shartnomalar (Ega - Do'kon)</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>

      <CardBox class="mb-4">
        <div class="flex items-center justify-end">
          <BaseButton color="success" :disabled="loading" label="Yaratish" @click="openCreate" />
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
                <td colspan="7" class="px-4 py-6 text-center">Yuklanmoqda...</td>
              </tr>
              <tr v-else-if="!items.length">
                <td colspan="7" class="px-4 py-6 text-center">Ma'lumot topilmadi</td>
              </tr>
              <tr
                v-for="it in items"
                :key="it.id"
                class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <td class="px-4 py-2">
                  {{ owners.find((o) => o.id === it.ownerId)?.fullName || it.ownerId }}
                </td>
                <td class="px-4 py-2">
                  {{ stores.find((s) => s.id === it.storeId)?.storeNumber || it.storeId }}
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
                <td class="px-4 py-2 text-right">
                  <BaseButton color="success" small outline label="To'lov" class="mr-2"
                    :disabled="!it?.store?.click_payment_url"
                    @click="openPayment(it?.store?.click_payment_url)" />
                  <BaseButton color="info" small label="Tahrirlash" @click="openEdit(it)" />
                  <BaseButton
                    color="danger"
                    small
                    outline
                    label="O'chirish"
                    class="ml-2"
                    @click="removeItem(it.id)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between px-4 py-3">
          <div>Jami: {{ total }}</div>
          <div class="flex items-center gap-2">
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
