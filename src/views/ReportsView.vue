<script setup>
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitle first>Reports</SectionTitle>
      <div class="rounded-lg border border-gray-200 p-4">Delinquency, occupancy, income/expense, and trends.</div>
    </SectionMain>
  </LayoutAuthenticated>
</template>

