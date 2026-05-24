/* Notebook React app — Jupyter-style cells, music DSL + Tone.js.
   Features: syntax-highlighted code cells, piano roll output, WAV export,
   chord palette sidebar, theme panel.
*/
import React from "react"
import * as Tone from "tone"
import * as MusicEngine from "./lib/music-engine.js"
import { APP_CONSTANTS } from "./shared/constants.js"
import { useCellManager } from "./hooks/useCellManager.js"
import { usePlayback } from "./hooks/usePlayback.js"
import { useKeyboard } from "./hooks/useKeyboard.js"
import { useTheme } from "./components/theme-panel.jsx"
import Sidebar from "./components/Sidebar.jsx"
import Toolbar from "./components/Toolbar.jsx"
import Cell from "./components/Cell.jsx"
import StatusBar from "./components/StatusBar.jsx"
import ChordBrowserPanel from "./components/ChordBrowser.jsx"
import DocsPanel from "./components/DocsPanel.jsx"

// ============================================================================
// App
// ============================================================================

export default function App() {
  const [sideTab, setSideTab] = React.useState(() => {
    const hash = window.location.hash.replace("#", "")
    if (hash.startsWith("docs-")) return "docs"
    return "notebook"
  })
  const [kernelStatus, setKernelStatus] = React.useState("idle")
  const [activeCellId, setActiveCellId] = React.useState(null)
  const [runCounter, setRunCounter] = React.useState(0)
  const abortRef = React.useRef(null)
  // Cell management hook
  const cm = useCellManager(APP_CONSTANTS.STARTER_CELLS)
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
  } = cm

  const [settings, setSetting] = useTheme(APP_CONSTANTS.THEME_DEFAULTS)
  const theme = settings.theme || "light"
  const accent = settings.accent || "#1a73e8"
  const density = settings.density || "cozy"
  const monoFont = settings.monoFont || "IBM Plex Mono"

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.density = density
    document.documentElement.style.setProperty("--accent", accent)
    document.documentElement.style.setProperty(
      "--font-mono",
      `'${monoFont}', ui-monospace, Menlo, monospace`,
    )
  }, [theme, accent, density, monoFont])

  const armAudio = React.useCallback(async () => {
    try {
      await Tone.start()
    } catch (_e) {}
  }, [])

  const playback = usePlayback(armAudio)

  const runCell = React.useCallback(
    async (id) => {
      const c = cells.find((x) => x.id === id)
      if (!c) return
      if (c.type === "text") {
        setEditingId((e) => (e === id ? null : e))
        return
      }
      playback.stopCell(id)
      setKernelStatus("busy")
      setActiveCellId(id)
      updateCell(id, { status: "running", output: null })
      const runId = Symbol()
      abortRef.current = runId
      try {
        const parsed = MusicEngine.parseSource(c.source)
        if (abortRef.current !== runId) return
        if (parsed.errors && parsed.errors.length > 0) {
          const lines = parsed.errors.map((e) => `Line ${e.line}: ${e.msg}`).join("\n")
          updateCell(id, { status: "idle", output: { kind: "error", error: lines } })
          return
        }
        const isEmpty = parsed.chords.length === 0
        if (isEmpty) {
          const msg = "No chords. Try `Cmaj7  Am7  Dm7  G7`."
          updateCell(id, { status: "idle", output: { kind: "error", error: msg } })
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
      } catch (e) {
        if (abortRef.current !== runId) return
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
      }
    },
    [cells, runCounter, updateCell, playback],
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
      const id = queueRef.current.shift()
      await new Promise((resolve) => {
        skipRef.current = resolve
        runCellRef.current(id).then(resolve, resolve)
      })
      skipRef.current = null
    }
    processingRef.current = false
    setKernelStatus("idle")
  }, [])

  const queuedRunCell = React.useCallback((id) => {
    updateCell(id, { status: "waiting", output: null, runCount: null })
    setKernelStatus("busy")
    queueRef.current.push(id)
    processQueue()
  }, [updateCell, processQueue])

  const interruptCell = React.useCallback(
    (id) => {
      const c = cells.find((x) => x.id === id)
      if (!c) return
      if (c.status === "waiting") {
        // Just remove from queue, don't touch anything else
        queueRef.current = queueRef.current.filter((qid) => qid !== id)
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
    // Clear entire queue
    const waiting = [...queueRef.current]
    queueRef.current = []
    waiting.forEach((id) => updateCell(id, { status: "idle" }))
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
    for (const c of cells) {
      if (c.type !== "music") continue
      queuedRunCell(c.id)
    }
  }, [cells, playback, queuedRunCell])

  // Keyboard shortcuts hook
  useKeyboard({
    selectedId,
    editingId,
    cells,
    findIndex,
    runCell: queuedRunCell,
    insertCell,
    deleteCell,
    undoDelete,
    setSelectedId,
    setEditingId,
  })

  return (
    <div className="app-shell">
      <Sidebar
        sideTab={sideTab}
        onTabChange={(tab) => {
          setSideTab(tab)
          if (tab !== "docs" && window.location.hash.startsWith("#docs-")) {
            history.replaceState(null, "", window.location.pathname)
          }
        }}
        theme={theme}
        onSetTheme={(v) => setSetting("theme", v)}
      />

      <div className="app-main">
        <div className="notebook-root" style={{ display: sideTab === "notebook" ? undefined : "none" }}>
          <div className="nb-sticky-header">
          <div className="nb-title-bar">
            <h1 className="panel-title">Notebook</h1>
            <p className="panel-subtitle">Cells & playback</p>
          </div>
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
            onRun={() => selectedId && queuedRunCell(selectedId)}
            onRunAll={queuedRunAll}
            onStop={() => {
              playback.stopAll()
              stopAll()
            }}
            onDelete={() => selectedId && deleteCell(selectedId)}
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
                  focusedCellId={playback.focusedCellId}
                  isPlaying={playback.isPlaying}
                  onSelect={() => setSelectedId(c.id)}
                  onEnterEdit={() => setEditingId(c.id)}
                  onLeaveEdit={() => setEditingId((cur) => (cur === c.id ? null : cur))}
                  onChange={(v) => updateCell(c.id, { source: v, output: null, runCount: null })}
                  onRun={() => queuedRunCell(c.id)}
                  onInterrupt={() => interruptCell(c.id)}
                  onDelete={() => deleteCell(c.id)}
                  onSetPreview={(v) => updateCell(c.id, { previewMode: v })}
                  onTogglePlayback={playback.togglePlayback}
                  onPlaybackFinished={playback.onPlaybackFinished}
                  registerPlayer={playback.registerPlayer}
                  unregisterPlayer={playback.unregisterPlayer}
                  armAudio={armAudio}
                />
              ))}
            </div>
          </main>

          <StatusBar editingId={editingId} kernelStatus={kernelStatus} />

        </div>
        <ChordBrowserPanel style={{ display: sideTab === "chords" ? undefined : "none" }} />
        <DocsPanel style={{ display: sideTab === "docs" ? undefined : "none" }} />
      </div>
    </div>
  )
}
