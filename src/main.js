import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useDarkModeStore } from './stores/darkMode'

import './css/main.css'

const pinia = createPinia()
const darkModeStore = useDarkModeStore(pinia)

// Apply preferred theme before mount to avoid flicker
try {
  darkModeStore.hydrateFromPreference()
  darkModeStore.listenToSystemPreference()
} catch {}

const app = createApp(App)
app.use(router)
app.use(pinia)
app.mount('#app')

// Simple auth guard: require token for protected routes
router.beforeEach((to) => {
  const token = localStorage.getItem('access_token')
  const isPublicRoute = to.meta?.public || to.path === '/login'
  if (!isPublicRoute && !token) return { path: '/login' }
  if (to.path === '/login' && token) return { path: '/dashboard' }
})

// Default title tag
const defaultDocumentTitle = 'Bozor boshqaruv paneli'

// Set document title from route meta
router.afterEach((to) => {
  document.title = to.meta?.title
    ? `${to.meta.title} - ${defaultDocumentTitle}`
    : defaultDocumentTitle
})
