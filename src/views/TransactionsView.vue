<script setup>
import LayoutAuthenticated from '@/layouts/LayoutAuthenticated.vue'
import SectionMain from '@/components/SectionMain.vue'
import SectionTitle from '@/components/SectionTitle.vue'
</script>

<template>
  <LayoutAuthenticated>
    <SectionMain>
      <SectionTitle first>Transactions</SectionTitle>
      <div class="rounded-lg border border-gray-200 p-4">List and manage transactions.</div>
    </SectionMain>
  </LayoutAuthenticated>
</template>

