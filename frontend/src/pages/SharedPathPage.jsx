import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import client from '../api/client'
import ProgressBar from '../components/ProgressBar'
import VideoCard from '../components/VideoCard'

export default function SharedPathPage() {
  const { token } = useParams()    // /shared/:token
  const navigate = useNavigate()
  const [path, setPath] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Clone dialog state
  const [showCloneDialog, setShowCloneDialog] = useState(false)
  const [cloneName, setCloneName] = useState('')
  const [cloning, setCloning] = useState(false)
  const [cloneAuthError, setCloneAuthError] = useState(false)

  useEffect(() => {
    client.get(`/paths/shared/${token}/`)
      .then((res) => setPath(res.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [token])

  const handleClone = async (e) => {
    e.preventDefault()
    setCloning(true)
    setCloneAuthError(false)
    try {
      const { data } = await client.post(`/paths/${path.id}/clone/`, { title: cloneName.trim() || undefined })
      navigate(`/paths/${data.id}`)
    } catch (err) {
      if (err.response?.status === 401) {
        // Save intent so login/register can complete it automatically
        localStorage.setItem('pendingClone', JSON.stringify({ pathId: path.id, cloneName: cloneName.trim() || path.title }))
        setShowCloneDialog(false)
        setCloneAuthError(true)
      }
    } finally {
      setCloning(false)
    }
  }

  if (loading) return <div className="page-loading">Loading…</div>

  if (notFound) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>Path not found</h2>
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            This link may be invalid or the path is no longer public.
          </p>
        </div>
      </div>
    )
  }

  const total = path.items.length

  return (
    <div className="path-page">
      <header className="path-header">
        <div className="path-header__meta">
          <p className="shared-badge">Shared path · read-only</p>
          <h1>{path.title}</h1>
          {path.description && <p className="path-description">{path.description}</p>}
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
            by {path.created_by}
          </p>
        </div>
        <div className="path-header__actions">
          <button className="btn-ghost" onClick={() => { setCloneName(path.title); setShowCloneDialog(true) }}>
            Clone to my paths
          </button>
        </div>
      </header>

      {total > 0 && (
        <div className="path-progress">
          <ProgressBar percentage={0} />
          <span className="progress-count">{total} video{total !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Auth error modal */}
      {cloneAuthError && (
        <div className="theater-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setCloneAuthError(false) }}>
          <div className="clone-dialog">
            <button className="theater-close" onClick={() => setCloneAuthError(false)}>✕</button>
            <h3>Sign in to clone</h3>
            <p className="muted" style={{ fontSize: '0.875rem', margin: '0.75rem 0 1.25rem' }}>
              You need an account to save this path. Your chosen name is already saved — just sign in or create an account and we'll clone it automatically.
            </p>
            <div className="clone-dialog__actions">
              <button className="btn-ghost" onClick={() => navigate('/register')}>Sign up</button>
              <button className="btn-primary" onClick={() => navigate('/login')} style={{ width: 'auto', marginTop: 0 }}>Log in</button>
            </div>
          </div>
        </div>
      )}

      {/* Clone dialog */}
      {showCloneDialog && (
        <div className="theater-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowCloneDialog(false) }}>
          <form className="clone-dialog" onSubmit={handleClone}>
            <h3>Clone learning path</h3>
            <p className="muted" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
              Give your copy a name.
            </p>
            <div className="field">
              <label>Name</label>
              <input
                type="text"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="clone-dialog__actions">
              <button type="button" className="btn-ghost" onClick={() => setShowCloneDialog(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={cloning}>
                {cloning ? 'Cloning…' : 'Clone'}
              </button>
            </div>
          </form>
        </div>
      )}

      {total === 0 ? (
        <div className="empty-state">
          <svg className="empty-state__icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="14" width="48" height="30" rx="4" stroke="currentColor" strokeWidth="2"/>
            <path d="M27 24l12 7-12 7V24z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
            <path d="M20 50h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M32 44v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <h3 className="empty-state__title">Nothing here yet</h3>
          <p className="empty-state__desc">The author hasn't added any videos to this path yet.</p>
        </div>
      ) : (
        <div className="card-rail">
          {path.items.map((item) => (
            <VideoCard
              key={item.id}
              item={item}
              isCompleted={false}
              onToggleComplete={() => {}}
              readOnly={true}
            />
          ))}
        </div>
      )}
    </div>
  )
}
