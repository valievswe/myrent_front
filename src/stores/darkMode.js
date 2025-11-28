import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useDarkModeStore = defineStore('darkMode', () => {
  const isEnabled = ref(false)
  const isInProgress = ref(false)
  const systemQuery =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null
  let systemListenerAttached = false

  const persistPreference = (enabled) => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem('darkMode', enabled ? '1' : '0')
  }

  const applyDomState = (enabled) => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.classList.toggle('dark', enabled)
    root.classList.toggle('dark-scrollbars-compat', enabled)
    root.dataset.theme = enabled ? 'dark' : 'light'
    root.style.colorScheme = enabled ? 'dark' : 'light'
    document.body.classList.toggle('dark-scrollbars', enabled)
  }

  function set(payload = null) {
    isInProgress.value = true
    isEnabled.value = payload !== null ? payload : !isEnabled.value

    applyDomState(isEnabled.value)

    setTimeout(() => {
      isInProgress.value = false
    }, 200)

    // Persist dark mode setting
    persistPreference(isEnabled.value)
  }

  const hydrateFromPreference = () => {
    const persisted = typeof localStorage !== 'undefined' ? localStorage.getItem('darkMode') : null
    const prefersDark = systemQuery?.matches ?? false
    const next = persisted === '1' || (persisted === null && prefersDark)
    isEnabled.value = next
    applyDomState(next)
    if (persisted === '0' || persisted === '1') {
      persistPreference(next)
    }
  }

  const listenToSystemPreference = () => {
    if (!systemQuery || systemListenerAttached) return
    const handler = (event) => {
      const persisted = typeof localStorage !== 'undefined' ? localStorage.getItem('darkMode') : null
      if (persisted !== null) return
      isEnabled.value = event.matches
      applyDomState(event.matches)
    }
    systemQuery.addEventListener('change', handler)
    systemListenerAttached = true
  }

  return {
    isEnabled,
    isInProgress,
    set,
    hydrateFromPreference,
    listenToSystemPreference,
  }
})
