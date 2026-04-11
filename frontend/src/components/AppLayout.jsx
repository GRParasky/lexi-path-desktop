import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import NotebookSidebar from './NotebookSidebar'
import NotebookEditor from './NotebookEditor'
import useNotebookStore from '../store/notebookStore'

// AppLayout wraps all inner routes (Dashboard + PathPage).
// It adds the persistent notebook sidebar on the left and renders the editor
// panel when a notebook page is open.
export default function AppLayout() {
  const activePage = useNotebookStore((s) => s.activePage)
  const init = useNotebookStore((s) => s.init)

  useEffect(() => {
    init()
  }, [])

  return (
    <div className="app-layout">
      <NotebookSidebar />
      {/* app-main is hidden (not unmounted) when the editor is open so
          the page state (scroll position, forms) is preserved. */}
      <div className={`app-main ${activePage ? 'app-main--editor-open' : ''}`}>
        <Outlet />
      </div>
      {activePage && <NotebookEditor />}
    </div>
  )
}
