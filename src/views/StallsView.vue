<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import { listStalls, createStall, updateStall, deleteStall } from '@/services/stalls'
import { listAttendances } from '@/services/attendances'
import { listSaleTypes } from '@/services/saleTypes'
import { listSections } from '@/services/sections'

const items = ref([])
const loading = ref(false)
const errorMsg = ref('')
const search = ref('')
const page = ref(1)
const limit = ref(10)
const total = ref(0)

const saleTypes = ref([])
const sections = ref([])

const showForm = ref(false)
const editingId = ref(null)
const form = ref({ area: null, saleTypeId: null, sectionId: null, description: '' })
const expandedStallId = ref(null)
const attendanceMap = ref({})

const selectedSaleType = computed(() =>
  saleTypes.value.find((s) => s.id === Number(form.value.saleTypeId)),
)
const computedFee = computed(() => {
  const area = Number(form.value.area) || 0
  const price = selectedSaleType.value ? Number(selectedSaleType.value.tax) || 0 : 0
  return area * price
})

async function fetchData() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await listStalls({ search: search.value, page: page.value, limit: limit.value })
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
    saleTypes.value = await listSaleTypes()
  } catch {}
  try {
    sections.value = await listSections()
  } catch {}
}

function openCreate() {
  editingId.value = null
  form.value = { area: null, saleTypeId: null, sectionId: null, description: '' }
  showForm.value = true
}

function openEdit(item) {
  editingId.value = item.id
  form.value = {
    area: item.area ?? null,
    saleTypeId: item.saleTypeId ?? null,
    sectionId: item.sectionId ?? null,
    description: item.description || '',
  }
  showForm.value = true
}

async function submitForm() {
  loading.value = true
  errorMsg.value = ''
  try {
    const payload = {
      area: form.value.area ? Number(form.value.area) : null,
      saleTypeId: form.value.saleTypeId ? Number(form.value.saleTypeId) : null,
      sectionId: form.value.sectionId ? Number(form.value.sectionId) : null,
      description: form.value.description || undefined,
    }
    if (!payload.area || !payload.saleTypeId || !payload.sectionId) {
      throw new Error("Maydon, Sotuv turi va Bo'lim majburiy")
    }
    if (editingId.value) await updateStall(editingId.value, payload)
    else await createStall(payload)
    showForm.value = false
    await fetchData()
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
    await deleteStall(id)
    await fetchData()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || "O'chirishda xatolik"
  } finally {
    loading.value = false
  }
}

async function toggleAttendance(it) {
  expandedStallId.value = expandedStallId.value === it.id ? null : it.id
  if (expandedStallId.value && !attendanceMap.value[it.id]) {
    try {
      const res = await listAttendances({ stallId: it.id, page: 1, limit: 10 })
      attendanceMap.value = { ...attendanceMap.value, [it.id]: res.data }
    } catch (e) {
      console.error(e)
    }
  }
}

onMounted(async () => {
  await preloadRefs()
  await fetchData()
})
let debounceId
watch(
  () => search.value,
  () => {
    page.value = 1
    if (debounceId) clearTimeout(debounceId)
    debounceId = setTimeout(() => fetchData(), 300)
  },
)
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitle first>Rastalar</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>

      <CardBox class="mb-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <FormField label="Qidirish">
            <FormControl v-model="search" placeholder="Izoh yoki boshqa maydonlar" />
          </FormField>
          <div class="flex gap-2">
            <BaseButton color="success" :disabled="loading" label="Yaratish" @click="openCreate" />
          </div>
        </div>
      </CardBox>

      <CardBox has-table>
        <div class="overflow-x-auto">
          <table class="w-full table-auto">
            <thead>
              <tr>
                <th class="px-4 py-2 text-left">Bo'lim</th>
                <th class="px-4 py-2 text-left">Sotuv turi</th>
                <th class="px-4 py-2 text-left">Maydon (kv m)</th>
                <th class="px-4 py-2 text-left">Presskurant (1 kv m)</th>
                <th class="px-4 py-2 text-left">Hisoblangan to'lov</th>
                <th class="px-4 py-2 text-left">Izoh</th>
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
              <template v-for="it in items" :key="it.id">
                <tr class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td class="px-4 py-2">
                    {{ sections.find((s) => s.id === it.sectionId)?.name || it.sectionId }}
                  </td>
                  <td class="px-4 py-2">
                    {{ saleTypes.find((s) => s.id === it.saleTypeId)?.name || it.saleTypeId }}
                  </td>
                  <td class="px-4 py-2">{{ it.area }}</td>
                  <td class="px-4 py-2">{{ saleTypes.find((s) => s.id === it.saleTypeId)?.tax }}</td>
                  <td class="px-4 py-2">
                    {{
                      (Number(it.area) || 0) *
                      (Number(saleTypes.find((s) => s.id === it.saleTypeId)?.tax) || 0)
                    }}
                  </td>
                  <td class="px-4 py-2">{{ it.description }}</td>
                  <td class="px-4 py-2 text-right">
                    <BaseButton color="info" small label="Tahrirlash" @click="openEdit(it)" />
                    <BaseButton
                      color="danger"
                      small
                      outline
                      label="O'chirish"
                      class="ml-2"
                      @click="removeItem(it.id)"
                    />
                    <BaseButton
                      color="info"
                      small
                      outline
                      label="Attendance"
                      class="ml-2"
                      @click="toggleAttendance(it)"
                    />
                  </td>
                </tr>
                <tr v-if="expandedStallId === it.id">
                  <td colspan="7" class="bg-gray-50 px-4 py-3 dark:bg-gray-800">
                    <div class="mb-2 text-sm font-semibold">So'nggi attendance</div>
                    <div v-if="!attendanceMap[it.id]?.length" class="text-sm text-gray-500">Ma'lumot yo'q</div>
                    <div v-else>
                      <table class="w-full table-auto text-sm">
                        <thead>
                          <tr>
                            <th class="px-2 py-1 text-left">Sana</th>
                            <th class="px-2 py-1 text-left">Summasi</th>
                            <th class="px-2 py-1 text-left">Holati</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="a in attendanceMap[it.id]" :key="a.id">
                            <td class="px-2 py-1">{{ a.date?.substring(0,10) }}</td>
                            <td class="px-2 py-1">{{ a.amount }}</td>
                            <td class="px-2 py-1">{{ a.status }}</td>
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
        <SectionTitle>
          {{ editingId ? 'Rastani tahrirlash' : 'Rasta yaratish' }}
        </SectionTitle>
        <div class="grid gap-4 md:grid-cols-2">
          <FormField label="Bo'lim">
            <select
              v-model="form.sectionId"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option :value="null" disabled>Tanlang...</option>
              <option v-for="s in sections" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </FormField>
          <FormField label="Sotuv turi">
            <select
              v-model="form.saleTypeId"
              class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option :value="null" disabled>Tanlang...</option>
              <option v-for="st in saleTypes" :key="st.id" :value="st.id">
                {{ st.name }} - {{ st.tax }}
              </option>
            </select>
          </FormField>
          <FormField label="Maydon (kv m)">
            <FormControl
              v-model="form.area"
              type="number"
              min="0"
              step="0.01"
              placeholder="Masalan: 12"
            />
          </FormField>
          <FormField label="Izoh">
            <FormControl v-model="form.description" placeholder="Qisqacha izoh" />
          </FormField>
          <div class="rounded border border-gray-200 p-3 md:col-span-2 dark:border-gray-700">
            Hisoblangan to'lov: <b>{{ computedFee }}</b>
          </div>
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
