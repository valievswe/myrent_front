<script setup>
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitle first>Payments</SectionTitle>
      <div class="rounded-lg border border-gray-200 p-4">Invoices, receipts, balances, and exports.</div>
    </SectionMain>
  </LayoutAuthenticated>
</template>

