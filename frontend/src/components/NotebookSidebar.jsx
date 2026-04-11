import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import useNotebookStore from '../store/notebookStore'

export default function NotebookSidebar() {
  const { t } = useTranslation()

  const notebooks = useNotebookStore((s) => s.notebooks)
  const pages = useNotebookStore((s) => s.pages)
  const expandedIds = useNotebookStore((s) => s.expandedIds)
  const activePage = useNotebookStore((s) => s.activePage)
  const toggleExpanded = useNotebookStore((s) => s.toggleExpanded)
  const createNotebook = useNotebookStore((s) => s.createNotebook)
  const openPageByItem = useNotebookStore((s) => s.openPageByItem)

  const [collapsed, setCollapsed] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)

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

  const handlePageClick = async (page) => {
    await openPageByItem(page.learning_path_item)
  }

  return (
    <aside className={`notebook-sidebar ${collapsed ? 'notebook-sidebar--collapsed' : ''}`}>
      <div className="nb-sidebar-header">
        {!collapsed && (
          <span className="nb-sidebar-title">{t('notebook.sidebarTitle')}</span>
        )}
        <button
          className="nb-sidebar-toggle"
          onClick={() => { setCollapsed((v) => !v); setShowCreateForm(false) }}
          title={collapsed ? t('notebook.expandSidebar') : t('notebook.collapseSidebar')}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {!collapsed && (
        <>
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
              <button
                type="submit"
                className="btn-primary-sm"
                disabled={creating || !newTitle.trim()}
              >
                {t('notebook.create')}
              </button>
              <button
                type="button"
                className="btn-ghost-sm"
                onClick={() => { setShowCreateForm(false); setNewTitle('') }}
              >
                ✕
              </button>
            </form>
          ) : (
            <button className="nb-create-btn" onClick={() => setShowCreateForm(true)}>
              {t('notebook.newNotebook')}
            </button>
          )}

          <div className="nb-sidebar-body">
            {notebooks.length === 0 ? (
              <p className="nb-empty-hint">{t('notebook.emptyHint')}</p>
            ) : (
              notebooks.map((notebook) => {
                const isExpanded = expandedIds.has(notebook.id)
                const notebookPages = pages[notebook.id] || []

                return (
                  <div key={notebook.id} className="nb-notebook">
                    <div
                      className="nb-notebook-header"
                      onClick={() => toggleExpanded(notebook.id)}
                    >
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
                              onClick={() => handlePageClick(page)}
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
              })
            )}
          </div>
        </>
      )}
    </aside>
  )
}
