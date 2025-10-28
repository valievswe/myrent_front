<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { signIn } from '@/services/auth'
import { mdiAccount, mdiAsterisk } from '@mdi/js'
import SectionFullScreen from '@/components/SectionFullScreen.vue'
import CardBox from '@/components/CardBox.vue'
import FormCheckRadio from '@/components/FormCheckRadio.vue'
import FormField from '@/components/FormField.vue'
import FormControl from '@/components/FormControl.vue'
import BaseButton from '@/components/BaseButton.vue'
import BaseButtons from '@/components/BaseButtons.vue'
import LayoutGuest from '@/layouts/LayoutGuest.vue'

const form = reactive({ email: '', password: '', remember: true })
const loading = ref(false)
const errorMsg = ref('')

const router = useRouter()

const submit = async () => {
  errorMsg.value = ''
  loading.value = true
  try {
    await signIn({ email: form.email, password: form.password })
    router.push('/dashboard')
  } catch (err) {
    errorMsg.value = err?.response?.data?.message || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <LayoutGuest>
    <SectionFullScreen v-slot="{ cardClass }" bg="purplePink">
      <CardBox :class="cardClass" is-form @submit.prevent="submit">
        <FormField label="Email" help="Iltimos, emailingizni kiriting">
          <FormControl
            v-model="form.email"
            :icon="mdiAccount"
            name="email"
            autocomplete="email"
          />
        </FormField>

        <FormField label="Parol" help="Iltimos, parolingizni kiriting">
          <FormControl
            v-model="form.password"
            :icon="mdiAsterisk"
            type="password"
            name="password"
            autocomplete="current-password"
          />
        </FormField>

        <div v-if="errorMsg" class="mb-2 rounded border border-red-200 bg-red-50 p-2 text-red-700">
          {{ errorMsg }}
        </div>

        <FormCheckRadio
          v-model="form.remember"
          name="remember"
          label="Remember"
          :input-value="true"
        />

        <template #footer>
          <BaseButtons>
            <BaseButton :disabled="loading" type="submit" color="info" :label="loading ? 'Kirish...' : 'Kirish'" />
          </BaseButtons>
        </template>
      </CardBox>
    </SectionFullScreen>
  </LayoutGuest>
</template>
