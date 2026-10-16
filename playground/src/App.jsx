/* Notebook React app — Jupyter-style cells, music DSL + Tone.js.
   Features: syntax-highlighted code cells, piano roll output, WAV export,
   chord palette sidebar, theme panel.
*/
import React from "react"
import * as Tone from "tone"
import * as MusicEngine from "composer-nb/engine"
import { APP_CONSTANTS } from "./shared/constants.js"
import {
  EMBED,
  OPEN,
  embedCell,
  embedTheme,
  listenForTheme,
  openedCells,
  reportHeight,
  shareNotebookUrl,
} from "./shared/embed.js"
import { cellId, useCellManager } from "./hooks/useCellManager.js"
import { openingNotebook, useNotebooks } from "./hooks/useNotebooks.js"
import { grooveText } from "composer-nb/grooves"
import NotebookTitle from "./components/NotebookTitle.jsx"
import { usePlayback } from "./hooks/usePlayback.js"
import { useKeyboard } from "./hooks/useKeyboard.js"
import { useTheme } from "./components/theme-panel.jsx"
import Sidebar from "./components/Sidebar.jsx"
import Toolbar from "./components/Toolbar.jsx"
import Cell from "./components/Cell.jsx"
import StatusBar from "./components/StatusBar.jsx"

// The chord library brings every chord shape with it, so it loads when first opened
const ChordBrowserPanel = React.lazy(() => import("./components/ChordBrowser.jsx"))

// ============================================================================
// App
// ============================================================================

