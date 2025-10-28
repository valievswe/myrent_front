import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

import './css/main.css'

// Init Pinia
const pinia = createPinia()

// Create Vue app
createApp(App).use(router).use(pinia).mount('#app')

// Simple auth guard: require token for protected routes
router.beforeEach((to) => {
  const token = localStorage.getItem('access_token')
  if (to.path !== '/login' && !token) return { path: '/login' }
  if (to.path === '/login' && token) return { path: '/dashboard' }
})

// Dark mode: restore persisted setting or prefers-color-scheme
import { useDarkModeStore } from './stores/darkMode'
const darkModeStore = useDarkModeStore(pinia)
try {
  const persisted = typeof localStorage !== 'undefined' ? localStorage.getItem('darkMode') : null
  if (
    (!persisted && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ||
    persisted === '1'
  ) {
    darkModeStore.set(true)
  } else {
    darkModeStore.set(false)
  }
} catch (_) {}

// Default title tag
const defaultDocumentTitle = 'Bozor boshqaruv paneli'

// Set document title from route meta
router.afterEach((to) => {
  document.title = to.meta?.title
    ? `${to.meta.title} — ${defaultDocumentTitle}`
    : defaultDocumentTitle
})

// Fix document title joiner
router.afterEach((to) => {
  document.title = to.meta?.title
    ? `${to.meta.title} - ${defaultDocumentTitle}`
    : defaultDocumentTitle
})
