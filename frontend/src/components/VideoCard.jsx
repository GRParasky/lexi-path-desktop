import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import client from '../api/client'
import useNotebookStore from '../store/notebookStore'

// Small notepad icon used in the card-actions area
const NoteIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <line x1="3.5" y1="4" x2="8.5" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <line x1="3.5" y1="6" x2="8.5" y2="6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <line x1="3.5" y1="8" x2="6.5" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
)

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

  // Notebook store — used to open/create pages and know the icon state
  const notebooks = useNotebookStore((s) => s.notebooks)
  const itemPageMap = useNotebookStore((s) => s.itemPageMap)
  const openPageByItem = useNotebookStore((s) => s.openPageByItem)
  const openOrCreatePage = useNotebookStore((s) => s.openOrCreatePage)
  const createNotebook = useNotebookStore((s) => s.createNotebook)

  // True when this item already has a notebook page.
  // Uses explicit 'in' check to distinguish:
  //   - key absent → never fetched; fall back to server prop (item.notebook_page_id)
  //   - key = null  → page was deleted this session; ignore server prop
  //   - key = id    → page was created/found this session
  const hasNotebookPage = item.id in itemPageMap
    ? !!itemPageMap[item.id]
    : !!item.notebook_page_id

  // Notebook picker state — shown as a card-overlay when user clicks the icon
  // on an item that has no page yet.
  const [notebookPickerOpen, setNotebookPickerOpen] = useState(false)
  const [showNewNotebookInput, setShowNewNotebookInput] = useState(false)
  const [newNotebookTitle, setNewNotebookTitle] = useState('')
  const [creatingNotebook, setCreatingNotebook] = useState(false)
  const [openingPage, setOpeningPage] = useState(false)

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

  // Online stream state — for non-downloaded videos in theater mode.
  // We try to stream via /api/videos/online-stream/ first; if yt-dlp fails
  // or the format isn't available, fall back to Download & Watch / Watch on YouTube.
  const [onlineStreamFailed, setOnlineStreamFailed] = useState(false)
  const [onlineStreamLoading, setOnlineStreamLoading] = useState(false)

  // Offline video state — initialised from the API response.
  // download_status: 'none' | 'downloading' | 'done' | 'error'
  // has_local_file: true only when the file physically exists on disk
  const [downloadStatus, setDownloadStatus] = useState(item.download_status ?? 'none')
  const [hasLocalFile, setHasLocalFile] = useState(item.has_local_file ?? false)
  const [downloadProgress, setDownloadProgress] = useState(null) // 0-100 or null
  const [downloadError, setDownloadError] = useState(item.download_error ?? '')

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

  // Close notebook picker on Escape
  useEffect(() => {
    if (!notebookPickerOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setNotebookPickerOpen(false)
        setShowNewNotebookInput(false)
        setNewNotebookTitle('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [notebookPickerOpen])

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
        if (data.download_error) setDownloadError(data.download_error)
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
      setOnlineStreamFailed(false)
      setOnlineStreamLoading(false)
      return
    }
    // Token is used for both local serve and online stream endpoints —
    // always fetch it when theater opens, regardless of download status.
    client.post(`/videos/token/${item.id}/`)
      .then(({ data }) => {
        setVideoToken(data.token)
        setLocalPath(data.local_path || null)
      })
      .catch(() => setTokenError(true))
  }, [theater, item.id])

  // ── Offline actions ────────────────────────────────────────────────────────

  const handleDownload = async () => {
    try {
      setDownloadError('')
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
      setDownloadError('')
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

  // ── Notebook actions ──────────────────────────────────────────────────────

  const handleNotebookIconClick = async (e) => {
    e.stopPropagation()
    if (hasNotebookPage) {
      await openPageByItem(item.id)
    } else {
      setNotebookPickerOpen(true)
    }
  }

  const handlePickNotebook = async (notebookId) => {
    setOpeningPage(true)
    try {
      await openOrCreatePage(notebookId, item.id)
      setNotebookPickerOpen(false)
    } finally {
      setOpeningPage(false)
    }
  }

  const handleCreateAndOpen = async (e) => {
    e.preventDefault()
    if (!newNotebookTitle.trim()) return
    setCreatingNotebook(true)
    try {
      const notebook = await createNotebook(newNotebookTitle.trim())
      await openOrCreatePage(notebook.id, item.id)
      setNotebookPickerOpen(false)
    } finally {
      setCreatingNotebook(false)
      setNewNotebookTitle('')
      setShowNewNotebookInput(false)
    }
  }

  // Close theater and open/create notebook page
  const handleTheaterNotebook = async () => {
    setTheater(false)
    if (hasNotebookPage) {
      await openPageByItem(item.id)
    } else {
      setNotebookPickerOpen(true)
    }
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
        {/* Card-level overlays: edit / delete-confirm */}
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
                className={`card-action-btn ${hasNotebookPage ? 'card-action-btn--notebook-active' : ''}`}
                onClick={handleNotebookIconClick}
                title={t(hasNotebookPage ? 'notebook.openNotes' : 'notebook.addToNotebook')}
              >
                <NoteIcon />
              </button>
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
                // Not downloaded — try online streaming via yt-dlp proxy first.
                // If extraction fails (bot detection, DASH-only, unavailable),
                // onError fires and we fall back to Download & Watch / Watch on YouTube.
                (!videoToken && !tokenError) ? (
                  <div className="theater-loading"><span className="spinner-sm" /></div>
                ) : (tokenError || onlineStreamFailed) ? (
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
                        ↗ {t('video.watchOnYouTube')}
                      </a>
                    </div>
                  </div>
                ) : (
                  <>
                    {onlineStreamLoading && (
                      <div className="theater-loading">
                        <span className="spinner-sm" />
                        <span className="theater-loading__label">{t('video.connecting')}</span>
                      </div>
                    )}
                    <video
                      controls
                      autoPlay
                      style={onlineStreamLoading ? { display: 'none' } : undefined}
                      src={`/api/videos/online-stream/${item.id}/?token=${videoToken}`}
                      onLoadStart={() => setOnlineStreamLoading(true)}
                      onCanPlay={() => setOnlineStreamLoading(false)}
                      onError={() => { setOnlineStreamLoading(false); setOnlineStreamFailed(true) }}
                    />
                  </>
                )
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
                  {/* Notebook button — closes theater and opens the page editor */}
                  <button
                    className={`btn-ghost-sm ${hasNotebookPage ? 'btn-ghost-sm--notebook' : ''}`}
                    onClick={handleTheaterNotebook}
                    title={t(hasNotebookPage ? 'notebook.openNotes' : 'notebook.addToNotebook')}
                  >
                    {t('notebook.openNotebook')}
                  </button>

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
                        <span className="offline-status offline-status--error" title={downloadError ? t(`video.error.${downloadError}`) : undefined}>
                          {t('video.downloadFailed')}
                        </span>
                        {downloadError && (
                          <span className="offline-error-reason">
                            {t(`video.error.${downloadError}`, t('video.error.unknown'))}
                          </span>
                        )}
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

      {/* ── Notebook picker modal ── */}
      {notebookPickerOpen && (
        <div
          className="theater-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setNotebookPickerOpen(false)
              setShowNewNotebookInput(false)
              setNewNotebookTitle('')
            }
          }}
        >
          <div className="nb-picker-modal">
            <button
              className="theater-close"
              onClick={() => {
                setNotebookPickerOpen(false)
                setShowNewNotebookInput(false)
                setNewNotebookTitle('')
              }}
            >✕</button>

            <h2 className="nb-picker-modal__title">{t('notebook.pickNotebook')}</h2>

            <div className="nb-picker-modal__list">
              {notebooks.length === 0 && (
                <p className="nb-picker-modal__empty">{t('notebook.emptyHint')}</p>
              )}
              {notebooks.map((nb) => (
                <button
                  key={nb.id}
                  className="nb-picker-modal__item"
                  onClick={() => handlePickNotebook(nb.id)}
                  disabled={openingPage}
                >
                  <span className="nb-picker-modal__name">{nb.title}</span>
                  <span className="nb-picker-modal__count">{nb.pages_count}</span>
                </button>
              ))}
            </div>

            {showNewNotebookInput ? (
              <form className="nb-picker-modal__new-form" onSubmit={handleCreateAndOpen}>
                <input
                  className="nb-picker-modal__new-input"
                  value={newNotebookTitle}
                  onChange={(e) => setNewNotebookTitle(e.target.value)}
                  placeholder={t('notebook.notebookPlaceholder')}
                  autoFocus
                />
                <div className="nb-picker-modal__new-actions">
                  <button
                    type="submit"
                    className="btn-primary-sm"
                    disabled={creatingNotebook || !newNotebookTitle.trim()}
                  >
                    {t('notebook.create')}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost-sm"
                    onClick={() => { setShowNewNotebookInput(false); setNewNotebookTitle('') }}
                  >
                    ✕
                  </button>
                </div>
              </form>
            ) : (
              <button
                className="nb-picker-modal__new-btn"
                onClick={() => setShowNewNotebookInput(true)}
              >
                {t('notebook.newNotebook')}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
