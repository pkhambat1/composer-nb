import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cellId } from "./useCellManager.ts"
import { supabase } from "../lib/supabase.ts"
import type { Notebook, NotebookCell, SavedCell } from "../shared/types.ts"
import type { Store } from "../shared/types.ts"

type NotebookRow = { id: string; title: string; document: { version: 1; cells: SavedCell[] }; revision: number; updated_at: string }
const bare = (cells: SavedCell[]): SavedCell[] => cells.map(({ id, type, source }) => ({ id, type, source }))
const sameCells = (a: SavedCell[], b: SavedCell[]) => JSON.stringify(a) === JSON.stringify(b)
const fromRow = (row: NotebookRow): Notebook => ({ id: row.id, title: row.title, cells: row.document.cells, revision: row.revision, updated: new Date(row.updated_at).getTime() })

export function dropShared(store: Store): Store {
  const list = store.list.filter((item) => item.title !== "Shared notebook" && item.title !== "Shared cell")
  if (list.length === store.list.length) return store
  return { current: list.some((item) => item.id === store.current) ? store.current : (list[0]?.id ?? null), list }
}

export function withIds(cells: SavedCell[]): NotebookCell[] {
  return cells.map((c) => ({ id: c.id || cellId(), type: c.type, source: c.source, runCount: null, output: null, status: "idle" }))
}

export function useNotebooks({ starters, cells, setCells, setSelectedId }: {
  starters: SavedCell[]; cells: NotebookCell[]; setCells: (cells: NotebookCell[]) => void; setSelectedId: (id: string | null) => void
}) {
  const [list, setList] = useState<Notebook[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [status, setStatus] = useState("Loading from Supabase…")
  const listRef = useRef(list)
  listRef.current = list

  const show = useCallback((notebook: Notebook) => {
    const fresh = withIds(notebook.cells)
    setCells(fresh)
    setSelectedId(fresh.find((cell) => cell.type === "music")?.id || fresh[0]?.id || null)
    setCurrentId(notebook.id)
  }, [setCells, setSelectedId])

  const createCloud = useCallback(async (title: string, contents: SavedCell[]) => {
    if (!supabase) throw new Error("Supabase is not configured")
    setStatus("Saving…")
    const { data, error } = await supabase.from("notebooks")
      .insert({ title, document: { version: 1, cells: bare(contents) } })
      .select("id,title,document,revision,updated_at").single()
    if (error) throw error
    const notebook = fromRow(data as NotebookRow)
    setList((items) => [notebook, ...items])
    show(notebook)
    setStatus("Saved to Supabase")
    return notebook
  }, [show])

  useEffect(() => {
    let live = true
    void (async () => {
      if (!supabase) return setStatus("Supabase is not configured")
      const { data, error } = await supabase.from("notebooks")
        .select("id,title,document,revision,updated_at").is("deleted_at", null).order("updated_at", { ascending: false })
      if (!live) return
      if (error) return setStatus(error.message)
      const notebooks = (data as NotebookRow[]).map(fromRow)
      setList(notebooks)
      if (notebooks[0]) { show(notebooks[0]); setStatus("Saved to Supabase") }
      else try { await createCloud("Welcome", starters) } catch (cause) { setStatus(cause instanceof Error ? cause.message : "Could not create notebook") }
    })()
    return () => { live = false }
  }, [createCloud, show, starters])

  useEffect(() => {
    if (!currentId) return
    const notebook = listRef.current.find((item) => item.id === currentId)
    const next = bare(cells)
    if (!notebook || sameCells(notebook.cells, next) || !supabase) return
    setStatus("Unsaved changes")
    const timer = window.setTimeout(() => {
      const latest = listRef.current.find((item) => item.id === currentId)
      if (!latest || !supabase) return
      setStatus("Saving…")
      void supabase.rpc("save_notebook", { notebook_id: currentId, expected_revision: latest.revision || 1, new_document: { version: 1, cells: next } })
        .then(({ data, error }) => {
          if (error) return setStatus(error.message.includes("Revision conflict") ? "Save conflict — reload this notebook" : error.message)
          const saved = fromRow(data as NotebookRow)
          setList((items) => items.map((item) => item.id === saved.id ? saved : item))
          setStatus("Saved to Supabase")
        })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [cells, currentId])

  const open = useCallback((id: string) => { const notebook = listRef.current.find((item) => item.id === id); if (notebook) show(notebook) }, [show])
  const create = useCallback(() => { void createCloud("Untitled", [{ type: "music", source: "" }]).catch((e: Error) => setStatus(e.message)) }, [createCloud])
  const duplicate = useCallback((id: string) => { const notebook = listRef.current.find((item) => item.id === id); if (notebook) void createCloud(`${notebook.title} (copy)`, notebook.cells).catch((e: Error) => setStatus(e.message)) }, [createCloud])
  const rename = useCallback((id: string, title: string) => {
    const clean = title.trim() || "Untitled"
    setList((items) => items.map((item) => item.id === id ? { ...item, title: clean } : item)); setStatus("Saving…")
    void supabase?.from("notebooks").update({ title: clean }).eq("id", id).then(({ error }) => setStatus(error ? error.message : "Saved to Supabase"))
  }, [])
  const remove = useCallback((id: string) => {
    const remaining = listRef.current.filter((item) => item.id !== id); setList(remaining)
    if (currentId === id) { if (remaining[0]) show(remaining[0]); else create() }
    void supabase?.from("notebooks").update({ deleted_at: new Date().toISOString() }).eq("id", id)
  }, [create, currentId, show])

  const current = useMemo(() => list.find((item) => item.id === currentId) || null, [list, currentId])
  const sorted = useMemo(() => [...list].sort((a, b) => b.updated - a.updated), [list])
  return { list: sorted, current, status, open, create, duplicate, rename, remove }
}
