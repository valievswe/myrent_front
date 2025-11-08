<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import PaginationControls from '@/components/PaginationControls.vue'
import { listContracts } from '@/services/contracts'
import { formatTashkentDate, parseTashkentDate, startOfTashkentDay } from '@/utils/time'

const items = ref([])
const loading = ref(false)
const errorMsg = ref('')
const search = ref('')
const statusFilter = ref('all')
const page = ref(1)
const limit = ref(15)
const total = ref(0)
const expandedId = ref(null)

const statusOptions = [
  { value: 'all', label: 'Barchasi' },
  { value: 'active', label: 'Faol' },
  { value: 'inactive', label: 'Arxiv' },
]

const pageStats = computed(() => {
  const active = items.value.filter((c) => c.isActive !== false).length
  const archived = Math.max(0, items.value.length - active)
  return {
    active,
    archived,
    count: items.value.length,
  }
})

function formatDate(value) {
  return formatTashkentDate(value) || '-'
}

function statusLabel(item) {
  if (item.isActive === false) return 'Arxiv'
  const today = startOfTashkentDay() || new Date()
  const expiry = parseTashkentDate(item.expiryDate)
  if (expiry && expiry < today) return 'Muddat tugagan'
  return 'Faol'
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id
}

async function fetchData() {
  loading.value = true
  errorMsg.value = ''
  try {
    const params = {
      page: page.value,
      limit: limit.value,
    }
    const q = search.value.trim()
    if (q) params.search = q
    if (statusFilter.value === 'active') params.isActive = true
    else if (statusFilter.value === 'inactive') params.isActive = false

    const res = await listContracts(params)
    items.value = res.data || []
    total.value = Number(res.pagination?.total ?? res.meta?.total ?? items.value.length)
    const maxPage = Math.max(1, Math.ceil(total.value / (limit.value || 1)))
    if (page.value > maxPage) {
      suppressPaginationFetch = true
      page.value = maxPage
      suppressPaginationFetch = false
    }
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Yuklashda xatolik'
  } finally {
    loading.value = false
  }
}

let searchDebounceId = null
let suppressPaginationFetch = false

watch(search, () => {
  if (searchDebounceId) clearTimeout(searchDebounceId)
  searchDebounceId = setTimeout(() => {
    suppressPaginationFetch = true
    page.value = 1
    fetchData().finally(() => {
      suppressPaginationFetch = false
    })
  }, 300)
})

watch(statusFilter, () => {
  suppressPaginationFetch = true
  page.value = 1
  fetchData().finally(() => {
    suppressPaginationFetch = false
  })
})

watch([page, limit], () => {
  if (suppressPaginationFetch) return
  fetchData()
})

