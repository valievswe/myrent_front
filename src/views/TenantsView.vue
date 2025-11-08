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
import { listOwners } from '@/services/owners'
import { listSections } from '@/services/sections'
import { isContractActive } from '@/utils/contracts'
import { formatTashkentDate, parseTashkentDate, startOfTashkentDay } from '@/utils/time'

const loading = ref(false)
const errorMsg = ref('')
const owners = ref([])
const sections = ref([])

const search = ref('')
const sectionFilter = ref('all')
const statusFilter = ref('active')
const expiringWindow = ref(30)

const page = ref(1)
const limit = ref(10)
const total = ref(0)

const hasNextPage = computed(() => page.value * limit.value < total.value)
const hasPrevPage = computed(() => page.value > 1)

const statusOptions = computed(() => [
  { value: 'active', label: 'Faol' },
  { value: 'expiring', label: `Muddati ${expiringWindow.value} kunda tugaydi` },
  { value: 'expired', label: 'Muddati tugagan' },
  { value: 'inactive', label: 'Arxivlangan' },
  { value: 'all', label: 'Barchasi' },
])

function statusOf(contract) {
  if (!contract) return 'none'
  if (isContractActive(contract)) {
    if (!contract.expiryDate) return 'active'
    const diff = daysBetween(startOfTashkentDay() || new Date(), parseTashkentDate(contract.expiryDate))
    return diff >= 0 && diff <= Number(expiringWindow.value || 0) ? 'expiring' : 'active'
  }
  if (contract.isActive === false) return 'inactive'
  return 'expired'
}

function daysBetween(a, b) {
  if (!a || !b) return NaN
  const start = a instanceof Date ? a : parseTashkentDate(a)
  const end = b instanceof Date ? b : parseTashkentDate(b)
  if (!start || !end) return NaN
  const ms = end.getTime() - start.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

const flattenedContracts = computed(() => {
  const rows = []
  for (const owner of owners.value || []) {
    for (const contract of owner.contracts || []) {
      const store = contract.store || {}
      rows.push({
        id: `${owner.id}-${contract.id}`,
        owner,
        contract,
        store,
        status: statusOf(contract),
        daysLeft: contract.expiryDate
          ? daysBetween(startOfTashkentDay() || new Date(), parseTashkentDate(contract.expiryDate))
          : null,
        sectionName: sections.value.find((s) => s.id === store.sectionId)?.name || null,
      })
    }
    if (!(owner.contracts || []).length) {
      rows.push({
        id: `${owner.id}-empty`,
        owner,
        contract: null,
        store: {},
        status: 'none',
        daysLeft: null,
        sectionName: null,
      })
    }
  }
  return rows
})

const filteredRows = computed(() => {
  const rows = flattenedContracts.value.filter((row) => {
    if (statusFilter.value !== 'all') {
      if (statusFilter.value === 'expiring') {
        if (row.status !== 'expiring') return false
      } else if (row.status !== statusFilter.value) {
        return false
      }
    }

    if (sectionFilter.value !== 'all') {
      if (Number(row.store.sectionId) !== Number(sectionFilter.value)) return false
    }
    return true
  })
  return rows
})

async function fetchOwners() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await listOwners({ search: search.value, page: page.value, limit: limit.value })
    owners.value = res.data || []
    total.value = res.pagination?.total ?? owners.value.length
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
  statusFilter.value = 'active'
  sectionFilter.value = 'all'
  expiringWindow.value = 30
  fetchOwners()
}

let debounceId
watch(search, () => {
  page.value = 1
  if (debounceId) clearTimeout(debounceId)
  debounceId = setTimeout(() => {
    fetchOwners()
  }, 300)
})

watch([page, limit], () => {
  fetchOwners()
})

