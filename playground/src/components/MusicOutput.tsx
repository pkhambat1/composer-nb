// components/MusicOutput.tsx — Music cell output: waveform, piano roll, chord chips, errors
import React from "react"
import WaveSurfer from "wavesurfer.js"
import * as MusicEngine from "composer-nb/engine"
import type { GridBlock, Parsed } from "composer-nb/language"
import type { DrumView, NotebookCell, Player, Theme } from "../shared/types.ts"
import DrumGrid from "./DrumGrid.tsx"

// What a cell's output plays and draws with: which cell is playing, what plays and stops
// it, and how the page draws the hits
export type PlayerProps = {
  focusedCellId: string | null
  isPlaying: boolean
  onTogglePlayback: (id: string) => void
  onPlaybackFinished: (id: string) => void
  registerPlayer: (id: string, player: Player) => void
  unregisterPlayer: (id: string) => void
  armAudio: () => Promise<void>
  theme: Theme
  accent: string
  drumView: DrumView
  onSetDrumView: (view: DrumView) => void
  sheetCounts: boolean
  onSetSheetCounts: (counts: boolean) => void
}

// Loaded when first shown: the chord shapes for the diagrams, abcjs for the sheet music
const ChordDiagram = React.lazy(() => import("./ChordDiagram.tsx"))
const DrumSheet = React.lazy(() => import("./DrumSheet.tsx"))

function themeColors(theme: string, accent: string) {
  if (theme === "retro") {
    return {
      primary: "#ffb000",
      secondary: "#ff8533",
      midline: "rgba(255,176,0,0.15)",
      grid: "rgba(255,176,0,0.12)",
      label: "rgba(255,176,0,0.7)",
      rest: "rgba(255,176,0,0.22)",
      cellBg: "rgba(255,176,0,0.04)",
      cellBgAlt: "rgba(255,176,0,0.10)",
    }
  }
  if (theme === "dark") {
    return {
      primary: accent,
      secondary: "#8ea4c8",
      midline: "rgba(255,255,255,0.06)",
      grid: "rgba(255,255,255,0.10)",
      label: "rgba(255,255,255,0.55)",
      rest: "rgba(255,255,255,0.12)",
      cellBg: "rgba(255,255,255,0.02)",
      cellBgAlt: "rgba(255,255,255,0.05)",
    }
  }
  return {
    primary: accent,
    secondary: "#9fb8da",
    midline: "rgba(0,0,0,0.06)",
    grid: "rgba(0,0,0,0.08)",
    label: "rgba(0,0,0,0.6)",
    rest: "rgba(0,0,0,0.12)",
    cellBg: "rgba(0,0,0,0.02)",
    cellBgAlt: "rgba(0,0,0,0.05)",
  }
}

const noTime = () => 0

