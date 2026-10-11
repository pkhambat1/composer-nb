/* A cell for an assistant: parse it, and say what came of it in text a model can read and
   act on: the errors with their lines, the settings and names in effect, and for each play
   a grid of every hit and note, bar by bar, which is the playground's grid as text. Pure. */
import { countingOf, gridCounts, gridRows } from "composer-nb/grid"
import { initialState, parseCell, timeLabel } from "composer-nb/language"

// Parses `source` after `after`, the earlier cells it continues from. Returns the cell's
// parse and the earlier cells', so their mistakes can be reported too.
export function parse(source, after) {
  let state = initialState()
  const earlier = after ? parseCell(after, state) : null
  if (earlier) state = earlier.state
  return { parsed: parseCell(source || "", state), earlier }
}

const MAX_BARS_SHOWN = 16
const LEGEND =
  "x hit · ^ accent · ~ ghost · d double · - nothing. On an instrument's row: the note where it starts, - while it sounds, . silence"

export function settingsOf(state) {
  const out = {
    time: timeLabel(state),
    tempo: state.tempo,
    swing: state.swing,
    key: state.key,
    capo: state.capo,
    octave: state.octave,
    kit: state.kit,
  }
  for (const [inst, sound] of Object.entries(state.sounds || {})) out[inst] = sound
  return out
}

export function namesOf(state) {
  return [
    ...Object.entries(state.words).map(([name, w]) => ({ type: w.type, name, line: w.line })),
    ...Object.entries(state.sections).map(([name, s]) => ({ type: "pattern", name, line: s.ln })),
  ].sort((a, b) => (a.line ?? 0) - (b.line ?? 0))
}

// The kit pieces and instruments that play in an output, in the order the grid draws them.
export function playersOf(output) {
  const drums = new Set()
  for (const e of output.drumEvents) if (!e.hidden && e.lane !== "sticking") drums.add(e.lane)
  const pitched = new Set()
  for (const e of output.events) if (e.note || e.chord) pitched.add(e.instrument)
  return [...pitched, ...drums]
}

const pad = (s, n) => String(s).padEnd(n)

// One block of a play as rows of text: a count row, then a row per kit piece and
// instrument, a cell a step, bar by bar.
export function gridText(block, maxBars = MAX_BARS_SHOWN) {
  const { per, rows } = gridRows(block)
  if (!rows.length) return []
  const cellText = (e, pitched) => {
    if (!e) return pitched ? "." : "-"
    if (e.sticking) return e.text
    if (e.hit) {
      if (e.note) return (e.accent ? "^" : e.ghost ? "~" : "") + e.text
      return e.double ? "d" : e.ghost ? "~" : e.accent ? "^" : "x"
    }
    return "-"
  }
  const texts = rows.map((r) => {
    const pitched = r.key.includes(" ")
    return { label: r.label, cells: Array.from({ length: per * block.bars }, (_, i) => cellText(r.cells.get(i), pitched)) }
  })
  const width = Math.max(1, ...texts.flatMap((r) => r.cells.map((c) => c.length)))
  const labels = Math.max(5, ...rows.map((r) => r.label.length))
  const out = []
  const bars = Math.min(block.bars, maxBars)
  const counts = gridCounts(block).map((c) => c.label)
  for (let bar = 0; bar < bars; bar++) {
    out.push(pad(`bar ${bar + 1}`, labels) + " " + counts.map((c) => pad(c, width)).join(" "))
    for (const r of texts) {
      const cells = r.cells.slice(bar * per, (bar + 1) * per)
      out.push(pad(r.label, labels) + " " + cells.map((c) => pad(c, width)).join(" "))
    }
    if (bar < bars - 1) out.push("")
  }
  if (block.bars > bars) out.push(`… and ${block.bars - bars} more bars`)
  return out
}

// The chords a block plays, by bar: "bar 1: Am (A C E) · F (F A C)". A chord's notes are
// named the first time it plays.
export function chordsText(block) {
  const byBar = new Map()
  const named = new Set()
  for (const e of block.chordEvents || []) {
    const bar = Math.floor(e.tick / block.barTicks) + 1
    let label = e.chord.label
    if (!named.has(label)) {
      named.add(label)
      label += ` (${e.chord.noteNames.map((n) => n.replace(/-?\d+$/, "")).join(" ")})`
    }
    byBar.set(bar, [...(byBar.get(bar) || []), label])
  }
  return [...byBar].map(([bar, chords]) => `bar ${bar}: ${chords.join(" · ")}`)
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`
const secs = (s) => `${Math.round(s * 10) / 10} s`

function blockHead(b) {
  return `time ${b.time} · tempo ${b.tempo} · ${plural(b.bars, "bar")} · counting ${countingOf(b)}`
}

// What came of parsing `source`: a report in text, for the assistant to read.
export function describe(parsed, earlier, source = "") {
  const lines = String(source).split("\n")
  const out = []
  const say = (errors, where) => {
    for (const e of errors) {
      const text = lines[e.line - 1]?.trim()
      out.push(`  line ${e.line}${where}: ${e.msg}` + (text ? `\n      ${text}` : ""))
    }
  }
  if (earlier?.errors.length) {
    out.push(`The earlier cells (after) have ${plural(earlier.errors.length, "error")}:`)
    for (const e of earlier.errors) out.push(`  line ${e.line} of after: ${e.msg}`)
    out.push("")
  }
  if (parsed.errors.length) {
    out.push(`${plural(parsed.errors.length, "error")}. A cell with errors plays nothing; fix them and parse again:`)
    say(parsed.errors, "")
  } else out.push("No errors.")
  const settings = settingsOf(parsed.state)
  out.push(
    "Settings at the end: " +
      Object.entries(settings)
        .map(([k, v]) => `${k} ${v}`)
        .join(" · "),
  )
  const names = namesOf(parsed.state)
  if (names.length) out.push("Names: " + names.map((n) => `${n.type} ${n.name}`).join(", "))
  if (parsed.fromAbove.length) out.push("From the earlier cells: " + parsed.fromAbove.join(", "))
  if (parsed.errors.length) return out.join("\n")
  if (!parsed.outputs.length) {
    out.push(
      "Nothing plays: there is no play line. The settings and names carry on to the cells after this one. To hear something, add a play, such as play groove.",
    )
    return out.join("\n")
  }
  parsed.outputs.forEach((o, i) => {
    out.push("")
    const bars = o.blocks.reduce((a, b) => a + b.bars, 0)
    const who = playersOf(o)
    out.push(
      `Play ${i + 1} (line ${o.line}): ${o.label} · ${plural(bars, "bar")} · ${secs(o.durSec)}` +
        (who.length ? ` · ${who.join(", ")}` : ""),
    )
    if (i === 0) out.push(`  ${LEGEND}`)
    for (const b of o.blocks) {
      if (o.blocks.length > 1) out.push(`  ${blockHead(b)}`)
      else out.push(`  ${blockHead(b)}`)
      for (const l of gridText(b)) out.push(l ? `  ${l}` : "")
      for (const l of chordsText(b)) out.push(`  chords ${l}`)
    }
  })
  return out.join("\n")
}