onMounted(async () => {
  await preload()
  await fetchOwners()
})
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitle first>Qarzdorlar / Ijarachilar</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>

      <CardBox class="mb-4">
        <FilterToolbar>
          <FormField label="Qidirish" class="min-w-[220px]">
            <FormControl
              v-model="search"
              placeholder="Ism, STIR yoki telefon"
            />
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

          <FormField label="Holati" class="min-w-[220px]">
            <select
              v-model="statusFilter"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </FormField>

          <FormField
            v-if="statusFilter === 'expiring'"
            label="Muddati tugashigacha (kun)"
            class="w-44"
          >
            <FormControl v-model.number="expiringWindow" type="number" min="1" max="180" />
          </FormField>

          <template #actions>
            <BaseButton outline color="info" label="Filtrlarni tozalash" @click="resetFilters" />
          </template>
        </FilterToolbar>
      </CardBox>

      <CardBox has-table>
        <div class="overflow-x-auto">
          <table class="w-full table-auto">
            <thead>
              <tr>
                <th class="px-4 py-2 text-left">Ijarachi</th>
                <th class="px-4 py-2 text-left">Bog'lanish</th>
                <th class="px-4 py-2 text-left">Do'kon</th>
                <th class="px-4 py-2 text-left">Bo'lim</th>
                <th class="px-4 py-2 text-left">Muddati</th>
                <th class="px-4 py-2 text-left">Holati</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="6" class="px-4 py-6 text-center">Yuklanmoqda...</td>
              </tr>
              <tr v-else-if="!filteredRows.length">
                <td colspan="6" class="px-4 py-6 text-center">Ma'lumot topilmadi</td>
              </tr>
              <tr
                v-for="row in filteredRows"
                :key="row.id"
                class="align-top transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <td class="px-4 py-2">
                  <div class="font-semibold">{{ row.owner.fullName }}</div>
                  <div class="text-xs text-gray-500">STIR: {{ row.owner.tin }}</div>
                </td>
                <td class="px-4 py-2">
                  <div class="text-sm text-gray-700 dark:text-gray-300">
                    {{ row.owner.phoneNumber || '-' }}
                  </div>
                  <div class="text-xs text-gray-500 break-words">
                    {{ row.owner.address || '' }}
                  </div>
                </td>
                <td class="px-4 py-2">
                  <template v-if="row.contract">
                    <div class="font-medium">{{ row.store.storeNumber || row.contract.storeId }}</div>
                    <div class="text-xs text-gray-500">{{ row.store.description || 'Izoh yo\'q' }}</div>
                  </template>
                  <template v-else>
                    <span class="text-sm text-gray-500">Shartnoma yo'q</span>
                  </template>
                </td>
                <td class="px-4 py-2">
                  {{ row.sectionName || (row.store.sectionId ? `#${row.store.sectionId}` : '-') }}
                </td>
                <td class="px-4 py-2">
                  <div v-if="row.contract">
                    <div class="text-sm">
                      {{ formatTashkentDate(row.contract.issueDate) || '-' }} —
                      {{ formatTashkentDate(row.contract.expiryDate) || '-' }}
                    </div>
                    <div v-if="row.daysLeft !== null" class="text-xs text-gray-500">
                      Qoldi: {{ row.daysLeft }} kun
                    </div>
                  </div>
                  <span v-else class="text-sm text-gray-500">-</span>
                </td>
                <td class="px-4 py-2">
                  <span
                    :class="[
                      'rounded-full px-3 py-1 text-xs font-semibold',
                      row.status === 'active'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : row.status === 'expiring'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : row.status === 'expired'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : row.status === 'inactive'
                              ? 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                    ]"
                  >
                    {{
                      row.status === 'none'
                        ? 'Shartnoma yo\'q'
                        : row.status === 'inactive'
                          ? 'Arxivlangan'
                          : row.status === 'expired'
                            ? 'Muddati tugagan'
                            : row.status === 'expiring'
                              ? 'Tez orada tugaydi'
                              : 'Faol'
                    }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-between px-4 py-3">
          <div>Jami: {{ total }}</div>
          <div class="flex items-center gap-2">
            <BaseButton
              :disabled="!hasPrevPage || loading"
              label="Oldingi"
              @click="page--"
            />
            <span>Sahifa {{ page }}</span>
            <BaseButton
              :disabled="!hasNextPage || loading"
              label="Keyingi"
              @click="page++"
            />
          </div>
        </div>
      </CardBox>
    </SectionMain>
  </LayoutAuthenticated>
</template>
