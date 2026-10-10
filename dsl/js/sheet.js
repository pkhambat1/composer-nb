/* A play's output as drum sheet music: one block of the grid as ABC notation, for a
   renderer such as abcjs to draw as a percussion staff. Pure, like grid.js. */
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

// One note or chord: the hits at one moment, `u` sixteenths long. A double stroke is the
// note with a slash through its stem.
function note(hits, u) {
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
  // A ghost note is written in parentheses: text to the left and right of it
  if (notes.every((n) => n.ghost)) deco += '"<("">)"'
  const heads = notes.map((n) => (n.at.head ? `!style=${n.at.head}!` : "") + n.at.pitch)
  return deco + (heads.length === 1 ? heads[0] : `[${heads.join("")}]`) + dur(u)
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

// The ABC for one voice's hits in one beam group: `hits` maps a tick from the group's
// start to the hits there, over `ticks` ticks. A double stroke's `span` is how long it is,
// which is how long its note is written.
function group(hits, ticks) {
  if (!hits.size) return "z" + dur(ticks / 24) // one rest for the whole group
  const spans = [...hits.values()].flatMap((h) => h.filter((x) => x.span).map((x) => x.span))
  let slot = SLOTS.find(
    (s) => ticks % s === 0 && [...hits.keys()].every((t) => t % s === 0) && spans.every((x) => x % s === 0),
  )
  if (!slot) {
    // Nothing fits as written, so the hits are moved to the nearest thirty-second
    slot = 12
    const moved = new Map()
    for (const [t, h] of hits) {
      const at = Math.min(Math.round(t / slot) * slot, ticks - slot)
      moved.set(at, [...(moved.get(at) || []), ...h])
    }
    hits = moved
  }
  const n = ticks / slot
  const at = (i) => hits.get(i * slot) || []
  if (TRIPLET(slot)) {
    // Triplets, three slots at a time: three notes in the time of two, unless all rest
    const nominal = (1.5 * slot) / 24 // what each one is written as, in sixteenths
    let out = ""
    for (let i = 0; i < n; i += 3) {
      const three = [at(i), at(i + 1), at(i + 2)]
      if (three.every((h) => !h.length)) out += "z" + dur((3 * slot) / 24)
      else out += "(3:2:3" + three.map((h) => (h.length ? note(h, nominal) : "z" + dur(nominal))).join("")
    }
    return out
  }
  let out = ""
  for (let i = 0; i < n; ) {
    let free = 1 // this slot, and the empty ones after it
    while (i + free < n && !at(i + free).length) free++
    const hit = at(i).length > 0
    const span = at(i).find((x) => x.span)?.span
    const d = span ? span / slot : longest(hit ? LENGTHS : PLAIN, i, free)
    const u = (d * slot) / 24
    out += hit ? note(at(i), u) : "z" + dur(u)
    i += d
  }
  return out
}

// `block` is one of a parsed output's `blocks`. Returns its drums as ABC: a percussion
// staff with the hands in one voice and the feet in another, or "" if nothing plays.
export function sheetAbc(block) {
  // A double stroke is two events, the second hidden: the first is drawn, for as long as
  // the two of them last.
  const spans = new Map()
  for (const e of block.drumEvents) {
    if (!e.hidden) continue
    const gap = e.gap ?? Math.round(e.gapSec / block.secPerTick)
    spans.set(`${e.lane}@${e.tick - gap}`, 2 * gap)
  }
  const voices = { H: new Map(), F: new Map() }
  for (const e of block.drumEvents) {
    const at = STAFF[e.lane]
    if (!at || e.hidden) continue
    const v = voices[at.foot ? "F" : "H"]
    const span = spans.get(`${e.lane}@${e.tick}`)
    v.set(e.tick, [...(v.get(e.tick) || []), span ? { ...e, span } : e])
  }
  const sounding = Object.keys(voices).filter((v) => voices[v].size)
  if (!sounding.length) return ""
  const groups = beamGroups(block)
  const lines = sounding.map((v) => {
    const bars = []
    for (let bar = 0; bar < block.bars; bar++) {
      let start = bar * block.barTicks
      const out = []
      for (const ticks of groups) {
        const inside = new Map()
        for (const [t, h] of voices[v]) if (t >= start && t < start + ticks) inside.set(t - start, h)
        out.push(group(inside, ticks))
        start += ticks
      }
      bars.push(out.join(" "))
    }
    return `[V:${v}] ${bars.join(" | ")} |`
  })
  const count = block.groups.reduce((a, b) => a + b, 0)
  return [
    "X:1",
    "L:1/16",
    `M:${count}/${block.unit}`,
    `Q:1/4=${block.tempo}`,
    "K:perc",
    ...(sounding.length > 1 ? ["%%score (H F)"] : []),
    ...(sounding.includes("H") ? ["V:H stem=up"] : []),
    ...(sounding.includes("F") ? ["V:F stem=down"] : []),
    ...lines,
  ].join("\n")
}
