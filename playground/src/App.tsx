/* Notebook React app — Jupyter-style cells, music DSL + Tone.js.
   Features: syntax-highlighted code cells, piano roll output,
   chord palette sidebar, theme panel.
*/
import React from "react"
import * as Tone from "tone"
import * as MusicEngine from "composer-nb/engine"
import { APP_CONSTANTS } from "./shared/constants.ts"
import { EMBED, embedCell, embedTheme, listenForTheme, reportHeight } from "./shared/embed.ts"
import type { Host, KernelStatus } from "./shared/types.ts"
import { useCellManager, type Place } from "./hooks/useCellManager.ts"
import { openingNotebook, useNotebooks } from "./hooks/useNotebooks.ts"
import NotebookTitle, { type NotebookMenu } from "./components/NotebookTitle.tsx"
import { usePlayback } from "./hooks/usePlayback.ts"
import { useKeyboard } from "./hooks/useKeyboard.ts"
import { useTheme } from "./components/theme-panel.tsx"
import Sidebar from "./components/Sidebar.tsx"
import Toolbar from "./components/Toolbar.tsx"
import Cell from "./components/Cell.tsx"
import CellGap from "./components/CellGap.tsx"
import StatusBar from "./components/StatusBar.tsx"

// ============================================================================
// App
// ============================================================================

