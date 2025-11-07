<script setup>
import { computed } from 'vue'
import BaseButton from '@/components/BaseButton.vue'

const props = defineProps({
  page: {
    type: Number,
    default: 1,
  },
  limit: {
    type: Number,
    default: 10,
  },
  total: {
    type: Number,
    default: 0,
  },
  limitOptions: {
    type: Array,
    default: () => [10, 20, 50, 100],
  },
  showLimit: {
    type: Boolean,
    default: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:page', 'update:limit'])

const totalPages = computed(() => {
  const size = Math.max(1, props.limit || 1)
  const totalItems = Math.max(0, props.total || 0)
  const pages = Math.ceil(totalItems / size)
  return pages > 0 ? pages : 1
})

const showingRange = computed(() => {
  if (!props.total) return null
  const start = (props.page - 1) * props.limit + 1
  const end = Math.min(props.total, props.page * props.limit)
  if (start > end) return null
  return { start, end }
})

const pageNumbers = computed(() => {
  const maxVisible = 5
  const pages = []
  let start = Math.max(1, props.page - Math.floor(maxVisible / 2))
  let end = start + maxVisible - 1
  if (end > totalPages.value) {
    end = totalPages.value
    start = Math.max(1, end - maxVisible + 1)
  }
  for (let p = start; p <= end; p += 1) {
    pages.push(p)
  }
  return pages
})

function goTo(page) {
  if (props.disabled) return
  const normalized = Math.min(Math.max(1, page), totalPages.value)
  if (normalized === props.page) return
  emit('update:page', normalized)
}

function goToFirst() {
  goTo(1)
}

function goToLast() {
  goTo(totalPages.value)
}

function goToPrev() {
  goTo(props.page - 1)
}

function goToNext() {
  goTo(props.page + 1)
}

function changeLimit(event) {
  if (!event) return
  const raw = event?.target ? Number(event.target.value) : Number(event)
  if (!raw || raw === props.limit) return
  emit('update:limit', raw)
  emit('update:page', 1)
}
</script>

<template>
  <div class="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 text-sm dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
    <div class="text-gray-600 dark:text-gray-300">
      <template v-if="showingRange">
        Ko'rsatilmoqda {{ showingRange.start }}–{{ showingRange.end }} / {{ total }}
      </template>
      <template v-else>
        Jami: {{ total }}
      </template>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <label
        v-if="showLimit"
        class="flex items-center gap-2 text-gray-600 dark:text-gray-300"
      >
        <span>Sahifa hajmi</span>
        <select
          class="rounded border border-gray-300 bg-white px-3 py-1 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          :value="limit"
          :disabled="disabled"
          @change="changeLimit"
        >
          <option v-for="opt in limitOptions" :key="opt" :value="opt">
            {{ opt }}
          </option>
        </select>
      </label>
      <div class="flex flex-wrap items-center gap-1">
        <BaseButton
          small
          outline
          label="«"
          :disabled="disabled || page <= 1"
          @click="goToFirst"
        />
        <BaseButton
          small
          outline
          label="‹"
          :disabled="disabled || page <= 1"
          @click="goToPrev"
        />
        <BaseButton
          v-for="p in pageNumbers"
          :key="p"
          small
          :color="p === page ? 'primary' : 'info'"
          :outline="p !== page"
          :disabled="disabled"
          :label="String(p)"
          @click="goTo(p)"
        />
        <BaseButton
          small
          outline
          label="›"
          :disabled="disabled || page >= totalPages"
          @click="goToNext"
        />
        <BaseButton
          small
          outline
          label="»"
          :disabled="disabled || page >= totalPages"
          @click="goToLast"
        />
      </div>
    </div>
  </div>
</template>
