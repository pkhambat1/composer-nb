/* anywidget front end for the Python library: parses a chain of cell sources,
   renders the last one to audio, and shows a player, the settings in effect,
   chord chips and parse errors. */
import "./widget.css"
import {
  parseChain,
  renderToBuffer,
  drawWaveform,
  bufferDuration,
  bufferToWav,
} from "../music-engine.js"

// Tone.Offline swaps Tone's global context while it renders, so two cells
// rendering at once (Run All) would trample each other. Render one at a time.
let renderQueue = Promise.resolve()
function queueRender(parsed) {
  const job = renderQueue.then(() => renderToBuffer(parsed))
  renderQueue = job.catch(() => {})
  return job
}

// Only one cell plays at a time, like the playground.
let nowPlaying = null

function h(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

function formatTime(sec) {
  if (!sec || sec < 0) return "0:00"
  return Math.floor(sec / 60) + ":" + String(Math.floor(sec % 60)).padStart(2, "0")
}

function describeSettings(d) {
  const parts = [`key ${d.key}`, `${d.tempo} bpm`, d.inst, `${d.beats} beats/bar`]
  if (d.inst === "guitar" && d.capo > 0) parts.push(`capo ${d.capo}`)
  return parts.join(" · ")
}

function renderPlayer(slot, buffer, filename) {
  const audioUrl = URL.createObjectURL(bufferToWav(buffer))
  const audio = new Audio(audioUrl)
  const duration = bufferDuration(buffer)

  const row = h("div", "cnb-player")
  const play = h("button", "cnb-play")
  play.type = "button"
  play.title = "Play"
  play.setAttribute("aria-label", "Play")
  const wave = h("div", "cnb-wave")
  wave.title = "Click to seek"
  const base = h("canvas", "cnb-wave-base")
  const progress = h("div", "cnb-wave-progress")
  const fill = h("canvas", "cnb-wave-fill")
  progress.append(fill)
  wave.append(base, progress)
  const time = h("span", "cnb-time", `0:00 / ${formatTime(duration)}`)
  const download = h("a", "cnb-download", "WAV")
  download.href = audioUrl
  download.download = filename
  download.title = "Download as WAV"
  row.append(play, wave, time, download)
  slot.replaceChildren(row)

  const draw = () => {
    const styles = getComputedStyle(slot)
    fill.style.width = wave.clientWidth + "px"
    drawWaveform(base, buffer, {
      stroke: styles.getPropertyValue("--cnb-wave").trim(),
      midline: "transparent",
      normalize: true,
    })
    drawWaveform(fill, buffer, {
      stroke: styles.getPropertyValue("--cnb-accent").trim(),
      midline: "transparent",
      normalize: true,
    })
  }
  const resize = new ResizeObserver(draw)
  resize.observe(wave)

  let frame = 0
  const tick = () => {
    const pct = duration ? Math.min(1, audio.currentTime / duration) : 0
    progress.style.width = pct * 100 + "%"
    time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`
    if (!audio.paused) frame = requestAnimationFrame(tick)
  }
  const setPlaying = (playing) => {
    play.classList.toggle("is-playing", playing)
    play.title = playing ? "Pause" : "Play"
    play.setAttribute("aria-label", play.title)
  }

  audio.addEventListener("play", () => {
    if (nowPlaying && nowPlaying !== audio) nowPlaying.pause()
    nowPlaying = audio
    setPlaying(true)
    frame = requestAnimationFrame(tick)
  })
  audio.addEventListener("pause", () => {
    setPlaying(false)
    tick()
  })
  audio.addEventListener("ended", () => {
    audio.currentTime = 0
    tick()
  })

  play.addEventListener("click", () => {
    if (audio.paused) audio.play().catch((err) => console.warn("composer-nb: playback failed", err))
    else audio.pause()
  })
  wave.addEventListener("click", (e) => {
    const rect = wave.getBoundingClientRect()
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * duration
    tick()
  })

  return () => {
    cancelAnimationFrame(frame)
    resize.disconnect()
    audio.pause()
    if (nowPlaying === audio) nowPlaying = null
    URL.revokeObjectURL(audioUrl)
  }
}

function renderCell(el, model) {
  const name = model.get("name")
  const after = model.get("after")
  const parsed = parseChain(model.get("sources"))
  let disposePlayer = null
  let disposed = false

  const root = h("div", "cnb")
  const head = h("div", "cnb-head")
  if (name) head.append(h("span", "cnb-name", name))
  if (after) head.append(h("span", "cnb-after", `after ${after}`))
  head.append(h("span", "cnb-settings", describeSettings(parsed.directives)))
  root.append(head)

  // Holds the status line until the audio is ready, then the player.
  const slot = h("div", "cnb-slot")
  const status = h("div", "cnb-status")
  slot.append(status)
  root.append(slot)

  if (parsed.chords.length) {
    const chips = h("div", "cnb-chords")
    for (const ev of parsed.chords) {
      const chip = h("div", "cnb-chip")
      chip.append(
        h("span", "cnb-chip-label", ev.chord.label),
        h(
          "span",
          "cnb-chip-notes",
          ev.chord.noteNames.map((n) => n.replace(/-?\d+$/, "")).join(" "),
        ),
      )
      chips.append(chip)
    }
    root.append(chips)
  }

  if (parsed.errors.length) {
    const errors = h("div", "cnb-errors")
    for (const err of parsed.errors) {
      const row = h("div", "cnb-error")
      if (err.line) row.append(h("span", "cnb-error-line", `line ${err.line}`))
      row.append(h("span", "cnb-error-msg", err.msg))
      errors.append(row)
    }
    root.append(errors)
  }

  el.replaceChildren(root)

  if (!parsed.chords.length) {
    status.textContent = "Nothing to play yet. Add some chords."
  } else {
    status.textContent = "Rendering audio…"
    queueRender(parsed)
      .then((buffer) => {
        if (disposed) return
        disposePlayer = renderPlayer(slot, buffer, `${name || "composer-nb"}.wav`)
      })
      .catch((err) => {
        if (disposed) return
        status.textContent = `Couldn't render audio: ${err?.message || err}`
        status.classList.add("cnb-status-error")
      })
  }

  return () => {
    disposed = true
    disposePlayer?.()
  }
}

export default {
  render({ model, el }) {
    el.classList.add("cnb-host")
    let dispose = renderCell(el, model)
    const onChange = () => {
      dispose()
      dispose = renderCell(el, model)
    }
    model.on("change:sources", onChange)
    return () => {
      model.off("change:sources", onChange)
      dispose()
    }
  },
}
