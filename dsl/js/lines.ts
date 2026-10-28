/* Lines: what each line of a cell or a block is, from how it starts. A setting (set tempo 90),
   a declaration (steps pair = ^-x-), an instrument's line (kick: x--x), what plays in a bar
   (bar 2 { ... }) or at its own pace (every 3 steps { ... }), or patterns to play (intro
   verse). An instrument's line is then read as what it plays. */
import { buildChord, parseKey } from "./chords.ts"
import { classifyDecl, patternHint, readDecl } from "./declare.ts"
import { blockBeside } from "./eval.ts"
import { readSequence, type Item } from "./sequence.ts"
import { closest, unknownInstrument } from "./resolve.ts"
import { keyOf, readSetting } from "./settings.ts"
import { bracesIn, headOf, onlyBraces, textOf, withHead } from "./parts.ts"
import type { Line, Piece, State } from "./state.ts"
import {
  evalNumber,
  lengthAt,
  lengthPrefix,
  MAX_BARS,
  meterOf,
  nearWhole,
  numbers,
  singularLength,
  TPQ,
  type Report,
} from "./time.ts"
import type { ChartClip } from "./values/chart.ts"
import { drawsNotes, pitchedPattern, spaceNotes, type PitchedClip } from "./values/notes.ts"
import {
  beatPattern,
  listsBeats,
  stepParts,
  stepBlock,
  stepPattern,
  tokenize,
  type DrumClip,
} from "./values/steps.ts"
import {
  among,
  PARTS,
  PITCHED,
  SETTING_EXAMPLE,
  SETTINGS,
  SOUNDS,
  TYPES,
  type Setting,
  type Type,
} from "./vocab.ts"

// What a line is, read
export type SettingLine = { kind: "setting"; ln: number; name: string; value: string }
export type DeclLine =
  | { kind: "word"; ln: number; type: Type; name: string; value: Piece[] }
  | { kind: "blockdef"; ln: number; name: string; value: Piece[] }
export type PartLine = {
  kind: "part"
  ln: number
  st?: State // the state where it plays
  name: string
  value: Piece[]
  pitched?: boolean
  drum?: string
  art?: string
}
export type Placed = {
  kind: "placed"
  ln: number
  from: number
  to: number
  lines: Line[]
  st?: State
}
export type Paced = {
  kind: "paced"
  ln: number
  n: number
  unit: string
  shown: string
  line: Line
  st?: State
}
export type SequenceLine = { kind: "sequence"; ln: number; items: Item[]; st?: State }
export type ReadLine = SettingLine | DeclLine | PartLine | Placed | Paced | SequenceLine
// An instrument's line, read as what it plays
export type Played = (DrumClip | PitchedClip | ChartClip) & { part: PartLine }

export const DEF_RE = /^([A-Za-z][A-Za-z0-9]*)\s*=\s*(.*)$/
// A type, a name and what it holds: steps pair = ^-x-
const TYPE_WORDS = TYPES.join("|")
export const TYPED_RE = new RegExp(`^(${TYPE_WORDS})\\s+([A-Za-z][A-Za-z0-9]*)\\s*=\\s*(.*)$`)
// The same with the = left out: steps pair ^-x-
export const NO_EQUALS_RE = new RegExp(`^(${TYPE_WORDS})\\s+([A-Za-z][A-Za-z0-9]*)\\s+([^=].*)$`)
export const TRACK_RE = /^([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)?)\s*:\s*(.*)$/
// bar 2 ..., bar 3 to 4 ...: a place in front of what plays there
export const PLACE_RE = /^bar(\s+\S|$)/
// every 3 steps ...: how long a step lasts, in front of what plays at that pace
export const EVERY_RE = /^every(\s|$)/

export const LINE_SHAPES =
  "Each line is a setting (set tempo 90), a name with its type (chords verse = Am F, " +
  "pattern groove = { ... }), play, or inside braces an instrument and what it plays " +
  "(kick: x--x---, guitar: notes F---G---) or patterns to play (intro verse)"

