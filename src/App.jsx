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
  const [sideTab, setSideTab] = React.useState("notebook")
  const [kernelStatus, setKernelStatus] = React.useState("idle")
  const [activeCellId, setActiveCellId] = React.useState(null)
  const [runCounter, setRunCounter] = React.useState(0)
  const abortRef = React.useRef(null)
  const queueGenRef = React.useRef(0)
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

  const interruptCell = React.useCallback(
    (id) => {
      abortRef.current = null
      setActiveCellId(null)
      updateCell(id, { status: "idle", output: null })
      // Clear all waiting cells and reset the queue
      queueGenRef.current += 1
      runQueueRef.current = Promise.resolve()
      cells.forEach((c) => {
        if (c.status === "waiting") updateCell(c.id, { status: "idle" })
      })
      setKernelStatus("idle")
    },
    [updateCell, cells],
  )

  // --- Run queue: serialise all run operations so they don't overlap ------
  const runQueueRef = React.useRef(Promise.resolve())
  const runCellRef = React.useRef(runCell)
  React.useEffect(() => { runCellRef.current = runCell }, [runCell])

  const queuedRunCell = React.useCallback((id) => {
    updateCell(id, { status: "waiting" })
    setKernelStatus("busy")
    const gen = queueGenRef.current
    const p = runQueueRef.current.then(
      () => { if (queueGenRef.current === gen) return runCellRef.current(id) },
      () => { if (queueGenRef.current === gen) return runCellRef.current(id) },
    )
    runQueueRef.current = p
    return p
  }, [updateCell])

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
        onTabChange={setSideTab}
        theme={theme}
        onSetTheme={(v) => setSetting("theme", v)}
      />

      <div className="app-main">
        <div className="notebook-root" style={{ display: sideTab === "notebook" ? undefined : "none" }}>
          <Toolbar
            onAdd={() =>
              insertCell(
                selectedId || (cells[cells.length - 1] && cells[cells.length - 1].id),
                "below",
                "music",
              )
            }
            onRun={() => selectedId && queuedRunCell(selectedId)}
            onRunAll={queuedRunAll}
            onStop={() => {
              playback.stopAll()
              if (activeCellId) interruptCell(activeCellId)
              // Also clear any waiting cells even if nothing is actively running
              queueGenRef.current += 1
              runQueueRef.current = Promise.resolve()
              cells.forEach((c) => {
                if (c.status === "waiting") updateCell(c.id, { status: "idle" })
              })
              setKernelStatus("idle")
            }}
            onDelete={() => selectedId && deleteCell(selectedId)}
            kernelStatus={kernelStatus}
          />

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
                  onChange={(v) => updateCell(c.id, { source: v })}
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
