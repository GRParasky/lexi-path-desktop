import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import client from '../api/client'

// Basic YouTube URL check — mirrors the backend's extract_youtube_video_id logic.
// Only used for client-side feedback before the request is sent.
const YOUTUBE_URL_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]+/

export default function VideoCard({
  item,
  isCompleted,
  onToggleComplete,
  onDelete,
  onEditItem,
  readOnly,
  // drag-and-drop
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
}) {
  const { t } = useTranslation()
  const [theater, setTheater] = useState(false)
  const [toggling, setToggling] = useState(false)

  // Theater-level delete confirm
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Theater-level inline title edit
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  // Card-level quick edit (pencil hover button)
  const [cardEditing, setCardEditing] = useState(false)
  const [cardTitleDraft, setCardTitleDraft] = useState('')
  const [cardUrlDraft, setCardUrlDraft] = useState('')
  const [cardUrlError, setCardUrlError] = useState(null)

  // Card-level delete confirm (trash hover button)
  const [cardConfirmDelete, setCardConfirmDelete] = useState(false)
  const [cardDeleting, setCardDeleting] = useState(false)

  // Offline video state — initialised from the API response.
  // download_status: 'none' | 'downloading' | 'done' | 'error'
  // has_local_file: true only when the file physically exists on disk
  const [downloadStatus, setDownloadStatus] = useState(item.download_status ?? 'none')
  const [hasLocalFile, setHasLocalFile] = useState(item.has_local_file ?? false)
  const [downloadProgress, setDownloadProgress] = useState(null) // 0-100 or null

  // Short-lived token for the <video> src URL.
  // The browser's native media player can't send Authorization headers,
  // so we request a UUID token and append it as ?token= instead.
  const [videoToken, setVideoToken] = useState(null)
  const [localPath, setLocalPath] = useState(null)
  const [useNativeProtocol, setUseNativeProtocol] = useState(true)
  const [tokenError, setTokenError] = useState(false)
  const [videoError, setVideoError] = useState(false)

  // Prevent card click from opening theater right after a drag ends
  const justDragged = useRef(false)

  // Close theater on Escape
  useEffect(() => {
    if (!theater) return
    const onKey = (e) => { if (e.key === 'Escape') setTheater(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [theater])

  // Close card edit on Escape
  useEffect(() => {
    if (!cardEditing) return
    const onKey = (e) => { if (e.key === 'Escape') setCardEditing(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cardEditing])

  // Poll the download status every 2 s while a download is in progress.
  // The backend runs yt-dlp in a background thread and updates the model
  // when it finishes — polling is the simplest way to reflect that here.
  useEffect(() => {
    if (downloadStatus !== 'downloading') return

    const interval = setInterval(async () => {
      try {
        const { data } = await client.get(`/videos/download/${item.id}/`)
        setDownloadStatus(data.status)
        setDownloadProgress(data.progress ?? null)
        if (data.has_local_file) setHasLocalFile(true)
      } catch {
        setDownloadStatus('error')
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [downloadStatus, item.id])

  // Fetch a video stream token whenever the theater opens.
  // Used for both local files (/videos/serve/) and online streams (/videos/online-stream/).
  // The token is passed as ?token= so the browser's media player can
  // authenticate without sending custom Authorization headers.
  useEffect(() => {
    if (!theater) {
      setVideoToken(null)
      setLocalPath(null)
      setUseNativeProtocol(true)
      setTokenError(false)
      setVideoError(false)
      return
    }
    // Only fetch a token when the video has been downloaded locally.
    // Online videos use the YouTube iframe and don't need a token.
    if (!hasLocalFile) return
    client.post(`/videos/token/${item.id}/`)
      .then(({ data }) => {
        setVideoToken(data.token)
        setLocalPath(data.local_path || null)
      })
      .catch(() => setTokenError(true))
  }, [theater, item.id, hasLocalFile])

  // ── Offline actions ────────────────────────────────────────────────────────

  const handleDownload = async () => {
    try {
      const { data } = await client.post(`/videos/download/${item.id}/`)
      setDownloadStatus(data.status)
    } catch {
      setDownloadStatus('error')
    }
  }

  const handleRemoveOffline = async () => {
    try {
      await client.delete(`/videos/download/${item.id}/`)
      setDownloadStatus('none')
      setHasLocalFile(false)
    } catch {
      // silently ignore — worst case the badge stays until next reload
    }
  }

  // ── Theater actions ────────────────────────────────────────────────────────

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(item.id)
      setTheater(false)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const handleToggle = async () => {
    if (toggling) return
    setToggling(true)
    try {
      if (isCompleted) {
        await client.delete(`/progress/items/${item.id}/complete/`)
      } else {
        await client.post(`/progress/items/${item.id}/complete/`)
      }
      onToggleComplete(item.id, !isCompleted)
    } catch (err) {
      console.error('Failed to toggle completion', err)
    } finally {
      setToggling(false)
    }
  }

  const handleSaveTitle = () => {
    const value = titleDraft.trim()
    setEditingTitle(false)
    if (!value || value === item.title) return
    onEditItem(item.id, { title: value })
  }

  // ── Card quick-edit actions ────────────────────────────────────────────────

  const openCardEdit = (e) => {
    e.stopPropagation()
    setCardTitleDraft(item.title)
    setCardUrlDraft(item.youtube_url)
    setCardUrlError(null)
    setCardEditing(true)
  }

  const handleCardSave = () => {
    const title = cardTitleDraft.trim()
    const url = cardUrlDraft.trim()
    if (!title) return
    if (url !== item.youtube_url && !YOUTUBE_URL_RE.test(url)) {
      setCardUrlError(t('video.invalidUrl'))
      return
    }
    setCardUrlError(null)
    setCardEditing(false)
    const fields = {}
    if (title !== item.title) fields.title = title
    if (url !== item.youtube_url) fields.youtube_url = url
    if (Object.keys(fields).length > 0) onEditItem(item.id, fields)
  }

  const handleCardDelete = async () => {
    setCardDeleting(true)
    try {
      await onDelete(item.id)
    } finally {
      setCardDeleting(false)
      setCardConfirmDelete(false)
    }
  }

  return (
    <>
      {/* ── Card (thumbnail + offline badge + hover actions) ── */}
      <div
        className={`video-card ${isCompleted ? 'video-card--done' : ''} ${isDragOver ? 'video-card--drag-over' : ''}`}
        draggable={draggable}
        onClick={() => {
          if (justDragged.current || cardEditing || cardConfirmDelete) return
          setTheater(true)
        }}
        onDragStart={() => { justDragged.current = false; onDragStart?.() }}
        onDragEnd={() => { justDragged.current = true; setTimeout(() => { justDragged.current = false }, 100) }}
        onDragOver={(e) => { e.preventDefault(); onDragOver?.() }}
        onDrop={(e) => { e.preventDefault(); onDrop?.() }}
        title={draggable ? t('video.dragToReorder') : t('video.openTheater')}
      >
        {/* Card-level edit / delete-confirm overlay */}
        {(cardEditing || cardConfirmDelete) && (
          <div className="card-overlay" onClick={(e) => e.stopPropagation()}>
            {cardEditing ? (
              <form
                className="card-edit-form"
                onSubmit={(e) => { e.preventDefault(); handleCardSave() }}
              >
                <input
                  className="card-edit-input"
                  value={cardTitleDraft}
                  onChange={(e) => setCardTitleDraft(e.target.value)}
                  placeholder={t('video.clickToEditTitle')}
                  autoFocus
                />
                <input
                  className="card-edit-input"
                  value={cardUrlDraft}
                  onChange={(e) => { setCardUrlDraft(e.target.value); setCardUrlError(null) }}
                  placeholder="YouTube URL"
                />
                {cardUrlError && <span className="card-edit-error">{cardUrlError}</span>}
                <div className="card-edit-actions">
                  <button type="submit" className="btn-primary-sm">{t('common.save')}</button>
                  <button type="button" className="btn-ghost-sm" onClick={() => setCardEditing(false)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            ) : (
              <div className="card-confirm">
                <p>{t('video.removeVideo')}</p>
                <div className="card-confirm-actions">
                  <button className="btn-danger-sm" onClick={handleCardDelete} disabled={cardDeleting}>
                    {cardDeleting ? '…' : t('video.yesDelete')}
                  </button>
                  <button className="btn-ghost-sm" onClick={() => setCardConfirmDelete(false)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="video-card__thumb">
          <img src={item.thumbnail_url} alt={item.title} />
          <div className="play-overlay">▶</div>
          {hasLocalFile && (
            <span className="offline-badge" title={t('video.offlineAvailable')}>{t('video.offlineBadge')}</span>
          )}
        </div>
        <div className="video-card__body">
          <p className="video-card__pos">#{item.position + 1}</p>
          <h3 className="video-card__title">{item.title}</h3>
          {isCompleted && <span className="card-done-badge">{t('video.doneBadge')}</span>}
          {!readOnly && (
            <div className="card-actions">
              <button
                className="card-action-btn"
                onClick={openCardEdit}
                title={t('video.editVideo')}
              >✎</button>
              <button
                className="card-action-btn card-action-btn--danger"
                onClick={(e) => { e.stopPropagation(); setCardConfirmDelete(true) }}
                title={t('common.delete')}
              >✕</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Theater overlay ── */}
      {theater && (
        <div
          className="theater-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setTheater(false) }}
        >
          <div className="theater-modal">
            <button className="theater-close" onClick={() => setTheater(false)}>✕</button>

            <div className="theater-player">
              {hasLocalFile ? (
                // Downloaded video — served natively via Electron's lexipath://
                // protocol (bypasses Python entirely). Falls back to Django proxy
                // if lexipath:// is not available (browser dev mode).
                videoToken ? (
                  <video
                    controls
                    autoPlay
                    src={
                      localPath && useNativeProtocol
                        ? `lexipath://video?path=${encodeURIComponent(localPath)}`
                        : `/api/videos/serve/${item.id}/?token=${videoToken}`
                    }
                    onError={() => {
                      if (localPath && useNativeProtocol) {
                        setUseNativeProtocol(false) // retry with Django proxy
                      } else {
                        setVideoError(true)
                      }
                    }}
                  />
                ) : tokenError || videoError ? (
                  <div className="theater-yt-fallback">
                    <p className="theater-yt-fallback__msg">{t('video.localFileError')}</p>
                  </div>
                ) : (
                  <div className="theater-loading"><span className="spinner-sm" /></div>
                )
              ) : (
                // Not downloaded — Electron runs an isolated Chromium with no
                // YouTube cookies, so iframes always trigger bot detection.
                // Show a clear prompt instead: download to watch offline (primary)
                // or open in the user's real browser (secondary).
                <div className="theater-not-downloaded">
                  <img
                    src={`https://i.ytimg.com/vi/${item.video_id}/hqdefault.jpg`}
                    alt={item.title}
                    className="theater-not-downloaded__thumb"
                  />
                  <div className="theater-not-downloaded__actions">
                    {!readOnly && (
                      <button
                        className="btn-primary theater-not-downloaded__download"
                        onClick={() => { setTheater(false); handleDownload() }}
                        disabled={downloadStatus === 'downloading'}
                      >
                        ⬇ {t('video.downloadToWatch')}
                      </button>
                    )}
                    <a
                      href={`https://www.youtube.com/watch?v=${item.video_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="theater-not-downloaded__external"
                    >
                      ↗ {t('watchOnYouTube')}
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="theater-footer">
              <div className="theater-meta">
                <span className="video-card__pos">#{item.position + 1}</span>
                {!readOnly && editingTitle ? (
                  <input
                    className="inline-edit inline-edit--theater-title"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={handleSaveTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.target.blur()
                      if (e.key === 'Escape') setEditingTitle(false)
                    }}
                    autoFocus
                  />
                ) : (
                  <h2
                    className={`theater-title ${!readOnly ? 'editable-field' : ''}`}
                    title={!readOnly ? t('video.clickToEditTitle') : undefined}
                    onClick={() => { if (!readOnly) { setTitleDraft(item.title); setEditingTitle(true) } }}
                  >
                    {item.title}
                  </h2>
                )}
              </div>

              {!readOnly && (
                <div className="theater-footer__actions">
                  {/* Offline download controls */}
                  <div className="offline-controls">
                    {downloadStatus === 'none' && (
                      <button className="btn-ghost-sm" onClick={handleDownload} title={t('video.downloadTitle')}>
                        {t('video.download')}
                      </button>
                    )}
                    {downloadStatus === 'downloading' && (
                      <span className="offline-status offline-status--downloading">
                        <span className="spinner-sm" />
                        {downloadProgress !== null ? `${downloadProgress}%` : t('video.downloading')}
                      </span>
                    )}
                    {downloadStatus === 'done' && (
                      <>
                        <span className="offline-status offline-status--done">{t('video.offlineDone')}</span>
                        <button className="btn-ghost-sm" onClick={handleRemoveOffline} title={t('video.removeTitle')}>
                          {t('video.remove')}
                        </button>
                      </>
                    )}
                    {downloadStatus === 'error' && (
                      <>
                        <span className="offline-status offline-status--error">{t('video.downloadFailed')}</span>
                        <button className="btn-ghost-sm" onClick={handleDownload}>
                          {t('video.retry')}
                        </button>
                      </>
                    )}
                  </div>

                  <button
                    className={`btn-complete ${isCompleted ? 'btn-complete--done' : ''}`}
                    onClick={handleToggle}
                    disabled={toggling}
                  >
                    {isCompleted ? t('video.doneBadge') : t('video.markComplete')}
                  </button>

                  {confirmDelete ? (
                    <div className="delete-confirm">
                      <span>{t('video.removeVideo')}</span>
                      <button className="btn-danger-sm" onClick={handleDelete} disabled={deleting}>
                        {deleting ? '…' : t('video.yesDelete')}
                      </button>
                      <button className="btn-ghost-sm" onClick={() => setConfirmDelete(false)}>
                        {t('common.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button className="btn-ghost-sm btn-ghost-sm--danger" onClick={() => setConfirmDelete(true)}>
                      {t('common.delete')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