// bar 2 { ... }, bar 2 hat.pedal: 4, bar 3 to 4 fill: what plays in those bars of the
// block it's in, and nowhere else. Returns { kind: "placed", from, to, lines }, where
// `lines` is what plays there, or null after saying what's wrong.
export function readPlace(parts: Piece[], ln: number, err: Report): Placed | null {
  const text = headOf(parts)
  const nums = numbers(text)
  const first = nums.sumAt(3)
  const to = first && /^\s+to(?![A-Za-z0-9])\s*/.exec(text.slice(first.end))
  const last = to ? nums.sumAt(first.end + to[0].length) : first
  if (!first || !last) {
    err(
      ln,
      "bar takes the number of a bar, then what plays there: bar 2 { ... }, or bar 3 to 4 { ... }",
    )
    return null
  }
  const [from, until] = [first.e.value, last.e.value]
  if (!Number.isInteger(from) || !Number.isInteger(until) || from < 1 || until > MAX_BARS) {
    err(ln, `Bars are counted from 1, up to ${MAX_BARS}: bar 1, bar 2`)
    return null
  }
  if (until < from) {
    err(ln, `bar ${from} to ${until} runs backwards. The first bar comes first`)
    return null
  }
  const rest = withHead(parts, text.slice(last.end))
  const shown = text.slice(0, last.end).trim()
  if (!rest.length) {
    err(ln, `${shown} needs what plays there: ${shown} { ... }`)
    return null
  }
  // bar 2 { ... }: the braces are the bar's own lines, so they fill the bar directly
  const braces = onlyBraces(rest)
  const lines: Line[] = braces ? braces.lines : [{ ln, parts: rest }]
  return { kind: "placed", ln, from, to: until, lines }
}

// every 3 steps { ... }, every 1/3 beats hats: what plays at that pace, where one step
// lasts that long. Returns { kind: "paced", n, unit, shown, line }, where `line` is what
// plays, or null after saying what's wrong.
export function readPace(parts: Piece[], ln: number, err: Report): Paced | null {
  const len = lengthAt(headOf(parts).slice(5).trim())
  if (!len) {
    err(ln, "every takes a length, then what plays at that pace: every 3 steps { ... }")
    return null
  }
  const shown = `every ${len.shown}`
  const thing = withHead(parts, len.thing)
  if (!thing.length) {
    err(ln, `${shown} needs what plays at that pace: ${shown} { ... }`)
    return null
  }
  return {
    kind: "paced",
    ln,
    n: len.n,
    unit: len.unit,
    shown,
    line: { ln, parts: thing },
  }
}

// How long a step lasts inside every 3 steps, in ticks, or null after saying it can't
// last that. steps are the steps of what it's in, so every 2 steps inside it doubles again.
export function paceTicks(l: Paced, st: State, err: Report): number | null {
  const ticks =
    l.n *
    ({ steps: st.stepTicks, beats: TPQ, bars: meterOf(st).barTicks } as Record<string, number>)[
      l.unit
    ]
  if (l.n > 0 && nearWhole(ticks) && ticks >= 8) return Math.round(ticks)
  err(l.ln, `A step can't last ${l.shown.slice(6)}. Try every 3 steps, or every 1/3 beats`)
  return null
}