// `host` is set when another page holds the playground's cells itself, as the MCP App does
// inside Claude: { cells: [{ type, source }], after, theme, onRun }. Then, as in a frame,
// there are only the cells: `after` is the source they continue from, `theme` follows the
// page's, the music cells render as they open, and `onRun` hears every cell as it runs.
export default function App({ host = null }: { host?: Host | null }) {
  const single = EMBED || !!host // only cells, with nothing around them
  const hostRef = React.useRef(host)
  hostRef.current = host
  const [kernelStatus, setKernelStatus] = React.useState<KernelStatus>("idle")
  const [activeCellId, setActiveCellId] = React.useState<string | null>(null)
  const [runCounter, setRunCounter] = React.useState(0)
  const abortRef = React.useRef<symbol | null>(null)
  // The notebook the page opens with: the one that was open, or the starters as the first
  // one. In a frame there's just the one cell, and in a host page its cells, kept nowhere.
  const [opening] = React.useState(() =>
    single ? null : openingNotebook(APP_CONSTANTS.STARTER_CELLS),
  )
  const cm = useCellManager(host ? host.cells : EMBED ? [embedCell()] : opening!.cells)
  const {
    cells,
    selectedId,
    setSelectedId,
    editingId,
    setEditingId,
    findIndex,
    updateCell,
    insertCell,
    deleteCell,
    undoDelete,
    moveCell,
    moveCellTo,
    duplicateCell,
  } = cm

  const notebooks = useNotebooks({
    store: opening?.store || { current: null, list: [] },
    cells,
    setCells: cm.setCells,
    setSelectedId,
  })

  // In a frame or a host page the page's theme rules; otherwise the choices are kept on this
  // device
  const [settings, setSetting] = useTheme(
    single
      ? { ...APP_CONSTANTS.THEME_DEFAULTS, theme: host ? (host.theme ?? "light") : embedTheme() }
      : APP_CONSTANTS.THEME_DEFAULTS,
    { remember: !single },
  )
  const theme = settings.theme || "light"
  const accent = APP_CONSTANTS.THEME_DEFAULTS.accent

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // In a frame: follow the page's theme, and tell the page how tall the cell is.
  const embedRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!EMBED) return
    const stopTheme = listenForTheme((t) => setSetting("theme", t))
    const stopHeight = reportHeight(embedRef.current!)
    return () => {
      stopTheme()
      stopHeight()
    }
  }, [setSetting])
  const hostTheme = host?.theme
  React.useEffect(() => {
    if (hostTheme) setSetting("theme", hostTheme)
  }, [hostTheme, setSetting])

  const armAudio = React.useCallback(async () => {
    try {
      await Tone.start()
    } catch (_e) {}
  }, [])

  const playback = usePlayback(armAudio)

  // Play all: every music cell renders, then they play one after another.
  const playAllRef = React.useRef<{ ids: string[]; rendered: Set<string>; pending: number } | null>(
    null,
  )

  // Renders a cell, and plays it when asked (the cell's own button and Shift+Enter).
  const runCell = React.useCallback(
    async (id: string, play = false) => {
      const c = cells.find((x) => x.id === id)
      if (!c) return
      if (c.type === "text") {
        setEditingId((e) => (e === id ? null : e))
        return
      }
      hostRef.current?.onRun?.(cells.map(({ type, source }) => ({ type, source })))
      // Running a cell starts it over: a cell that is playing plays its new audio from the
      // start, as the first run of it would
      setKernelStatus("busy")
      setActiveCellId(id)
      updateCell(id, { status: "running", output: null })
      const runId = Symbol()
      abortRef.current = runId
      try {
        // Settings and names carry on from the music cells above, like variables in Jupyter,
        // and in a host page from the source the page says comes before them.
        let inherited = MusicEngine.initialState()
        const after = hostRef.current?.after
        if (after) inherited = MusicEngine.parseSource(after, inherited).state
        for (const prev of cells.slice(0, cells.indexOf(c))) {
          if (prev.type === "music")
            inherited = MusicEngine.parseSource(prev.source, inherited).state
        }
        const parsed = MusicEngine.parseSource(c.source, inherited)
        if (abortRef.current !== runId) return
        if (parsed.errors && parsed.errors.length > 0) {
          const lines = parsed.errors.map((e) => `Line ${e.line}: ${e.msg}`).join("\n")
          playback.stopCell(id)
          updateCell(id, {
            status: "idle",
            output: {
              kind: "error",
              error: lines,
              lines: parsed.errors.map((e) => e.line),
              source: c.source,
            },
          })
          return
        }
        if (parsed.events.length === 0 && parsed.drumEvents.length === 0) {
          const message =
            "Nothing plays in this cell. Its settings and names carry on to the cells below. " +
            "To hear something, add a play, such as play piano: chords C Am|F G."
          playback.stopCell(id)
          setRunCounter(runCounter + 1)
          updateCell(id, {
            status: "idle",
            runCount: runCounter + 1,
            output: { kind: "info", message },
          })
          return
        }
        const nextCount = runCounter + 1
        setRunCounter(nextCount)
        updateCell(id, {
          status: "rendering",
          runCount: nextCount,
          output: { kind: "rendering", parsed, duration: parsed.totalSec },
        })
        // Yield so React can paint chord chips before the render blocks the main thread
        await new Promise((r) => setTimeout(r, 0))
        if (abortRef.current !== runId) return
        const buffer = await MusicEngine.renderToBuffer(parsed)
        if (abortRef.current !== runId) return
        const dur = MusicEngine.bufferDuration(buffer) || parsed.totalSec || 0
        updateCell(id, {
          status: "idle",
          output: { kind: "rendered", buffer, parsed, duration: dur },
        })
        playAllRef.current?.rendered.add(id)
        if (play) playback.playCell(id)
      } catch (e) {
        if (abortRef.current !== runId) return
        playback.stopCell(id)
        updateCell(id, {
          status: "idle",
          output: { kind: "error", error: String((e as Error)?.message || e) },
        })
      } finally {
        if (abortRef.current === runId) {
          abortRef.current = null
          setActiveCellId(null)
          setKernelStatus("idle")
        }
        // The last of a play-all's renders starts the playing
        const pa = playAllRef.current
        if (pa && pa.ids.includes(id) && --pa.pending === 0) {
          const first = pa.ids.find((i) => pa.rendered.has(i))
          if (first) playback.playCell(first)
          else playAllRef.current = null
        }
      }
    },
    [cells, runCounter, updateCell, playback, setEditingId],
  )

  // --- Run queue: array queue with sequential processing ------------------
  const queueRef = React.useRef<{ id: string; play: boolean }[]>([])
  const processingRef = React.useRef(false)
  const skipRef = React.useRef<(() => void) | null>(null) // resolve fn to immediately unblock queue
  const runCellRef = React.useRef(runCell)
  React.useEffect(() => {
    runCellRef.current = runCell
  }, [runCell])

  const processQueue = React.useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true
    while (queueRef.current.length > 0) {
      const { id, play } = queueRef.current.shift()!
      await new Promise<void>((resolve) => {
        skipRef.current = resolve
        runCellRef.current(id, play).then(resolve, resolve)
      })
      skipRef.current = null
    }
    processingRef.current = false
    setKernelStatus("idle")
  }, [])

  const queuedRunCell = React.useCallback(
    (id: string, play = false) => {
      updateCell(id, { status: "waiting", output: null, runCount: null })
      setKernelStatus("busy")
      queueRef.current.push({ id, play })
      processQueue()
    },
    [updateCell, processQueue],
  )

  // The cell's own Run button and Shift+Enter: render it, and leave playing to its player
  const runCellNow = React.useCallback(
    (id: string) => {
      playAllRef.current = null
      queuedRunCell(id)
    },
    [queuedRunCell],
  )

  const interruptCell = React.useCallback(
    (id: string) => {
      const c = cells.find((x) => x.id === id)
      if (!c) return
      if (c.status === "waiting") {
        // Just remove from queue, don't touch anything else
        queueRef.current = queueRef.current.filter((q) => q.id !== id)
        updateCell(id, { status: "idle" })
        if (queueRef.current.length === 0 && !activeCellId) {
          setKernelStatus("idle")
        }
      } else {
        // Running cell — abort and immediately unblock queue
        abortRef.current = null
        setActiveCellId(null)
        updateCell(id, { status: "idle", output: null })
        if (skipRef.current) skipRef.current()
      }
    },
    [updateCell, cells, activeCellId],
  )

  const stopAll = React.useCallback(() => {
    playAllRef.current = null
    // Clear entire queue
    const waiting = [...queueRef.current]
    queueRef.current = []
    waiting.forEach(({ id }) => updateCell(id, { status: "idle" }))
    // Reset any running/rendering cells
    cells.forEach((c) => {
      if (c.status === "running" || c.status === "rendering") {
        updateCell(c.id, { status: "idle", output: null })
      }
    })
    // Abort active cell and unblock queue loop
    abortRef.current = null
    setActiveCellId(null)
    if (skipRef.current) skipRef.current()
    setKernelStatus("idle")
  }, [updateCell, cells])

  const queuedRunAll = React.useCallback(() => {
    playback.stopAll()
    const ids = cells.filter((c) => c.type === "music").map((c) => c.id)
    playAllRef.current = { ids, rendered: new Set<string>(), pending: ids.length }
    for (const id of ids) queuedRunCell(id)
  }, [cells, playback, queuedRunCell])

  // When a cell finishes in a play-all, the next rendered one plays
  const onPlaybackFinished = React.useCallback(
    (id: string) => {
      playback.onPlaybackFinished(id)
      const pa = playAllRef.current
      if (!pa) return
      const list = pa.ids.filter((i) => pa.rendered.has(i))
      const k = list.indexOf(id)
      if (k >= 0 && k + 1 < list.length) playback.playCell(list[k + 1])
      else playAllRef.current = null
    },
    [playback],
  )
  // Pressing play on a cell by hand ends a play-all
  const togglePlayback = React.useCallback(
    (id: string) => {
      playAllRef.current = null
      return playback.togglePlayback(id)
    },
    [playback],
  )

  // A host page's cells render as they open, and wait for Play.
  const renderAll = React.useCallback(() => {
    for (const c of cells) if (c.type === "music") queuedRunCell(c.id)
  }, [cells, queuedRunCell])
  const renderAllRef = React.useRef(renderAll)
  React.useEffect(() => {
    renderAllRef.current = renderAll
  }, [renderAll])
  React.useEffect(() => {
    if (hostRef.current) renderAllRef.current()
  }, [])

  // Another notebook: whatever plays stops, and the page shows the one asked for
  const quiet = React.useCallback(() => {
    playback.stopAll()
    stopAll()
  }, [playback, stopAll])
  const openNotebook = React.useCallback(
    (id: string) => {
      if (notebooks.current?.id === id) return
      quiet()
      notebooks.open(id)
    },
    [notebooks, quiet],
  )
  const newNotebook = React.useCallback(() => {
    quiet()
    notebooks.create()
  }, [notebooks, quiet])
  // The title's menu, for the open notebook
  const current = notebooks.current
  const notebookMenu = React.useMemo<NotebookMenu | null>(
    () =>
      current
        ? {
            rename: (title) => notebooks.rename(current.id, title),
            duplicate: () => {
              quiet()
              notebooks.duplicate(current.id)
            },
            remove: () => {
              if (!window.confirm(`Delete "${current.title}"? This can't be undone.`)) return
              quiet()
              notebooks.remove(current.id)
            },
          }
        : null,
    [current, notebooks, quiet],
  )

  // Keyboard shortcuts hook
  useKeyboard({
    selectedId,
    editingId,
    cells,
    findIndex,
    runCell: runCellNow,
    insertCell,
    deleteCell,
    undoDelete,
    setSelectedId,
    setEditingId,
    single,
  })

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

  const cellList = (
    <div
      className={"cells" + (dragId ? " cells-dragging" : "")}
      onDragOver={single ? undefined : dragOver}
      onDrop={single ? undefined : drop}
    >
      {gap("gap-top", cells[0]?.id ?? null, "above", 0)}
      {cells.map((c, i) => (
        <React.Fragment key={c.id}>
          <Cell
            cell={c}
            index={i}
            selected={c.id === selectedId}
            editing={c.id === editingId}
            isActive={c.id === activeCellId}
            theme={theme}
            accent={accent}
            drumView={settings.drumView || "bricks"}
            onSetDrumView={(v) => setSetting("drumView", v)}
            sheetCounts={!!settings.sheetCounts}
            onSetSheetCounts={(v) => setSetting("sheetCounts", v)}
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
            armAudio={armAudio}
          />
          {gap("gap-" + c.id, c.id, "below", i + 1)}
        </React.Fragment>
      ))}
    </div>
  )

  // Cells and nothing else: see shared/embed.ts
  if (single) {
    return (
      <div className="embed-root" ref={embedRef}>
        {cellList}
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar
        notebooks={notebooks}
        onOpenNotebook={openNotebook}
        onNewNotebook={newNotebook}
        theme={theme}
        onSetTheme={(v) => setSetting("theme", v)}
      />

      <div className="app-main">
        <div className="notebook-root">
          <div className="nb-sticky-header">
            <NotebookTitle
              title={notebooks.current?.title || "Notebook"}
              subtitle="Kept on this device as you write"
              menu={notebookMenu}
            />
            <Toolbar
              onAddCode={() =>
                insertCell(cells.length ? cells[cells.length - 1].id : null, "below", "music")
              }
              onAddText={() =>
                insertCell(cells.length ? cells[cells.length - 1].id : null, "below", "text")
              }
              onRunAll={queuedRunAll}
              onStop={quiet}
              kernelStatus={kernelStatus}
            />
          </div>

          <main
            className="nb-main"
            onClick={(e) => {
              if (
                e.target === e.currentTarget ||
                (e.target as HTMLElement).classList.contains("cells")
              )
                setSelectedId(null)
            }}
          >
            {cellList}
          </main>

          <StatusBar editingId={editingId} kernelStatus={kernelStatus} />
        </div>
      </div>
    </div>
  )
}
