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
  keyOf,
} from "../chords.ts"
import { ChordType, Note } from "tonal"
import {
  intervalCall,
  intervalSteps,
  moveInScale,
  wrapInterval,
  tokenize,
  splitBars,
} from "../intervals.ts"
import { misplaced } from "../check.ts"
import { textOf } from "../parts.ts"
import type { Piece, State } from "../state.ts"
import { callAt, drawsNotes, spaceNotes } from "./notes.ts"
import { barSlotTicks, timeLabel } from "../time.ts"
import { message, reportIn, type Report } from "../diagnostics.ts"
import { locatedTokens, SourceText, tokenSources } from "../source.ts"
import { NAME_LIKE } from "../vocab.ts"

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
  return message("chord.upperNumeral", { tok, lower, base: acc + numeral.toLowerCase() })
}

// vii°, viiø: a diminished numeral is written with dim, as a chord is
const DIM_MARK = /^([#b]?(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i))([°ø])(.*)$/
export function dimMarkProblem(tok: string): string | null {
  const m = DIM_MARK.exec(tok)
  if (!m) return null
  const [, numeral, mark, rest] = m
  const written = mark === "ø" ? `${numeral}m7b5` : `${numeral}dim${rest}`
  return message("chord.dimNumeral", { tok, written })
}

// A chord's slot. A mistake is marked on `at`, the chord as it's written on the line: `tok`
// itself, or the name or interval call `tok` came from.
export function chordSlot(
  tok: string,
  part: Part,
  st: State,
  key: Key,
  err: Report,
  at: string = tok,
): Slot | null {
  if (tok === "-") return { hold: true }
  if (tok === "_") return { rest: true }
  if (tok === "%") {
    err(part.ln, message("chord.percentAlone"), at)
    return null
  }
  const fn = intervalCall(tok)
  if (fn) {
    if (fn.error) {
      err(part.ln, fn.error, at === tok ? callAt(tok) : at)
      return null
    }
    const call = fn.call!
    if (call.end !== tok.length || call.prefix) {
      err(part.ln, message("chord.callEnds"), at)
      return null
    }
    // Apply the musical operation before the playback-only transpose setting. A call that's
    // written as is has its chord written inside it.
    const inner = chordSlot(
      call.body,
      part,
      { ...st, transpose: 0 },
      key,
      err,
      at === tok ? call.body : at,
    )
    if (!inner?.chord) return inner
    const chord = moveChord(inner.chord, key, intervalSteps(call, key))
    chord.input = tok
    applyTranspose(chord, st.transpose)
    if (![chord.bassMidi, ...chord.notesMidi].every((m) => m >= 0 && m <= 127)) {
      err(part.ln, message("note.outsideMidi", { tok }), at)
      return null
    }
    return { chord }
  }
  if (NAME_LIKE.test(tok) && !isDegreeChord(tok)) {
    err(
      part.ln,
      st.sections[tok]
        ? misplaced(tok, st.sections[tok].type, { line: "chart" })!
        : message("chord.undefinedAbove", { tok }),
      at,
    )
    return null
  }
  const chord = buildChord(tok, key, st.octave)
  if (!chord) {
    const degree = /^[#b]?(vii|vi|iv|v|iii|ii|i)/.exec(tok)?.[1]
    const past = degree && pastScale(key, degreeNumber(degree))
    err(
      part.ln,
      (past && message("chord.pastScale", { tok, mode: key.mode, degrees: key.scale.length })) ||
        dimMarkProblem(tok) ||
        upperNumeral(tok) ||
        (drawsNotes(tok)
          ? message("chord.isNotes", { tok, part: part.name, notes: spaceNotes(tok) })
          : message("chord.unknown", { chord: tok })),
      at,
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
// call stay inline; a named chart retains its existing bar boundaries. `origins`, when
// given, gets the place in `tokens` that each token returned came from.
export function expandChordTokens(
  tokens: string[],
  st: State,
  err: Report,
  ln: number,
  depth = 0,
  declaration = false,
  origins?: number[],
): string[] | null {
  // A mistake is marked on `at`, the token it's about, as it's written
  const fail = (msg: string, at: string) => {
    err(ln, msg, at)
    return null
  }
  if (depth > 32) return fail(message("interval.nested"), tokens.join(" "))
  const out: string[] = []
  const from: number[] = []
  const sources = tokenSources(tokens)
  const written: SourceText[] = []
  const outer = err
  for (const [i, token] of tokens.entries()) {
    const source = sources?.[i]
    err = reportIn(outer, source)
    const push = (...more: string[]) => {
      out.push(...more)
      from.push(...more.map(() => i))
      if (source)
        written.push(
          ...more.map((t) =>
            t === source.text ? source : SourceText.writtenAs(t, source.span, source.owner),
          ),
        )
    }
    if (token.includes("'")) return fail(message("octave.apostrophe"), token)
    const word = st.words[token]
    if (word) {
      if (word.type !== "chords")
        return fail(
          declaration
            ? message("name.wrongType", { name: token, type: word.type, into: "chords" })
            : misplaced(token, word.type, { line: "chart" })!,
          token,
        )
      // A single chord fills a slot just like its literal. A chart keeps its bars.
      if (word.tokens.length === 1 && !CHORD_MARKS.includes(word.tokens[0])) push(...word.tokens)
      else push("|", ...word.tokens, "|")
      continue
    }
    if (st.sections[token])
      return fail(misplaced(token, st.sections[token].type, { line: "chart" })!, token)
    const fn = intervalCall(token)
    if (!fn) {
      push(token)
      continue
    }
    if (fn.error) return fail(fn.error, callAt(token))
    const call = fn.call!
    if (call.end !== token.length || call.prefix) return fail(message("chord.callEnds"), token)
    const bodyFrom = token.indexOf("(") + 1
    const leading = token.slice(bodyFrom).length - token.slice(bodyFrom).trimStart().length
    const body = source?.slice(bodyFrom + leading, bodyFrom + leading + call.body.length)
    const inner = expandChordTokens(tokenize(call.body, body), st, err, ln, depth + 1, declaration)
    if (!inner) return null
    // % belongs to the argument's own preceding bar, before its tones move.
    const bars = splitBars(inner)
    for (let b = 0; b < bars.length; b++) {
      if (bars[b].length === 1 && bars[b][0] === "%") {
        if (!b) return fail(message("chord.percentInCall"), token)
        bars[b] = [...bars[b - 1]]
      }
    }
    if (inner[0] === "|") push("|")
    bars.forEach((bar, b) => {
      if (b) push("|")
      push(...bar.map((t) => (CHORD_MARKS.includes(t) ? t : wrapInterval(call, t))))
    })
    if (inner.at(-1) === "|") push("|")
  }
  const kept = out.map((token, k) => token !== "|" || out[k - 1] !== "|")
  origins?.push(...from.filter((_, k) => kept[k]))
  return locatedTokens(
    out.filter((_, k) => kept[k]),
    sources && written.filter((_, k) => kept[k]),
  )
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

// A chords line: its chords, `tokens`, read from the line's value, when it has one
export function chordPattern(
  part: Part & { value?: Piece[] },
  tokens: string[],
  st: State,
  barTicks: number,
  err: Report,
): ChartClip | null {
  // the state's key was read when it was set
  const key: Key = keyOf(st)!
  const origins: number[] = []
  const expanded = expandChordTokens(tokens, st, err, part.ln, 0, false, origins)
  if (!expanded) return null
  // Where each chord is written: the token it came from (a chord, a name, an interval call)
  const written = (k: number) => tokens[origins[k]]
  // The bars, each as the places in `expanded` of what it holds
  const places: number[][] = [[]]
  expanded.forEach((t, k) => (t === "|" ? places.push([]) : places.at(-1)!.push(k)))
  let ok = true
  const again = chartRepeat(expanded)
  if (again) {
    const chart = part.value ? textOf(part.value).replace(/^chords\s*/, "") : tokens.join(" ")
    err(
      part.ln,
      message("chord.repeats", {
        part: part.name,
        chart: tokens.join(" ").replace(/ \| /g, "|"),
        again,
      }),
      chart,
    )
    return null
  }
  const bars: Slot[][] = []
  for (const at of places.filter((b) => b.length)) {
    const bar = at.map((k) => expanded[k])
    if (bar.length === 1 && bar[0] === "%") {
      if (bars.length) bars.push(bars[bars.length - 1])
      else {
        err(part.ln, message("chord.firstBar"), written(at[0]))
        ok = false
      }
      continue
    }
    if (!barSlotTicks(barTicks, bar.length)) {
      // The bar as it's written: each token it came from, once
      const bar = [...new Set(at.map((k) => origins[k]))].map((i) => tokens[i]).join(" ")
      err(part.ln, message("chord.splitEvenly", { time: timeLabel(st), slots: at.length }), bar)
      ok = false
      continue
    }
    const slots = at.map((k) =>
      chordSlot(expanded[k], part, st, key, reportIn(err, tokenSources(expanded)?.[k]), written(k)),
    )
    if (slots.includes(null)) ok = false
    bars.push(slots as Slot[])
  }
  if (!ok) return null
  if (!bars.length) {
    err(part.ln, message("chord.needsChords", { part: part.name }), "chords")
    return null
  }
  if (bars[0][0].hold) {
    const first = places.find((b) => b.length)![0]
    err(part.ln, message("chord.startsWithHold"), written(first))
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
