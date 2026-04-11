import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import useAuthStore from './store/authStore'
import AppLayout from './components/AppLayout'
import DashboardPage from './pages/DashboardPage'
import PathPage from './pages/PathPage'
import SharedPathPage from './pages/SharedPathPage'

export default function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const autoLogin = useAuthStore((s) => s.autoLogin)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const initializing = useAuthStore((s) => s.initializing)

  useEffect(() => {
    if (isAuthenticated) {
      fetchMe()
    } else {
      autoLogin()
    }
  }, [])

  if (initializing) return null

  return (
    <Routes>
      {/* AppLayout renders the notebook sidebar + Outlet for nested pages */}
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/paths/:id" element={<PathPage />} />
      </Route>
      {/* SharedPathPage is read-only — no sidebar needed */}
      <Route path="/shared/:token" element={<SharedPathPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
