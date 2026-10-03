/* anywidget front end for the Python library: parses a chain of cell sources,
   renders the last one to audio, and shows a player, what each block plays, a drum
   grid, chord chips and parse errors. */
import "./widget.css"
import {
  parseChain,
  renderToBuffer,
  drawWaveform,
  bufferDuration,
  bufferToWav,
} from "../music-engine.js"
import { LANES, TPQ } from "../language.js"

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

function describeBlock(b) {
  const bars = `${b.bars} bar${b.bars === 1 ? "" : "s"}${b.times > 1 ? ` × ${b.times}` : ""}`
  return `time ${b.time} · tempo ${b.tempo} · ${bars}`
}

// What the chords play on, e.g. "guitar, capo 2".
function describeSounds(output) {
  const seen = new Map()
  for (const e of output.chords) seen.set(e.instrument, e.capo)
  return [...seen].map(([inst, capo]) => (capo ? `${inst}, capo ${capo}` : inst)).join(" · ")
}

// --- Drum grid: each block drawn once, bar by bar, counted 1 e & a -------------

const SAY = { 1: [""], 2: ["", "&"], 3: ["", "&", "a"], 4: ["", "e", "&", "a"] }

function renderDrumGrid(blocks) {
  const grid = h("div", "cnb-grid")
  blocks.forEach((block, bi) => {
    if (!block.drumEvents.length) return
    const per = Math.round((block.barTicks / TPQ) * block.res)
    const cellTicks = TPQ / block.res
    const lanes = LANES.filter((d) => block.drumEvents.some((e) => e.lane === d))
    const hits = new Map()
    for (const e of block.drumEvents) {
      if (e.hidden) continue
      const k = e.lane + "@" + Math.round(e.tick / cellTicks)
      if (!hits.has(k) || e.vel > hits.get(k).vel) hits.set(k, e)
    }
    // Shade alternate groups in added-up meters like (3+4)/4, otherwise alternate beats.
    const groupEnds = []
    let acc = 0
    for (const g of block.groups) groupEnds.push((acc += (g * 4) / block.unit))
    const shaded = (col) => {
      const q = col / block.res
      return block.groups.length > 1
        ? groupEnds.findIndex((end) => q < end - 1e-9) % 2 === 1
        : Math.floor(q) % 2 === 1
    }

    if (blocks.length > 1) grid.append(h("div", "cnb-grid-head", describeBlock(block)))
    for (let bar = 0; bar < block.bars; bar++) {
      const row = h("div", "cnb-bar")
      row.style.gridTemplateColumns = `68px repeat(${per}, minmax(0, 1fr))`
      for (const lane of lanes) {
        row.append(h("div", "cnb-lane", lane))
        for (let col = 0; col < per; col++) {
          const e = hits.get(lane + "@" + (bar * per + col))
          let cls = "cnb-cell" + (shaded(col) ? " cnb-alt" : "")
          if (e) cls += " cnb-hit" + (e.accent ? " cnb-acc" : "") + (e.ghost ? " cnb-ghost" : "")
          const cell = h("div", cls)
          cell.dataset.k = `${bi}-${bar}-${col}`
          row.append(cell)
        }
      }
      row.append(h("div", "cnb-lane cnb-bar-num", block.bars > 1 ? `bar ${bar + 1}` : ""))
      for (let col = 0; col < per; col++) {
        const sub = col % block.res
        const count = h(
          "div",
          "cnb-count" + (sub ? "" : " cnb-count-beat"),
          sub ? (SAY[block.res]?.[sub] ?? "·") : String(Math.floor(col / block.res) + 1),
        )
        count.dataset.k = `${bi}-${bar}-${col}`
        row.append(count)
      }
      grid.append(row)
    }
  })

  // Marks the step playing at `t` seconds. A block that plays more than once is drawn
  // once, so the playhead goes round it again each time.
  let lastKey = null
  const setTime = (t, active) => {
    let key = null
    if (active) {
      const bi = blocks.findIndex((b) => b.plays.some((at) => t >= at && t < at + b.durSec))
      if (bi >= 0) {
        const b = blocks[bi]
        const at = b.plays.find((s) => t >= s && t < s + b.durSec)
        const tick = (t - at) / b.secPerTick
        const bar = Math.floor(tick / b.barTicks)
        key = `${bi}-${bar}-${Math.floor((tick - bar * b.barTicks) / (TPQ / b.res))}`
      }
    }
    if (key === lastKey) return
    grid.querySelectorAll(".cnb-now").forEach((el) => el.classList.remove("cnb-now"))
    if (key) grid.querySelectorAll(`[data-k="${key}"]`).forEach((el) => el.classList.add("cnb-now"))
    lastKey = key
  }
  return { grid, setTime }
}

