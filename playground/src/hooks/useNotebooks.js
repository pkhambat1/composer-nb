/* useNotebooks hook — notebooks kept on this device: the list of them, which one is open,
   and saving the open one as it changes. A notebook is a title and its cells' sources;
   an account would sync the same thing. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cellId } from "./useCellManager.js"

const KEY = "composer-nb:notebooks"
const FILE_KIND = "composer-nb notebook"

const notebookId = () => "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const bare = (cells) => cells.map((c) => ({ type: c.type, source: c.source }))
const sameCells = (a, b) =>
  a.length === b.length && a.every((c, i) => c.type === b[i].type && c.source === b[i].source)

// What's stored: { current, list: [{ id, title, cells, updated }] }, or null when there's
// nothing yet or storage isn't there.
export function loadStore() {
  try {
    const store = JSON.parse(localStorage.getItem(KEY))
    if (store && Array.isArray(store.list)) return store
  } catch {
    return null
  }
  return null
}

function saveStore(store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // out of room, or storage not allowed: the notebook stays as it is on the page
  }
}

// A notebook's title, from its first heading when it has one.
export function titleOf(cells, fallback = "Untitled") {
  for (const c of cells) {
    if (c.type !== "text") continue
    const m = /^#+\s+(.+)$/m.exec(c.source)
    if (m) return m[1].trim()
  }
  return fallback
}

// Cells for the page: each with its own id and no output yet.
export function withIds(cells) {
  return cells.map((c) => ({
    id: cellId(),
    type: c.type,
    source: c.source,
    runCount: null,
    output: null,
    status: "idle",
  }))
}

// What the page opens with: the cells a link brought (as a notebook of their own, unless
// one just like it is already here), else the notebook that was open, else the starters as
// the first notebook. Returns { store, cells }.
export function openingNotebook(starters, opened) {
  let store = loadStore() || { current: null, list: [] }
  if (opened) {
    let nb = store.list.find((n) => sameCells(n.cells, opened))
    if (!nb) {
      nb = { id: notebookId(), title: titleOf(opened, "Shared notebook"), cells: bare(opened), updated: Date.now() }
      store = { current: nb.id, list: [nb, ...store.list] }
    } else store = { ...store, current: nb.id }
    saveStore(store)
    return { store, cells: nb.cells }
  }
  const current = store.list.find((n) => n.id === store.current)
  if (current) return { store, cells: current.cells }
  const first = { id: notebookId(), title: "Welcome", cells: bare(starters), updated: Date.now() }
  store = { current: first.id, list: [first, ...store.list] }
  saveStore(store)
  return { store, cells: first.cells }
}

export function useNotebooks({ store: initial, cells, setCells, setSelectedId }) {
  const [store, setStore] = useState(initial)
  const storeRef = useRef(store)
  storeRef.current = store

  // Save the open notebook as its cells change, a moment after the last change
  const currentId = store.current
  useEffect(() => {
    const id = currentId
    if (!id) return
    const t = setTimeout(() => {
      setStore((s) => {
        const nb = s.list.find((n) => n.id === id)
        if (!nb) return s
        const next = bare(cells)
        if (sameCells(nb.cells, next)) return s
        const list = s.list.map((n) => (n.id === id ? { ...n, cells: next, updated: Date.now() } : n))
        const out = { ...s, list }
        saveStore(out)
        return out
      })
    }, 400)
    return () => clearTimeout(t)
  }, [cells, currentId])

  const put = useCallback((next) => {
    saveStore(next)
    setStore(next)
  }, [])

  const open = useCallback(
    (id) => {
      const s = storeRef.current
      const nb = s.list.find((n) => n.id === id)
      if (!nb) return
      const fresh = withIds(nb.cells)
      setCells(fresh)
      setSelectedId(fresh.find((c) => c.type === "music")?.id || fresh[0]?.id || null)
      put({ ...s, current: id })
    },
    [setCells, setSelectedId, put],
  )

  const add = useCallback(
    (title, cells) => {
      const nb = { id: notebookId(), title, cells: bare(cells), updated: Date.now() }
      put({ current: nb.id, list: [nb, ...storeRef.current.list] })
      const fresh = withIds(nb.cells)
      setCells(fresh)
      setSelectedId(fresh.find((c) => c.type === "music")?.id || fresh[0]?.id || null)
      return nb.id
    },
    [put, setCells, setSelectedId],
  )

  const create = useCallback(
    () => add("Untitled", [{ type: "text", source: "# Untitled" }, { type: "music", source: "" }]),
    [add],
  )

  const duplicate = useCallback(
    (id) => {
      const nb = storeRef.current.list.find((n) => n.id === id)
      if (nb) add(`${nb.title} (copy)`, nb.cells)
    },
    [add],
  )

  const rename = useCallback(
    (id, title) => {
      const s = storeRef.current
      put({ ...s, list: s.list.map((n) => (n.id === id ? { ...n, title: title.trim() || "Untitled" } : n)) })
    },
    [put],
  )

  const remove = useCallback(
    (id) => {
      const s = storeRef.current
      const list = s.list.filter((n) => n.id !== id)
      if (s.current !== id) return put({ ...s, list })
      // The open one is gone: open the next, or a new one
      if (list.length) {
        put({ current: list[0].id, list })
        const fresh = withIds(list[0].cells)
        setCells(fresh)
        setSelectedId(fresh.find((c) => c.type === "music")?.id || fresh[0]?.id || null)
      } else {
        put({ current: null, list })
        create()
      }
    },
    [put, setCells, setSelectedId, create],
  )

  // A notebook as a file, and back
  const exportFile = useCallback((id) => {
    const nb = storeRef.current.list.find((n) => n.id === id)
    if (!nb) return
    const json = JSON.stringify({ kind: FILE_KIND, title: nb.title, cells: nb.cells }, null, 2)
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${nb.title.replace(/[^\w.-]+/g, "-") || "notebook"}.composer-nb.json`
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 0)
  }, [])

  const importFile = useCallback(
    async (file) => {
      const text = await file.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error("That file isn't a notebook: it doesn't hold JSON")
      }
      const cells = Array.isArray(data?.cells) ? data.cells : null
      if (!cells || !cells.every((c) => typeof c.source === "string")) {
        throw new Error("That file isn't a notebook: no cells in it")
      }
      add(
        typeof data.title === "string" && data.title.trim() ? data.title.trim() : titleOf(cells),
        cells.map((c) => ({ type: c.type === "text" ? "text" : "music", source: c.source })),
      )
    },
    [add],
  )

  const current = useMemo(() => store.list.find((n) => n.id === store.current) || null, [store])
  const list = useMemo(() => [...store.list].sort((a, b) => b.updated - a.updated), [store])

  return { list, current, open, create, duplicate, rename, remove, exportFile, importFile }
}
