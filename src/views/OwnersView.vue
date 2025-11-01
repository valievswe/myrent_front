<script setup>
import { ref, onMounted, watch } from 'vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import CardBox from '@/components/CardBox.vue'
import BaseButton from '@/components/BaseButton.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import { listOwners, createOwner, updateOwner, deleteOwner } from '@/services/owners'

const items = ref([])
const loading = ref(false)
const errorMsg = ref('')
const search = ref('')
const page = ref(1)
const limit = ref(10)
const total = ref(0)

const showForm = ref(false)
const editingId = ref(null)
const form = ref({ fullName: '', tin: '', phoneNumber: '', address: '' })

async function fetchData() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await listOwners({ search: search.value, page: page.value, limit: limit.value })
    items.value = res.data
    total.value = res.pagination.total
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
let debounceId = null
watch(() => search.value, () => {
  page.value = 1
  if (debounceId) clearTimeout(debounceId)
  debounceId = setTimeout(() => {
    fetchData()
  }, 300)
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
          <FormField label="Qidirish">
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
                      .filter(c => c.isActive !== false && (!c.issueDate || new Date(c.issueDate) <= new Date()) && (!c.expiryDate || new Date(c.expiryDate) >= new Date()))
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
        <div class="flex items-center justify-between px-4 py-3">
          <div>Jami: {{ total }}</div>
          <div class="flex items-center gap-2">
            <BaseButton
              :disabled="page <= 1 || loading"
              label="Oldingi"
              @click="page--; fetchData()"
            />
            <span>Sahifa {{ page }}</span>
            <BaseButton
              :disabled="items.length < limit || loading"
              label="Keyingi"
              @click="page++; fetchData()"
            />
          </div>
        </div>
      </CardBox>

      <CardBox v-if="showForm" class="mt-4" is-form @submit.prevent="submitForm">
        <SectionTitle>
          {{ editingId ? 'Tadbirkor tahrirlash' : 'Tadbirkor yaratish' }}
        </SectionTitle>
        <div class="grid gap-4 md:grid-cols-2">
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
