<script setup>
defineProps({
  dense: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <div
    :class="[
      'rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900',
      dense ? 'sm:flex sm:flex-wrap sm:items-center sm:gap-3' : 'flex flex-wrap items-center gap-3',
    ]"
  >
    <slot />
    <div class="ml-auto flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