export default function App() {
  const [sideTab, setSideTab] = React.useState("notebook")
  const [chordsOpened, setChordsOpened] = React.useState(false)
  const openTab = React.useCallback((tab) => {
    if (tab === "chords") setChordsOpened(true)
    setSideTab(tab)
  }, [])
  const [kernelStatus, setKernelStatus] = React.useState("idle")
  const [activeCellId, setActiveCellId] = React.useState(null)
  const [runCounter, setRunCounter] = React.useState(0)
  const abortRef = React.useRef(null)
  // The notebook the page opens with: a shared link's cells, the one that was open, or the
  // starters as the first one. In a frame there's just the one cell, kept nowhere.
  const [opening] = React.useState(() =>
    EMBED ? null : openingNotebook(APP_CONSTANTS.STARTER_CELLS, openedCells()),
  )
  const cm = useCellManager(EMBED ? [embedCell()] : opening.cells)
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
    duplicateCell,
  } = cm

  const notebooks = useNotebooks({
    store: opening?.store || { current: null, list: [] },
    draft: opening?.draft || null,
    cells,
    setCells: cm.setCells,
    setSelectedId,
  })

  // In a frame the page's theme rules; otherwise the choices are kept on this device
  const [settings, setSetting] = useTheme(
    EMBED ? { ...APP_CONSTANTS.THEME_DEFAULTS, theme: embedTheme() } : APP_CONSTANTS.THEME_DEFAULTS,
    { remember: !EMBED },
  )
  const theme = settings.theme || "light"
  const accent = APP_CONSTANTS.THEME_DEFAULTS.accent

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // In a frame: follow the page's theme, and tell the page how tall the cell is.
  const embedRef = React.useRef(null)
  React.useEffect(() => {
    if (!EMBED) return
    const stopTheme = listenForTheme((t) => setSetting("theme", t))
    const stopHeight = reportHeight(embedRef.current)
    return () => {
      stopTheme()
      stopHeight()
    }
  }, [setSetting])

  const armAudio = React.useCallback(async () => {
    try {
      await Tone.start()
    } catch (_e) {}
  }, [])

  const playback = usePlayback(armAudio)

  // Play all: every music cell renders, then they play one after another.
  const playAllRef = React.useRef(null) // { ids, rendered, pending }

  // Renders a cell, and plays it when asked (the cell's own button and Shift+Enter).
  const runCell = React.useCallback(
    async (id, play = false) => {
      const c = cells.find((x) => x.id === id)
      if (!c) return
      if (c.type === "text") {
        setEditingId((e) => (e === id ? null : e))
        return
      }
      // A cell that is playing keeps playing from where it was once its new audio is
      // ready, so a groove can be edited while it runs
      setKernelStatus("busy")
      setActiveCellId(id)
      updateCell(id, { status: "running", output: null })
      const runId = Symbol()
      abortRef.current = runId
      try {
        // Settings and names carry on from the music cells above, like variables in Jupyter.
        let inherited = MusicEngine.initialState()
        for (const prev of cells.slice(0, cells.indexOf(c))) {
          if (prev.type === "music") inherited = MusicEngine.parseSource(prev.source, inherited).state
        }
        const parsed = MusicEngine.parseSource(c.source, inherited)
        if (abortRef.current !== runId) return
        if (parsed.errors && parsed.errors.length > 0) {
          const lines = parsed.errors.map((e) => `Line ${e.line}: ${e.msg}`).join("\n")
          playback.stopCell(id)
          updateCell(id, {
            status: "idle",
            output: { kind: "error", error: lines, lines: parsed.errors.map((e) => e.line), source: c.source },
          })
          return
        }
        if (parsed.events.length === 0 && parsed.drumEvents.length === 0) {
          const message =
            "Nothing plays in this cell. Its settings and names carry on to the cells below. " +
            "To hear something, add a play, such as play piano: chords C Am|F G."
          playback.stopCell(id)
          setRunCounter(runCounter + 1)
          updateCell(id, { status: "idle", runCount: runCounter + 1, output: { kind: "info", message } })
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
          output: { kind: "error", error: String((e && e.message) || e) },
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
  const queueRef = React.useRef([])
  const processingRef = React.useRef(false)
  const skipRef = React.useRef(null) // resolve fn to immediately unblock queue
  const runCellRef = React.useRef(runCell)
  React.useEffect(() => { runCellRef.current = runCell }, [runCell])

  const processQueue = React.useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true
    while (queueRef.current.length > 0) {
      const { id, play } = queueRef.current.shift()
      await new Promise((resolve) => {
        skipRef.current = resolve
        runCellRef.current(id, play).then(resolve, resolve)
      })
      skipRef.current = null
    }
    processingRef.current = false
    setKernelStatus("idle")
  }, [])

  const queuedRunCell = React.useCallback((id, play = false) => {
    updateCell(id, { status: "waiting", output: null, runCount: null })
    setKernelStatus("busy")
    queueRef.current.push({ id, play })
    processQueue()
  }, [updateCell, processQueue])

  // The cell's own Play button and Shift+Enter: render, then play
  const playCellNow = React.useCallback((id) => {
    playAllRef.current = null
    queuedRunCell(id, true)
  }, [queuedRunCell])

  const interruptCell = React.useCallback(
    (id) => {
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
    playAllRef.current = { ids, rendered: new Set(), pending: ids.length }
    for (const id of ids) queuedRunCell(id)
  }, [cells, playback, queuedRunCell])

  // When a cell finishes in a play-all, the next rendered one plays
  const onPlaybackFinished = React.useCallback(
    (id) => {
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
    (id) => {
      playAllRef.current = null
      return playback.togglePlayback(id)
    },
    [playback],
  )

  // A shared link renders its cells as soon as it opens.
  const runAllRef = React.useRef(queuedRunAll)
  React.useEffect(() => {
    runAllRef.current = queuedRunAll
  }, [queuedRunAll])
  React.useEffect(() => {
    if (OPEN) runAllRef.current()
  }, [])

  // A starter from the + menu: its words and its music go at the end of the notebook, and it plays
  const addStarter = React.useCallback(
    (g) => {
      const textId = cellId()
      const musicId = cellId()
      const mk = (id, type, source) => ({ id, type, source, runCount: null, output: null, status: "idle" })
      // A new notebook's one empty cell gives way to it
      const blank = (cs) => cs.length === 1 && cs[0].type === "music" && !cs[0].source.trim()
      cm.setCells((cs) => [...(blank(cs) ? [] : cs), mk(textId, "text", grooveText(g)), mk(musicId, "music", g.source)])
      setSelectedId(musicId)
      setTimeout(() => {
        queuedRunCell(musicId, true)
        document.querySelector(`[data-cell-id="${musicId}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" })
      }, 60)
    },
    [cm, setSelectedId, queuedRunCell],
  )

  // Another notebook: whatever plays stops, and the page shows the one asked for
  const quiet = React.useCallback(() => {
    playback.stopAll()
    stopAll()
  }, [playback, stopAll])
  const openNotebook = React.useCallback(
    (id) => {
      if (!notebooks.draft && notebooks.current?.id === id) return openTab("notebook")
      quiet()
      notebooks.open(id)
      openTab("notebook")
    },
    [notebooks, quiet, openTab],
  )
  const newNotebook = React.useCallback(() => {
    quiet()
    notebooks.create()
    openTab("notebook")
  }, [notebooks, quiet, openTab])
  // The title's menu, for the open notebook (a draft has none yet: it has Keep)
  const current = notebooks.current
  const notebookMenu = React.useMemo(
    () =>
      current && !notebooks.draft
        ? {
            rename: (title) => notebooks.rename(current.id, title),
            duplicate: () => {
              quiet()
              notebooks.duplicate(current.id)
            },
            exportFile: () => notebooks.exportFile(current.id),
            importFile: async (file) => {
              await notebooks.importFile(file)
              quiet()
              openTab("notebook")
            },
            remove: () => {
              if (!window.confirm(`Delete "${current.title}"? This can't be undone.`)) return
              quiet()
              notebooks.remove(current.id)
            },
          }
        : null,
    [current, notebooks, quiet, openTab],
  )

  const [shared, setShared] = React.useState(false)
  const shareNotebook = React.useCallback(async () => {
    await navigator.clipboard.writeText(shareNotebookUrl(cells))
    setShared(true)
    setTimeout(() => setShared(false), 1500)
  }, [cells])

  // Keyboard shortcuts hook
  useKeyboard({
    selectedId,
    editingId,
    cells,
    findIndex,
    runCell: playCellNow,
    insertCell,
    deleteCell,
    undoDelete,
    setSelectedId,
    setEditingId,
    single: EMBED,
  })

  const cellList = (
    <div className="cells">
      {cells.map((c, i) => (
        <Cell
          key={c.id}
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
          onRun={() => playCellNow(c.id)}
          onInterrupt={() => interruptCell(c.id)}
          onDelete={() => deleteCell(c.id)}
          onMoveUp={() => moveCell(c.id, -1)}
          onMoveDown={() => moveCell(c.id, 1)}
          onDuplicate={() => duplicateCell(c.id)}
          first={i === 0}
          last={i === cells.length - 1}
          onSetPreview={(v) => updateCell(c.id, { previewMode: v })}
          onTogglePlayback={togglePlayback}
          onPlaybackFinished={onPlaybackFinished}
          registerPlayer={playback.registerPlayer}
          unregisterPlayer={playback.unregisterPlayer}
          armAudio={armAudio}
        />
      ))}
    </div>
  )

  // One cell and nothing else: see shared/embed.js
  if (EMBED) {
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
        sideTab={sideTab}
        onTabChange={openTab}
        theme={theme}
        onSetTheme={(v) => setSetting("theme", v)}
      />

      <div className="app-main">
        <div className="notebook-root" style={{ display: sideTab === "notebook" ? undefined : "none" }}>
          <div className="nb-sticky-header">
          <NotebookTitle
            title={notebooks.draft?.title || notebooks.current?.title || "Notebook"}
            subtitle={
              notebooks.draft
                ? "From a link. Change it or press Keep, and it's kept on this device"
                : "Kept on this device as you write"
            }
            menu={notebookMenu}
          />
          <Toolbar
            onAddCode={() =>
              insertCell(
                cells.length ? cells[cells.length - 1].id : null,
                "below",
                "music",
              )
            }
            onAddText={() =>
              insertCell(
                cells.length ? cells[cells.length - 1].id : null,
                "below",
                "text",
              )
            }
            onAddStarter={addStarter}
            onRunAll={queuedRunAll}
            onStop={quiet}
            onShare={shareNotebook}
            shared={shared}
            onKeep={notebooks.draft ? () => notebooks.keep(cells) : null}
            kernelStatus={kernelStatus}
          />
          </div>

          <main
            className="nb-main"
            onClick={(e) => {
              if (e.target === e.currentTarget || e.target.classList.contains("cells"))
                setSelectedId(null)
            }}
          >
            {cellList}
          </main>

          <StatusBar editingId={editingId} kernelStatus={kernelStatus} />

        </div>
        {chordsOpened && (
          <React.Suspense fallback={null}>
            <ChordBrowserPanel style={{ display: sideTab === "chords" ? undefined : "none" }} />
          </React.Suspense>
        )}
      </div>
    </div>
  )
}
