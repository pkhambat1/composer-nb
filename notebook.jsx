/* Notebook React app — Jupyter-style cells, music DSL + Tone.js.
   Features: syntax-highlighted code cells, piano roll output, WAV export,
   chord palette sidebar, theme/accent/density/font tweaks.
*/

const { useState, useEffect, useRef, useCallback, useMemo } = React

// ============================================================================
// Tweaks
// ============================================================================

function NotebookTweaks({ tweaks, setTweak }) {
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Theme">
        <TweakRadio
          value={tweaks.theme}
          onChange={(v) => setTweak("theme", v)}
          options={["light", "dark", "retro"]}
        />
      </TweakSection>
      <TweakSection label="Accent">
        <TweakColor
          value={tweaks.accent}
          onChange={(v) => setTweak("accent", v)}
          options={APP_CONSTANTS.ACCENT_OPTIONS}
        />
      </TweakSection>
      <TweakSection label="Density">
        <TweakRadio
          value={tweaks.density}
          onChange={(v) => setTweak("density", v)}
          options={["cozy", "compact"]}
        />
      </TweakSection>
      <TweakSection label="Mono font">
        <TweakSelect
          value={tweaks.monoFont}
          onChange={(v) => setTweak("monoFont", v)}
          options={APP_CONSTANTS.MONO_FONTS}
        />
      </TweakSection>
    </TweaksPanel>
  )
}

// ============================================================================
// App
// ============================================================================

