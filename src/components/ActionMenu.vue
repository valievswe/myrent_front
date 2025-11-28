<template>
  <div ref="root" class="relative inline-block text-left">
    <button
      type="button"
      class="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-transparent transition hover:-translate-y-[1px] hover:border-slate-300 hover:bg-white hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800"
      :aria-label="buttonLabel"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-4 w-4 text-slate-500 transition group-hover:text-slate-700 dark:text-slate-300 dark:group-hover:text-slate-100"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.75a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zM12 13.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zM12 19.75a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
      </svg>
      <span class="hidden text-xs uppercase tracking-wide text-slate-500 group-hover:text-slate-700 md:inline dark:text-slate-300 dark:group-hover:text-slate-100">
        {{ buttonLabel }}
      </span>
    </button>

    <transition name="fade">
      <div
        v-if="open"
        class="absolute right-0 z-30 mt-2 w-64 origin-top-right rounded-2xl border border-slate-200/80 bg-white/95 p-2 shadow-2xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
      >
        <div class="space-y-1">
          <button
            v-for="(item, idx) in items"
            :key="idx"
            type="button"
            :disabled="item.disabled"
            class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:-translate-y-[1px] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800"
            :class="item.danger ? 'text-rose-600 dark:text-rose-300' : 'text-slate-700 dark:text-slate-200'"
            @click.stop="handleClick(item)"
          >
            <span
              v-if="item.icon"
              class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              :class="item.danger ? 'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200' : 'border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-900/30 dark:bg-blue-900/10 dark:text-blue-200'"
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
  buttonLabel: {
    type: String,
    default: 'Amallar',
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
