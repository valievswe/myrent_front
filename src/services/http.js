import axios from 'axios'

// Base URL points to Nest global prefix
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export const http = axios.create({
  baseURL: "/api",
  withCredentials: true, 
})

// Persist token in-memory and localStorage for reloads
let accessToken = localStorage.getItem('access_token') || null

export function setAccessToken(token) {
  accessToken = token
  if (token) localStorage.setItem('access_token', token)
  else localStorage.removeItem('access_token')
}

http.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

let isRefreshing = false
let pendingQueue = []

http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { response, config } = error || {}
    const status = response?.status
    const originalRequest = config || {}

    // Avoid infinite loop on auth endpoints
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/')

    if (status === 401 && !isAuthEndpoint) {
      if (isRefreshing) {
        // queue the request until refresh completes
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers = originalRequest.headers || {}
            originalRequest.headers.Authorization = `Bearer ${token}`
            return http(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      isRefreshing = true
      try {
        // try refresh; backend uses refresh cookie
        const { data } = await http.post('/auth/refresh')
        if (data?.accessToken) {
          setAccessToken(data.accessToken)
          pendingQueue.forEach(({ resolve }) => resolve(data.accessToken))
          pendingQueue = []
          originalRequest.headers = originalRequest.headers || {}
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
          return http(originalRequest)
        }
      } catch (e) {
        pendingQueue.forEach(({ reject }) => reject(e))
        pendingQueue = []
        // clear token and force login
        setAccessToken(null)
        try { window.location.hash = '#/login' } catch (_) { }
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)

export default http
