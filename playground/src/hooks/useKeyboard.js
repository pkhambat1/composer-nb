/* useKeyboard hook — keyboard event handler for notebook navigation
   Handles all keyboard shortcuts:
   - Shift+Enter: run cell and move to next (or insert new)
   - Ctrl/Cmd+Enter: run cell without moving
   - Alt+Enter: run cell and insert below
   - Enter: edit mode (command mode) or exit (edit mode via Escape)
   - A/B: insert cell above/below (command mode)
   - DD: double-tap to delete cell (command mode)
   - Z: undo last delete (command mode)
   - Arrow keys / J/K: navigate cells (command mode)
*/
import { useEffect, useRef } from "react"
import { APP_CONSTANTS } from "../shared/constants.js"

export function useKeyboard({
  selectedId,
  editingId,
  cells,
  findIndex,
  runCell,
  insertCell,
  deleteCell,
  undoDelete,
  setSelectedId,
  setEditingId,
}) {
  // Double-key press tracking for DD delete
  const dPressedRef = useRef(false)
  const dTimerRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      const inEditable =
        e.target.tagName === "TEXTAREA" ||
        e.target.tagName === "INPUT" ||
        e.target.isContentEditable

      // Shift+Enter: run cell and move to next (or insert new at end)
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault()
        if (selectedId) {
          runCell(selectedId)
          const idx = findIndex(selectedId)
          if (idx < cells.length - 1) {
            const nextId = cells[idx + 1].id
            setSelectedId(nextId)
            setEditingId(nextId)
          } else {
            insertCell(selectedId, "below", "music")
          }
          if (e.target.blur) e.target.blur()
        }
        return
      }

      // Ctrl/Cmd+Enter: run cell without moving
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (selectedId) runCell(selectedId)
        return
      }

      // Alt+Enter: run cell and insert below
      if (e.key === "Enter" && e.altKey) {
        e.preventDefault()
        if (selectedId) {
          runCell(selectedId)
          insertCell(selectedId, "below", "music")
        }
        return
      }

      // Escape: exit edit mode
      if (inEditable) {
        if (e.key === "Escape") {
          e.preventDefault()
          setEditingId(null)
          if (e.target.blur) e.target.blur()
        }
        return
      }

      // Below shortcuts only work in command mode (not editing)
      if (!selectedId) return
      const idx = findIndex(selectedId)

      // Enter: enter edit mode
      if (e.key === "Enter") {
        e.preventDefault()
        setEditingId(selectedId)
        return
      }

      // A: insert cell above
      if (e.key === "a" || e.key === "A") {
        e.preventDefault()
        insertCell(selectedId, "above", "music")
        return
      }

      // B: insert cell below
      if (e.key === "b" || e.key === "B") {
        e.preventDefault()
        insertCell(selectedId, "below", "music")
        return
      }

      // Z: undo last delete
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault()
        undoDelete()
        return
      }

      // DD: double-tap to delete
      if (e.key === "d" || e.key === "D") {
        e.preventDefault()
        if (dPressedRef.current) {
          deleteCell(selectedId)
          dPressedRef.current = false
          if (dTimerRef.current) clearTimeout(dTimerRef.current)
        } else {
          dPressedRef.current = true
          dTimerRef.current = setTimeout(() => {
            dPressedRef.current = false
          }, APP_CONSTANTS.DOUBLE_KEY_TIMEOUT)
        }
        return
      }

      // Arrow down / J: select next cell
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault()
        if (idx < cells.length - 1) setSelectedId(cells[idx + 1].id)
        return
      }

      // Arrow up / K: select previous cell
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault()
        if (idx > 0) setSelectedId(cells[idx - 1].id)
        return
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [
    selectedId,
    editingId,
    cells,
    findIndex,
    runCell,
    insertCell,
    deleteCell,
    undoDelete,
    setSelectedId,
    setEditingId,
  ])
}
