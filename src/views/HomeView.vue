<script setup>
import { ref } from 'vue'
import {
  mdiAccountMultiple,
  mdiSwapHorizontal,
  mdiFileDocumentOutline,
} from '@mdi/js'
import SectionMain from '@/components/SectionMain.vue'
import CardBoxWidget from '@/components/CardBoxWidget.vue'
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionTitleLineWithButton from '@/components/SectionTitleLineWithButton.vue'
const stats = ref({ owners: 0, contracts: 0, transactions: 0 })
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitleLineWithButton :icon="mdiAccountMultiple" title="Umumiy ko'rsatkichlar" main />

      <div class="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <CardBoxWidget
          color="text-emerald-500"
          :icon="mdiAccountMultiple"
          :number="stats.owners"
          label="Owners"
        />
        <CardBoxWidget
          color="text-blue-500"
          :icon="mdiFileDocumentOutline"
          :number="stats.contracts"
          label="Contracts"
        />
        <CardBoxWidget
          color="text-purple-500"
          :icon="mdiSwapHorizontal"
          :number="stats.transactions"
          label="Transactions"
        />
      </div>
    </SectionMain>
  </LayoutAuthenticated>
</template>
