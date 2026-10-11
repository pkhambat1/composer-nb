// components/MusicOutput.jsx — Music cell output: waveform, piano roll, chord chips, errors
import React from "react"
import WaveSurfer from "wavesurfer.js"
import * as MusicEngine from "composer-nb/engine"
import { embedSnippet, shareCellUrl } from "../shared/embed.js"
import DrumGrid from "./DrumGrid.jsx"

// Loaded when first shown: the chord shapes for the diagrams, abcjs for the sheet music
const ChordDiagram = React.lazy(() => import("./ChordDiagram.jsx"))
const DrumSheet = React.lazy(() => import("./DrumSheet.jsx"))

// Share: a link that opens the playground on this cell, or an iframe that shows it.
function ShareMenu({ source, theme }) {
  const [open, setOpen] = React.useState(false)
  const [copied, setCopied] = React.useState(null)
  const ref = React.useRef(null)

  React.useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  const copy = async (what, text) => {
    await navigator.clipboard.writeText(text)
    setCopied(what)
    setTimeout(() => {
      setCopied(null)
      setOpen(false)
    }, 1200)
  }

  return (
    <div className="share-wrap" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={"icon-btn" + (open ? " icon-btn-on" : "")}
        onClick={() => setOpen((v) => !v)}
        title="Share this cell"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M4.8 7.2l2.4-2.4M5.2 8.4l-1 1a1.7 1.7 0 0 1-2.4-2.4l1-1M6.8 3.6l1-1a1.7 1.7 0 0 1 2.4 2.4l-1 1" />
        </svg>
        <span>Share</span>
      </button>
      {open && (
        <div className="share-menu">
          <button type="button" className="share-item" onClick={() => copy("link", shareCellUrl(source))}>
            {copied === "link" ? "Link copied" : "Copy link"}
            <span className="share-hint">opens the playground on this cell, playing</span>
          </button>
          <button type="button" className="share-item" onClick={() => copy("embed", embedSnippet(source, theme))}>
            {copied === "embed" ? "Embed copied" : "Copy embed"}
            <span className="share-hint">an iframe for a page of your own</span>
          </button>
        </div>
      )}
    </div>
  )
}

// Tempo for practice: a rate on the player, so the audio isn't rendered again.
const RATES = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5]

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
}) {
  const chords = parsed.events.filter((e) => e.chord && !e.repeat)
  const drawn = (b) => b.drumEvents.length > 0 || b.noteEvents.length > 0 || b.chordEvents?.length > 0
  const sheet = drumView === "sheet"
  const meta = parsed.blocks
    .filter((b) => !drawn(b))
    .map((b) => `time ${b.time} · tempo ${b.tempo} · ${b.bars} bar${b.bars === 1 ? "" : "s"}`)
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
              {["bricks", "sheet"].map((v) => (
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
          </div>
          {sheet ? (
            <React.Suspense fallback={<div className="dg-head">Drawing the staff…</div>}>
              <DrumSheet blocks={parsed.blocks} counts={sheetCounts} getTime={getTime} playing={playing} />
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
  drumView,
  onSetDrumView,
  sheetCounts,
  onSetSheetCounts,
  runCount,
}) {
  const waveMountRef = React.useRef(null)
  const wsRef = React.useRef(null)
  const urlRef = React.useRef(null)
  const onPlaybackFinishedRef = React.useRef(onPlaybackFinished)
  const [ready, setReady] = React.useState(false)
  const [timeTick, setTimeTick] = React.useState(0)
  // Practice controls: play slower or faster than written, and round and round
  const [rate, setRate] = React.useState(1)
  const [loop, setLoop] = React.useState(false)
  const loopRef = React.useRef(loop)

  React.useEffect(() => {
    onPlaybackFinishedRef.current = onPlaybackFinished
  }, [onPlaybackFinished])
  React.useEffect(() => {
    loopRef.current = loop
  }, [loop])

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
    const ab = buffer && buffer.get ? buffer.get() : buffer
    const channelData = []
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
      if (loopRef.current) {
        ws.seekTo(0)
        ws.play().catch(() => {})
        return
      }
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

  // The rate changes the speed and keeps the pitch, so a slowed-down kit still sounds like one
  React.useEffect(() => {
    if (!ready || !wsRef.current) return
    wsRef.current.setPlaybackRate(rate, true)
  }, [rate, ready])

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

  const onExport = () => {
    const fname = `cell-${runCount || "out"}.wav`
    MusicEngine.downloadWav(output.buffer, fname)
  }
  // The tempo shown is the first block's, at the rate the player is set to
  const written = parsed.blocks[0]?.tempo || 120
  const step = (by) => {
    const i = RATES.indexOf(rate)
    const next = RATES[Math.min(RATES.length - 1, Math.max(0, (i < 0 ? 5 : i) + by))]
    setRate(next)
  }

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
            <div className="out-controls-right" onClick={(e) => e.stopPropagation()}>
              <span className="tempo-ctl" title="Play slower or faster than written">
                <button type="button" className="tempo-btn" onClick={() => step(-1)} disabled={rate <= RATES[0]} aria-label="Slower">
                  −
                </button>
                <span className={"tempo-val" + (rate !== 1 ? " tempo-val-changed" : "")}>
                  ♩= {Math.round(written * rate)}
                </span>
                <button type="button" className="tempo-btn" onClick={() => step(1)} disabled={rate >= RATES[RATES.length - 1]} aria-label="Faster">
                  +
                </button>
              </span>
              <button
                type="button"
                className={"icon-btn" + (loop ? " icon-btn-on" : "")}
                onClick={() => setLoop((v) => !v)}
                title={loop ? "Playing round and round" : "Play round and round"}
                aria-pressed={loop}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 5V4.5A1.5 1.5 0 0 1 3.5 3H9M9 3L7.5 1.5M9 3L7.5 4.5M10 7v.5A1.5 1.5 0 0 1 8.5 9H3M3 9l1.5 1.5M3 9l1.5-1.5" />
                </svg>
                <span>Loop</span>
              </button>
              <ShareMenu source={cell.source} theme={theme} />
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
