/* Lines: what each line of a cell or a block is, from how it starts. A setting (set tempo 90),
   a declaration (steps pair = ^-x-), an instrument's line (kick: x--x), what plays in a bar
   (fill on bar 2) or at its own pace (every 3/4 beats { ... }), or patterns to play (intro
   verse). An instrument's line is then read as what it plays. */
import { buildChord, parseKey, keyOf } from "./chords.ts"
import { classifyDecl, patternHint, readDecl, type DeclLine } from "./declare.ts"
import { readSequence, type Item } from "./sequence.ts"
import { unknownInstrument } from "./resolve.ts"
import { readSetting } from "./settings.ts"
import {
  bracesIn,
  headOf,
  lengthIn,
  onlyBraces,
  textOf,
  withHead,
  sourceOf,
  located,
  sourcesOf,
} from "./parts.ts"
import { reportIn, type At, type Report, closest } from "./diagnostics.ts"
import type { SourceText } from "./source.ts"
import type { Line, Piece, State } from "./state.ts"
import {
  evalNumber,
  lengthAt,
  lengthPrefix,
  MAX_BARS,
  nearWhole,
  numbers,
  singularLength,
  TPQ,
} from "./time.ts"
import type { ChartClip } from "./values/chart.ts"
import { drawsNotes, pitchedPattern, spaceNotes, type PitchedClip } from "./values/notes.ts"
import { stepParts, stepBlock, stepPattern, type DrumClip } from "./values/steps.ts"
import {
  among,
  EVERY_RE,
  NO_EQUALS_RE,
  PARTS,
  PLACE_RE,
  PITCHED,
  SETTING_EXAMPLE,
  SETTINGS,
  SOUNDS,
  TRACK_RE,
  TYPED_BRACES_RE,
  type Setting,
} from "./vocab.ts"
import { blockBeside } from "./check.ts"
import { tokenize } from "./intervals.ts"

// What a line is, read
export type SettingLine = { kind: "setting"; ln: number; name: string; value: string }
export type PartLine = {
  source?: SourceText
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
  source?: SourceText
  kind: "paced"
  ln: number
  n: number
  unit: string
  shown: string
  line: Line
  st?: State
}
export type SequenceLine = { kind: "sequence"; ln: number; items: Item[]; st?: State }
export type ReadLine = (SettingLine | DeclLine | PartLine | Placed | Paced | SequenceLine) & {
  source?: SourceText
}
// An instrument's line, read as what it plays
export type Played = (DrumClip | PitchedClip | ChartClip) & { part: PartLine }

export const LINE_SHAPES =
  "Each line is a setting (set tempo 90), a name with its type (chords verse = Am F, " +
  "pattern groove = { ... }), play, or inside braces an instrument and what it plays " +
  "(kick: x--x---, guitar: notes F---G---) or patterns to play (intro verse)"