// --- Player --------------------------------------------------------------------

function renderPlayer(slot, buffer, filename, onTime) {
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
    onTime(audio.currentTime, !audio.paused || audio.currentTime > 0)
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

// --- Cell ----------------------------------------------------------------------

// One play line's output: what it is, its player, drum grid and chords.
function renderOutput(output, filename, messages) {
  const box = h("div", "cnb-output")
  const head = h("div", "cnb-output-head")
  head.append(h("span", "cnb-play-line", output.label))
  const summary = output.blocks.map(describeBlock)
  if (output.chords.length) summary.push(describeSounds(output))
  head.append(h("span", "cnb-settings", summary.join(" · ")))
  box.append(head)

  // Holds the status line until the audio is ready, then the player.
  const slot = h("div", "cnb-slot")
  const status = h("div", "cnb-status", "Rendering audio…")
  slot.append(status)
  box.append(slot)

  const { grid, setTime } = renderDrumGrid(output.blocks)
  if (grid.childElementCount) box.append(grid)

  const firstTime = output.chords.filter((e) => !e.repeat)
  if (firstTime.length) {
    const chips = h("div", "cnb-chords")
    for (const ev of firstTime) {
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
    box.append(chips)
  }

  let disposePlayer = null
  let disposed = false
  queueRender(output)
    .then((buffer) => {
      if (disposed) return
      disposePlayer = renderPlayer(slot, buffer, filename, setTime)
      for (const msg of output.warnings || []) messages.add(msg)
    })
    .catch((err) => {
      if (disposed) return
      status.textContent = `Couldn't render audio: ${err?.message || err}`
      status.classList.add("cnb-status-error")
    })

  return {
    box,
    dispose() {
      disposed = true
      disposePlayer?.()
    },
  }
}

function renderCell(el, model) {
  const name = model.get("name")
  const after = model.get("after")
  const parsed = parseChain(model.get("sources"))

  const root = h("div", "cnb")
  if (name || after || parsed.fromAbove.length) {
    const head = h("div", "cnb-head")
    if (name) head.append(h("span", "cnb-name", name))
    if (after) head.append(h("span", "cnb-after", `after ${after}`))
    if (parsed.fromAbove.length)
      head.append(h("span", "cnb-settings", `from ${after}: ${parsed.fromAbove.join(", ")}`))
    root.append(head)
  }

  // Errors first come from parsing; drum-sample warnings arrive once audio renders.
  const errors = h("div", "cnb-errors")
  const shown = []
  const messages = {
    add(msg) {
      if (shown.some((m) => m.msg === msg)) return
      shown.push({ msg })
      draw()
    },
  }
  const draw = () => {
    errors.replaceChildren()
    for (const m of shown) {
      const row = h("div", "cnb-error")
      if (m.line) row.append(h("span", "cnb-error-line", `line ${m.line}`))
      row.append(h("span", "cnb-error-msg", m.msg))
      errors.append(row)
    }
    if (shown.length && !errors.isConnected) root.append(errors)
  }

  const outputs = parsed.outputs.map((o, i) =>
    renderOutput(
      o,
      `${name || "composer-nb"}${parsed.outputs.length > 1 ? "-" + (i + 1) : ""}.wav`,
      messages,
    ),
  )
  for (const o of outputs) root.append(o.box)
  if (!outputs.length && !parsed.errors.length) {
    const defined = Object.keys(parsed.state.sections)
    root.append(
      h(
        "div",
        "cnb-status",
        defined.length
          ? `Defined ${defined.join(", ")}. Hear it with play ${defined[0]}`
          : "Nothing played yet. Add play to hear it.",
      ),
    )
  }
  shown.push(...parsed.errors)
  draw()

  el.replaceChildren(root)
  return () => outputs.forEach((o) => o.dispose())
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