onMounted(fetchData)
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain wide>
      <SectionTitle first>Ijara shartnomalari</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>

      <CardBox class="mb-4">
        <div class="grid gap-4 md:grid-cols-3">
          <FormField label="Qidirish">
            <FormControl v-model="search" placeholder="Tadbirkor, do'kon yoki hujjat raqami" />
          </FormField>
          <FormField label="Holati">
            <select
              v-model="statusFilter"
              class="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </FormField>
          <div class="flex items-end justify-end">
            <BaseButton color="info" :disabled="loading" label="Yangilash" @click="fetchData" />
          </div>
        </div>
        <div class="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div class="rounded border border-slate-200 px-3 py-2 dark:border-slate-700">
            <div class="text-xs uppercase text-slate-500">Sahifadagi jami</div>
            <div class="text-lg font-semibold">{{ pageStats.count }}</div>
          </div>
          <div class="rounded border border-slate-200 px-3 py-2 dark:border-slate-700">
            <div class="text-xs uppercase text-slate-500">Faol</div>
            <div class="text-lg font-semibold text-emerald-600">{{ pageStats.active }}</div>
          </div>
          <div class="rounded border border-slate-200 px-3 py-2 dark:border-slate-700">
            <div class="text-xs uppercase text-slate-500">Arxiv</div>
            <div class="text-lg font-semibold text-amber-600">{{ pageStats.archived }}</div>
          </div>
        </div>
      </CardBox>

      <CardBox has-table>
        <div class="overflow-x-auto">
          <table class="w-full table-auto">
            <thead>
              <tr>
                <th class="px-4 py-2 text-left">Shartnoma</th>
                <th class="px-4 py-2 text-left">Tadbirkor</th>
                <th class="px-4 py-2 text-left">Do'kon</th>
                <th class="px-4 py-2 text-left">Muddat</th>
                <th class="px-4 py-2 text-left">Oylik to'lov</th>
                <th class="px-4 py-2 text-left">Holati</th>
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
              <template v-else>
                <template v-for="contract in items" :key="contract.id">
                  <tr
                    class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td class="px-4 py-2">
                      <div class="font-semibold">#{{ contract.id }}</div>
                      <div class="text-xs text-slate-500">
                        {{ contract.certificateNumber || '—' }}
                      </div>
                  </td>
                  <td class="px-4 py-2">
                    <div class="font-semibold">
                      {{ contract.owner?.fullName || contract.ownerName || '—' }}
                    </div>
                    <div class="text-xs text-slate-500">{{ contract.owner?.tin || contract.ownerTin || '' }}</div>
                  </td>
                  <td class="px-4 py-2">
                    <div>{{ contract.store?.storeNumber || `Do'kon #${contract.storeId}` }}</div>
                    <div class="text-xs text-slate-500">{{ contract.store?.description || '' }}</div>
                  </td>
                  <td class="px-4 py-2">
                    <div>{{ formatDate(contract.issueDate) }} → {{ formatDate(contract.expiryDate) }}</div>
                    <div class="text-xs text-slate-500">
                      {{ contract.termType || '' }}
                    </div>
                  </td>
                  <td class="px-4 py-2">
                    {{ contract.shopMonthlyFee ? `${Number(contract.shopMonthlyFee).toLocaleString()} so'm` : '—' }}
                  </td>
                  <td class="px-4 py-2">
                    <span
                      :class="[
                        'rounded-full px-3 py-1 text-xs font-semibold',
                        contract.isActive === false
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700',
                      ]"
                    >
                      {{ statusLabel(contract) }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-right">
                    <BaseButton
                      small
                      outline
                      :label="expandedId === contract.id ? 'Yopish' : 'Batafsil'"
                      @click="toggleExpand(contract.id)"
                    />
                  </td>
                </tr>
                  <tr
                    v-if="expandedId === contract.id"
                    :key="`details-${contract.id}`"
                    class="bg-slate-50 text-sm dark:bg-slate-800/70"
                  >
                    <td colspan="7" class="px-4 py-3">
                      <div class="flex flex-wrap gap-6">
                        <div>
                          <div class="text-xs font-semibold uppercase text-slate-500">Boshlanishi</div>
                          <div>{{ formatDate(contract.issueDate) }}</div>
                        </div>
                        <div>
                          <div class="text-xs font-semibold uppercase text-slate-500">Yakunlanish</div>
                          <div>{{ formatDate(contract.expiryDate) }}</div>
                        </div>
                        <div>
                          <div class="text-xs font-semibold uppercase text-slate-500">To'lov davriyligi</div>
                          <div>{{ contract.paymentFrequency || '—' }}</div>
                        </div>
                        <div>
                          <div class="text-xs font-semibold uppercase text-slate-500">Telefon</div>
                          <div>{{ contract.owner?.phoneNumber || '—' }}</div>
                        </div>
                        <div>
                          <div class="text-xs font-semibold uppercase text-slate-500">Izoh</div>
                          <div>{{ contract.description || '—' }}</div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </template>
            </tbody>
          </table>
        </div>

        <PaginationControls
          v-model:page="page"
          v-model:limit="limit"
          :total="total"
          :disabled="loading"
          :limit-options="[15, 30, 50, 100]"
        />
      </CardBox>
    </SectionMain>
  </LayoutAuthenticated>
</template>
