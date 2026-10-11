/* A play's output as sheet music: one block of the grid as ABC notation, for a renderer
   such as abcjs to draw. The drums are a percussion staff with the hands in one voice and
   the feet in another; each pitched instrument's line is a staff of its own, and a guitar's
   comes with a tab staff. Pure, like grid.js. */
import { abcKey, keySignature, parseKey } from "./chords.js"
import { beatGroups, isCompound } from "./grid.js"
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
  const hand = notes.find((n) => n.hand)?.hand
  if (hand) deco += `"^${hand}"` // the sticking, above the staff, clear of the feet's rests
  const heads = notes.map((n) => (n.at.head ? `!style=${n.at.head}!` : "") + n.at.pitch)
  return deco + (heads.length === 1 ? heads[0] : `[${heads.join("")}]`) + dur(u)
}

// A pitch as ABC writes it: C is middle C, c the octave above, C, the octave below, and an
// accidental when the key signature and the bar so far don't give it already. `acc` is the
// bar's accidentals so far, by letter and octave; `sig` is the key: its signature's marks
// by letter, and how it spells its black keys.
const SHARP_SPELL = ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"]
const FLAT_SPELL = ["C", "_D", "D", "_E", "E", "F", "_G", "G", "_A", "A", "_B", "B"]
function abcPitch(midi, acc, sig) {
  const octave = Math.floor(midi / 12) - 1
  const pc = ((midi % 12) + 12) % 12
  // A minor key's raised seventh is a sharp whatever the key's spelling: F# in G minor
  const leading = sig.key.mode === "minor" || sig.key.mode === "aeolian"
  const flat = sig.key.flats && !(leading && pc === (sig.key.tonicPc + 11) % 12)
  const spelt = (flat ? FLAT_SPELL : SHARP_SPELL)[pc]
  const needed = /^[\^_]/.test(spelt) ? spelt[0] : ""
  const letter = needed ? spelt[1] : spelt
  const at = letter + octave
  const current = acc.has(at) ? acc.get(at) : sig.marks.get(letter) || ""
  let mark = ""
  if (needed !== current) {
    mark = needed || "="
    acc.set(at, needed)
  }
  const name = octave >= 5 ? letter.toLowerCase() + "'".repeat(octave - 5) : letter + ",".repeat(Math.max(0, 4 - octave))
  return mark + name
}

