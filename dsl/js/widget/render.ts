/* The player: parses a chain of cell sources, renders the last one to audio, and shows
   a player, what each block plays, a drum grid, chord chips and parse errors. Shared by
   the Jupyter widget (index.ts) and the JavaScript library (../music.ts). */
import {
  parseChain,
  renderToBuffer,
  drawWaveform,
  bufferDuration,
  bufferToWav,
} from "../music-engine.ts"
import { TPQ, type GridBlock, type Output } from "../language.ts"
import { gridCounts, gridRows } from "../grid.ts"
import { sheetAbc } from "../sheet.ts"
import abcjs, { type NoteTimingEvent, type TuneObject } from "abcjs"
import type { ToneAudioBuffer } from "tone"

// Moves a view's playhead to `t` seconds, or takes it off when the audio isn't `active`
type Follow = (t: number, active: boolean) => void
// Where messages go to be shown once each, under the outputs
type Messages = { add(msg: string): void }
// abcjs gives a tune its timings once it's timed
type TimedTune = TuneObject & { noteTimings: NoteTimingEvent[] }

// Tone.Offline swaps Tone's global context while it renders, so two cells
// rendering at once (Run All) would trample each other. Render one at a time, and skip
// any whose output has gone by the time its turn comes.
let renderQueue: Promise<unknown> = Promise.resolve()
function queueRender(parsed: Output, gone: () => boolean): Promise<ToneAudioBuffer | null> {
  const job = renderQueue.then(() => (gone() ? null : renderToBuffer(parsed)))
  renderQueue = job.catch(() => {})
  return job
}

// Only one cell plays at a time, like the playground.
let nowPlaying: HTMLAudioElement | null = null

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string | null,
  text?: string | null,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

function formatTime(sec: number): string {
  if (!sec || sec < 0) return "0:00"
  return Math.floor(sec / 60) + ":" + String(Math.floor(sec % 60)).padStart(2, "0")
}

function describeBlock(b: GridBlock): string {
  const bars = `${b.bars} bar${b.bars === 1 ? "" : "s"}${b.times > 1 ? ` × ${b.times}` : ""}`
  return `time ${b.time} · tempo ${b.tempo}${b.swing ? " · swing" : ""} · key ${b.key} ${b.mode} · ${bars}`
}

// The pitched instruments that play, e.g. "guitar, transpose 2 · bass".
function describeSounds(output: Output): string {
  const seen = new Map<string, number | undefined>()
  for (const e of output.events) seen.set(e.instrument, e.transpose || seen.get(e.instrument))
  return [...seen].map(([inst, t]) => (t ? `${inst}, transpose ${t}` : inst)).join(" · ")
}

// --- Grid: each block's drums and notes drawn once, bar by bar, counted 1 e & a ---

