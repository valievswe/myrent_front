<script setup>
import { computed } from 'vue'
import { containerMaxW, containerWideMaxW } from '@/config.js'

const props = defineProps({
  wide: {
    type: Boolean,
    default: false,
  },
})

const sectionClass = computed(() => (props.wide ? containerWideMaxW : containerMaxW))
</script>

<template>
  <section class="p-6" :class="sectionClass">
    <slot />
  </section>
</template>
