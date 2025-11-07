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
import { listUsers, createUser, updateUser, deleteUser } from '@/services/users'

const items = ref([])
const loading = ref(false)
const errorMsg = ref('')

const search = ref('')
const role = ref('')
const roles = ['CHECKER', 'ADMIN', 'SUPERADMIN']
const page = ref(1)
const limit = ref(10)
const total = ref(0)

const showForm = ref(false)
const editingId = ref(null)
const form = ref({ email: '', password: '', firstName: '', lastName: '', role: 'CHECKER' })

async function fetchData() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await listUsers({
      search: search.value || undefined,
      role: role.value || undefined,
      page: page.value,
      limit: limit.value,
    })
    items.value = res.data || []
    total.value = Number(res.pagination?.total ?? items.value.length)
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Yuklashda xatolik'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.value = { email: '', password: '', firstName: '', lastName: '', role: 'CHECKER' }
  showForm.value = true
}

function openEdit(item) {
  editingId.value = item.id
  form.value = { email: item.email || '', password: '', firstName: item.firstName || '', lastName: item.lastName || '', role: item.role || 'CHECKER' }
  showForm.value = true
}

async function submitForm() {
  loading.value = true
  errorMsg.value = ''
  try {
    const payload = { email: form.value.email, firstName: form.value.firstName, lastName: form.value.lastName, role: form.value.role }
    if (!editingId.value) payload.password = form.value.password
    else if (form.value.password) payload.password = form.value.password

    if (editingId.value) await updateUser(editingId.value, payload)
    else await createUser(payload)
    showForm.value = false
    await fetchData()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || 'Saqlashda xatolik (ehtimol ruxsat yo\'q)'
  } finally {
    loading.value = false
  }
}

async function removeItem(id) {
  if (!confirm("Haqiqatan o'chirmoqchimisiz?")) return
  loading.value = true
  errorMsg.value = ''
  try {
    await deleteUser(id)
    await fetchData()
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || "O'chirishda xatolik (ehtimol ruxsat yo'q)"
  } finally {
    loading.value = false
  }
}

onMounted(fetchData)
let filterDebounceId = null
let suppressPaginationFetch = false
let paginationTimer = null
watch([search, role], () => {
  page.value = 1
  suppressPaginationFetch = true
  if (filterDebounceId) clearTimeout(filterDebounceId)
  filterDebounceId = setTimeout(() => {
    suppressPaginationFetch = false
    fetchData()
  }, 300)
})
watch([page, limit], () => {
  if (suppressPaginationFetch) return
  if (paginationTimer) clearTimeout(paginationTimer)
  paginationTimer = setTimeout(() => {
    fetchData()
  }, 0)
})
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain wide>
      <SectionTitle first>Foydalanuvchilar</SectionTitle>

      <div v-if="errorMsg" class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
        {{ errorMsg }}
      </div>

      <CardBox class="mb-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div class="flex flex-col gap-3 md:flex-row md:items-end">
            <FormField class="w-full md:max-w-xl" label="Qidirish">
              <FormControl v-model="search" placeholder="Email yoki ism/familiya" />
            </FormField>
            <FormField label="Roli">
              <select v-model="role" class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
                <option value="">Barchasi</option>
                <option v-for="r in roles" :key="r" :value="r">{{ r }}</option>
              </select>
            </FormField>
          </div>
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
                <th class="px-4 py-2 text-left">Email</th>
                <th class="px-4 py-2 text-left">Ism</th>
                <th class="px-4 py-2 text-left">Familiya</th>
                <th class="px-4 py-2 text-left">Roli</th>
                <th class="px-4 py-2 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="5" class="px-4 py-6 text-center">Yuklanmoqda...</td>
              </tr>
              <tr v-else-if="!items.length">
                <td colspan="5" class="px-4 py-6 text-center">Ma'lumot topilmadi</td>
              </tr>
              <tr v-for="it in items" :key="it.id" class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
                <td class="px-4 py-2">{{ it.email }}</td>
                <td class="px-4 py-2">{{ it.firstName }}</td>
                <td class="px-4 py-2">{{ it.lastName }}</td>
                <td class="px-4 py-2">{{ it.role }}</td>
                <td class="px-4 py-2 text-right">
                  <BaseButton color="info" small label="Tahrirlash" @click="openEdit(it)" />
                  <BaseButton color="danger" small outline label="O'chirish" class="ml-2" @click="removeItem(it.id)" />
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
        />
      </CardBox>

      <CardBoxModal
        v-model="showForm"
        has-cancel
        :close-on-confirm="false"
        :confirm-disabled="loading"
        button="success"
        :button-label="loading ? 'Saqlanmoqda...' : editingId ? 'Saqlash' : 'Yaratish'"
        :title="editingId ? 'Foydalanuvchini tahrirlash' : 'Foydalanuvchi yaratish'"
        @confirm="submitForm"
        @cancel="showForm = false"
      >
        <form class="grid gap-4 md:grid-cols-2" @submit.prevent="submitForm">
          <FormField label="Email">
            <FormControl v-model="form.email" type="email" required placeholder="user@example.com" />
          </FormField>
          <FormField v-if="!editingId" label="Parol">
            <FormControl v-model="form.password" type="password" required placeholder="Kuchli parol" />
          </FormField>
          <FormField v-else label="Parol (o'zgartirish)">
            <FormControl v-model="form.password" type="password" placeholder="Ixtiyoriy" />
          </FormField>
          <FormField label="Ism">
            <FormControl v-model="form.firstName" placeholder="Ism" />
          </FormField>
          <FormField label="Familiya">
            <FormControl v-model="form.lastName" placeholder="Familiya" />
          </FormField>
          <FormField label="Roli">
            <select v-model="form.role" class="block w-full rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
              <option v-for="r in roles" :key="r" :value="r">{{ r }}</option>
            </select>
          </FormField>
          <button type="submit" class="hidden" />
        </form>
      </CardBoxModal>
    </SectionMain>
  </LayoutAuthenticated>
</template>
