/* A play's output as sheet music: one block of the grid as ABC notation, for a renderer
   such as abcjs to draw. The drums are a percussion staff with the hands in one voice and
   the feet in another; each pitched instrument's line is a staff of its own, and a guitar's
   comes with a tab staff. Pure, like grid.js. */
import { TPQ } from "./language.js"

// Where each kit piece sits on the staff (its ABC pitch), its notehead, and whether a foot
// plays it. The hands are one voice with stems up, the feet another with stems down.
const STAFF = {
  crash: { pitch: "a", head: "x" },
  ride: { pitch: "f", head: "x" },
  "ride.bell": { pitch: "f", head: "harmonic" },
  hat: { pitch: "g", head: "x" },
  "hat.open": { pitch: "g", head: "x", open: true },
  "hat.pedal": { pitch: "D", head: "x", foot: true },
  "tom.high": { pitch: "e" },
  "tom.low": { pitch: "d" },
  snare: { pitch: "c" },
  "snare.ghost": { pitch: "c" },
  "snare.rim": { pitch: "c", head: "triangle" },
  "snare.cross": { pitch: "c", head: "x" },
  "tom.floor": { pitch: "A" },
  kick: { pitch: "F", foot: true },
}
// Low to high, so a chord's notes come out in staff order.
const ORDER = "DFAcdefga"

// How long a slot is, in ticks, from the coarsest down: a quarter, eighth, sixteenth and
// thirty-second, then the same as triplets.
const SLOTS = [96, 48, 24, 12, 32, 16, 8]
const TRIPLET = (s) => s % 3 !== 0
// Lengths a note can have, in slots: plain and dotted values. A rest is only ever plain.
const LENGTHS = [16, 12, 8, 6, 4, 3, 2, 1]
const PLAIN = LENGTHS.filter((d) => d % 3 !== 0)

// A length in sixteenths, as ABC writes it after a note: 1 is nothing, 2 is "2", 0.5 is "/".
const dur = (u) => (u === 1 ? "" : Number.isInteger(u) ? String(u) : u === 0.5 ? "/" : `${u * 2}/2`)

// The beam groups of a bar, in ticks: the groups of an added-up meter, else each beat.
function beamGroups(block) {
  if (block.groups.length > 1) return block.groups.map((g) => (g * 4 * TPQ) / block.unit)
  const out = []
  for (let left = block.barTicks; left > 0; left -= TPQ) out.push(Math.min(TPQ, left))
  return out
}

// A ghost note is written in parentheses: text to the left and right of it
const GHOST = '"<("">)"'

// One drum note or chord: the hits at one moment, `u` sixteenths long. A double stroke is
// the note with a slash through its stem.
function drumNote(hits, u) {
  const byPitch = new Map()
  for (const h of hits) {
    const at = STAFF[h.lane]
    const had = byPitch.get(at.pitch)
    if (!had || h.vel > had.vel) byPitch.set(at.pitch, { ...h, at })
  }
  const notes = [...byPitch.values()].sort((a, b) => ORDER.indexOf(a.at.pitch) - ORDER.indexOf(b.at.pitch))
  let deco = ""
  if (notes.some((n) => n.accent)) deco += "!>!"
  if (notes.some((n) => n.at.open)) deco += "!open!"
  if (notes.some((n) => n.span)) deco += "!/!"
  if (notes.every((n) => n.ghost)) deco += GHOST
  const heads = notes.map((n) => (n.at.head ? `!style=${n.at.head}!` : "") + n.at.pitch)
  return deco + (heads.length === 1 ? heads[0] : `[${heads.join("")}]`) + dur(u)
}

