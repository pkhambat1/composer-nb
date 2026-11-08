// components/MusicOutput.tsx — Music cell output: waveform, piano roll, chord chips, errors
import React from "react"
import WaveSurfer from "wavesurfer.js"
import * as MusicEngine from "composer-nb/engine"
import type { NotebookCell } from "../shared/types.ts"

// What a cell's output plays and draws with: which cell is playing, what plays and stops
// it, and how the page draws the hits
import type { PlayerProps } from "../notebook/types.ts"
import MusicViews from "../notebook/MusicViews.tsx"
export type { PlayerProps } from "../notebook/types.ts"

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
      // Web Audio works in sandboxed MCP hosts without an HTML media source.
      backend: "WebAudio",
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
      const media = ws.getMediaElement()
      // WaveSurfer's bundled Web Audio player exposes its output node. Check the
      // runtime shape rather than importing a second copy of its player class.
      const node: unknown =
        "getGainNode" in media && typeof media.getGainNode === "function"
          ? media.getGainNode()
          : null
      const context = node instanceof GainNode ? node.context : null
      const resumed = context instanceof AudioContext ? context.resume() : Promise.resolve()
      resumed
        .then(() => ws.play())
        .catch((err: unknown) => {
          console.warn("Playback failed:", err instanceof Error ? err.message : String(err))
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

          <MusicViews
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
          <span className="tb-name">
            {lines.length === 1 ? "1 error" : `${lines.length} errors`}
          </span>
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
    return <div className="cell-run-confirmation" role="status">Cell executed successfully.</div>
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
                "btn btn-primary btn-icon btn-round play-btn" + (displayPlaying ? " playing" : "") + (displayPaused ? " paused" : "")
              }
              onClick={(e) => {
                e.stopPropagation()
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

        <MusicViews
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
