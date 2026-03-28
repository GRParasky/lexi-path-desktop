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

// Response interceptor: if any request gets a 401, clear stored tokens.
// This handles expired tokens cleanly without crashing.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access')
      localStorage.removeItem('refresh')
    }
    return Promise.reject(error)
  }
)

export default client
