import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import client from '../api/client'
import LanguageSelector from '../components/LanguageSelector'

export default function DashboardPage() {
  const [paths, setPaths] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [showForm, setShowForm] = useState(false)

  const navigate = useNavigate()
  const { t } = useTranslation()

  useEffect(() => {
    client.get('/paths/')
      .then((res) => setPaths(res.data))
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const { data } = await client.post('/paths/', { title: newTitle, description: '', is_public: false })
      setPaths((prev) => [data, ...prev])
      setNewTitle('')
      setShowForm(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>LexiPath</h1>
        <div className="header-actions">
          <LanguageSelector />
        </div>
      </header>

      <main className="dashboard-main">
        <div className="section-header">
          <h2>{t('dashboard.title')}</h2>
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
            {showForm ? t('common.cancel') : t('dashboard.newPath')}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="create-form">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t('dashboard.placeholder')}
              autoFocus
              required
            />
            <button type="submit" disabled={creating} className="btn-primary">
              {creating ? t('dashboard.creating') : t('dashboard.create')}
            </button>
          </form>
        )}

        {loading ? (
          <p className="muted">{t('common.loading')}</p>
        ) : paths.length === 0 ? (
          <div className="empty-state">
            <svg className="empty-state__icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="32" r="6" stroke="currentColor" strokeWidth="2"/>
              <circle cx="32" cy="16" r="6" stroke="currentColor" strokeWidth="2"/>
              <circle cx="52" cy="32" r="6" stroke="currentColor" strokeWidth="2"/>
              <path d="M18 32h8M38 20l6 8M38 44l6-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="32" cy="48" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3"/>
              <path d="M26 32h-2M40 32h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3"/>
            </svg>
            <h3 className="empty-state__title">{t('dashboard.empty.title')}</h3>
            <p className="empty-state__desc">{t('dashboard.empty.description')}</p>
            <button className="btn-primary empty-state__cta" onClick={() => setShowForm(true)}>
              {t('dashboard.empty.cta')}
            </button>
          </div>
        ) : (
          <div className="path-grid">
            {paths.map((path) => (
              <div
                key={path.id}
                className="path-card"
                onClick={() => navigate(`/paths/${path.id}`)}
              >
                <h3>{path.title}</h3>
                <p className="path-meta">
                  {t('dashboard.videoCount', { count: path.items.length })}
                  {path.is_public && <span className="badge">{t('dashboard.public')}</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
