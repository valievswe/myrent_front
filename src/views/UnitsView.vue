<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import FilterToolbar from '@/components/FilterToolbar.vue'
import { listStores } from '@/services/stores'
import { listSections } from '@/services/sections'
import { isContractActive } from '@/utils/contracts'

const loading = ref(false)
const errorMsg = ref('')
const stores = ref([])
const sections = ref([])

const search = ref('')
const sectionFilter = ref('all')
const occupancyFilter = ref('all')
const statusFilter = ref('all')
const minArea = ref('')
const maxArea = ref('')

const page = ref(1)
const limit = ref(12)
const total = ref(0)
const hasNextPage = computed(() => page.value * limit.value < total.value)
const hasPrevPage = computed(() => page.value > 1)

function latestContract(store) {
  return (store.contracts || [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.issueDate || b.createdAt || 0).getTime() -
        new Date(a.issueDate || a.createdAt || 0).getTime(),
    )[0] || null
}

function contractStatus(contract) {
  if (!contract) return 'free'
  if (contract.isActive === false) return 'inactive'

  if (!contract.expiryDate) {
    return isContractActive(contract) ? 'occupied' : 'free'
  }

  const diff = Math.floor(
    (new Date(contract.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
  )
  if (diff < 0) return 'expired'
  if (diff <= 14) return 'expiring'

  return 'occupied'
}

const filteredStores = computed(() => {
  return (stores.value || []).filter((store) => {
    const contract = latestContract(store)
    const status = contractStatus(contract)

    if (occupancyFilter.value === 'free' && status !== 'free') return false
    if (occupancyFilter.value === 'occupied' && status === 'free') return false

    if (statusFilter.value === 'expiring' && status !== 'expiring') return false
    if (statusFilter.value === 'expired' && status !== 'expired') return false
    if (statusFilter.value === 'inactive' && status !== 'inactive') return false

    if (sectionFilter.value !== 'all' && Number(store.sectionId) !== Number(sectionFilter.value)) return false

    const min = Number(minArea.value) || null
    const max = Number(maxArea.value) || null
    if (min !== null && Number(store.area) < min) return false
    if (max !== null && Number(store.area) > max) return false

    return true
  })
})

async function fetchStores() {
  loading.value = true
  errorMsg.value = ''
  try {
    const onlyFree = occupancyFilter.value === 'free'
    const res = await listStores({
      search: search.value,
      page: page.value,
      limit: limit.value,
      withContracts: true,
      onlyFree,
    })
    stores.value = res.data || []
    total.value = res.total ?? res.pagination?.total ?? stores.value.length
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Yuklashda xatolik'
  } finally {
    loading.value = false
  }
}

async function preload() {
  try {
    sections.value = await listSections()
  } catch (e) {
    console.error(e)
  }
}

function resetFilters() {
  sectionFilter.value = 'all'
  occupancyFilter.value = 'all'
  statusFilter.value = 'all'
  minArea.value = ''
  maxArea.value = ''
  fetchStores()
}

let debounceId
watch(search, () => {
  page.value = 1
  if (debounceId) clearTimeout(debounceId)
  debounceId = setTimeout(() => {
    fetchStores()
  }, 300)
})

watch([page, limit], () => {
  fetchStores()
})

watch(occupancyFilter, () => {
  page.value = 1
  fetchStores()
})

onMounted(async () => {
  await preload()
  await fetchStores()
})
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitle first>Do'kon va bo'limlar holati</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>

      <CardBox class="mb-4">
        <FilterToolbar>
          <FormField label="Qidirish" class="min-w-[220px]">
            <FormControl v-model="search" placeholder="Do'kon raqami yoki izoh" />
          </FormField>

          <FormField label="Bo'lim" class="min-w-[200px]">
            <select
              v-model="sectionFilter"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="all">Barchasi</option>
              <option v-for="s in sections" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </FormField>

          <FormField label="Bandlik" class="min-w-[180px]">
            <select
              v-model="occupancyFilter"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="all">Barchasi</option>
              <option value="occupied">Band</option>
              <option value="free">Bo'sh</option>
            </select>
          </FormField>

          <FormField label="Shartnoma holati" class="min-w-[200px]">
            <select
              v-model="statusFilter"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="all">Barchasi</option>
              <option value="expiring">Muddati tugash arafasida</option>
              <option value="expired">Muddati tugagan</option>
              <option value="inactive">Arxivlangan</option>
            </select>
          </FormField>

          <FormField label="Maydon (min)" class="w-32">
            <FormControl v-model="minArea" type="number" min="0" step="0.1" />
          </FormField>

          <FormField label="Maydon (max)" class="w-32">
            <FormControl v-model="maxArea" type="number" min="0" step="0.1" />
          </FormField>

          <template #actions>
            <BaseButton outline color="info" label="Filtrlarni tozalash" @click="resetFilters" />
          </template>
        </FilterToolbar>
      </CardBox>

      <CardBox>
        <div v-if="loading" class="py-24 text-center text-sm text-gray-500">Yuklanmoqda...</div>
        <template v-else>
          <div v-if="!filteredStores.length" class="py-24 text-center text-sm text-gray-500">
            Ma'lumot topilmadi
          </div>
          <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div
              v-for="store in filteredStores"
              :key="store.id"
              class="rounded-lg border border-gray-200 p-4 shadow-sm transition hover:border-primary-400 dark:border-gray-700 dark:hover:border-primary-500"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-xs text-gray-500">Do'kon</div>
                  <div class="text-xl font-semibold">{{ store.storeNumber }}</div>
                </div>
                <span
                  :class="[
                    'rounded-full px-3 py-1 text-xs font-semibold',
                    contractStatus(latestContract(store)) === 'occupied'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                      : contractStatus(latestContract(store)) === 'expiring'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        : contractStatus(latestContract(store)) === 'expired'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          : contractStatus(latestContract(store)) === 'inactive'
                            ? 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                  ]"
                >
                  {{
                    contractStatus(latestContract(store)) === 'occupied'
                      ? 'Faol'
                      : contractStatus(latestContract(store)) === 'expiring'
                        ? 'Tugash arafasida'
                        : contractStatus(latestContract(store)) === 'expired'
                          ? 'Muddati tugagan'
                          : contractStatus(latestContract(store)) === 'inactive'
                            ? 'Arxivlangan'
                          : "Bo'sh"
                  }}
                </span>
              </div>

              <dl class="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <div class="flex justify-between">
                  <dt>Maydon</dt>
                  <dd>{{ store.area }} m²</dd>
                </div>
                <div class="flex justify-between">
                  <dt>Bo'lim</dt>
                  <dd>{{ sections.find((s) => s.id === store.sectionId)?.name || '-' }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt>Izoh</dt>
                  <dd class="max-w-[180px] text-right text-xs text-gray-500">
                    {{ store.description || '-' }}
                  </dd>
                </div>
              </dl>

              <div class="mt-4 rounded border border-dashed border-gray-200 p-3 text-sm dark:border-gray-700">
                <template v-if="latestContract(store)">
                  <div class="font-semibold text-gray-700 dark:text-gray-200">
                    {{ latestContract(store)?.owner?.fullName || '—' }}
                  </div>
                  <div class="text-xs text-gray-500">
                    {{ latestContract(store)?.owner?.phoneNumber || '' }}
                  </div>
                  <div class="mt-2 text-xs text-gray-500">
                    {{ latestContract(store)?.issueDate?.substring(0, 10) || '-' }} —
                    {{ latestContract(store)?.expiryDate?.substring(0, 10) || '-' }}
                  </div>
                  <div class="mt-1 text-xs text-gray-500">
                    Oylik: {{ latestContract(store)?.shopMonthlyFee ?? '—' }}
                  </div>
                </template>
                <template v-else>
                  <div class="text-sm text-gray-500">Shartnoma mavjud emas.</div>
                  <div class="mt-1 text-xs text-gray-400">
                    Bo'sh joyga tezda shartnoma tuzish uchun Tadbirkorlar bo'limidan foydalaning.
                  </div>
                </template>
              </div>
            </div>
          </div>
        </template>

        <div class="mt-6 flex items-center justify-between">
          <div>
            Jami (sahifada): {{ filteredStores.length }}
            <span v-if="total"> • Barcha do'konlar: {{ total }}</span>
          </div>
          <div class="flex items-center gap-2">
            <BaseButton :disabled="!hasPrevPage || loading" label="Oldingi" @click="page--" />
            <span>Sahifa {{ page }}</span>
            <BaseButton :disabled="!hasNextPage || loading" label="Keyingi" @click="page++" />
          </div>
        </div>
      </CardBox>
    </SectionMain>
  </LayoutAuthenticated>
</template>
