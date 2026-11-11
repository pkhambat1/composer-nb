/* Charts: what a chords line plays, bar by bar. A bar's chords split it evenly; - holds the
   chord before for another slot, _ rests, % plays the bar before again. A chord is a name
   (Am7, C6/9/E), a scale degree (1, 5dom7), or an interval function. */
import {
  applyTranspose,
  buildChord,
  chordParts,
  degreeNumber,
  isDegreeChord,
  parseKey,
  pastScale,
  pastScaleMessage,
} from "../chords.ts"
import { ChordType, Note } from "tonal"
import {
  intervalCall,
  intervalSteps,
  moveInScale,
  wrapInterval,
  OCTAVE_HELP,
} from "../intervals.ts"
import { misplaced } from "../check.ts"
import { keyOf } from "../settings.ts"
import { NAME_LIKE } from "../resolve.ts"
import type { State } from "../state.ts"
import { drawsNotes, spaceNotes } from "./notes.ts"
import { splitBars, tokenize } from "./steps.ts"
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

export function chordSlot(tok: string, part: Part, st: State, key: Key, err: Report): Slot | null {
  if (tok === "-") return { hold: true }
  if (tok === "_") return { rest: true }
  if (tok === "%") {
    err(part.ln, "% stands for a whole bar, so it goes between bar lines on its own: Am F|%")
    return null
  }
  const fn = intervalCall(tok)
  if (fn) {
    if (fn.error) {
      err(part.ln, fn.error)
      return null
    }
    const call = fn.call!
    if (call.end !== tok.length || call.prefix) {
      err(part.ln, "A chord interval call ends at its closing ): fifth(1)")
      return null
    }
    // Apply the musical operation before the playback-only transpose setting.
    const inner = chordSlot(call.body, part, { ...st, transpose: 0 }, key, err)
    if (!inner?.chord) return inner
    const chord = moveChord(inner.chord, key, intervalSteps(call, key))
    chord.input = tok
    applyTranspose(chord, st.transpose)
    if (![chord.bassMidi, ...chord.notesMidi].every((m) => m >= 0 && m <= 127)) {
      err(
        part.ln,
        `"${tok}" goes outside playable MIDI notes 0 to 127. Change octave or use octave(value, -1)`,
      )
      return null
    }
    return { chord }
  }
  if (NAME_LIKE.test(tok) && !isDegreeChord(tok)) {
    err(
      part.ln,
      st.sections[tok]
        ? misplaced(tok, st.sections[tok].type, { line: "chart" })!
        : `"${tok}" isn't defined above. Name it first: chords ${tok} = Am F|C G`,
    )
    return null
  }
  const chord = buildChord(tok, key, st.octave)
  if (!chord) {
    const degree = /^[#b]?(vii|vi|iv|v|iii|ii|i)/.exec(tok)?.[1]
    const past = degree && pastScale(key, degreeNumber(degree))
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

// Every chord tone, including an explicit bass, moves through the same scale.
// Recognize the resulting harmony for its chip and guitar shape. Unusual tone
// sets get an honest list of spelled notes instead of an incorrect chord name.
function moveChord(chord: Chord, key: Key, steps: number): Chord {
  const notes = chord.notesMidi.map((m, i) => moveInScale(m, chord.noteNames[i], key, steps))
  const bass = moveInScale(chord.bassMidi, chord.bassName, key, steps)
  const root = notes[0].name.replace(/-?\d+$/, "")
  const intervals = notes.map((n) => Note.distance(notes[0].name, n.name))
  const known = ChordType.all().find(
    (type) =>
      type.intervals.length === intervals.length &&
      type.intervals.every((iv, i) => iv === intervals[i]),
  )
  const suffix = known?.name === "major" ? "" : known?.aliases[0]
  const [original, originalBass] = chordParts(chord.label)
  const sameShape = intervals.every(
    (iv, i) => iv === Note.distance(chord.noteNames[0], chord.noteNames[i]),
  )
  const label = sameShape
    ? root + original.replace(/^[A-G][#b]*/, "")
    : suffix !== undefined
      ? root + suffix
      : `[${notes.map((n) => n.name.replace(/-?\d+$/, "")).join(" ")}]`
  return {
    ...chord,
    rootPc: ((notes[0].midi % 12) + 12) % 12,
    notesMidi: notes.map((n) => n.midi),
    noteNames: notes.map((n) => n.name),
    bassMidi: bass.midi,
    bassName: bass.name,
    label: label + (originalBass ? "/" + bass.name.replace(/-?\d+$/, "") : ""),
  }
}

// Expand names and calls without resolving their pitches. Bars inside an inline
// call stay inline; a named chart retains its existing bar boundaries.
export function expandChordTokens(
  tokens: string[],
  st: State,
  err: Report,
  ln: number,
  depth = 0,
  declaration = false,
): string[] | null {
  const fail = (msg: string) => {
    err(ln, msg)
    return null
  }
  if (depth > 32) return fail("Interval functions can nest at most 32 levels")
  const out: string[] = []
  for (const token of tokens) {
    if (token.includes("'")) return fail(OCTAVE_HELP)
    const word = st.words[token]
    if (word) {
      if (word.type !== "chords")
        return fail(
          declaration
            ? `${token} is ${word.type}, so it can't go in chords`
            : misplaced(token, word.type, { line: "chart" })!,
        )
      // A single chord fills a slot just like its literal. A chart keeps its bars.
      if (word.tokens.length === 1 && !CHORD_MARKS.includes(word.tokens[0]))
        out.push(...word.tokens)
      else out.push("|", ...word.tokens, "|")
      continue
    }
    if (st.sections[token])
      return fail(misplaced(token, st.sections[token].type, { line: "chart" })!)
    const fn = intervalCall(token)
    if (!fn) {
      out.push(token)
      continue
    }
    if (fn.error) return fail(fn.error)
    const call = fn.call!
    if (call.end !== token.length || call.prefix)
      return fail("A chord interval call ends at its closing ): fifth(1)")
    const inner = expandChordTokens(tokenize(call.body), st, err, ln, depth + 1, declaration)
    if (!inner) return null
    // % belongs to the argument's own preceding bar, before its tones move.
    const bars = splitBars(inner)
    for (let i = 0; i < bars.length; i++) {
      if (bars[i].length === 1 && bars[i][0] === "%") {
        if (!i)
          return fail("% inside an interval function needs a preceding bar inside that function")
        bars[i] = [...bars[i - 1]]
      }
    }
    if (inner[0] === "|") out.push("|")
    bars.forEach((bar, i) => {
      if (i) out.push("|")
      out.push(...bar.map((t) => (CHORD_MARKS.includes(t) ? t : wrapInterval(call, t))))
    })
    if (inner.at(-1) === "|") out.push("|")
  }
  return out.filter((token, i) => token !== "|" || out[i - 1] !== "|")
}

// Declaration validation uses the same reader as playback, without transpose.
export function validChordToken(token: string, st: State, err: Report, ln: number): boolean {
  return !!chordSlot(token, { name: "piano", ln }, { ...st, transpose: 0 }, keyOf(st)!, err)
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
  const expanded = expandChordTokens(tokens, st, err, part.ln)
  if (!expanded) return null
  let ok = true
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
