import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import useAuthStore from './store/authStore'
import DashboardPage from './pages/DashboardPage'
import PathPage from './pages/PathPage'
import SharedPathPage from './pages/SharedPathPage'

export default function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const autoLogin = useAuthStore((s) => s.autoLogin)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const initializing = useAuthStore((s) => s.initializing)

  // On first load: restore an existing session or auto-login transparently.
  // The user never sees a login screen — this is a single-user desktop app.
  useEffect(() => {
    if (isAuthenticated) {
      fetchMe()
    } else {
      autoLogin()
    }
  }, [])

  // Show nothing while the session is being established to avoid
  // a flash of unauthenticated content or a spurious redirect.
  if (initializing) return null

  return (
    <Routes>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/paths/:id" element={<PathPage />} />
      <Route path="/shared/:token" element={<SharedPathPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