// A suffix places its whole value in those bars. Keeping that value as a line makes a
// named block and an inline block behave identically, including playing only once.
export function readPlace(parts: Piece[], ln: number, err: Report): Placed | null {
  const lastPart = parts[parts.length - 1]
  // The placement as written, up to any block after it: on bar 2
  const placement = () => /\bon\s+bar\b[^{]*/.exec(textOf(parts))![0]
  if (typeof lastPart !== "string") {
    err(ln, "Placement follows its value: block { crash: x } on bar 2", placement())
    return null
  }
  const suffix = /\bon\s+bar(?=\s|$)/.exec(lastPart)
  if (!suffix) {
    err(ln, "Placement follows its value: block { crash: x } on bar 2", placement())
    return null
  }
  // The placement as written, on bar and its bars: what a mistake in the bars marks, since
  // a bar number alone may also be written earlier on the line
  const written = lastPart.slice(suffix.index).trim()
  const before = lastPart.slice(0, suffix.index).trim()
  const value = [...parts.slice(0, -1), ...(before ? [before] : [])]
  const text = lastPart
    .slice(suffix.index)
    .replace(/^on\s+/, "")
    .replace(/\s+/g, " ")
  const nums = numbers(text)
  const first = nums.sumAt(3)
  const to = first && /^\s+to(?![A-Za-z0-9])\s*/.exec(text.slice(first.end))
  const last = to ? nums.sumAt(first.end + to[0].length) : first
  if (!first || !last) {
    err(ln, "on bar takes a bar number or range: fill on bar 2, or fill on bar 3 to 4", written)
    return null
  }
  const [from, until] = [first.e.value, last.e.value]
  if (!Number.isInteger(from) || !Number.isInteger(until) || from < 1 || until > MAX_BARS) {
    err(ln, `Bars are counted from 1, up to ${MAX_BARS}: bar 1, bar 2`, written)
    return null
  }
  if (until < from) {
    err(ln, `bar ${from} to ${until} runs backwards. The first bar comes first`, written)
    return null
  }
  if (text.slice(last.end).trim()) {
    err(ln, "Placement ends the value: fill on bar 2, or fill on bar 3 to 4", written)
    return null
  }
  if (!value.length) {
    err(ln, "Put what plays before on bar: block { crash: x } on bar 2", suffix[0])
    return null
  }
  return { kind: "placed", ln, from, to: until, lines: [{ ln, parts: value }] }
}

// every 3/4 beats { ... }, every 1/3 beats hats: what plays at that pace, where one step
// lasts that long. Returns { kind: "paced", n, unit, shown, line }, where `line` is what
// plays, or null after saying what's wrong.
export function readPace(parts: Piece[], ln: number, err: Report): Paced | null {
  const len = lengthAt(headOf(parts).slice(5).trim())
  if (!len || len.unit !== "beats") {
    err(
      ln,
      "every sets a step's length in beats: every 1/2 beats { kick: x }",
      len?.shown ?? "every",
    )
    return null
  }
  const shown = `every ${len.shown}`
  const thing = withHead(parts, len.thing)
  if (!thing.length) {
    err(ln, `${shown} needs what plays at that pace: ${shown} { ... }`, headOf(parts))
    return null
  }
  if (TYPED_BRACES_RE.test(lengthPrefix(textOf(thing)).rest)) {
    // The type in front of its braces
    const type = /^\S+/.exec(lengthPrefix(headOf(thing)).rest)![0]
    err(ln, `What plays at a pace is a pattern, so its braces take no type: ${shown} { ... }`, type)
    return null
  }
  // every 3/4 beats { ... }, every 3/4 beats 4 bars { ... }: its braces are a pattern
  const only = onlyBraces(lengthIn(thing).rest)
  return {
    kind: "paced",
    ln,
    n: len.n,
    unit: len.unit,
    shown,
    line: {
      ln,
      parts: located(
        thing.map((p) => (p === only ? { ...only, type: "pattern" } : p)),
        sourcesOf(thing),
      ),
    },
  }
}

// How long a step lasts inside every, in ticks, or null after saying it can't last that.
// Beats always measure quarter notes, independently of the surrounding pace.
export function paceTicks(l: Paced, st: State, err: Report): number | null {
  err = reportIn(err, l.source)
  const ticks = l.n * TPQ
  if (l.n > 0 && nearWhole(ticks) && ticks >= 8) {
    if (Math.round(ticks) === st.stepTicks && st.noteStepTicks === st.stepTicks) {
      err(l.ln, `${l.shown} repeats the current step length. Leave out this every`, l.shown)
      return null
    }
    return Math.round(ticks)
  }
  err(
    l.ln,
    `A step can't last ${l.shown.slice(6)}. Try every 1/2 beats or every 1/3 beats`,
    l.shown.slice(6),
  )
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
  // The line, for a mistake about all of it: the text it starts with, or, when it starts
  // with a block, the whole of it as the reader was given it
  const lineAt = (): At => headOf(parts) || (err.source?.text ? err.source.span : text)
  if (singularLength(text, ln, err)) return null
  const decl = readDecl(parts)
  if (decl) return classifyDecl(decl, ln, err, st)
  if (/^bar(?:\s|$)/.test(text)) {
    err(ln, "Placement follows its value: block { crash: x } on bar 2", "bar")
    return null
  }
  if (PLACE_RE.test(text)) return readPlace(parts, ln, err)
  if (EVERY_RE.test(text)) return readPace(parts, ln, err)
  if (/^bars(\s|$)/.test(text)) {
    err(
      ln,
      "bars is a length, and goes after a number: 6 bars groove. Placement follows its value: fill on bar 3 to 4",
      "bars",
    )
    return null
  }

  const m = TRACK_RE.exec(headOf(parts))
  // ( ... ) or 4 bars ( ... ): what plays in order, whatever lines are in it. pattern { ... }
  // or 4 bars block { ... }: lines with their type.
  const lead = lengthPrefix(text).rest
  if (!m && (lead.startsWith("(") || TYPED_BRACES_RE.test(lead))) {
    const items = readSequence(parts, ln, err, st)
    return items && { kind: "sequence", ln, items }
  }
  if (!m) {
    const tokens = tokenize(text)
    const first = tokens[0] || ""
    const after = tokens.slice(1).join(" ")
    const noEquals = NO_EQUALS_RE.exec(text)
    // A setting can be named octave too; its following arithmetic isn't a call.
    if (first === "set") return readSetting(text, text.split(/\s+/), ln, err)
    if (/^with(\s|\{|$)/.test(text)) {
      // with octave 2 { ... }: a block, played with those settings
      const items = readSequence(parts, ln, err, st)
      return items && { kind: "sequence", ln, items }
    }
    if (text.startsWith("|")) {
      err(
        ln,
        "A line that starts with | continues the line above it, and there's no line above to continue",
        "|",
      )
    } else if (noEquals && !(noEquals[1] === "chords" && buildChord(noEquals[2], keyOf(st)!))) {
      const [, type, name, value] = noEquals
      err(ln, `${type} ${name} needs = before what it holds: ${type} ${name} = ${value}`, name)
    } else if (/^pattern(\s|$)/.test(text)) {
      err(ln, patternHint(text), headOf(parts))
    } else if (among(PITCHED, first.toLowerCase()) && /^[a-z]+$/.test(after) && !st.words[after]) {
      // guitar.electric muted is a setting, so it starts with set
      const name = first.toLowerCase()
      if (name in SOUNDS) {
        err(ln, `${name} ${after} is a setting, so it starts with set: set ${name} ${after}`, first)
        return null
      }
      const choice = Object.entries(SOUNDS).map(([i, s]) => `${i} (${s.join(", ")})`)
      err(ln, `${name} has one sound. Instruments with more: ${choice.join(", ")}`, after)
    } else if (among(PARTS, first.toLowerCase()) && after) {
      err(ln, `Put a colon after ${first}: ${first}: ${after}`, first)
    } else if (first === "chords" && after) {
      err(ln, `Chords go on an instrument's line: ${"piano"}: ${text}`, first)
    } else if (first === "notes" && after) {
      err(ln, `Notes go on an instrument's line: guitar: notes ${spaceNotes(after)}`, first)
    } else if (among(SETTINGS, first.toLowerCase())) {
      // tempo 90 is a setting, so it starts with set
      const name = first.toLowerCase()
      const value = text.slice(first.length).trim() || SETTING_EXAMPLE[name as Setting]
      err(ln, `${name} is a setting, so it starts with set: set ${name} ${value}`, first)
    } else if (after && evalNumber(after) && closest(first.toLowerCase(), SETTINGS)[1] <= 2) {
      err(
        ln,
        `"${first}" isn't a setting. Did you mean set ${closest(first.toLowerCase(), SETTINGS)[0]}?`,
        first,
      )
    } else if (
      !sections[first.replace(/^\(+/, "").split("*")[0]] &&
      !/^\d/.test(first) &&
      buildChord(first, parseKey("C"))
    ) {
      err(ln, `Chords go on an instrument's line, e.g. ${"piano"}: chords ${text}`, lineAt())
    } else if (!tokens.some((t) => sections[t]) && tokens.some(drawsNotes)) {
      err(ln, `Notes go on an instrument's line, e.g. guitar: notes ${spaceNotes(text)}`, lineAt())
    } else if (/^[A-Za-z(*\d{]/.test(first)) {
      // intro verse verse: patterns to play, one after another
      const items = readSequence(parts, ln, err, st)
      return items && { kind: "sequence", ln, items }
    } else err(ln, LINE_SHAPES, headOf(parts))
    return null
  }
  const name = m[1].toLowerCase()
  const value = withHead(parts, m[2])
  if (name === "bars" || name === "bar") {
    err(
      ln,
      "Write the length like this: pattern groove = 3 bars {, or play groove for 3 bars",
      m[1],
    )
    return null
  }
  if (among(SETTINGS, name)) {
    err(
      ln,
      `${name} is a setting, not an instrument, so it takes no colon: set ${name} ${textOf(value)}`,
      m[1],
    )
    return null
  }
  if (among(PARTS, name)) {
    if (!value.length) {
      err(ln, `${name}: needs something after the colon`, headOf(parts))
      return null
    }
    if (among(PITCHED, name)) return { kind: "part", ln, name, value, pitched: true }
    const [drum, art = "hit"] = name.split(".")
    return { kind: "part", ln, name, value, drum, art }
  }
  err(ln, unknownInstrument(name), m[1])
  return null
}

// ---------------------------------------------------------------------------
// Parts: what one line plays. In a pattern it repeats until the pattern ends; in a play it
// plays once.
// ---------------------------------------------------------------------------

// One instrument's line.
export function readPart(
  part: PartLine,
  st: State,
  barTicks: number,
  err: Report,
  repeats = true,
): Played | null {
  err = reportIn(err, sourceOf(part.value) ?? part.source)
  if (part.pitched) {
    const pattern = pitchedPattern(part, st, barTicks, err, repeats)
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
        // What's written beside the block
        part.value.find((p): p is string => typeof p === "string" && !!p.trim())!,
      )
      return null
    }
    const run = stepBlock(only, st, err, part, repeats)
    const pattern = run == null ? null : stepPattern(part, [run], st, err)
    return pattern && { ...pattern, part }
  }
  const parts = stepParts(textOf(part.value), st, err, part.ln, part, repeats)
  if (!parts) return null
  const pattern = stepPattern(part, parts.tokens, st, err, parts.toEnd, parts.fill)
  return pattern && { ...pattern, part }
}
