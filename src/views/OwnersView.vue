<script setup>
import { ref, onMounted, watch } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import CardBoxModal from '@/components/CardBoxModal.vue'
import PaginationControls from '@/components/PaginationControls.vue'
import { listOwners, createOwner, updateOwner, deleteOwner } from '@/services/owners'
import { parseTashkentDate, startOfTashkentDay } from '@/utils/time'

const items = ref([])
const loading = ref(false)
const errorMsg = ref('')
const search = ref('')
const page = ref(1)
const limit = ref(15)
const total = ref(0)

const showForm = ref(false)
const editingId = ref(null)
const form = ref({ fullName: '', tin: '', phoneNumber: '', address: '' })

async function fetchData() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await listOwners({
      search: search.value ? search.value.trim() : undefined,
      page: page.value,
      limit: limit.value,
    })
    items.value = res.data || []
    total.value = Number(res.pagination?.total ?? res.total ?? items.value.length)
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

function openCreate() {
  editingId.value = null
  form.value = { fullName: '', tin: '', phoneNumber: '', address: '' }
  showForm.value = true
}

function openEdit(item) {
  editingId.value = item.id
  form.value = {
    fullName: item.fullName || '',
    tin: item.tin || '',
    phoneNumber: item.phoneNumber || '',
    address: item.address || '',
  }
  showForm.value = true
}

async function submitForm() {
  loading.value = true
  errorMsg.value = ''
  try {
    if (editingId.value) {
      await updateOwner(editingId.value, form.value)
    } else {
      await createOwner(form.value)
    }
    showForm.value = false
    await fetchData()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Saqlashda xatolik'
  } finally {
    loading.value = false
  }
}

async function removeItem(id) {
  if (!confirm("Haqiqatan o'chirmoqchimisiz?")) return
  loading.value = true
  errorMsg.value = ''
  try {
    await deleteOwner(id)
    await fetchData()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || "O'chirishda xatolik"
  } finally {
    loading.value = false
  }
}

onMounted(fetchData)

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

watch([page, limit], () => {
  if (suppressPaginationFetch) return
  fetchData()
})
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain wide>
      <SectionTitle first>Tadbirkorlar</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>

      <CardBox class="mb-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <FormField class="w-full md:max-w-xl" label="Qidirish">
            <FormControl v-model="search" placeholder="Ism, STIR yoki telefon" />
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
                <th class="px-4 py-2 text-left">F.I.Sh</th>
                <th class="px-4 py-2 text-left">STIR</th>
                <th class="px-4 py-2 text-left">Telefon</th>
                <th class="px-4 py-2 text-left">Do'kon(lar)</th>
                <th class="px-4 py-2 text-left">Manzil</th>
                <th class="px-4 py-2 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="6" class="px-4 py-6 text-center">Yuklanmoqda...</td>
              </tr>
              <tr v-else-if="!items.length">
                <td colspan="6" class="px-4 py-6 text-center">Ma'lumot topilmadi</td>
              </tr>
              <tr
                v-for="it in items"
                :key="it.id"
                class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <td class="px-4 py-2">{{ it.fullName }}</td>
                <td class="px-4 py-2">{{ it.tin }}</td>
                <td class="px-4 py-2">{{ it.phoneNumber }}</td>
                <td class="px-4 py-2">
                  <span v-if="(it.contracts || []).length">
                    {{ (it.contracts
                      .filter((c) => {
                        const today = startOfTashkentDay() || new Date()
                        const startOk =
                          !c.issueDate || (parseTashkentDate(c.issueDate) || new Date(0)) <= today
                        const endOk =
                          !c.expiryDate ||
                          (parseTashkentDate(c.expiryDate) || new Date(8640000000000000)) >= today
                        return c.isActive !== false && startOk && endOk
                      })
                      .map(c => c.store?.storeNumber || `#${c.storeId}`)).join(', ') || '-' }}
                  </span>
                  <span v-else>-</span>
                </td>
                <td class="px-4 py-2">{{ it.address }}</td>
                <td class="px-4 py-2">
                  <div class="flex flex-wrap justify-end gap-2">
                    <BaseButton color="info" small label="Tahrirlash" @click="openEdit(it)" />
                    <BaseButton
                      color="danger"
                      small
                      outline
                      label="O'chirish"
                      @click="removeItem(it.id)"
                    />
                  </div>
                </td>
              </tr>
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

      <CardBoxModal
        v-model="showForm"
        has-cancel
        :close-on-confirm="false"
        :confirm-disabled="loading"
        button="success"
        :button-label="loading ? 'Saqlanmoqda...' : editingId ? 'Saqlash' : 'Yaratish'"
        :title="editingId ? 'Tadbirkor tahrirlash' : 'Tadbirkor yaratish'"
        @confirm="submitForm"
        @cancel="showForm = false"
      >
        <form class="grid gap-4 md:grid-cols-2" @submit.prevent="submitForm">
          <FormField label="F.I.Sh">
            <FormControl v-model="form.fullName" required placeholder="Masalan: Ali Valiyev" />
          </FormField>
          <FormField label="STIR">
            <FormControl v-model="form.tin" required placeholder="Masalan: 123456789" />
          </FormField>
          <FormField label="Telefon">
            <FormControl v-model="form.phoneNumber" placeholder="Masalan: +998901234567" />
          </FormField>
          <FormField label="Manzil">
            <FormControl v-model="form.address" placeholder="Manzil" />
          </FormField>
          <button type="submit" class="hidden" />
        </form>
      </CardBoxModal>
    </SectionMain>
  </LayoutAuthenticated>
</template>
