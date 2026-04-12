import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import useNotebookStore from '../store/notebookStore'

export default function NotebooksPage() {
  const { t } = useTranslation()

  const notebooks      = useNotebookStore((s) => s.notebooks)
  const pages          = useNotebookStore((s) => s.pages)
  const expandedIds    = useNotebookStore((s) => s.expandedIds)
  const toggleExpanded = useNotebookStore((s) => s.toggleExpanded)
  const createNotebook = useNotebookStore((s) => s.createNotebook)
  const openPageByItem = useNotebookStore((s) => s.openPageByItem)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newTitle, setNewTitle]             = useState('')
  const [creating, setCreating]             = useState(false)

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
          <div className="nb-notebooks-list">
            {notebooks.map((notebook) => {
              const isExpanded    = expandedIds.has(notebook.id)
              const notebookPages = pages[notebook.id] || []

              return (
                <div key={notebook.id} className="nb-notebooks-item">
                  <div
                    className="nb-notebooks-item__header"
                    onClick={() => toggleExpanded(notebook.id)}
                  >
                    <span className={`nb-notebooks-item__arrow ${isExpanded ? 'nb-notebooks-item__arrow--open' : ''}`}>
                      ›
                    </span>
                    <span className="nb-notebooks-item__title">{notebook.title}</span>
                    <span className="nb-notebooks-item__badge">{notebook.pages_count}</span>
                  </div>

                  {isExpanded && (
                    <div className="nb-notebooks-item__pages">
                      {notebookPages.length === 0 ? (
                        <p className="nb-notebooks-item__empty">{t('notebook.noPages')}</p>
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
