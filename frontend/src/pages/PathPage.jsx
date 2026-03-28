import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import client from '../api/client'
import ProgressBar from '../components/ProgressBar'
import VideoCard from '../components/VideoCard'

export default function PathPage() {
  const { id } = useParams()           // /paths/:id
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [path, setPath] = useState(null)
  const [completedIds, setCompletedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)

  // Drag-and-drop state
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)

  // Share panel state
  const [showSharePanel, setShowSharePanel] = useState(false)
  const [togglingPublic, setTogglingPublic] = useState(false)
  const [copied, setCopied] = useState(false)

  // Clone dialog state
  const [showCloneDialog, setShowCloneDialog] = useState(false)
  const [cloneName, setCloneName] = useState('')
  const [cloning, setCloning] = useState(false)

  // Delete path dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingPath, setDeletingPath] = useState(false)

  // Inline edit state
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')

  // Add video form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [videoTitle, setVideoTitle] = useState('')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    // Fetch path data and progress in parallel
    Promise.all([
      client.get(`/paths/${id}/`),
      client.get(`/progress/paths/${id}/`),
    ])
      .then(([pathRes, progressRes]) => {
        setPath(pathRes.data)
        setCompletedIds(new Set(progressRes.data.completed_items))
      })
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false))
  }, [id])

  // Called by VideoCard when the user toggles completion
  const handleToggleComplete = (itemId, nowCompleted) => {
    setCompletedIds((prev) => {
      const next = new Set(prev)
      if (nowCompleted) next.add(itemId)
      else next.delete(itemId)
      return next
    })
  }

  const handleTogglePublic = async () => {
    const newValue = !path.is_public
    setPath((prev) => ({ ...prev, is_public: newValue }))   // optimistic update
    setTogglingPublic(true)
    try {
      await client.patch(`/paths/${id}/`, { is_public: newValue })
    } catch {
      setPath((prev) => ({ ...prev, is_public: !newValue })) // revert on error
    } finally {
      setTogglingPublic(false)
    }
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/shared/${path.share_token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClone = async (e) => {
    e.preventDefault()
    setCloning(true)
    try {
      const { data } = await client.post(`/paths/${id}/clone/`, { title: cloneName.trim() || undefined })
      navigate(`/paths/${data.id}`)
    } finally {
      setCloning(false)
      setShowCloneDialog(false)
      setCloneName('')
    }
  }

  const handleSaveTitle = async () => {
    const value = titleDraft.trim()
    setEditingTitle(false)
    if (!value || value === path.title) return
    setPath((prev) => ({ ...prev, title: value }))
    try {
      await client.patch(`/paths/${id}/`, { title: value })
    } catch {
      setPath((prev) => ({ ...prev, title: path.title }))
    }
  }

  const handleSaveDesc = async () => {
    const value = descDraft.trim()
    setEditingDesc(false)
    if (value === (path.description ?? '')) return
    setPath((prev) => ({ ...prev, description: value }))
    try {
      await client.patch(`/paths/${id}/`, { description: value })
    } catch {
      setPath((prev) => ({ ...prev, description: path.description }))
    }
  }

  const handleEditItem = async (itemId, fields) => {
    try {
      const { data } = await client.patch(`/paths/${id}/items/${itemId}/`, fields)
      // Always update from the response — when youtube_url changes the backend
      // rewrites video_id and thumbnail_url, so we need the full updated item.
      setPath((prev) => ({
        ...prev,
        items: prev.items.map((i) => i.id === itemId ? { ...i, ...data } : i),
      }))
    } catch {
      // silently ignore — stale data stays until next reload
    }
  }

  const handleDrop = async (targetId) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      setDragOverId(null)
      return
    }
    const items = [...path.items]
    const fromIndex = items.findIndex((i) => i.id === draggedId)
    const toIndex = items.findIndex((i) => i.id === targetId)
    const [moved] = items.splice(fromIndex, 1)
    items.splice(toIndex, 0, moved)
    // Reassign positions locally
    const reordered = items.map((item, idx) => ({ ...item, position: idx }))
    setPath((prev) => ({ ...prev, items: reordered }))
    setDraggedId(null)
    setDragOverId(null)
    try {
      await client.post(`/paths/${id}/reorder/`, { order: reordered.map((i) => i.id) })
    } catch {
      // silently ignore — positions will resync on next page load
    }
  }

  const handleDeleteItem = async (itemId) => {
    await client.delete(`/paths/${id}/items/${itemId}/`)
    setPath((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== itemId) }))
    setCompletedIds((prev) => { const next = new Set(prev); next.delete(itemId); return next })
  }

  const handleDeletePath = async () => {
    setDeletingPath(true)
    try {
      await client.delete(`/paths/${id}/`)
      navigate('/dashboard')
    } finally {
      setDeletingPath(false)
    }
  }

  const handleAddVideo = async (e) => {
    e.preventDefault()
    setAddError('')
    setAdding(true)
    try {
      const nextPosition = path.items.length   // append to end
      const { data: newItem } = await client.post(`/paths/${id}/items/`, {
        title: videoTitle,
        youtube_url: youtubeUrl,
        position: nextPosition,
      })
      // Merge new item into local state — no need to re-fetch the whole path
      setPath((prev) => ({ ...prev, items: [...prev.items, newItem] }))
      setYoutubeUrl('')
      setVideoTitle('')
      setShowAddForm(false)
    } catch (err) {
      const data = err.response?.data
      setAddError(data?.youtube_url?.[0] || data?.detail || t('path.addVideoError'))
    } finally {
      setAdding(false)
    }
  }

  if (loading) return <div className="page-loading">{t('common.loading')}</div>
  if (!path) return null

  const total = path.items.length
  const completed = completedIds.size
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100)

  return (
    <div className="path-page">
      {/* Header */}
      <header className="path-header">
        <Link to="/dashboard" className="back-link">{t('path.back')}</Link>
        <div className="path-header__meta">
          {editingTitle ? (
            <input
              className="inline-edit inline-edit--title"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingTitle(false) }}
              autoFocus
            />
          ) : (
            <h1
              className="editable-field"
              title={t('path.clickToEdit')}
              onClick={() => { setTitleDraft(path.title); setEditingTitle(true) }}
            >
              {path.title}
            </h1>
          )}
          {editingDesc ? (
            <textarea
              className="inline-edit inline-edit--desc"
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={handleSaveDesc}
              onKeyDown={(e) => { if (e.key === 'Escape') setEditingDesc(false) }}
              autoFocus
              rows={2}
            />
          ) : (
            <p
              className={`path-description editable-field ${!path.description ? 'editable-field--empty' : ''}`}
              title={t('path.clickToEdit')}
              onClick={() => { setDescDraft(path.description ?? ''); setEditingDesc(true) }}
            >
              {path.description || t('path.addDescription')}
            </p>
          )}
        </div>
        <div className="path-header__actions">
          <button className="btn-ghost" onClick={() => setShowSharePanel((v) => !v)}>
            {t('path.share')}
          </button>
          <button className="btn-ghost" onClick={() => { setCloneName(path.title); setShowCloneDialog(true) }}>
            {t('common.clone')}
          </button>
          <button className="btn-ghost btn-ghost--danger" onClick={() => setShowDeleteDialog(true)}>
            {t('common.delete')}
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              if (showAddForm) {
                setYoutubeUrl('')
                setVideoTitle('')
                setAddError('')
              }
              setShowAddForm((v) => !v)
            }}
          >
            {showAddForm ? t('common.cancel') : t('path.addVideo')}
          </button>
        </div>
      </header>

      {/* Share panel */}
      {showSharePanel && (
        <div className="share-panel">
          <div className="share-panel__row">
            <span className="share-panel__label">
              {path.is_public ? t('path.publicLabel') : t('path.privateLabel')}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                className={`btn-ghost ${path.is_public ? 'btn-ghost--danger' : ''}`}
                onClick={handleTogglePublic}
                disabled={togglingPublic}
              >
                {togglingPublic ? '…' : path.is_public ? t('path.makePrivate') : t('path.makePublic')}
              </button>
              <button className="share-panel__close" onClick={() => setShowSharePanel(false)} title={t('common.cancel')}>✕</button>
            </div>
          </div>
          {path.is_public && (
            <div className="share-panel__row">
              <span className="share-link">{window.location.origin}/shared/{path.share_token}</span>
              <button className="btn-ghost" onClick={handleCopyLink}>
                {copied ? t('path.copied') : t('path.copyLink')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      {total > 0 && (
        <div className="path-progress">
          <ProgressBar percentage={percentage} />
          <span className="progress-count">{t('path.progressCount', { completed, total })}</span>
        </div>
      )}

      {/* Add video form */}
      {showAddForm && (
        <form onSubmit={handleAddVideo} className="add-video-form">
          <div className="field">
            <label>{t('path.youtubeUrl')}</label>
            <div className="input-clearable">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder={t('path.youtubePlaceholder')}
                required
                autoFocus
              />
              {youtubeUrl && (
                <button type="button" className="input-clear" onClick={() => setYoutubeUrl('')}>×</button>
              )}
            </div>
          </div>
          <div className="field">
            <label>{t('path.titleLabel')}</label>
            <input
              type="text"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              placeholder={t('path.titlePlaceholder')}
              required
            />
          </div>
          {addError && <p className="error">{addError}</p>}
          <button type="submit" className="btn-primary" disabled={adding}>
            {adding ? t('path.adding') : t('path.addVideoBtn')}
          </button>
        </form>
      )}

      {/* Delete path dialog */}
      {showDeleteDialog && (
        <div className="theater-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteDialog(false) }}>
          <div className="clone-dialog">
            <h3>{t('path.deleteDialog.title')}</h3>
            <p className="muted" style={{ fontSize: '0.875rem', margin: '0.75rem 0 1.25rem' }}>
              <Trans
                i18nKey="path.deleteDialog.description"
                values={{ title: path.title }}
                components={{ strong: <strong style={{ color: 'var(--text)' }} /> }}
              />
            </p>
            <div className="clone-dialog__actions">
              <button className="btn-ghost" onClick={() => setShowDeleteDialog(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn-primary btn-primary--danger" onClick={handleDeletePath} disabled={deletingPath}>
                {deletingPath ? t('path.deleteDialog.deleting') : t('path.deleteDialog.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clone dialog */}
      {showCloneDialog && (
        <div className="theater-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowCloneDialog(false) }}>
          <form className="clone-dialog" onSubmit={handleClone}>
            <h3>{t('common.cloneDialog.title')}</h3>
            <p className="muted" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
              {t('common.cloneDialog.description')}
            </p>
            <div className="field">
              <label>{t('common.name')}</label>
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
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn-primary" disabled={cloning}>
                {cloning ? t('common.cloning') : t('common.clone')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Video card rail */}
      {total === 0 ? (
        <div className="empty-state">
          <svg className="empty-state__icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="14" width="48" height="30" rx="4" stroke="currentColor" strokeWidth="2"/>
            <path d="M27 24l12 7-12 7V24z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
            <path d="M20 50h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M32 44v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <h3 className="empty-state__title">{t('path.empty.title')}</h3>
          <p className="empty-state__desc">{t('path.empty.description')}</p>
          <button
            className="btn-primary empty-state__cta"
            onClick={() => { setShowAddForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          >
            {t('path.empty.cta')}
          </button>
        </div>
      ) : (
        <div className="card-rail" onDragLeave={() => setDragOverId(null)}>
          {path.items.map((item) => (
            <VideoCard
              key={item.id}
              item={item}
              isCompleted={completedIds.has(item.id)}
              onToggleComplete={handleToggleComplete}
              onDelete={handleDeleteItem}
              onEditItem={handleEditItem}
              readOnly={false}
              draggable={true}
              onDragStart={() => setDraggedId(item.id)}
              onDragOver={() => setDragOverId(item.id)}
              onDrop={() => handleDrop(item.id)}
              isDragOver={dragOverId === item.id && draggedId !== item.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
