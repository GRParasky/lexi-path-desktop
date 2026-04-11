import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import useNotebookStore from '../store/notebookStore'

export default function NotebookEditor() {
  const { t } = useTranslation()

  const activePage = useNotebookStore((s) => s.activePage)
  const notebooks = useNotebookStore((s) => s.notebooks)
  const savePage = useNotebookStore((s) => s.savePage)
  const closePage = useNotebookStore((s) => s.closePage)
  const deletePage = useNotebookStore((s) => s.deletePage)

  const [saveState, setSaveState] = useState(null) // null | 'saving' | 'saved'
  const [confirmDelete, setConfirmDelete] = useState(false)
  const saveTimer = useRef(null)
  // Track which page is loaded to avoid resetting content on unrelated re-renders
  const loadedPageId = useRef(null)

  const notebookName = notebooks.find((n) => n.id === activePage?.notebook)?.title ?? ''

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: t('notebook.notesPlaceholder') }),
    ],
    content: activePage?.content?.type === 'doc' ? activePage.content : '',
    onUpdate: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      setSaveState('saving')
      saveTimer.current = setTimeout(async () => {
        await savePage(editor.getJSON())
        setSaveState('saved')
        setTimeout(() => setSaveState(null), 2000)
      }, 1500)
    },
  })

  // When the user opens a different page, load its content into the editor.
  useEffect(() => {
    if (!editor || !activePage) return
    if (loadedPageId.current === activePage.id) return
    loadedPageId.current = activePage.id
    const content = activePage.content?.type === 'doc' ? activePage.content : ''
    // false = do not trigger the onUpdate handler (avoids a spurious save)
    editor.commands.setContent(content, false)
    setSaveState(null)
  }, [activePage?.id, editor])

  // Flush pending save and close the editor.
  const handleClose = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      if (editor) savePage(editor.getJSON())
    }
    loadedPageId.current = null
    closePage()
  }, [editor, savePage, closePage])

  // Close editor on Escape
  useEffect(() => {
    if (!activePage) return
    const onKey = (e) => { if (e.key === 'Escape' && !confirmDelete) handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activePage, confirmDelete, handleClose])

  const handleDeletePage = async () => {
    if (!activePage) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await deletePage(activePage.notebook, activePage.id)
    loadedPageId.current = null
    setConfirmDelete(false)
  }

  // Toolbar button helper — uses onMouseDown + preventDefault to prevent the
  // editor from losing focus when a toolbar button is clicked.
  const ToolbarBtn = ({ onClick, active, children, title }) => (
    <button
      className={`nb-toolbar-btn ${active ? 'nb-toolbar-btn--active' : ''}`}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
    >
      {children}
    </button>
  )

  if (!activePage) return null

  return (
    <div className="notebook-editor-panel">
      {/* Header */}
      <div className="nb-editor-header">
        <button className="nb-editor-back" onClick={handleClose}>
          ← {t('notebook.backToContent')}
        </button>
        <div className="nb-editor-breadcrumb">
          <p className="nb-editor-notebook">{notebookName}</p>
          <p className="nb-editor-title" title={activePage.item_title}>
            {activePage.item_title}
          </p>
        </div>
        {saveState && (
          <span className="nb-editor-saving">
            {saveState === 'saving' ? t('notebook.saving') : t('notebook.saved')}
          </span>
        )}
        {confirmDelete ? (
          <div className="nb-editor-delete-confirm">
            <span>{t('notebook.confirmDelete')}</span>
            <button className="btn-danger-sm" onClick={handleDeletePage}>
              {t('common.delete')}
            </button>
            <button className="btn-ghost-sm" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <button
            className="btn-ghost-sm btn-ghost-sm--danger"
            onClick={() => setConfirmDelete(true)}
          >
            {t('notebook.deletePage')}
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="nb-editor-toolbar">
        <ToolbarBtn
          active={editor?.isActive('bold')}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          title="Bold (Ctrl+B)"
        >
          <strong>B</strong>
        </ToolbarBtn>

        <div className="nb-editor-divider" />

        <ToolbarBtn
          active={editor?.isActive('paragraph')}
          onClick={() => editor?.chain().focus().setParagraph().run()}
          title={t('notebook.normalText')}
        >
          {t('notebook.normalText')}
        </ToolbarBtn>
        <ToolbarBtn
          active={editor?.isActive('heading', { level: 1 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
        >
          H1
        </ToolbarBtn>
        <ToolbarBtn
          active={editor?.isActive('heading', { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          H2
        </ToolbarBtn>
        <ToolbarBtn
          active={editor?.isActive('heading', { level: 3 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        >
          H3
        </ToolbarBtn>
      </div>

      {/* Editor area */}
      <div className="nb-editor-body">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
