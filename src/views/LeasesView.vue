<script setup>
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitle first>Leases</SectionTitle>
      <div class="rounded-lg border border-gray-200 p-4">Track lease terms, rent schedules, deposits, and docs.</div>
    </SectionMain>
  </LayoutAuthenticated>
</template>