function renderDrumGrid(blocks: GridBlock[]): { grid: HTMLElement; setTime: Follow } {
  const grid = h("div", "cnb-grid")
  blocks.forEach((block, bi) => {
    if (!block.drumEvents.length && !block.noteEvents.length) return
    const { per, rows } = gridRows(block)
    // Wide enough for the longest line name, e.g. guitar.electric
    const labels = Math.max(...rows.map((r) => r.label.length), 5) + 1
    // How the cells are counted, and which groups of beats are shaded
    const counts = gridCounts(block)
    const shaded = (col: number) => counts[col].shaded

    if (blocks.length > 1) grid.append(h("div", "cnb-grid-head", describeBlock(block)))
    for (let bar = 0; bar < block.bars; bar++) {
      const row = h("div", "cnb-bar")
      row.style.gridTemplateColumns = `${labels}ch repeat(${per}, minmax(0, 1fr))`
      for (const { label, cells } of rows) {
        row.append(h("div", "cnb-lane", label))
        for (let col = 0; col < per; col++) {
          const e = cells.get(bar * per + col)
          let cls = "cnb-cell" + (shaded(col) ? " cnb-alt" : "") + (e?.note ? " cnb-note" : "")
          if (e?.hit)
            cls += " cnb-hit" + (e.accent ? " cnb-acc" : "") + (e.ghost ? " cnb-ghost" : "")
          else if (e?.held) cls += " cnb-held"
          const cell = h("div", cls, e?.text)
          cell.dataset.k = `${bi}-${bar}-${col}`
          row.append(cell)
        }
      }
      row.append(h("div", "cnb-lane cnb-bar-num", block.bars > 1 ? `bar ${bar + 1}` : ""))
      counts.forEach((c, col) => {
        const count = h("div", "cnb-count" + (c.beat ? " cnb-count-beat" : ""), c.label === "." ? "·" : c.label)
        count.dataset.k = `${bi}-${bar}-${col}`
        row.append(count)
      })
      grid.append(row)
    }
  })

  // Marks the step playing at `t` seconds. A block that plays more than once is drawn
  // once, so the playhead goes round it again each time.
  let lastKey: string | null = null
  const setTime: Follow = (t, active) => {
    let key: string | null = null
    if (active) {
      const bi = blocks.findIndex((b) => b.plays.some((at) => t >= at && t < at + b.durSec))
      if (bi >= 0) {
        const b = blocks[bi]
        const at = b.plays.find((s) => t >= s && t < s + b.durSec)!
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

// --- Sheet: the same blocks as sheet music, drawn by abcjs, with a playhead ---

function renderSheet(blocks: GridBlock[]): { sheet: HTMLElement; setTime: Follow } {
  const sheet = h("div", "cnb-sheet")
  const timings = new Map<number, NoteTimingEvent[]>() // block index → when each note sounds
  blocks.forEach((block, bi) => {
    const { abc, tablature } = sheetAbc(block)
    if (!abc) return
    if (blocks.length > 1) sheet.append(h("div", "cnb-grid-head", describeBlock(block)))
    const staff = h("div", "cnb-staff")
    sheet.append(staff)
    // Drawn once the sheet is on the page, so the staff can take its width
    const draw = () => {
      const [tune] = abcjs.renderAbc(staff, abc, {
        responsive: "resize",
        staffwidth: Math.max(staff.clientWidth, 320) - 20,
        // Room for what hangs below the last staff and past the last bar line
        paddingtop: 8,
        paddingbottom: 36,
        paddingleft: 4,
        paddingright: 16,
        foregroundColor: "currentColor",
        format: { tablabelfont: "Helvetica 11" },
        ...(tablature.some((t) => t.instrument) && { tablature }),
      })
      tune.setTiming(0, 0)
      timings.set(
        bi,
        (tune as TimedTune).noteTimings.filter((t) => t.type === "event"),
      )
    }
    if (staff.isConnected) draw()
    else {
      const watch = new ResizeObserver(() => {
        if (!staff.clientWidth) return
        watch.disconnect()
        draw()
      })
      watch.observe(staff)
    }
  })

  let last: NoteTimingEvent | null = null
  const setTime: Follow = (t, active) => {
    let now: NoteTimingEvent | null = null
    if (active) {
      const bi = blocks.findIndex((b) => b.plays.some((at) => t >= at && t < at + b.durSec))
      if (bi >= 0) {
        const at = blocks[bi].plays.find((s) => t >= s && t < s + blocks[bi].durSec)!
        const ms = (t - at) * 1000
        for (const ev of timings.get(bi) || []) if (ev.milliseconds <= ms + 1) now = ev
      }
    }
    if (now === last) return
    sheet.querySelectorAll(".cnb-now").forEach((el) => el.classList.remove("cnb-now"))
    for (const group of now?.elements || []) for (const el of group) el.classList.add("cnb-now")
    last = now
  }
  return { sheet, setTime }
}

// How the hits are drawn, for every cell on the page: bricks, or sheet music
let view: "bricks" | "sheet" = "bricks"
const views = new Set<() => void>() // each output's switch, so they change together

// --- Player --------------------------------------------------------------------

// With `autoplay`, it starts playing as soon as it's drawn, as after a cell's Play button.
function renderPlayer(
  slot: HTMLElement,
  buffer: ToneAudioBuffer,
  onTime: Follow,
  autoplay: boolean,
): () => void {
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
  row.append(play, wave, time)
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
  const setPlaying = (playing: boolean) => {
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
  if (autoplay) audio.play().catch((err) => console.warn("composer-nb: playback failed", err))

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
function renderOutput(
  output: Output,
  messages: Messages,
  autoplay: boolean,
): { box: HTMLElement; dispose(): void } {
  const box = h("div", "cnb-output")
  const head = h("div", "cnb-output-head")
  head.append(h("span", "cnb-play-line", output.label))
  const summary = output.blocks.map(describeBlock)
  if (output.events.length) summary.push(describeSounds(output))
  head.append(h("span", "cnb-settings", summary.join(" · ")))
  box.append(head)

  // Holds the status line until the audio is ready, then the player.
  const slot = h("div", "cnb-slot")
  const status = h("div", "cnb-status", "Rendering audio…")
  slot.append(status)
  box.append(slot)

  // The hits, as bricks or as sheet music, with a switch when there's anything to draw
  const { grid, setTime: gridTime } = renderDrumGrid(output.blocks)
  let sheetView: ReturnType<typeof renderSheet> | null = null
  const drawn = h("div", "cnb-drawn")
  const setTime: Follow = (t, active) => {
    const follow = view === "sheet" && sheetView ? sheetView.setTime : gridTime
    follow(t, active)
  }
  if (grid.childElementCount) {
    const toggle = h("div", "cnb-view")
    const buttons: Record<string, HTMLButtonElement> = {}
    for (const v of ["bricks", "sheet"] as const) {
      const b = h("button", "cnb-view-btn", v)
      b.type = "button"
      b.addEventListener("click", () => {
        view = v
        for (const show of views) show()
      })
      buttons[v] = b
      toggle.append(b)
    }
    const show = () => {
      for (const [v, b] of Object.entries(buttons)) b.classList.toggle("cnb-view-on", view === v)
      if (view === "sheet" && !sheetView) sheetView = renderSheet(output.blocks)
      drawn.replaceChildren(view === "sheet" ? sheetView!.sheet : grid)
    }
    views.add(show)
    show()
    box.append(toggle, drawn)
  }

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

  let disposePlayer: (() => void) | null = null
  let disposed = false
  queueRender(output, () => disposed)
    .then((buffer) => {
      if (disposed || !buffer) return
      disposePlayer = renderPlayer(slot, buffer, setTime, autoplay)
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
      for (const show of views) if (!box.isConnected) views.delete(show)
    },
  }
}

// Draws the last of `sources` into `el`, starting from what the earlier ones left.
// `name` and `after` (the name of the song it continues from) are only shown, and `play`
// starts the first output once its audio is ready. Returns a function that stops the audio
// and frees it.
export function renderCell(
  el: HTMLElement,
  {
    sources,
    name,
    after,
    play = false,
  }: { sources: string[]; name?: string; after?: string; play?: boolean },
): () => void {
  const parsed = parseChain(sources)

  const root = h("div", "cnb")
  if (name || after || parsed.fromAbove.length) {
    const head = h("div", "cnb-head")
    if (name) head.append(h("span", "cnb-name", name))
    if (after) head.append(h("span", "cnb-after", `after ${after}`))
    if (parsed.fromAbove.length)
      head.append(
        h(
          "span",
          "cnb-settings",
          `${after ? `from ${after}` : "inherited"}: ${parsed.fromAbove.join(", ")}`,
        ),
      )
    root.append(head)
  }

  // Errors first come from parsing; drum-sample warnings arrive once audio renders.
  const errors = h("div", "cnb-errors")
  const shown: { line?: number; msg: string }[] = []
  const messages: Messages = {
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

  const outputs = parsed.outputs.map((o, i) => renderOutput(o, messages, play && i === 0))
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
