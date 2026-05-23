// components/MusicOutput.jsx — Music cell output: waveform, piano roll, chord chips, errors
import React from "react"
import WaveSurfer from "wavesurfer.js"
import * as MusicEngine from "../lib/music-engine.js"
import ChordDiagram from "./ChordDiagram.jsx"

function themeColors(theme, accent) {
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

function formatTime(sec) {
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
  runCount,
}) {
  const waveMountRef = React.useRef(null)
  const wsRef = React.useRef(null)
  const urlRef = React.useRef(null)
  const onPlaybackFinishedRef = React.useRef(onPlaybackFinished)
  const [ready, setReady] = React.useState(false)
  const [timeTick, setTimeTick] = React.useState(0)

  React.useEffect(() => {
    onPlaybackFinishedRef.current = onPlaybackFinished
  }, [onPlaybackFinished])

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
      setReady(true)
    })
    ws.on("finish", onFinish)
    ws.on("timeupdate", bumpTime)
    ws.on("audioprocess", bumpTime)

    ws.load(url)

    return () => {
      aborted = true
      container.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointerup", onPointerUp)
      ws.un("finish", onFinish)
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
      if (!ws.isPlaying()) ws.play().catch((err) => console.warn("Playback failed:", err.message))
    } else {
      if (ws.isPlaying()) ws.pause()
    }
  }, [focusedCellId, isPlaying, cell.id, ready])

  if (!output) return null

  if (output.kind === "rendering") {
    const parsed = output.parsed
    return (
      <div className="cell-output">
        <div className="out-prompt">Out [{runCount}]:</div>
        <div className="out-content">
          <div className="out-section">
            <div className="out-section-label">Playback</div>
            <div className="music-row music-row-controls rendering-placeholder">
              <span className="rendering-text">Rendering audio...</span>
            </div>
          </div>

          <div className="out-section">
            <div className="out-section-label">Chord diagrams</div>
            <div className="chord-strip">
              {parsed.events
                .filter((e) => e.chord)
                .map((e, i) => (
                  <div key={i} className="chord-chip">
                    <span className="chord-label">{e.chord.label}</span>
                    <ChordDiagram chord={e.chord} instrument={parsed.directives.inst} accent={accent} />
                    <span className="chord-notes">{e.chord.noteNames.map((n) => n.replace(/\d+$/, "")).join(" ")}</span>
                  </div>
                ))}
            </div>
          </div>

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
          <span className="tb-name">MusicError</span>
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

  const parsed = output.parsed
  const ws = wsRef.current
  const duration = ws && ready ? ws.getDuration() : output.duration || 0
  const currentTime = ws && ready ? ws.getCurrentTime() : 0
  const displayPlaying = cellIsPlaying && ws && ready && ws.isPlaying()
  const displayPaused = isFocused && !isPlaying && ws && ready && ws.getCurrentTime() > 0
  void timeTick

  const onExport = () => {
    const fname = `cell-${runCount || "out"}.wav`
    MusicEngine.downloadWav(output.buffer, fname)
  }

  return (
    <div className="cell-output">
      <div className="out-prompt">Out [{runCount}]:</div>
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
            <div className="out-controls-right">
              <button className="icon-btn" onClick={onExport} title="Download as WAV">
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path
                    d="M6 1v7m-3-3l3 3 3-3M2 10h8"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>WAV</span>
              </button>
            </div>
          </div>
        </div>

        <div className="out-section">
          <div className="out-section-label">Chord diagrams</div>
          <div className="chord-strip">
            {parsed.events
              .filter((e) => e.chord)
              .map((e, i) => (
                <div
                  key={i}
                  className="chord-chip"
                >
                  <span className="chord-label">{e.chord.label}</span>
                  <ChordDiagram chord={e.chord} instrument={parsed.directives.inst} accent={accent} />
                  <span className="chord-notes">{e.chord.noteNames.map((n) => n.replace(/\d+$/, "")).join(" ")}</span>
                </div>
              ))}
          </div>
        </div>

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
      </div>
    </div>
  )
}
