/* The shared cell surface. Website and MCP adapters supply state, not markup. */
import React from "react"
import { CellIdContext } from "./SelectionContext.tsx"
import Cell from "../components/Cell.tsx"
import CellGap from "../components/CellGap.tsx"
import type { Place, useCellManager } from "../hooks/useCellManager.ts"
import type { NotebookRuntime } from "../hooks/useNotebookRuntime.ts"
import type { PlayerProps } from "./types.ts"

export type Appearance = Pick<
  PlayerProps,
  "theme" | "accent" | "drumView" | "onSetDrumView" | "sheetCounts" | "onSetSheetCounts"
>
export default function NotebookCells({
  manager,
  runtime,
  appearance,
  single = false,
}: {
  manager: ReturnType<typeof useCellManager>
  runtime: NotebookRuntime
  appearance: Appearance
  single?: boolean
}) {
  const {
    cells,
    selectedId,
    editingId,
    setSelectedId,
    setEditingId,
    updateCell,
    insertCell,
    deleteCell,
    moveCellTo,
    moveCell,
    duplicateCell,
  } = manager
  const { activeCellId, playback, runCellNow, interruptCell, togglePlayback, onPlaybackFinished } =
    runtime
  // Dragging a cell by its grip, in a notebook: which cell, and where it would land, before
  // the cell at that index (the cells' length: the end)
  const [dragId, setDragId] = React.useState<string | null>(null)
  const [dropAt, setDropAt] = React.useState<number | null>(null)
  const startDrag = React.useCallback((id: string, e: React.DragEvent<HTMLElement>) => {
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", "") // Firefox starts a drag only with something in it
    const cell = e.currentTarget.closest(".cell")
    if (cell) e.dataTransfer.setDragImage(cell, 20, 20)
    setDragId(id)
  }, [])
  const endDrag = React.useCallback(() => {
    setDragId(null)
    setDropAt(null)
  }, [])
  // A drag anywhere over the notebook lands before the first cell whose middle is below the
  // pointer. Nothing but a cell's grip starts one, so other drags (a file, some text) are left be.
  const dragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!dragId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    const shown = [...e.currentTarget.querySelectorAll(":scope > .cell")]
    const at = shown.findIndex((el) => {
      const box = el.getBoundingClientRect()
      return e.clientY < box.top + box.height / 2
    })
    setDropAt(at < 0 ? shown.length : at)
  }
  const drop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!dragId) return
    e.preventDefault()
    if (dropAt != null) moveCellTo(dragId, dropAt)
    endDrag()
  }
  // Where the dragged cell would land, unless that's where it is already
  const from = dragId ? cells.findIndex((c) => c.id === dragId) : -1
  const landing = dropAt != null && dropAt !== from && dropAt !== from + 1 ? dropAt : null

  // In a notebook, a + shows between two cells on hover (and above the first and below the
  // last), to add a cell right there. The gap at `place` (the index of the cell after it)
  // shows where a dragged cell would land.
  const gap = (key: string, at: string | null, where: Place, place: number) =>
    single ? null : (
      <CellGap
        key={key}
        onAdd={(type) => insertCell(at, where, type)}
        dropHere={landing === place}
      />
    )

  return (
    <div
      className={"cells" + (dragId ? " cells-dragging" : "")}
      onDragOver={single ? undefined : dragOver}
      onDrop={single ? undefined : drop}
    >
      {gap("gap-top", cells[0]?.id ?? null, "above", 0)}
      {cells.map((c, i) => (
        <React.Fragment key={c.id}>
          <CellIdContext.Provider value={c.id}>
            <Cell
              cell={c}
              index={i}
              selected={c.id === selectedId}
              editing={c.id === editingId}
              isActive={c.id === activeCellId}
              theme={appearance.theme}
              accent={appearance.accent}
              drumView={appearance.drumView}
              onSetDrumView={appearance.onSetDrumView}
              sheetCounts={appearance.sheetCounts}
              onSetSheetCounts={appearance.onSetSheetCounts}
              focusedCellId={playback.focusedCellId}
              isPlaying={playback.isPlaying}
              onSelect={() => setSelectedId(c.id)}
              onEnterEdit={() => setEditingId(c.id)}
              onLeaveEdit={() => setEditingId((cur) => (cur === c.id ? null : cur))}
              onChange={(v) => updateCell(c.id, { source: v })}
              onRun={() => runCellNow(c.id)}
              onInterrupt={() => interruptCell(c.id)}
              onDelete={() => deleteCell(c.id)}
              onMoveUp={() => moveCell(c.id, -1)}
              onMoveDown={() => moveCell(c.id, 1)}
              onDuplicate={() => duplicateCell(c.id)}
              first={i === 0}
              last={i === cells.length - 1}
              onSetPreview={(v) => updateCell(c.id, { previewMode: v })}
              onTogglePlayback={togglePlayback}
              onDragStart={single ? undefined : (e) => startDrag(c.id, e)}
              onDragEnd={endDrag}
              dragging={c.id === dragId}
              onPlaybackFinished={onPlaybackFinished}
              registerPlayer={playback.registerPlayer}
              unregisterPlayer={playback.unregisterPlayer}
            />
          </CellIdContext.Provider>
          {gap("gap-" + c.id, c.id, "below", i + 1)}
        </React.Fragment>
      ))}
    </div>
  )
}
