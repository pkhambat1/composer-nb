/* useCellManager hook — cell CRUD, ordering, undo/trash
   Manages cells array, selection, editing state, and operations:
   - Cell ID generation
   - Cell CRUD operations (create, update, delete)
   - Undo deleted cells from trash
   - Cell type conversion (music <-> text)
*/
import { useState, useCallback } from "react"

// Cell ID generator (global counter)
let _cid = 0
export function cellId() {
  return "c" + ++_cid + "_" + Date.now().toString(36)
}

export function useCellManager(starterCells) {
  // Initialize cells from starter data - add id, runCount, output, status
  const initCells = starterCells.map((c) => ({
    id: cellId(),
    type: c.type,
    source: c.source,
    runCount: null,
    output: null,
    status: "idle",
  }))

  // State
  const [cells, setCells] = useState(initCells)
  const [selectedId, setSelectedId] = useState(initCells[1]?.id || null)
  const [editingId, setEditingId] = useState(null)
  const [trash, setTrash] = useState([])

  // Find index of cell by id
  const findIndex = useCallback((id) => cells.findIndex((c) => c.id === id), [cells])

  // Update a cell with partial data
  const updateCell = useCallback((id, patch) => {
    setCells((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  // Insert a new cell
  const insertCell = useCallback((afterId, where = "below", type = "music", source) => {
    setCells((cs) => {
      const idx = afterId ? cs.findIndex((c) => c.id === afterId) : cs.length - 1
      const insertAt = where === "above" ? Math.max(0, idx) : idx + 1
      const nc = {
        id: cellId(),
        type,
        source:
          source != null ? source : type === "music" ? "@key C\n@tempo 96\n@inst piano\n\n" : "",
        runCount: null,
        output: null,
        status: "idle",
      }
      const next = [...cs]
      next.splice(insertAt, 0, nc)
      setSelectedId(nc.id)
      setEditingId(source ? null : nc.id)
      return next
    })
  }, [])

  // Delete a cell (moves to trash for undo)
  const deleteCell = useCallback((id) => {
    setCells((cs) => {
      const idx = cs.findIndex((c) => c.id === id)
      if (idx < 0) return cs
      const removed = cs[idx]
      setTrash((t) => [...t, { cell: removed, idx }])
      const next = cs.filter((c) => c.id !== id)
      if (next.length) setSelectedId(next[Math.min(idx, next.length - 1)].id)
      else setSelectedId(null)
      return next
    })
  }, [])

  // Undo last delete (restore from trash)
  const undoDelete = useCallback(() => {
    setTrash((t) => {
      if (!t.length) return t
      const last = t[t.length - 1]
      setCells((cs) => {
        const next = [...cs]
        next.splice(Math.min(last.idx, next.length), 0, last.cell)
        return next
      })
      setSelectedId(last.cell.id)
      return t.slice(0, -1)
    })
  }, [])

  // Convert cell type (music <-> text)
  const convertCell = useCallback((id, type) => {
    setCells((cs) =>
      cs.map((c) => (c.id === id ? { ...c, type, output: null, runCount: null } : c)),
    )
  }, [])

  return {
    cells,
    setCells,
    selectedId,
    setSelectedId,
    editingId,
    setEditingId,
    trash,
    findIndex,
    updateCell,
    insertCell,
    deleteCell,
    undoDelete,
    convertCell,
  }
}