function App() {
  const [sideTab, setSideTab] = useState("notebook")
  const [kernelStatus, setKernelStatus] = useState("idle")
  const [runCounter, setRunCounter] = useState(0)
  const [audioReady, setAudioReady] = useState(false)

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
    _convertCell,
  } = cm

  const [tweaks, setTweak] = useTweaks(APP_CONSTANTS.TWEAK_DEFAULTS)
  const theme = tweaks.theme || "light"
  const accent = tweaks.accent || "#1a73e8"
  const density = tweaks.density || "cozy"
  const monoFont = tweaks.monoFont || "IBM Plex Mono"

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.density = density
    document.documentElement.style.setProperty("--accent", accent)
    document.documentElement.style.setProperty(
      "--font-mono",
      `'${monoFont}', ui-monospace, Menlo, monospace`,
    )
  }, [theme, accent, density, monoFont])

  const armAudio = useCallback(async () => {
    try {
      await window.Tone.start()
      setAudioReady(true)
    } catch (e) {}
  }, [])

  const playback = usePlayback(armAudio)

  const runCell = useCallback(
    async (id) => {
      const c = cells.find((x) => x.id === id)
      if (!c) return
      if (c.type === "text") {
        setEditingId((e) => (e === id ? null : e))
        return
      }
      playback.stopCell(id)
      setKernelStatus("busy")
      updateCell(id, { status: "running" })
      try {
        const parsed = window.MusicEngine.parseSource(c.source)
        if (parsed.errors && parsed.errors.length > 0) {
          const lines = parsed.errors.map((e) => `Line ${e.line}: ${e.msg}`).join("\n")
          updateCell(id, { status: "idle", output: { kind: "error", error: lines } })
          return
        }
        const isEmpty =
          parsed.kind === "drums"
            ? !parsed.events || parsed.events.length === 0
            : parsed.chords.length === 0
        if (isEmpty) {
          const msg =
            parsed.kind === "drums"
              ? "No drum hits. Try `bd: x.4 ~.4 x.4 ~.4`."
              : "No chords. Try `Cmaj7  Am7  Dm7  G7`."
          updateCell(id, { status: "idle", output: { kind: "error", error: msg } })
          return
        }
        const buffer = await window.MusicEngine.renderToBuffer(parsed)
        const nextCount = runCounter + 1
        setRunCounter(nextCount)
        const dur = window.MusicEngine.bufferDuration(buffer) || parsed.totalSec || 0
        updateCell(id, {
          status: "idle",
          runCount: nextCount,
          output: { kind: "rendered", buffer, parsed, duration: dur },
        })
      } catch (e) {
        updateCell(id, {
          status: "idle",
          output: { kind: "error", error: String((e && e.message) || e) },
        })
      } finally {
        setKernelStatus("idle")
      }
    },
    [cells, runCounter, updateCell, playback],
  )

  const runAll = useCallback(async () => {
    playback.stopAll()
    setKernelStatus("busy")
    let counter = runCounter
    for (const c of cells) {
      if (c.type !== "music") continue
      updateCell(c.id, { status: "running" })
      try {
        const parsed = window.MusicEngine.parseSource(c.source)
        if (parsed.errors && parsed.errors.length > 0) {
          const lines = parsed.errors.map((e) => `Line ${e.line}: ${e.msg}`).join("\n")
          updateCell(c.id, { status: "idle", output: { kind: "error", error: lines } })
          continue
        }
        const isEmpty =
          parsed.kind === "drums"
            ? !parsed.events || parsed.events.length === 0
            : parsed.chords.length === 0
        if (isEmpty) {
          const msg = parsed.kind === "drums" ? "No drum hits." : "No chords."
          updateCell(c.id, { status: "idle", output: { kind: "error", error: msg } })
          continue
        }
        const buffer = await window.MusicEngine.renderToBuffer(parsed)
        counter += 1
        const dur = window.MusicEngine.bufferDuration(buffer) || parsed.totalSec || 0
        updateCell(c.id, {
          status: "idle",
          runCount: counter,
          output: { kind: "rendered", buffer, parsed, duration: dur },
        })
      } catch (e) {
        updateCell(c.id, {
          status: "idle",
          output: { kind: "error", error: String((e && e.message) || e) },
        })
      }
    }
    setRunCounter(counter)
    setKernelStatus("idle")
  }, [cells, runCounter, updateCell, playback])

  // Insert from palette
  const insertFromPalette = useCallback(
    (source) => {
      const target = selectedId || (cells.length ? cells[cells.length - 1].id : null)
      insertCell(target, "below", "music", source)
    },
    [selectedId, cells, insertCell],
  )

  // Keyboard shortcuts hook
  useKeyboard({
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
  })

  return (
    <div className="app-shell">
      <Sidebar
        sideTab={sideTab}
        onTabChange={setSideTab}
        onStopAll={playback.stopAll}
      />

      <div className="app-main">
        {sideTab === "chords" ? (
          <ChordBrowserPanel theme={theme} accent={accent} />
        ) : (
          <div className="notebook-root">
      <header className="nb-header">
        <div className="nb-header-left">
          <div className="nb-logo">
            <svg width="22" height="22" viewBox="0 0 24 24">
              <circle cx="9" cy="17" r="3" fill="currentColor" />
              <circle cx="18" cy="14" r="3" fill="currentColor" />
              <path d="M12 17V5l9-2v12" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          </div>
          <div className="nb-titles">
            <div className="nb-title">
              Composer<span className="nb-title-sep">.</span>
              <span className="nb-title-ext">nb</span>
            </div>
            <div className="nb-subtitle">
              Last Checkpoint: a few seconds ago <span className="nb-dim">(autosaved)</span>
            </div>
          </div>
        </div>
      </header>

      <Toolbar
        onAdd={() =>
          insertCell(
            selectedId || (cells[cells.length - 1] && cells[cells.length - 1].id),
            "below",
            "music",
          )
        }
        onRun={() => selectedId && runCell(selectedId)}
        onRunAll={runAll}
        onStop={playback.stopAll}
        onDelete={() => selectedId && deleteCell(selectedId)}
        kernelStatus={kernelStatus}
        onOpenTweaks={() => window.postMessage({ type: "__activate_edit_mode" }, "*")}
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
              theme={theme}
              accent={accent}
              focusedCellId={playback.focusedCellId}
              isPlaying={playback.isPlaying}
              onSelect={() => setSelectedId(c.id)}
              onEnterEdit={() => setEditingId(c.id)}
              onLeaveEdit={() => setEditingId((cur) => (cur === c.id ? null : cur))}
              onChange={(v) => updateCell(c.id, { source: v })}
              onRun={() => runCell(c.id)}
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

      <NotebookTweaks tweaks={tweaks} setTweak={setTweak} />
          </div>
        )}
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />)
