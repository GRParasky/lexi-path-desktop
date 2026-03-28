import { create } from 'zustand'
import client from '../api/client'

const useAuthStore = create((set) => ({
  // State
  user: null,
  isAuthenticated: !!localStorage.getItem('access'),
  // True while the app is establishing the session on first load.
  // Prevents ProtectedRoute from redirecting before auto-login finishes.
  initializing: true,

  // Desktop auto-login: no password required.
  // Called once on app mount. The backend creates the desktop user on
  // first run and returns tokens — the user never sees a login screen.
  autoLogin: async () => {
    try {
      const { data } = await client.get('/auth/auto-login/')
      localStorage.setItem('access', data.access)
      localStorage.setItem('refresh', data.refresh)
      const me = await client.get('/auth/me/')
      set({ user: me.data, isAuthenticated: true, initializing: false })
    } catch {
      set({ initializing: false })
    }
  },

  // Called on app load when a token already exists in localStorage.
  fetchMe: async () => {
    try {
      const { data } = await client.get('/auth/me/')
      set({ user: data, isAuthenticated: true, initializing: false })
    } catch {
      localStorage.removeItem('access')
      localStorage.removeItem('refresh')
      set({ user: null, isAuthenticated: false, initializing: false })
    }
  },

  logout: () => {
    localStorage.removeItem('access')
    localStorage.removeItem('refresh')
    set({ user: null, isAuthenticated: false })
  },
}))

export default useAuthStore