// One note or chord of a pitched line, `u` sixteenths long, tied on when `tie`. A chord
// chart's symbol goes above its first note.
function pitchedNote(hits, u, tie, acc, cont, sig) {
  const notes = [...new Map(hits.map((h) => [h.midi, h])).values()].sort((a, b) => a.midi - b.midi)
  let deco = ""
  if (!cont) {
    if (notes.some((n) => n.accent)) deco += "!>!"
    if (notes.every((n) => n.ghost)) deco += GHOST
    const symbol = notes.find((n) => n.symbol)?.symbol
    if (symbol) deco += `"${symbol}"`
  }
  const heads = notes.map((n) => abcPitch(n.midi, acc, sig))
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
          out.push({ s, tick: (i + k) * slot, cont, triplet: true })
        } else if (carry) {
          carry.left--
          s += mk(carry.hits, nominal, carry.left > 0, true)
          out.push({ s, tick: (i + k) * slot, cont: true, triplet: true })
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
      out.push({ s: "z" + dur((d * slot) / 24), len: (d * slot) / 24 })
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
      out.push({ s: mk(here, (d * slot) / 24, tie, cont), tick: i * slot, cont, len: (d * slot) / 24, hits: here, tie })
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

// What a note is counted as, by where it falls in the beat: 1 e & a, and 1 & a for
// triplets. A compound meter is counted in eighths: 1 & 2 & 3 &.
function countOf(tick, block) {
  if (isCompound(block)) {
    const eighth = TPQ / 2
    const n = Math.floor(tick / eighth) + 1
    return { 0: String(n), 24: "&" }[tick % eighth] || "*"
  }
  const beat = Math.floor(tick / TPQ) + 1
  const pos = tick % TPQ
  return { 0: String(beat), 24: "e", 48: "&", 72: "a", 32: "&", 64: "a" }[pos] || "*"
}

// A note's lengths that can cross the beats: a quarter, a dotted quarter, a half, a
// dotted half and a whole, in sixteenths, and where in the bar each may start.
const LONG = [4, 6, 8, 12, 16]
const startsLong = (len, at) => (len === 16 ? at === 0 : len >= 8 ? at % 4 === 0 : at % 2 === 0)
const midisOf = (hits) => hits.map((h) => h.midi).sort((a, b) => a - b).join(",")

// A note written as tied pieces, one a beam group, becomes one note where its length is
// one that may cross the beats from where it starts: a whole note on the one, not four
// tied quarters. A note that doesn't start the bar still shows the bar's middle, as a
// tie there, in a bar with an even number of beats (`mid`, in sixteenths, or null).
// `pieces` are a bar's, with `at`, where each starts, in sixteenths.
function joinLong(pieces, mid) {
  const out = []
  for (let i = 0; i < pieces.length; i++) {
    let p = pieces[i]
    if (p.hits && !p.triplet) {
      const from = i
      while (p.tie) {
        const next = pieces[i + 1]
        if (!next?.hits || next.triplet || !next.cont || midisOf(next.hits) !== midisOf(p.hits)) break
        const len = p.len + next.len
        if (!LONG.includes(len) || !startsLong(len, p.at)) break
        if (mid != null && p.at > 0 && p.at < mid && p.at + len > mid) break
        const s = p.s.replace(/(\d+\/2|\d+|\/)?-?$/, dur(len) + (next.tie ? "-" : ""))
        p = { ...p, s, len, tie: next.tie }
        i++
      }
      // A merged note is a quarter or longer, so nothing beams to it: a space follows it
      if (i > from && pieces[i + 1]) pieces[i + 1] = { ...pieces[i + 1], first: true }
    }
    out.push(p)
  }
  return out
}

// A chord's note name, as the engine spells it (C#3), as a midi number.
const BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
function midiOf(name) {
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(name)
  if (!m) return null
  return 12 * (Number(m[3]) + 1) + BASE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0)
}

// A pitched instrument's clef, and how far above its sound it's written: guitars and basses
// an octave up, as their parts are, the rest where their notes sit: a bass clef when most
// of them are below middle C.
function clefFor(inst, midis) {
  const kind = inst.split(".")[0]
  // Guitar notation sounds an octave below the staff; abcjs's tab counts on that already,
  // so the clef is a plain treble (treble-8 would have it drop another octave)
  if (kind === "guitar") return { clef: "treble", shift: 12, tab: true }
  if (kind === "bass") return { clef: "bass", shift: 12 }
  const sorted = [...midis].sort((a, b) => a - b)
  const mid = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 60
  return { clef: mid < 60 ? "bass" : "treble", shift: 0 }
}