// Sorts one line (not play) into a setting, a word, a named pattern ("blockdef"), an
// instrument line ("part"), patterns to play ("sequence"), something in a bar ("placed")
// or something at its own pace ("paced"). Returns null when the line
// is a mistake, after reporting it. `st` is the state so far, for the names it has.
export function classify({ ln, parts }: Line, err: Report, st: State): ReadLine | null {
  const sections = st.sections
  // The line as text, its blocks shown as { ... }, for how it starts and for messages
  const text = textOf(parts)
  if (singularLength(text, ln, err)) return null
  if (PLACE_RE.test(text)) return readPlace(parts, ln, err)
  if (EVERY_RE.test(text)) return readPace(parts, ln, err)
  if (/^bars(\s|$)/.test(text)) {
    err(
      ln,
      "bars is a length, and goes after a number: 6 bars groove. To say which bars, write bar: bar 3 to 4 { ... }",
    )
    return null
  }

  const decl = readDecl(parts)
  if (decl) return classifyDecl(decl, ln, err, st)

  const m = TRACK_RE.exec(headOf(parts))
  // ( ... ) or 4 bars ( ... ): what plays in order, whatever lines are in it
  if (!m && lengthPrefix(text).rest.startsWith("(")) {
    const items = readSequence(parts, ln, err, st)
    return items && { kind: "sequence", ln, items }
  }
  if (!m) {
    const tokens = tokenize(text)
    const first = tokens[0] || ""
    const after = tokens.slice(1).join(" ")
    const noEquals = NO_EQUALS_RE.exec(text)
    if (first === "set") return readSetting(text, tokens, ln, err)
    if (/^with(\s|\{|$)/.test(text)) {
      // with octave 2 { ... }: a block, played with those settings
      const items = readSequence(parts, ln, err, st)
      return items && { kind: "sequence", ln, items }
    }
    if (text.startsWith("|")) {
      err(
        ln,
        "A line that starts with | continues the line above it, and there's no line above to continue",
      )
    } else if (noEquals && !(noEquals[1] === "chords" && buildChord(noEquals[2], keyOf(st)!))) {
      const [, type, name, value] = noEquals
      err(ln, `${type} ${name} needs = before what it holds: ${type} ${name} = ${value}`)
    } else if (/^pattern(\s|$)/.test(text)) {
      err(ln, patternHint(text))
    } else if (among(PITCHED, first.toLowerCase()) && /^[a-z]+$/.test(after) && !st.words[after]) {
      // guitar.electric muted is a setting, so it starts with set
      const name = first.toLowerCase()
      if (name in SOUNDS) {
        err(ln, `${name} ${after} is a setting, so it starts with set: set ${name} ${after}`)
        return null
      }
      const choice = Object.entries(SOUNDS).map(([i, s]) => `${i} (${s.join(", ")})`)
      err(ln, `${name} has one sound. Instruments with more: ${choice.join(", ")}`)
    } else if (among(PARTS, first.toLowerCase()) && after) {
      err(ln, `Put a colon after ${first}: ${first}: ${after}`)
    } else if (first === "chords" && after) {
      err(ln, `Chords go on an instrument's line: ${"piano"}: ${text}`)
    } else if (first === "notes" && after) {
      err(ln, `Notes go on an instrument's line: guitar: notes ${spaceNotes(after)}`)
    } else if (among(SETTINGS, first.toLowerCase())) {
      // tempo 90 is a setting, so it starts with set
      const name = first.toLowerCase()
      const value = text.slice(first.length).trim() || SETTING_EXAMPLE[name as Setting]
      err(ln, `${name} is a setting, so it starts with set: set ${name} ${value}`)
    } else if (after && evalNumber(after) && closest(first.toLowerCase(), SETTINGS)[1] <= 2) {
      err(
        ln,
        `"${first}" isn't a setting. Did you mean set ${closest(first.toLowerCase(), SETTINGS)[0]}?`,
      )
    } else if (
      !sections[first.replace(/^\(+/, "").split("*")[0]] &&
      buildChord(first, parseKey("C"))
    ) {
      err(ln, `Chords go on an instrument's line, e.g. ${"piano"}: chords ${text}`)
    } else if (!tokens.some((t) => sections[t]) && tokens.some(drawsNotes)) {
      err(ln, `Notes go on an instrument's line, e.g. guitar: notes ${spaceNotes(text)}`)
    } else if (/^[A-Za-z(*\d{]/.test(first)) {
      // intro verse verse: patterns to play, one after another
      const items = readSequence(parts, ln, err, st)
      return items && { kind: "sequence", ln, items }
    } else err(ln, LINE_SHAPES)
    return null
  }
  const name = m[1].toLowerCase()
  const value = withHead(parts, m[2])
  if (name === "bars" || name === "bar") {
    err(
      ln,
      "A length goes in front of what it measures: pattern groove = 3 bars {, or play 3 bars { ... }",
    )
    return null
  }
  if (among(SETTINGS, name)) {
    err(
      ln,
      `${name} is a setting, not an instrument, so it takes no colon: set ${name} ${textOf(value)}`,
    )
    return null
  }
  if (among(PARTS, name)) {
    if (!value.length) {
      err(ln, `${name}: needs something after the colon`)
      return null
    }
    if (among(PITCHED, name)) return { kind: "part", ln, name, value, pitched: true }
    const [drum, art = "hit"] = name.split(".")
    return { kind: "part", ln, name, value, drum, art }
  }
  err(ln, unknownInstrument(name))
  return null
}

// ---------------------------------------------------------------------------
// Parts: what one line plays. In a pattern it repeats until the pattern ends; in a play it
// plays once.
// ---------------------------------------------------------------------------

// One instrument's line.
export function readPart(part: PartLine, st: State, barTicks: number, err: Report): Played | null {
  if (part.pitched) {
    const pattern = pitchedPattern(part, st, barTicks, err)
    return pattern && { ...pattern, part }
  }
  // A drum's line: its parts, with any lengths written out as the steps they stand for.
  // A block on it is the whole line: its layers' steps.
  if (bracesIn(part.value).length) {
    const only = onlyBraces(part.value)
    if (!only) {
      err(
        part.ln,
        blockBeside(`${part.name} plays`, (fig: string) => `${part.name}: x--- ${fig}`),
      )
      return null
    }
    const run = stepBlock(only, st, err, part)
    const pattern = run == null ? null : stepPattern(part, [run], st, err)
    return pattern && { ...pattern, part }
  }
  const parts = stepParts(textOf(part.value), st, err, part.ln, part)
  if (!parts) return null
  const pattern = listsBeats(parts.tokens)
    ? beatPattern(part, parts.tokens, st, barTicks, err)
    : stepPattern(part, parts.tokens, st, err, parts.toEnd, parts.fill)
  return pattern && { ...pattern, part }
}
