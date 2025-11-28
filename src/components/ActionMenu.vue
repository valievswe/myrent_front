<template>
  <div ref="root" class="relative inline-block text-left">
    <button
      type="button"
      class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      aria-label="Actions"
      @click.stop="toggle"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.75a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zM12 13.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zM12 19.75a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
      </svg>
    </button>

    <transition name="fade">
      <div
        v-if="open"
        class="absolute right-0 z-30 mt-2 w-56 origin-top-right rounded-lg border border-slate-200 bg-white shadow-lg ring-1 ring-black ring-opacity-5 dark:border-slate-700 dark:bg-slate-900"
      >
        <div class="py-1">
          <button
            v-for="(item, idx) in items"
            :key="idx"
            type="button"
            :disabled="item.disabled"
            class="flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 dark:hover:bg-slate-800"
            :class="item.danger ? 'text-rose-600 dark:text-rose-300' : 'text-slate-700 dark:text-slate-200'"
            @click.stop="handleClick(item)"
          >
            <span
              v-if="item.icon"
              class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              :class="item.danger ? 'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200' : ''"
            >
              <svg v-if="typeof item.icon === 'string'" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path :d="item.icon" />
              </svg>
              <component v-else :is="item.icon" class="h-4 w-4" />
            </span>
            <div class="flex flex-col">
              <span>{{ item.label }}</span>
              <span v-if="item.hint" class="text-xs text-slate-500 dark:text-slate-400">{{ item.hint }}</span>
            </div>
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'

const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
})
const emit = defineEmits(['select'])
const open = ref(false)
const root = ref(null)

function close() {
  open.value = false
}
function toggle() {
  open.value = !open.value
}
function handleClick(item) {
  if (item.disabled) return
  emit('select', item)
  if (typeof item.onClick === 'function') item.onClick()
  close()
}

function handleOutside(event) {
  if (!root.value) return
  if (!root.value.contains(event.target)) {
    close()
  }
}

document.addEventListener('click', handleOutside)
onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutside)
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