// A pitch as ABC writes it: C is middle C, c the octave above, C, the octave below, with
// the accidental when the bar hasn't had it yet. `acc` is the bar's accidentals so far.
const SHARPS = ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"]
function abcPitch(midi, acc) {
  const octave = Math.floor(midi / 12) - 1
  const name = SHARPS[midi % 12]
  const sharp = name[0] === "^"
  const letter = sharp ? name[1] : name
  const key = letter + octave
  let mark = ""
  if (sharp && acc.get(key) !== "^") {
    mark = "^"
    acc.set(key, "^")
  } else if (!sharp && acc.get(key) === "^") {
    mark = "="
    acc.set(key, "")
  }
  const at = octave >= 5 ? letter.toLowerCase() + "'".repeat(octave - 5) : letter + ",".repeat(Math.max(0, 4 - octave))
  return mark + at
}

// One note or chord of a pitched line, `u` sixteenths long, tied on when `tie`. A chord
// chart's symbol goes above its first note.
function pitchedNote(hits, u, tie, acc, cont) {
  const notes = [...new Map(hits.map((h) => [h.midi, h])).values()].sort((a, b) => a.midi - b.midi)
  let deco = ""
  if (!cont) {
    if (notes.some((n) => n.accent)) deco += "!>!"
    if (notes.every((n) => n.ghost)) deco += GHOST
    const symbol = notes.find((n) => n.symbol)?.symbol
    if (symbol) deco += `"${symbol}"`
  }
  const heads = notes.map((n) => abcPitch(n.midi, acc))
  return deco + (heads.length === 1 ? heads[0] : `[${heads.join("")}]`) + dur(u) + (tie ? "-" : "")
}

// The longest of `lengths` that fits from slot `i` with `n` slots free: a plain length
// starts on a multiple of itself, and a dotted one where its longer half would.
function longest(lengths, i, n) {
  for (const d of lengths) {
    const on = d % 3 === 0 ? (2 * d) / 3 : d
    if (d <= n && i % on === 0) return d
  }
  return 1
}

// The ABC for one voice's hits in one beam group, as pieces ({ s, tick, cont }): `hits`
// maps a tick from the group's start to the hits there, over `ticks` ticks. A hit's `span`
// is how long it lasts: a double stroke's, or a note's, which is written as long as it
// sounds and tied on past the group; a hit marked `cont` came in tied from the group
// before. `mk(hits, u, tie, cont)` writes one note or chord.
function group(hits, ticks, mk) {
  if (!hits.size) return [{ s: "z" + dur(ticks / 24) }]
  // Every hit, and the end of every span inside the group, has to land on the slot
  const ends = [...hits].flatMap(([t, h]) => h.filter((x) => x.span).map((x) => Math.min(t + x.span, ticks)))
  let slot = SLOTS.find(
    (s) => ticks % s === 0 && [...hits.keys()].every((t) => t % s === 0) && ends.every((x) => x % s === 0),
  )
  if (!slot) {
    // Nothing fits as written, so the hits are moved to the nearest thirty-second
    slot = 12
    const moved = new Map()
    for (const [t, h] of hits) {
      const at = Math.min(Math.round(t / slot) * slot, ticks - slot)
      moved.set(at, [...(moved.get(at) || []), ...h.map((x) => (x.span ? { ...x, span: Math.max(slot, Math.round(x.span / slot) * slot) } : x))])
    }
    hits = moved
  }
  const n = ticks / slot
  const at = (i) => hits.get(i * slot) || []
  const spanOf = (h) => Math.max(0, ...h.map((x) => x.span || 0))
  const out = []
  if (TRIPLET(slot)) {
    // Triplets, three slots at a time: three notes in the time of two, unless all rest.
    // A note longer than a slot carries on as tied notes.
    const nominal = (1.5 * slot) / 24 // what each one is written as, in sixteenths
    let carry = null // { hits, left }
    for (let i = 0; i < n; i += 3) {
      const three = [0, 1, 2].map((k) => at(i + k))
      if (!carry && three.every((h) => !h.length)) {
        out.push({ s: "z" + dur((3 * slot) / 24) })
        continue
      }
      let s = "(3:2:3"
      for (let k = 0; k < 3; k++) {
        const h = three[k]
        if (h.length) {
          const cont = h.every((x) => x.cont)
          const past = spanOf(h) / slot > n - i - k
          const left = Math.min(Math.round(spanOf(h) / slot), n - i - k) - 1
          carry = left > 0 ? { hits: h, left } : null
          s += mk(h, nominal, left > 0 || (past && !left), cont)
          out.push({ s, tick: (i + k) * slot, cont })
        } else if (carry) {
          carry.left--
          s += mk(carry.hits, nominal, carry.left > 0, true)
          out.push({ s, tick: (i + k) * slot, cont: true })
          if (!carry.left) carry = null
        } else {
          s += "z" + dur(nominal)
          out.push({ s })
        }
        s = ""
      }
    }
    return out
  }
  for (let i = 0; i < n; ) {
    let free = 1 // this slot, and the empty ones after it
    while (i + free < n && !at(i + free).length) free++
    const here = at(i)
    if (!here.length) {
      const d = longest(PLAIN, i, free)
      out.push({ s: "z" + dur((d * slot) / 24) })
      i += d
      continue
    }
    const span = spanOf(here)
    // A hit without a span lasts until the next; one with a span, that long, tied on
    // past the group, and split into lengths that can be written
    let left = span ? Math.min(Math.round(span / slot), n - i) : longest(LENGTHS, i, free)
    const past = span && span / slot > n - i
    let cont = here.every((x) => x.cont)
    while (left > 0) {
      const d = longest(LENGTHS, i, left)
      const tie = left - d > 0 || (past && left - d === 0)
      out.push({ s: mk(here, (d * slot) / 24, tie, cont), tick: i * slot, cont })
      i += d
      left -= d
      cont = true
    }
  }
  return out
}

