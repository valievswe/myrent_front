<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  mdiAccountMultiple,
  mdiStorefront,
  mdiViewGridOutline,
  mdiFileCheckOutline,
  mdiArchiveOutline,
} from '@mdi/js'
import SectionMain from '@/components/SectionMain.vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionTitleLineWithButton from '@/components/SectionTitleLineWithButton.vue'
import CardBox from '@/components/CardBox.vue'
import BaseIcon from '@/components/BaseIcon.vue'
import { listStores } from '@/services/stores'
import { listStalls } from '@/services/stalls'
import { listOwners } from '@/services/owners'
import { listContracts } from '@/services/contracts'

const stats = ref({
  stores: 0,
  stalls: 0,
  owners: 0,
  contractsActive: 0,
  contractsArchived: 0,
})

const loading = ref(false)
const errorMsg = ref('')

function formatMonthLabel(d = new Date()) {
  const formatter = new Intl.DateTimeFormat('uz-UZ', { month: 'long', year: 'numeric' })
  const raw = formatter.format(d)
  if (!raw) return ''
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

const currentMonthLabel = formatMonthLabel()

function formatNumber(value) {
  return Number(value || 0).toLocaleString('ru-RU')
}

const cards = computed(() => [
  {
    key: 'stores',
    label: "Jami do'konlar",
    subtitle: "Ro'yxatdagi do'konlar soni",
    value: stats.value.stores,
    icon: mdiStorefront,
    color: 'text-blue-500',
  },
  {
    key: 'stalls',
    label: 'Jami rastalar',
    subtitle: "Faol rastalar umumiy soni",
    value: stats.value.stalls,
    icon: mdiViewGridOutline,
    color: 'text-amber-500',
  },
  {
    key: 'owners',
    label: 'Jami tadbirkorlar',
    subtitle: "Tizimdagi tadbirkorlar soni",
    value: stats.value.owners,
    icon: mdiAccountMultiple,
    color: 'text-emerald-500',
  },
  {
    key: 'contractsActive',
    label: 'Faol shartnomalar',
    subtitle: `${currentMonthLabel} holatiga`,
    description: 'Amaldagi shartnomalar soni',
    value: stats.value.contractsActive,
    icon: mdiFileCheckOutline,
    color: 'text-indigo-500',
    span: 'md:col-span-2 xl:col-span-1',
  },
  {
    key: 'contractsArchived',
    label: 'Arxivlangan shartnomalar',
    subtitle: `${currentMonthLabel} gacha`,
    description: 'Arxiv statustagi shartnomalar',
    value: stats.value.contractsArchived,
    icon: mdiArchiveOutline,
    color: 'text-slate-500',
    span: 'md:col-span-2 xl:col-span-1',
  },
])

async function fetchStats() {
  loading.value = true
  errorMsg.value = ''
  try {
    const [storesRes, stallsRes, ownersRes, activeContractsRes, archivedContractsRes] =
      await Promise.all([
        listStores({ page: 1, limit: 1 }),
        listStalls({ page: 1, limit: 1 }),
        listOwners({ page: 1, limit: 1 }),
        listContracts({ page: 1, limit: 1, isActive: true }),
        listContracts({ page: 1, limit: 1, isActive: false }),
      ])

    const extractTotal = (res) => {
      if (!res) return 0
      if (typeof res.total === 'number') return res.total
      if (res?.pagination && typeof res.pagination.total === 'number') return res.pagination.total
      if (Array.isArray(res?.data)) return res.data.length
      return 0
    }

    stats.value = {
      stores: extractTotal(storesRes),
      stalls: extractTotal(stallsRes),
      owners: extractTotal(ownersRes),
      contractsActive: extractTotal(activeContractsRes),
      contractsArchived: extractTotal(archivedContractsRes),
    }
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Statistikani yuklashda xatolik'
  } finally {
    loading.value = false
  }
}

onMounted(fetchStats)
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain wide>
      <SectionTitleLineWithButton :icon="mdiAccountMultiple" title="Umumiy ko'rsatkichlar" main />

      <div v-if="errorMsg" class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>
      <div v-else-if="loading" class="mb-4 text-sm text-gray-500">
        Yuklanmoqda...
      </div>
      <div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <CardBox
          v-for="card in cards"
          :key="card.key"
          :class="['min-h-[200px] transition-shadow duration-200 hover:shadow-lg', card.span]"
        >
          <div class="flex h-full flex-col justify-between gap-6 p-6">
            <div class="flex items-start justify-between gap-3">
              <div class="space-y-1">
                <div class="text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">
                  {{ card.label }}
                </div>
                <div v-if="card.subtitle" class="text-xs text-gray-400 dark:text-slate-500">
                  {{ card.subtitle }}
                </div>
              </div>
              <BaseIcon :path="card.icon" :class="card.color" w="w-12" h="h-12" size="48" />
            </div>
            <div class="text-4xl font-semibold text-gray-900 dark:text-gray-100 md:text-5xl">
              {{ formatNumber(card.value) }}
            </div>
            <p v-if="card.description" class="text-xs text-gray-500 dark:text-slate-400">
              {{ card.description }}
            </p>
          </div>
        </CardBox>
      </div>
    </SectionMain>
  </LayoutAuthenticated>
</template>
