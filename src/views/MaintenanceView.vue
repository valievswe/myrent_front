<script setup>
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitle first>Maintenance</SectionTitle>
      <div class="rounded-lg border border-gray-200 p-4">Work orders, vendors, scheduling, and SLAs.</div>
    </SectionMain>
  </LayoutAuthenticated>
</template>

