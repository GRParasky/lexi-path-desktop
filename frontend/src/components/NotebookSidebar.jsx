import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useNotebookStore from '../store/notebookStore'

// Step-by-step path icon: filled dot → line → filled dot → dashed line → empty dot
const PathsIcon = () => (
  <svg width="20" height="12" viewBox="0 0 20 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="2" cy="6" r="2" fill="currentColor"/>
    <line x1="4" y1="6" x2="8" y2="6" stroke="currentColor" strokeWidth="1.5"/>
    <circle cx="10" cy="6" r="2" fill="currentColor"/>
    <line x1="12" y1="6" x2="15.5" y2="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.5 1.5"/>
    <circle cx="18" cy="6" r="2" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
)

// Notebook icon: book shape with ruled lines
const NotebookIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <line x1="2.5" y1="5" x2="13.5" y2="5" stroke="currentColor" strokeWidth="1.3"/>
    <line x1="5.5" y1="7.5" x2="10.5" y2="7.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    <line x1="5.5" y1="9.5" x2="10.5" y2="9.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    <line x1="5.5" y1="11.5" x2="8.5" y2="11.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
  </svg>
)

export default function NotebookSidebar() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const notebooks    = useNotebookStore((s) => s.notebooks)
  const pages        = useNotebookStore((s) => s.pages)
  const expandedIds  = useNotebookStore((s) => s.expandedIds)
  const activePage   = useNotebookStore((s) => s.activePage)
  const toggleExpanded  = useNotebookStore((s) => s.toggleExpanded)
  const createNotebook  = useNotebookStore((s) => s.createNotebook)
  const openPageByItem  = useNotebookStore((s) => s.openPageByItem)
  const closePage       = useNotebookStore((s) => s.closePage)

  const [collapsed, setCollapsed]           = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newTitle, setNewTitle]             = useState('')
  const [creating, setCreating]             = useState(false)

  // Close the editor (if open) and navigate to the dashboard.
  const handleGoToPaths = () => {
    closePage()
    navigate('/dashboard')
  }

  const handleCollapse = () => {
    setCollapsed(true)
    setShowCreateForm(false)
    setNewTitle('')
  }

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

  // ── Collapsed view — icons only, still interactive ──────────────────────────
  if (collapsed) {
    return (
      <aside className="notebook-sidebar notebook-sidebar--collapsed">
        <button
          className="nb-nav-item nb-nav-item--icon-only"
          onClick={handleGoToPaths}
          title={t('notebook.learningPaths')}
        >
          <span className="nb-nav-icon"><PathsIcon /></span>
        </button>

        <div className="nb-sidebar-divider" />

        <button
          className="nb-nav-item nb-nav-item--icon-only"
          onClick={() => navigate('/notebooks')}
          title={t('notebook.sidebarTitle')}
        >
          <span className="nb-nav-icon"><NotebookIcon /></span>
        </button>

        <button
          className="nb-collapse-btn"
          onClick={() => setCollapsed(false)}
          title={t('notebook.expandSidebar')}
        >›</button>
      </aside>
    )
  }

  // ── Expanded view ────────────────────────────────────────────────────────────
  return (
    <aside className="notebook-sidebar">
      {/* Learning Paths navigation */}
      <button className="nb-nav-item" onClick={handleGoToPaths}>
        <span className="nb-nav-icon"><PathsIcon /></span>
        <span className="nb-nav-label">{t('notebook.learningPaths')}</span>
      </button>

      <div className="nb-sidebar-divider" />

      {/* Notebooks section — clicking the header navigates to the notebooks page */}
      <button className="nb-nav-item" onClick={() => navigate('/notebooks')}>
        <span className="nb-nav-icon"><NotebookIcon /></span>
        <span className="nb-nav-label">{t('notebook.sidebarTitle')}</span>
      </button>

      {/* Body: create form + accordion list */}
      <div className="nb-sidebar-body">
        {showCreateForm ? (
          <form className="nb-create-form" onSubmit={handleCreate}>
            <input
              className="nb-create-input"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t('notebook.notebookPlaceholder')}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Escape') { setShowCreateForm(false); setNewTitle('') } }}
            />
            <button type="submit" className="btn-primary-sm" disabled={creating || !newTitle.trim()}>
              {t('notebook.create')}
            </button>
            <button
              type="button"
              className="btn-ghost-sm"
              onClick={() => { setShowCreateForm(false); setNewTitle('') }}
            >✕</button>
          </form>
        ) : (
          <button className="nb-create-btn" onClick={() => setShowCreateForm(true)}>
            {t('notebook.newNotebook')}
          </button>
        )}

        {notebooks.length === 0 && (
          <p className="nb-empty-hint">{t('notebook.emptyHint')}</p>
        )}

        {notebooks.map((notebook) => {
          const isExpanded   = expandedIds.has(notebook.id)
          const notebookPages = pages[notebook.id] || []

          return (
            <div key={notebook.id} className="nb-notebook">
              <div className="nb-notebook-header" onClick={() => toggleExpanded(notebook.id)}>
                <span className={`nb-notebook-arrow ${isExpanded ? 'nb-notebook-arrow--open' : ''}`}>›</span>
                <span className="nb-notebook-name" title={notebook.title}>{notebook.title}</span>
                <span className="nb-notebook-count">{notebook.pages_count}</span>
              </div>

              {isExpanded && (
                <div className="nb-pages">
                  {notebookPages.length === 0 ? (
                    <p className="nb-page-empty">{t('notebook.noPages')}</p>
                  ) : (
                    notebookPages.map((page) => (
                      <div
                        key={page.id}
                        className={`nb-page ${activePage?.id === page.id ? 'nb-page--active' : ''}`}
                        onClick={() => openPageByItem(page.learning_path_item)}
                        title={page.item_title}
                      >
                        <img
                          className="nb-page-thumb"
                          src={`https://i.ytimg.com/vi/${page.item_video_id}/default.jpg`}
                          alt=""
                        />
                        <span className="nb-page-title">{page.item_title}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Collapse toggle */}
      <button
        className="nb-collapse-btn"
        onClick={handleCollapse}
        title={t('notebook.collapseSidebar')}
      >‹</button>
    </aside>
  )
}
