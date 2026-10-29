/* Charts: what a chords line plays, bar by bar. A bar's chords split it evenly; - holds the
   chord before for another slot, _ rests, % plays the bar before again. A chord is a name
   (Am7, C6/9/E), a numeral counted from the key's root (V7, bVII), or a numeral of another
   chord's root (V7 of V). */
import {
  applyTranspose,
  buildChord,
  isRoman,
  midiToName,
  parseKey,
  pastScale,
  pastScaleMessage,
} from "../chords.ts"
import { misplaced } from "../check.ts"
import { message } from "../diagnostics.ts"
import { keyOf } from "../settings.ts"
import { NAME_LIKE } from "../resolve.ts"
import type { State } from "../state.ts"
import { drawsNotes, spaceNotes } from "./notes.ts"
import { isOf, openParens, splitBars } from "./steps.ts"
import { TPQ, timeLabel, type Report } from "../time.ts"

export type Key = NonNullable<ReturnType<typeof parseKey>>
export type Chord = NonNullable<ReturnType<typeof buildChord>>
// A line of a block that an instrument plays: its name (piano) and where it is
export type Part = { name: string; ln: number }
// One chord of a chart, as it sounds
export type ChordEvent = {
  tick: number
  ticks: number
  chord: Chord
  label: string
  instrument: string
  sound?: string
  transpose: number
  repeat: boolean
  line: number
}
// A chart, read: how long it is, and its chords for as long as it's played
export type ChartClip = {
  kind: "pitched"
  ticks: number
  expand(total: number, loop: boolean): ChordEvent[]
}
// What one slot of a bar holds: a chord, or a hold or a rest
type Slot = { chord?: Chord; hold?: true; rest?: true }
// A chord after of, or why there isn't one
type Of = { chord: Chord; error?: undefined } | { error: string; chord?: undefined }

// What a chart line holds besides chords: a bar line, a hold, a rest, the bar again
export const CHORD_MARKS = ["|", "-", "_", "%"]