// Everything below the playback row: settings summary, the drums and notes as a grid of
// bricks or as sheet music, chord diagrams, errors.
function CellDetails({
  parsed,
  accent,
  drumView,
  onSetDrumView,
  sheetCounts,
  onSetSheetCounts,
  getTime = noTime,
  playing = false,
}: Pick<PlayerProps, "accent" | "drumView" | "onSetDrumView" | "sheetCounts" | "onSetSheetCounts"> & {
  parsed: Parsed
  getTime?: () => number
  playing?: boolean
}) {
  const chords = parsed.chords.filter((e) => !e.repeat)
  const drawn = (b: GridBlock) =>
    b.drumEvents.length > 0 || b.noteEvents.length > 0 || b.chordEvents.length > 0
  const sheet = drumView === "sheet"
  // Print: only this cell's sheet goes to the printer (see @media print)
  const sheetRef = React.useRef<HTMLDivElement>(null)
  const printSheet = () => {
    const el = sheetRef.current
    if (!el) return
    el.classList.add("printing")
    const done = () => {
      el.classList.remove("printing")
      window.removeEventListener("afterprint", done)
    }
    window.addEventListener("afterprint", done)
    window.print()
  }
  const meta = parsed.blocks
    .filter((b) => !drawn(b))
    .map(
      (b) =>
        `time ${b.time} · tempo ${b.tempo}${b.swing ? " · swing" : ""} · key ${b.key} ${b.mode} · ${b.bars} bar${b.bars === 1 ? "" : "s"}`,
    )
  if (parsed.outputs.length > 1) meta.unshift(`${parsed.outputs.length} plays, one after another`)
  if (parsed.fromAbove.length) meta.push(`from cells above: ${parsed.fromAbove.join(", ")}`)
  return (
    <>
      {meta.length > 0 && <div className="music-meta">{meta.join("  ·  ")}</div>}
      {parsed.warnings?.map((w) => (
        <div key={w} className="music-meta music-warning">
          {w}
        </div>
      ))}

      {parsed.blocks.some(drawn) && (
        <div className="out-section">
          <div className="out-section-label out-section-row">
            <span>{sheet ? "Sheet music" : parsed.notes.length ? "Steps" : "Drums"}</span>
            <span className="view-toggle" role="group" aria-label="How the hits are drawn">
              {(["bricks", "sheet"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={"view-btn" + (drumView === v ? " view-btn-on" : "")}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSetDrumView(v)
                  }}
                >
                  {v}
                </button>
              ))}
            </span>
            {sheet && parsed.blocks.some((b) => b.drumEvents.length > 0) && (
              <button
                type="button"
                className={"view-btn view-btn-lone" + (sheetCounts ? " view-btn-on" : "")}
                onClick={(e) => {
                  e.stopPropagation()
                  onSetSheetCounts(!sheetCounts)
                }}
                title="Count the hands' notes under the staff"
                aria-pressed={sheetCounts}
              >
                counts
              </button>
            )}
            {sheet && (
              <button
                type="button"
                className="view-btn view-btn-lone"
                onClick={(e) => {
                  e.stopPropagation()
                  printSheet()
                }}
                title="Print the sheet, or save it as a PDF"
              >
                print
              </button>
            )}
          </div>
          {sheet ? (
            <React.Suspense fallback={<div className="dg-head">Drawing the staff…</div>}>
              <div className="sheet-print" ref={sheetRef}>
                <DrumSheet blocks={parsed.blocks} counts={sheetCounts} getTime={getTime} playing={playing} />
              </div>
            </React.Suspense>
          ) : (
            <DrumGrid blocks={parsed.blocks} getTime={getTime} playing={playing} />
          )}
        </div>
      )}

      {chords.length > 0 && (
        <div className="out-section">
          <div className="out-section-label">Chord diagrams</div>
          <div className="chord-strip">
            <React.Suspense fallback={null}>
              {chords.map((e, i) => (
                <div key={i} className="chord-chip">
                  <span className="chord-label">{e.chord.label}</span>
                  <ChordDiagram chord={e.chord} instrument={e.instrument} accent={accent} />
                  <span className="chord-notes">
                    {e.chord.noteNames.map((n) => n.replace(/\d+$/, "")).join(" ")}
                  </span>
                </div>
              ))}
            </React.Suspense>
          </div>
        </div>
      )}

      {parsed.errors && parsed.errors.length > 0 && (
        <div className="parse-errors">
          <span className="pe-icon">!</span>
          <div className="pe-list">
            {parsed.errors.slice(0, 4).map((e, i) => (
              <div key={i} className="pe-row">
                <span className="pe-line">line {e.line}</span>
                <span className="pe-msg">{e.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function formatTime(sec: number): string {
  if (!sec || sec < 0) return "0:00"
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return m + ":" + String(s).padStart(2, "0")
}

export default function MusicOutput({
  cell,
  focusedCellId,
  isPlaying,
  onTogglePlayback,
  onPlaybackFinished,
  registerPlayer,
  unregisterPlayer,
  armAudio,
  theme,
  accent,
  drumView,
  onSetDrumView,
  sheetCounts,
  onSetSheetCounts,
}: PlayerProps & { cell: NotebookCell }) {
  const waveMountRef = React.useRef<HTMLDivElement>(null)
  const wsRef = React.useRef<WaveSurfer | null>(null)
  const urlRef = React.useRef<string | null>(null)
  const onPlaybackFinishedRef = React.useRef(onPlaybackFinished)
  const [ready, setReady] = React.useState(false)
  const [timeTick, setTimeTick] = React.useState(0)
  // Where playback was when the cell was run again, so the new audio carries on from there
  const resumeRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    onPlaybackFinishedRef.current = onPlaybackFinished
  }, [onPlaybackFinished])

  const getTime = React.useCallback(
    () => (ready && wsRef.current ? wsRef.current.getCurrentTime() : 0),
    [ready],
  )

  const output = cell.output
  const buffer = output?.kind === "rendered" ? output.buffer : null
  const isFocused = focusedCellId === cell.id
  const cellIsPlaying = isFocused && isPlaying

  React.useEffect(() => {
    if (!buffer || !waveMountRef.current) return

    let aborted = false

    const colors = themeColors(theme, accent)
    const url = MusicEngine.bufferToObjectUrl(buffer)
    urlRef.current = url
    setReady(false)

    // Extract pre-decoded channel data to avoid expensive decodeAudioData for large files
    const ab = buffer.get()!
    const channelData: Float32Array[] = []
    for (let ch = 0; ch < ab.numberOfChannels; ch++) {
      channelData.push(ab.getChannelData(ch))
    }
    const duration = ab.duration

    const ws = WaveSurfer.create({
      container: waveMountRef.current,
      height: 50,
      waveColor: colors.midline || "rgba(0,0,0,0.12)",
      progressColor: colors.primary,
      cursorColor: colors.primary,
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      normalize: true,
      interact: true,
      dragToSeek: true,
      autoplay: false,
      // Pre-decoded peaks + duration: renders waveform instantly, skips decodeAudioData
      peaks: channelData,
      duration,
      url,
    })

    wsRef.current = ws

    let lastTimeUi = 0
    const bumpTime = () => {
      if (aborted) return
      const now = Date.now()
      if (now - lastTimeUi < 200) return
      lastTimeUi = now
      setTimeTick((n) => n + 1)
    }
    const onFinish = () => {
      if (aborted) return
      onPlaybackFinishedRef.current(cell.id)
    }

    let wasDragging = false
    const onPointerDown = () => {
      if (ws.isPlaying()) {
        wasDragging = true
        ws.pause()
      }
    }
    const onPointerUp = () => {
      if (wasDragging) {
        wasDragging = false
        ws.play().catch(() => {})
      }
    }
    const container = waveMountRef.current
    container.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("pointerup", onPointerUp)

    ws.on("ready", () => {
      if (aborted) return
      // Edited while playing: pick up where it was, as far as the new audio goes
      if (resumeRef.current != null) {
        const dur = ws.getDuration()
        if (dur > 0) ws.seekTo(Math.min(resumeRef.current, dur - 0.01) / dur)
        resumeRef.current = null
      }
      setReady(true)
    })
    ws.on("finish", onFinish)
    ws.on("timeupdate", bumpTime)
    ws.on("audioprocess", bumpTime)

    return () => {
      aborted = true
      container.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointerup", onPointerUp)
      ws.un("finish", onFinish)
      if (ws.isPlaying()) resumeRef.current = ws.getCurrentTime()
      ws.destroy()
      wsRef.current = null
      setReady(false)
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [buffer, cell.runCount, theme, accent, cell.id])

  React.useEffect(() => {
    if (!ready || !wsRef.current) return
    const colors = themeColors(theme, accent)
    wsRef.current.setOptions({
      waveColor: colors.midline || "rgba(0,0,0,0.12)",
      progressColor: colors.primary,
      cursorColor: colors.primary,
    })
  }, [theme, accent, ready])

  React.useEffect(() => {
    if (!ready || !wsRef.current) return
    registerPlayer(cell.id, {
      play: () => wsRef.current?.play(),
      pause: () => wsRef.current?.pause(),
      stop: () => {
        wsRef.current?.pause()
        wsRef.current?.seekTo(0)
      },
      isPlaying: () => wsRef.current?.isPlaying() ?? false,
      getCurrentTime: () => wsRef.current?.getCurrentTime() ?? 0,
    })
    return () => unregisterPlayer(cell.id)
  }, [ready, cell.id, registerPlayer, unregisterPlayer])

  React.useEffect(() => {
    const ws = wsRef.current
    if (!ws || !ready) return
    if (focusedCellId === cell.id && isPlaying) {
      if (ws.isPlaying()) return
      // A browser refuses to play before the page is touched, and then the cell isn't
      // playing: the first press of Play is what plays it
      ws.play().catch((err) => {
        console.warn("Playback failed:", err.message)
        onPlaybackFinishedRef.current(cell.id)
      })
    } else if (ws.isPlaying()) ws.pause()
  }, [focusedCellId, isPlaying, cell.id, ready])

  if (!output) return null

  if (output.kind === "rendering") {
    const parsed = output.parsed
    return (
      <div className="cell-output">
        <div className="out-prompt" />
        <div className="out-content">
          <div className="out-section">
            <div className="out-section-label">Playback</div>
            <div className="music-row music-row-controls rendering-placeholder">
              <span className="rendering-text">Rendering the audio…</span>
            </div>
          </div>

          <CellDetails
            parsed={parsed}
            accent={accent}
            drumView={drumView}
            onSetDrumView={onSetDrumView}
            sheetCounts={sheetCounts}
            onSetSheetCounts={onSetSheetCounts}
          />
        </div>
      </div>
    )
  }

  if (output.kind === "error") {
    const lines = String(output.error || "")
      .split("\n")
      .filter(Boolean)
    return (
      <div className="cell-output cell-output-error">
        <div className="traceback">
          <span className="tb-name">{lines.length === 1 ? "1 mistake" : `${lines.length} mistakes`}</span>
          <div className="tb-msg-block">
            {lines.map((l, i) => (
              <div key={i} className="tb-msg-line">
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (output.kind === "info") {
    return (
      <div className="cell-output cell-output-info">
        <div className="out-prompt" />
        <div className="info-msg">{output.message}</div>
      </div>
    )
  }

  const parsed = output.parsed
  const ws = wsRef.current
  const duration = ws && ready ? ws.getDuration() : output.duration || 0
  const currentTime = ws && ready ? ws.getCurrentTime() : 0
  const displayPlaying = cellIsPlaying && ws && ready && ws.isPlaying()
  const displayPaused = isFocused && !isPlaying && ws && ready && ws.getCurrentTime() > 0
  void timeTick

  return (
    <div className="cell-output">
      <div className="out-prompt" />
      <div className="out-content">
        <div className="out-section">
          <div className="out-section-label">Playback</div>
          <div className="music-row music-row-controls">
            <button
              type="button"
              className={
                "play-btn" +
                (displayPlaying ? " playing" : "") +
                (displayPaused ? " paused" : "")
              }
              onClick={async (e) => {
                e.stopPropagation()
                await armAudio()
                const w = wsRef.current
                if (!w || !ready) return
                onTogglePlayback(cell.id)
              }}
              title={displayPlaying ? "Pause" : "Play"}
            >
              {displayPlaying ? (
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <rect x="3" y="3" width="3" height="8" />
                  <rect x="8" y="3" width="3" height="8" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <polygon points="3,2 12,7 3,12" />
                </svg>
              )}
            </button>
            <div
              className="waveform-wrap"
              onClick={(e) => e.stopPropagation()}
              title="Click or drag to seek"
            >
              <div ref={waveMountRef} className="waveform-mount" />
            </div>
            {duration > 0 && (
              <span className="playback-time" aria-live="polite">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            )}
          </div>
        </div>

        <CellDetails
          parsed={parsed}
          accent={accent}
          drumView={drumView}
          onSetDrumView={onSetDrumView}
          sheetCounts={sheetCounts}
          onSetSheetCounts={onSetSheetCounts}
          getTime={getTime}
          playing={!!displayPlaying}
        />
      </div>
    </div>
  )
}
