import { create } from 'zustand'
import client from '../api/client'

const useNotebookStore = create((set, get) => ({
  notebooks: [],
  // { [notebookId]: [...page objects] } — populated lazily when a notebook is expanded
  pages: {},
  // { [itemId]: pageId } — updated on create/delete; used to show icon state on cards
  // without waiting for the full path to reload.
  itemPageMap: {},
  // Set of notebook IDs currently expanded in the sidebar
  expandedIds: new Set(),
  // The page currently open in the editor (null when editor is closed)
  activePage: null,

  // Called by AppLayout on mount — loads the notebook list once.
  init: async () => {
    try {
      const { data } = await client.get('/notebooks/')
      set({ notebooks: data })
    } catch {
      // Silent — sidebar will show empty state
    }
  },

  // Toggle notebook accordion in the sidebar; lazy-loads pages on first expand.
  toggleExpanded: (notebookId) => {
    const { expandedIds, pages } = get()
    const next = new Set(expandedIds)
    if (next.has(notebookId)) {
      next.delete(notebookId)
      set({ expandedIds: next })
    } else {
      next.add(notebookId)
      set({ expandedIds: next })
      if (!pages[notebookId]) get().fetchPages(notebookId)
    }
  },

  fetchPages: async (notebookId) => {
    try {
      const { data } = await client.get(`/notebooks/${notebookId}/pages/`)
      const newItemEntries = {}
      data.forEach((p) => { newItemEntries[p.learning_path_item] = p.id })
      set((state) => ({
        pages: { ...state.pages, [notebookId]: data },
        itemPageMap: { ...state.itemPageMap, ...newItemEntries },
      }))
    } catch {
      // Silent
    }
  },

  createNotebook: async (title) => {
    const { data } = await client.post('/notebooks/', { title })
    set((state) => ({ notebooks: [...state.notebooks, data] }))
    return data
  },

  renameNotebook: async (id, title) => {
    const { data } = await client.patch(`/notebooks/${id}/`, { title })
    set((state) => ({
      notebooks: state.notebooks.map((n) => n.id === id ? { ...n, title: data.title } : n),
    }))
  },

  deleteNotebook: async (id) => {
    await client.delete(`/notebooks/${id}/`)
    set((state) => {
      const deletedPages = state.pages[id] || []
      const newItemPageMap = { ...state.itemPageMap }
      deletedPages.forEach((p) => { delete newItemPageMap[p.learning_path_item] })
      const newPages = { ...state.pages }
      delete newPages[id]
      const newExpanded = new Set(state.expandedIds)
      newExpanded.delete(id)
      return {
        notebooks: state.notebooks.filter((n) => n.id !== id),
        pages: newPages,
        itemPageMap: newItemPageMap,
        expandedIds: newExpanded,
        activePage: state.activePage?.notebook === id ? null : state.activePage,
      }
    })
  },

  // Used when the card already has a page (notebook_page_id is set) — opens it directly.
  openPageByItem: async (itemId) => {
    try {
      const { data } = await client.get(`/notebooks/pages/by-item/${itemId}/`)
      set({ activePage: data })
      return data
    } catch {
      return null
    }
  },

  // Used by the notebook picker on a card — creates the page if it doesn't exist yet.
  openOrCreatePage: async (notebookId, itemId) => {
    // Check if a page for this item already exists (possibly in a different notebook)
    try {
      const { data } = await client.get(`/notebooks/pages/by-item/${itemId}/`)
      set({ activePage: data })
      return data
    } catch (err) {
      if (err.response?.status === 404) {
        const { data } = await client.post(`/notebooks/${notebookId}/pages/`, {
          learning_path_item: itemId,
        })
        set((state) => ({
          activePage: data,
          itemPageMap: { ...state.itemPageMap, [itemId]: data.id },
          pages: {
            ...state.pages,
            [notebookId]: [...(state.pages[notebookId] || []), data],
          },
          notebooks: state.notebooks.map((n) =>
            n.id === notebookId ? { ...n, pages_count: n.pages_count + 1 } : n
          ),
        }))
        return data
      }
      throw err
    }
  },

  // Auto-save — called by the editor after debounce.
  savePage: async (content) => {
    const { activePage } = get()
    if (!activePage) return
    const savedId = activePage.id  // capture before await — activePage may change
    try {
      await client.patch(`/notebooks/${activePage.notebook}/pages/${activePage.id}/`, { content })
      // Re-check after the request completes: if the user deleted this page and opened
      // a new one while the PATCH was in-flight, activePage.id will have changed.
      // Overwriting without this check would replace the new page's data with the old one.
      if (get().activePage?.id === savedId) {
        set((state) => ({ activePage: { ...state.activePage, content } }))
      }
    } catch {
      // Silent — next keystroke will retry
    }
  },

  deletePage: async (notebookId, pageId) => {
    const { pages } = get()
    const page = (pages[notebookId] || []).find((p) => p.id === pageId)
    await client.delete(`/notebooks/${notebookId}/pages/${pageId}/`)
    set((state) => {
      const newItemPageMap = { ...state.itemPageMap }
      // Set to null instead of deleting — the VideoCard checks (item.id in itemPageMap)
      // to distinguish "no page" (null) from "never seen" (key absent). If we delete the
      // key, the card falls back to item.notebook_page_id (the stale server prop) and
      // keeps the icon highlighted after deletion.
      if (page) newItemPageMap[page.learning_path_item] = null
      return {
        pages: {
          ...state.pages,
          [notebookId]: (state.pages[notebookId] || []).filter((p) => p.id !== pageId),
        },
        itemPageMap: newItemPageMap,
        notebooks: state.notebooks.map((n) =>
          n.id === notebookId ? { ...n, pages_count: Math.max(0, n.pages_count - 1) } : n
        ),
        activePage: state.activePage?.id === pageId ? null : state.activePage,
      }
    })
  },

  closePage: () => set({ activePage: null }),
}))

export default useNotebookStore
