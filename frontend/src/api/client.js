import axios from 'axios'

// A single axios instance used everywhere in the app.
// baseURL is empty — Vite's proxy forwards /api/* to Django.
const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor: attach the access token to every request automatically.
// Components never need to set Authorization headers manually.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor: on 401, re-authenticate via auto-login and retry.
// Desktop app has no password, so auto-login is always safe to call.
// _retry flag prevents infinite loops if auto-login itself returns 401.
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        // Use bare axios (not client) to avoid triggering this interceptor again
        const { data } = await axios.get('/api/auth/auto-login/')
        localStorage.setItem('access', data.access)
        localStorage.setItem('refresh', data.refresh)
        originalRequest.headers.Authorization = `Bearer ${data.access}`
        return client(originalRequest)
      } catch {
        localStorage.removeItem('access')
        localStorage.removeItem('refresh')
      }
    }
    return Promise.reject(error)
  }
)

export default client
