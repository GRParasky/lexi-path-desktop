import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import useNotebookStore from '../store/notebookStore'

// Trash icon used on the hover-reveal delete button (top-right of each card)
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M2 3h8M4.5 3V2a1 1 0 011-1h1a1 1 0 011 1v1M3 3l.5 7a1 1 0 001 1h3a1 1 0 001-1L9 3"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
)

export default function NotebooksPage() {
  const { t } = useTranslation()

  const notebooks      = useNotebookStore((s) => s.notebooks)
  const pages          = useNotebookStore((s) => s.pages)
  const expandedIds    = useNotebookStore((s) => s.expandedIds)
  const toggleExpanded = useNotebookStore((s) => s.toggleExpanded)
  const createNotebook = useNotebookStore((s) => s.createNotebook)
  const openPageByItem = useNotebookStore((s) => s.openPageByItem)
  const deleteNotebook = useNotebookStore((s) => s.deleteNotebook)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newTitle, setNewTitle]             = useState('')
  const [creating, setCreating]             = useState(false)

  // Inline delete confirmation — one card at a time
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deletingId, setDeletingId]           = useState(null)

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      await createNotebook(newTitle.trim())
      setNewTitle('')
      setShowCreateForm(false)
    } finally {
      setCreating(false)
    }
  }

  const handleConfirmDelete = async (id) => {
    setDeletingId(id)
    try {
      await deleteNotebook(id)
      setConfirmDeleteId(null)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>LexiPath</h1>
      </header>

      <main className="dashboard-main">
        <div className="section-header">
          <h2>{t('notebook.sidebarTitle')}</h2>
          <div className="section-header__actions">
            <button
              className="btn-primary"
              onClick={() => setShowCreateForm((v) => !v)}
            >
              {showCreateForm ? t('common.cancel') : t('notebook.newNotebook')}
            </button>
          </div>
        </div>

        {showCreateForm && (
          <form onSubmit={handleCreate} className="create-form">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t('notebook.notebookPlaceholder')}
              autoFocus
              required
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setShowCreateForm(false); setNewTitle('') }
              }}
            />
            <button type="submit" disabled={creating || !newTitle.trim()} className="btn-primary">
              {creating ? '…' : t('notebook.create')}
            </button>
          </form>
        )}

        {notebooks.length === 0 ? (
          <div className="empty-state">
            <svg className="empty-state__icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="10" y="8" width="38" height="48" rx="4" stroke="currentColor" strokeWidth="2"/>
              <line x1="10" y1="20" x2="48" y2="20" stroke="currentColor" strokeWidth="2"/>
              <line x1="20" y1="30" x2="38" y2="30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="20" y1="37" x2="38" y2="37" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="20" y1="44" x2="30" y2="44" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <h3 className="empty-state__title">{t('notebook.emptyPageTitle')}</h3>
            <p className="empty-state__desc">{t('notebook.emptyPageDesc')}</p>
            <button className="btn-primary empty-state__cta" onClick={() => setShowCreateForm(true)}>
              {t('notebook.newNotebook')}
            </button>
          </div>
        ) : (
          <div className="nb-notebooks-grid">
            {notebooks.map((notebook) => {
              const isExpanded    = expandedIds.has(notebook.id)
              const isConfirming  = confirmDeleteId === notebook.id
              const isDeleting    = deletingId === notebook.id
              const notebookPages = pages[notebook.id] || []

              if (isConfirming) {
                return (
                  <div key={notebook.id} className="nb-notebooks-card nb-notebooks-card--confirming">
                    <div className="nb-notebooks-card__confirm">
                      <p className="nb-notebooks-card__confirm-text">
                        {t('notebook.deleteNotebookConfirm', { title: notebook.title })}
                      </p>
                      <p className="nb-notebooks-card__confirm-hint">
                        {t('notebook.deleteNotebookHint')}
                      </p>
                      <div className="card-confirm-actions">
                        <button
                          className="btn-ghost-sm"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={isDeleting}
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          className="btn-danger-sm"
                          onClick={() => handleConfirmDelete(notebook.id)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? '…' : t('common.delete')}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }

              return (
                <div key={notebook.id} className="nb-notebooks-card">
                  <div
                    className="nb-notebooks-card__header"
                    onClick={() => toggleExpanded(notebook.id)}
                  >
                    <span className={`nb-notebooks-card__arrow ${isExpanded ? 'nb-notebooks-card__arrow--open' : ''}`}>
                      ›
                    </span>
                    <span className="nb-notebooks-card__title" title={notebook.title}>
                      {notebook.title}
                    </span>
                    <span className="nb-notebooks-card__badge">{notebook.pages_count}</span>
                    <button
                      type="button"
                      className="nb-notebooks-card__delete"
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(notebook.id) }}
                      title={t('notebook.deleteNotebook')}
                      aria-label={t('notebook.deleteNotebook')}
                    >
                      <TrashIcon />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="nb-notebooks-card__pages">
                      {notebookPages.length === 0 ? (
                        <p className="nb-notebooks-card__empty">{t('notebook.noPages')}</p>
                      ) : (
                        <div className="nb-page-cards">
                          {notebookPages.map((page) => (
                            <button
                              key={page.id}
                              className="nb-page-card"
                              onClick={() => openPageByItem(page.learning_path_item)}
                            >
                              <img
                                className="nb-page-card__thumb"
                                src={`https://i.ytimg.com/vi/${page.item_video_id}/default.jpg`}
                                alt=""
                              />
                              <span className="nb-page-card__title">{page.item_title}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