// `block` is one of a parsed output's `blocks`. Returns its ABC and, for abcjs, which
// staves get a tab staff: { abc, tablature }. `abc` is "" when nothing plays. With
// `counts`, the hands' notes are counted 1 e & a under the staff. The music breaks into
// systems of `barsPerLine` bars, written into the ABC itself: abcjs's own wrapping loses
// the tab staff.
export function sheetAbc(block, { counts = false, barsPerLine = 4 } = {}) {
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
  // A sticking's R or L goes under the hands' hit at the same moment
  const handAt = new Map()
  for (const e of block.drumEvents) if (e.lane === "sticking") handAt.set(e.tick, e.hand)
  for (const e of block.drumEvents) {
    const at = STAFF[e.lane]
    if (!at || e.hidden) continue
    const span = spans.get(`${e.lane}@${e.tick}`)
    const hand = at.foot ? null : handAt.get(e.tick)
    put(at.foot ? feet : hands, e.tick, { ...e, ...(span && { span }), ...(hand && { hand }) })
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
    add({ id: `P${++p}`, kind: "pitched", clef, name: staffName(v.inst), tab: !!tab, hits: v.hits })
  }
  if (!voices.length) return { abc: "", tablature: [] }

  const groups = beatGroups(block)
  // The middle of a bar of an even number of equal beats, in sixteenths: 4 over 4, 6 over 8
  const even = groups.length % 2 === 0 && groups.every((g) => g === groups[0])
  const mid = even ? block.barTicks / 2 / 24 : null
  const key = parseKey(block.key) || parseKey("C")
  const sig = { key, marks: keySignature(key) }
  const lines = []
  for (const v of voices) {
    const bars = []
    const said = []
    let carry = null // what the group before left sounding
    for (let bar = 0; bar < block.bars; bar++) {
      let start = bar * block.barTicks
      const acc = new Map() // the bar's accidentals so far
      const mk =
        v.kind === "drum" ? (h, u) => drumNote(h, u) : (h, u, tie, cont) => pitchedNote(h, u, tie, acc, cont, sig)
      // The bar's pieces, each knowing where it starts in the bar (in sixteenths) and
      // whether it starts a beam group, which a space in the ABC marks
      const pieces = []
      for (const ticks of groups) {
        const inside = new Map()
        if (carry) inside.set(0, carry)
        for (const [t, h] of v.hits) if (t >= start && t < start + ticks) inside.set(t - start, h)
        carry = carried(inside, ticks)
        const from = start - bar * block.barTicks
        group(inside, ticks, mk).forEach((x, i) =>
          pieces.push({ ...x, at: x.tick == null ? null : (from + x.tick) / 24, first: i === 0 }),
        )
        start += ticks
      }
      const written = v.kind === "pitched" ? joinLong(pieces, mid) : pieces
      bars.push(written.map((x, i) => (i && x.first ? " " : "") + x.s).join(""))
      said.push(
        pieces
          .filter((x) => x.at != null)
          .map((x) => (x.cont ? "*" : countOf(x.at * 24, block)))
          .join(" "),
      )
    }
    v.bars = bars
    v.said = said
  }
  // A system at a time, each voice's bars of it on a line of its own
  const perLine = Math.max(1, barsPerLine)
  for (let from = 0; from < block.bars; from += perLine) {
    for (const v of voices) {
      // A percussion staff has no key signature, so a key with one is turned off there
      const none = v.kind === "drum" && key.sharps && from === 0 ? "[K:none] " : ""
      lines.push(`[V:${v.id}] ${none}${v.bars.slice(from, from + perLine).join(" | ")} |`)
      if (v.counts) lines.push(`w: ${v.said.slice(from, from + perLine).join(" | ")} |`)
    }
  }

  const count = block.groups.reduce((a, b) => a + b, 0)
  // The instruments' staves, then the kit at the bottom, as a band chart has them. (abcjs
  // also draws no tab staff below a percussion staff.)
  const drums = voices.filter((v) => v.kind === "drum").map((v) => v.id)
  const score = [
    ...voices.filter((v) => v.kind !== "drum").map((v) => v.id),
    ...(drums.length > 1 ? [`(${drums.join(" ")})`] : drums),
  ]
  const abc = [
    "X:1",
    "L:1/16",
    `M:${count}/${block.unit}`,
    `Q:1/4=${block.tempo}`,
    `K:${abcKey(key)}`,
    `%%score ${score.join(" ")}`,
    ...voices.map(
      (v) =>
        `V:${v.id} clef=${v.clef}` + (v.stem ? ` stem=${v.stem}` : "") + (v.name ? ` name="${v.name}"` : ""),
    ),
    ...lines,
  ].join("\n")
  // abcjs takes the tab staves by staff: a staff a pitched voice, then the drums' one
  const staves = [...voices.filter((v) => v.kind !== "drum"), ...(drums.length ? [{ kind: "drum" }] : [])]
  const tablature = staves.map((v) => (v.tab ? { instrument: "guitar" } : { instrument: "" }))
  return { abc, tablature }
}

// A staff's name: the instrument's, with a second sound in front: el. guitar
function staffName(inst) {
  const [kind, sound] = inst.split(".")
  return sound ? `${sound.slice(0, 2)}. ${kind}` : kind
}