// What runs on past a group of `ticks` ticks: the hits still sounding at its end, with
// how long they have left, as the hits at the start of the next group.
function carried(hits, ticks) {
  for (const [t, h] of hits) {
    const left = Math.max(0, ...h.map((x) => x.span || 0)) + t - ticks
    if (left > 0) return h.map((x) => ({ ...x, span: left, cont: true }))
  }
  return null
}

// What a note is counted as, by where it falls in the beat: 1 e & a, and 1 & a for triplets.
function countOf(tick) {
  const beat = Math.floor(tick / TPQ) + 1
  const pos = tick % TPQ
  return { 0: String(beat), 24: "e", 48: "&", 72: "a", 32: "&", 64: "a" }[pos] || "*"
}

// A chord's note name, as the engine spells it (C#3), as a midi number.
const BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
function midiOf(name) {
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(name)
  if (!m) return null
  return 12 * (Number(m[3]) + 1) + BASE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0)
}

// A pitched instrument's clef, and how far above its sound it's written: guitars and basses
// an octave up, as their parts are, the rest where their notes sit.
function clefFor(inst, midis) {
  const kind = inst.split(".")[0]
  if (kind === "guitar") return { clef: "treble-8", shift: 12, tab: true }
  if (kind === "bass") return { clef: "bass", shift: 12 }
  const sorted = [...midis].sort((a, b) => a - b)
  const mid = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 60
  return { clef: mid < 55 ? "bass" : "treble", shift: 0 }
}