// V, IV7: a numeral is lowercase, since the mode makes the chord major or minor
const UPPER = /^([#b]?)(VII|VI|IV|V|III|II|I)(.*)$/
export function upperNumeral(tok: string): string | null {
  const m = UPPER.exec(tok)
  if (!m) return null
  const [, acc, numeral, rest] = m
  const lower = acc + numeral.toLowerCase() + rest
  return `"${tok}": numerals are lowercase, and the mode makes the chord major or minor: ${lower}. To say a chord outright, write its quality after it: ${acc}${numeral.toLowerCase()}M, ${acc}${numeral.toLowerCase()}m`
}

// vii°, viiø: a diminished numeral is written with dim, as a chord is
const DIM_MARK = /^([#b]?(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i))([°ø])(.*)$/
export function dimMarkProblem(tok: string): string | null {
  const m = DIM_MARK.exec(tok)
  if (!m) return null
  const [, numeral, mark, rest] = m
  const written = mark === "ø" ? `${numeral}m7b5` : `${numeral}dim${rest}`
  return `"${tok}": a diminished numeral takes dim, as a chord does: ${written} (viidim, viidim7, or viim7b5 for half-diminished)`
}

// V7 of V: a numeral counted on the major scale of the root of the chord after of, so
// in C it's D7, the V7 of G, and v of Am is E. The chord after of is any chord, a numeral or
// a name of any type (Am, Cmaj7, F#dim), and gives only its root. A chain takes brackets:
// V7 of (V of V). A bass note goes at the end: V7 of V/F#. Returns { chord } or { error }.
// The left side is a numeral, with whatever a chart takes after one (V7alt).
const numeral = (t: string) => /^[#b]?[IViv]/.test(t)
export function ofChord(tok: string, key: Key, octave: number): Of {
  const at = tok.indexOf(" of")
  // the last / is a bass's unless it's a 6/9's own: V7 of V/F#, V of I6/9
  const slash = tok.lastIndexOf("/")
  const own = tok.slice(slash - 1, slash + 2) === "6/9"
  const bass = slash > Math.max(at, tok.lastIndexOf(")")) && !own ? tok.slice(slash + 1) : null
  const main = bass === null ? tok : tok.slice(0, slash)
  const left = main.slice(0, at)
  const right = main.slice(at + 4) // past " of "
  if (!numeral(left)) {
    return { error: message("of.leftNumeral") }
  }
  if (right.startsWith("(") && openParens(right) > 0) return { error: message("of.openBracket") }
  let root: Chord | null
  if (right.startsWith("(")) {
    if (!right.endsWith(")")) return { error: message("of.chainBrackets") }
    const inner = right.slice(1, -1)
    const r = isOf(inner) ? ofChord(inner, key, octave) : { chord: buildChord(inner, key, octave) }
    if ("error" in r && r.error) return { error: r.error }
    if (!r.chord) return { error: message("chord.unknown", { chord: inner }) }
    root = r.chord
  } else {
    if (isOf(right)) return { error: message("of.chainBrackets") }
    root = buildChord(right, key, octave)
    if (!root) return { error: message("chord.unknown", { chord: right }) }
  }
  // The root's own major key, spelt with one sign at most, as a key is, in the octave where
  // the root sounds: V7 of V in A counts up from V's E4, so it's B4
  let name = /^[A-G][#b]*/.exec(root.label)![0]
  if (name.length > 2) name = midiToName(60 + root.rootPc, key.flats).replace(/-?\d+$/, "")
  // a note's major key always reads
  const rootKey = parseKey(name)!
  const rootOctave = Math.floor((root.notesMidi[0] - rootKey.tonicSemis) / 12) - 1
  const chord = buildChord(left + (bass === null ? "" : "/" + bass), rootKey, rootOctave)
  return chord ? { chord } : { error: message("chord.unknown", { chord: left }) }
}

function chordSlot(tok: string, part: Part, st: State, key: Key, err: Report): Slot | null {
  if (tok === "-") return { hold: true }
  if (tok === "_") return { rest: true }
  if (tok === "%") {
    err(part.ln, "% stands for a whole bar, so it goes between bar lines on its own: Am F|%")
    return null
  }
  if (isOf(tok)) {
    const of = ofChord(tok, key, st.octave)
    if (of.error !== undefined) {
      err(part.ln, of.error)
      return null
    }
    applyTranspose(of.chord, st.transpose)
    return { chord: of.chord }
  }
  if (NAME_LIKE.test(tok) && !isRoman(tok)) {
    err(
      part.ln,
      st.sections[tok]
        ? misplaced(tok, "pattern", { line: "chart" })!
        : `"${tok}" isn't defined above. Name it first: chords ${tok} = Am F|C G`,
    )
    return null
  }
  const chord = buildChord(tok, key, st.octave)
  if (!chord) {
    const degree = /^'*[#b]?(vii|vi|iv|v|iii|ii|i)/.exec(tok)?.[1]
    const past =
      degree && pastScale(key, ["i", "ii", "iii", "iv", "v", "vi", "vii"].indexOf(degree) + 1)
    err(
      part.ln,
      (past && `"${tok}": ${pastScaleMessage(key)}`) ||
        dimMarkProblem(tok) ||
        upperNumeral(tok) ||
        (drawsNotes(tok)
          ? `"${tok}" is notes, and this line says chords. A line of notes says notes in front: ${part.name}: notes ${spaceNotes(tok)}`
          : `"${tok}" isn't a chord I know`),
    )
    return null
  }
  applyTranspose(chord, st.transpose)
  return { chord }
}

// A chart that is the same bars more than once, after its names and % are written out:
// Am F|Am F is Am F twice. Returns the bars it repeats (Am F), or null. A chart repeats at
// the bar, so C C inside one bar strikes the chord twice and is no repeat.
export function chartRepeat(tokens: string[]): string | null {
  const bars: string[] = []
  for (const bar of splitBars(tokens)) {
    if (bar.length === 1 && bar[0] === "%") bars.push(bars.at(-1) ?? "%")
    else bars.push(bar.join(" "))
  }
  for (let p = 1; p <= bars.length / 2; p++) {
    if (bars.length % p === 0 && bars.every((b, i) => b === bars[i % p])) {
      return bars.slice(0, p).join("|")
    }
  }
  return null
}

export function chordPattern(
  part: Part,
  tokens: string[],
  st: State,
  barTicks: number,
  err: Report,
): ChartClip | null {
  // the state's key was read when it was set
  const key: Key = keyOf(st)!
  const expanded: string[] = []
  let ok = true
  for (const t of tokens) {
    const w = st.words[t]
    const problem = w && misplaced(t, w.type, { line: "chart" })
    if (problem) {
      err(part.ln, problem)
      ok = false
    } else if (w) expanded.push("|", ...w.tokens, "|")
    else expanded.push(t)
  }
  if (!ok) return null
  const again = chartRepeat(expanded)
  if (again) {
    err(
      part.ln,
      `${part.name}: chords ${tokens.join(" ").replace(/ \| /g, "|")} repeats ${again}. ` +
        `Write ${part.name}: chords ${again}: a pattern repeats it`,
    )
    return null
  }
  const bars: Slot[][] = []
  for (const bar of splitBars(expanded)) {
    if (bar.length === 1 && bar[0] === "%") {
      if (bars.length) bars.push(bars[bars.length - 1])
      else {
        err(part.ln, "% repeats the bar before it, but this is the first bar")
        ok = false
      }
      continue
    }
    if (barTicks % bar.length || (barTicks / bar.length) % (TPQ / 4)) {
      err(
        part.ln,
        `A ${timeLabel(st)} bar can't be split evenly into ${bar.length}. ` +
          "Use - to hold a chord for another slot, e.g. Am - F G",
      )
      ok = false
      continue
    }
    const slots = bar.map((tok) => chordSlot(tok, part, st, key, err))
    if (slots.includes(null)) ok = false
    bars.push(slots as Slot[])
  }
  if (!ok) return null
  if (!bars.length) {
    err(part.ln, `chords needs the chords after it: ${part.name}: chords Am F|C G`)
    return null
  }
  if (bars[0][0].hold) {
    err(part.ln, "This line starts with - but there's no chord to hold yet")
    return null
  }
  const transpose = st.transpose
  const sound = st.sounds[part.name]
  return {
    kind: "pitched",
    ticks: bars.length * barTicks,
    expand(total: number, loop: boolean) {
      const out: ChordEvent[] = []
      let cur: ChordEvent | null = null
      for (let b = 0; b * barTicks < total && (loop || b < bars.length); b++) {
        const bar = bars[b % bars.length]
        const slot = barTicks / bar.length
        bar.forEach((s, i) => {
          if (s.hold) {
            if (cur) cur.ticks += slot
            return
          }
          if (s.rest) {
            cur = null
            return
          }
          cur = {
            tick: b * barTicks + i * slot,
            ticks: slot,
            chord: s.chord!,
            label: s.chord!.label,
            instrument: part.name,
            ...(sound && { sound }),
            transpose,
            repeat: b >= bars.length,
            line: part.ln,
          }
          out.push(cur)
        })
      }
      return out
    },
  }
}