// `block` is one of a parsed output's `blocks`. Returns its ABC and, for abcjs, which
// voices get a tab staff: { abc, tablature }. `abc` is "" when nothing plays. With
// `counts`, the hands' notes are counted 1 e & a under the staff.
export function sheetAbc(block, { counts = false } = {}) {
  const voices = []
  const add = (v) => (v.hits.size ? voices.push(v) : null)
  const put = (map, tick, hit) => map.set(tick, [...(map.get(tick) || []), hit])

  // Drums. A double stroke is two events, the second hidden: the first is drawn, for as
  // long as the two of them last.
  const spans = new Map()
  for (const e of block.drumEvents) {
    if (!e.hidden) continue
    const gap = e.gap ?? Math.round(e.gapSec / block.secPerTick)
    spans.set(`${e.lane}@${e.tick - gap}`, 2 * gap)
  }
  const hands = new Map()
  const feet = new Map()
  for (const e of block.drumEvents) {
    const at = STAFF[e.lane]
    if (!at || e.hidden) continue
    const span = spans.get(`${e.lane}@${e.tick}`)
    put(at.foot ? feet : hands, e.tick, span ? { ...e, span } : e)
  }
  add({ id: "H", kind: "drum", clef: "perc", stem: "up", name: "drums", hits: hands, counts })
  add({ id: "F", kind: "drum", clef: "perc", stem: "down", hits: feet })

  // Pitched lines: a voice per instrument and layer, then a voice per chord chart
  const pitched = new Map()
  for (const e of block.noteEvents) {
    const key = `${e.instrument}#${e.voice}`
    if (!pitched.has(key)) pitched.set(key, { inst: e.instrument, hits: new Map() })
    put(pitched.get(key).hits, e.tick, { span: e.ticks, midi: e.note.midi, accent: e.accent, ghost: e.ghost })
  }
  for (const e of block.chordEvents || []) {
    const key = `${e.instrument}#chords`
    if (!pitched.has(key)) pitched.set(key, { inst: e.instrument, hits: new Map() })
    e.chord.noteNames.forEach((name, i) => {
      const midi = midiOf(name)
      if (midi != null) put(pitched.get(key).hits, e.tick, { span: e.ticks, midi, symbol: i === 0 ? e.chord.label : null })
    })
  }
  let p = 0
  for (const [, v] of pitched) {
    const midis = [...v.hits.values()].flat().map((h) => h.midi)
    const { clef, shift, tab } = clefFor(v.inst, midis)
    for (const hs of v.hits.values()) for (const h of hs) h.midi += shift
    add({ id: `P${++p}`, kind: "pitched", clef, name: v.inst, tab: !!tab, hits: v.hits })
  }
  if (!voices.length) return { abc: "", tablature: [] }

  const groups = beamGroups(block)
  const lines = []
  for (const v of voices) {
    const bars = []
    const said = []
    let carry = null // what the group before left sounding
    for (let bar = 0; bar < block.bars; bar++) {
      let start = bar * block.barTicks
      const acc = new Map() // the bar's accidentals so far
      const mk =
        v.kind === "drum" ? (h, u) => drumNote(h, u) : (h, u, tie, cont) => pitchedNote(h, u, tie, acc, cont)
      const out = []
      const syllables = []
      for (const ticks of groups) {
        const inside = new Map()
        if (carry) inside.set(0, carry)
        for (const [t, h] of v.hits) if (t >= start && t < start + ticks) inside.set(t - start, h)
        carry = carried(inside, ticks)
        const pieces = group(inside, ticks, mk)
        out.push(pieces.map((x) => x.s).join(""))
        for (const x of pieces) {
          if (x.tick == null) continue
          syllables.push(x.cont ? "*" : countOf(start - bar * block.barTicks + x.tick))
        }
        start += ticks
      }
      bars.push(out.join(" "))
      said.push(syllables.join(" "))
    }
    lines.push(`[V:${v.id}] ${bars.join(" | ")} |`)
    if (v.counts) lines.push(`w: ${said.join(" | ")} |`)
  }

  const count = block.groups.reduce((a, b) => a + b, 0)
  const drums = voices.filter((v) => v.kind === "drum").map((v) => v.id)
  const score = [
    ...(drums.length > 1 ? [`(${drums.join(" ")})`] : drums),
    ...voices.filter((v) => v.kind !== "drum").map((v) => v.id),
  ]
  const abc = [
    "X:1",
    "L:1/16",
    `M:${count}/${block.unit}`,
    `Q:1/4=${block.tempo}`,
    "K:C",
    `%%score ${score.join(" ")}`,
    ...voices.map(
      (v) =>
        `V:${v.id} clef=${v.clef}` + (v.stem ? ` stem=${v.stem}` : "") + (v.name ? ` name="${v.name}"` : ""),
    ),
    ...lines,
  ].join("\n")
  const tablature = voices.map((v) => (v.tab ? { instrument: "guitar", label: v.name } : { instrument: "" }))
  return { abc, tablature }
}
