/* Declarations: name = value, with its type in front. A declaration's value is read as
   the type it says (steps, notes, chords) and defined in its scope, or, for a
   pattern, kept as lines to play where it's played. A value that isn't the type it says,
   or a missing type, is said here. */
import { buildChord, isRoman } from "./chords.ts"
import { blockBeside } from "./eval.ts"
import { EVERY_RE, PLACE_RE, TRACK_RE, TYPED_RE, DEF_RE, type DeclLine } from "./lines.ts"
import { closest, NAME_LIKE, nameProblem, Scope } from "./resolve.ts"
import { keyOf } from "./settings.ts"
import {
  bracesIn,
  commaGroups,
  headOf,
  isBraces,
  lengthIn,
  onlyBraces,
  pieces,
  textOf,
  withHead,
} from "./parts.ts"
import type { Braces, Piece, Section, State } from "./state.ts"
import { evalNumber, fmt, lengthAt, lengthPrefix, MAX_BARS, type Report } from "./time.ts"
import { CHORD_MARKS, chartRepeat, dimMarkProblem, ofChord } from "./values/chart.ts"
import {
  drawsNotes,
  noteParts,
  noteSteps,
  notesTouch,
  notNotes,
  spacedNotes,
  spaceNotes,
} from "./values/notes.ts"
import {
  BEAT_RE,
  beatsAsSteps,
  EUCLID_RE,
  isStepRun,
  listsBeats,
  STEP_HELP,
  stepBlock,
  stepParts,
  isOf,
  tokenize,
  withoutOf,
} from "./values/steps.ts"
import { among, SETTINGS, TYPES, type Type } from "./vocab.ts"

// What a value reads as, from how it's written
type Shape = "steps" | "notes" | "chords" | "pattern"

export const CHORDS_BLOCK =
  "Chords play one at a time, so they can't be layered in a block. Put them on one line: piano: chords Am F|C G"
export const NOTES_BLOCK =
  "A name holds one line of notes. Notes that play together go in a block on the instrument's line: piano: { ... }"

// pattern groove 3 bars {: a pattern without its =.
export function patternHint(text: string): string {
  const m = /^pattern\s+([A-Za-z][A-Za-z0-9]*)\s*([^{=]*)/.exec(text)
  const len = lengthPrefix((m?.[2] || "").trim())
  const size = len.has ? `${fmt(len.bars)} bars ` : ""
  return `A pattern gets its name with =: pattern ${m?.[1] || "groove"} = ${size}{ ... }`
}

// pattern name = { ... }, = 3 bars { ... }, = intro verse: a pattern with a name. `value`
// is what follows the =. A length in front is the pattern's own.
function namedBlock(name: string, value: Piece[], ln: number): Section {
  const len = lengthIn(value)
  const only = onlyBraces(len.rest)
  if (only) return { name, ln, lines: only.lines, bars: len.bars, has: len.has }
  if (len.has && TRACK_RE.test(headOf(len.rest))) {
    return { name, ln, lines: [{ ln, parts: len.rest }], bars: len.bars, has: true }
  }
  // A length in front of anything else measures that, not the pattern: 8 bars loop verse
  return { name, ln, lines: [{ ln, parts: value }], bars: 0, has: false }
}

export function checkBars(bars: number, ln: number, err: Report): boolean {
  if (bars > 0 && bars <= MAX_BARS) return true
  err(ln, `A length is a number of bars up to ${MAX_BARS}, e.g. 3 bars`)
  return false
}

// steps name = ^-x-, chords name = Am E7|G D: steps or chords to hand to an instrument.
// What's written has to be the type that's declared.
export function defineWord(
  type: Type,
  name: string,
  parts: Piece[],
  ln: number,
  state: State,
  err: Report,
): void {
  // The value as text, for what's read as text and for messages
  const value = textOf(parts)
  const braces = bracesIn(parts)
  const problem = new Scope(state).problem(type, name, value)
  if (problem) return err(ln, problem)
  if (type === "notes") {
    // notes riff = E---F# E-E--: one line of notes, drawn on the steps, with any lengths
    // written out as the steps they hold
    if (braces.length) return err(ln, NOTES_BLOCK)
    const notes = noteParts(value, state, err, ln, null)
    if (!notes) return
    if (notes.open) {
      return err(
        ln,
        `A name's notes have a length of their own. ... is the rest of a block, so it goes on the instrument's line: piano: ${name}, ...rest`,
      )
    }
    const tokens: string[] = []
    for (const t of notes.tokens) {
      const w = state.words[t]
      if (w && w.type !== "notes") {
        return err(ln, `${t} is ${w.type}, so it can't go in notes`)
      } else if (w) tokens.push(...w.tokens)
      else if (noteSteps(t) && spacedNotes(t)) return err(ln, notesTouch(t, spacedNotes(t)!))
      else if (t === "|" || noteSteps(t)) tokens.push(t)
      else if (isStepRun(t)) {
        return err(
          ln,
          `"${t}" is steps, and ${name} is notes. For steps, write steps ${name} = ${value}`,
        )
      } else return err(ln, notNotes(t, state, "guitar", `chords ${name} = ${value}`))
    }
    if (!tokens.length) return err(ln, `notes ${name} = needs something after the =`)
    new Scope(state).defineWord(name, { type, tokens, line: ln })
    return
  }
  // Steps can be written with lengths (2 beats rest, dd), which come back as steps
  let written: string[]
  if (braces.length) {
    // steps ghosts = { ... }: a block of steps is steps. Chords are never in a block.
    if (type !== "steps") return err(ln, CHORDS_BLOCK)
    const only = onlyBraces(parts)
    if (!only) {
      const fig = name === "fig" ? "part" : "fig"
      return err(
        ln,
        blockBeside(`${name} holds`, (f: string) => `steps ${name} = x--- ${f}`, fig),
      )
    }
    const run = stepBlock(only, state, err)
    if (run == null) return
    new Scope(state).defineWord(name, { type, tokens: [run], line: ln })
    return
  }
  if (type === "steps") {
    const steps = stepParts(value, state, err, ln)
    if (!steps) return
    if (steps.toEnd) {
      return err(
        ln,
        `A name's steps have a length of their own. ... is the rest of a block, so it goes on the drum's line: snare: ${name}, ...rest`,
      )
    }
    written = steps.tokens
  } else written = tokenize(value)
  if (type === "steps" && listsBeats(written)) {
    // steps backbeat = 2 4: beats, as steps
    const run = beatsAsSteps({ name, art: "hit", ln }, written, state, err)
    if (run == null) return
    // A list of beats is a bar long by type, so it's never a repeat of a shorter figure
    new Scope(state).defineWord(name, { type, tokens: [run], line: ln, beats: true })
    return
  }
  const key = keyOf(state)!
  const tokens: string[] = []
  for (const t of written) {
    const w = state.words[t]
    if (w && w.type !== type) return err(ln, `${t} is ${w.type}, so it can't go in ${type}`)
    else if (w) tokens.push(...(type === "steps" ? w.tokens : ["|", ...w.tokens, "|"]))
    else if (state.sections[t]) {
      return err(ln, `${t} is a pattern, so it can't go in ${type}`)
    } else if (
      type === "steps"
        ? isStepRun(t) || t === "|"
        : CHORD_MARKS.includes(t) || buildChord(t, key, 3, true)
    ) {
      tokens.push(t)
    } else if (NAME_LIKE.test(t) && !isRoman(t) && !/^[-xd]+$/.test(t)) {
      return err(ln, `"${t}" isn't defined above. Name it first: ${type} ${t} = ...`)
    } else if (type === "chords" && isOf(t)) {
      const of = ofChord(t, key, state.octave)
      if (of.error) return err(ln, of.error)
      tokens.push(t)
    } else if (drawsNotes(t)) {
      return err(
        ln,
        `"${t}" is notes, and ${name} is ${type}. For notes, write notes ${name} = ${spaceNotes(value)}`,
      )
    } else if (type === "steps") {
      return err(
        ln,
        buildChord(t, key)
          ? `"${t}" is a chord, and ${name} is steps. For chords, write chords ${name} = ${value}`
          : `"${t}" isn't a step. ${STEP_HELP}`,
      )
    } else {
      return err(
        ln,
        isStepRun(t)
          ? `"${t}" is steps, and ${name} is chords. For steps, write steps ${name} = ${value}`
          : dimMarkProblem(t) || `"${t}" isn't a chord I know`,
      )
    }
  }
  if (!tokens.length) return err(ln, `${type} ${name} = needs something after the =`)
  const again = type === "chords" && chartRepeat(tokens)
  if (again) {
    return err(
      ln,
      `${name} repeats ${again}. Write chords ${name} = ${again}: a pattern repeats it`,
    )
  }
  new Scope(state).defineWord(name, { type, tokens, line: ln })
}

// name = value, with or without a type in front. null if the line isn't one.
export function readDecl(
  parts: Piece[],
): { type: string | null; name: string; value: Piece[] } | null {
  const head = headOf(parts)
  const typed = TYPED_RE.exec(head)
  if (typed) return { type: typed[1], name: typed[2], value: withHead(parts, typed[3]) }
  const def = DEF_RE.exec(head)
  return def ? { type: null, name: def[1], value: withHead(parts, def[2]) } : null
}

// Whether a value is written as a pattern: braces, a length, or an instrument's line.
export function patternText(parts: Piece[]): boolean {
  const value = textOf(parts)
  const len = lengthPrefix(value)
  if (len.has || /[{(]/.test(withoutOf(len.rest)) || PLACE_RE.test(value) || EVERY_RE.test(value))
    return true
  const track = TRACK_RE.exec(value)
  return !!track && !/\s/.test(track[1])
}

// Whether a token can be part of steps: a step run, a name of steps, a beat, a bar line,
// or a block of steps.
function stepsToken(t: Piece, st: State): boolean {
  if (isBraces(t)) return holdsSteps(t, st)
  return isStepRun(t) || st.words[t]?.type === "steps" || BEAT_RE.test(t) || t === "|" || t === "%"
}

// Whether everything in a block is steps (or beats, or names of steps): a drum's layers.
function holdsSteps(block: Braces, st: State): boolean {
  return block.lines.every((l) => pieces(l.parts).every((t) => stepsToken(t, st)))
}

// What a value is, from how it's written: a pattern (braces, a length, an instrument's
// line, or other patterns' names), steps, notes or chords. Braces holding steps are steps.
function shapeOf(value: Piece[], st: State): Shape {
  // A length in front of rest or steps is steps: 2 beats rest, dd. So are hits spread
  // over steps: 3 in 8
  const drawn = (part: Piece[]) => pieces(part).every((t) => stepsToken(t, st))
  const measured = (part: Piece[]) => {
    if (!bracesIn(part).length && EUCLID_RE.test(textOf(part))) return true
    const len = lengthAt(headOf(part))
    if (!len) return false
    const thing = withHead(part, len.thing)
    return len.thing === "rest" ? thing.length === 1 : thing.length > 0 && drawn(thing)
  }
  const parts = commaGroups(value)
  if (parts.some(measured) && parts.every((p) => measured(p) || drawn(p))) return "steps"
  const tokens = pieces(value)
  // The words, without the blocks, which are never chords or notes
  const words = tokens.filter((t): t is string => !isBraces(t))
  const all = (test: (t: string) => unknown) => words.length === tokens.length && words.every(test)
  const stepsLike = tokens.every((t) => stepsToken(t, st))
  if (stepsLike && tokens.some(isBraces)) return "steps"
  if (patternText(value)) return "pattern"
  // Beats, which are steps written by where they hit: -|3 dd
  if (stepsLike && words.some((t) => BEAT_RE.test(t))) return "steps"
  if (words.some((t) => st.sections[t])) return "pattern"
  const key = keyOf(st)!
  const steps = all((t) => isStepRun(t) || t === "|" || st.words[t]?.type === "steps")
  const chords = all(
    (t) => CHORD_MARKS.includes(t) || st.words[t]?.type === "chords" || buildChord(t, key),
  )
  // Only rests and bar lines are both (- - | -), and they're steps.
  if (steps && chords) return "steps"
  if (steps || chords) return steps ? "steps" : "chords"
  // Letters on their own (F G) read as a chart above; with - or _ among them, as notes.
  const notes = all((t) => t === "|" || noteSteps(t) || st.words[t]?.type === "notes")
  return notes ? "notes" : "pattern"
}

// Names a pattern (pattern name = { ... }) in `st`, the state of the block it's written
// in. Returns the pattern, or null if the name or length is a mistake.
export function defineBlock(l: DeclLine, st: State, err: Report): Section | null {
  const problem = new Scope(st).problem("pattern", l.name, "{")
  if (problem) {
    err(l.ln, problem)
    return null
  }
  const sec = namedBlock(l.name, l.value, l.ln)
  if (sec.has && !checkBars(sec.bars, l.ln, err)) return null
  new Scope(st).definePattern(sec)
  return sec
}

// A declaration, sorted into a word (steps or chords) or a named pattern ("blockdef").
// Reports a missing type, or a value that isn't the type it says, and returns null for
// mistakes that leave nothing to define.
export function classifyDecl(
  { type, name, value: parts }: { type: string | null; name: string; value: Piece[] },
  ln: number,
  err: Report,
  st: State,
): DeclLine | null {
  // The value as text, for what's read as text and for messages, with its blocks as { ... }
  const value = textOf(parts)
  const braces = bracesIn(parts)
  const lower = name.toLowerCase()
  if (!type && among(TYPES, lower)) {
    err(
      ln,
      `${lower} needs a name after it: ${lower} ${lower === "pattern" ? "groove" : "riff"} = ...`,
    )
    return null
  }
  if (!value) {
    err(ln, `${type ? type + " " : ""}${name} = needs something after the =`)
    return null
  }
  if (type && type !== "pattern" && /^with(\s|\{|$)/.test(value)) {
    // chords verse = with key E { ... }: a with holds what plays, which a value doesn't
    err(ln, `A with's block plays, so it goes around a line or a play, not after ${type} ${name} =`)
    return null
  }
  const shape = shapeOf(parts, st)
  // How the value reads in a message
  let shown = value.replace(/\s+/g, " ")
  if (shape === "notes") shown = spaceNotes(shown)
  if (!type) {
    if (!patternText(parts)) {
      if (among(SETTINGS, lower)) {
        err(ln, `${lower} is a setting, not a name, so it takes no =: set ${lower} ${value}`)
        return null
      }
      if (evalNumber(value)) {
        // A number can only be a setting, so this is a misspelt or made-up one.
        const best = closest(lower, SETTINGS)
        err(
          ln,
          best[1] <= 2
            ? `"${name}" isn't a setting. Did you mean set ${best[0]}?`
            : `"${name}" isn't a setting. Settings: ${SETTINGS.join(", ")}`,
        )
        return null
      }
    }
    const problem = nameProblem(name, value)
    if (problem) {
      err(ln, problem)
      return null
    }
    // The name still gets defined, so one missing type is one message.
    err(ln, `Say what ${name} is. Put its type in front: ${shape} ${name} = ${shown}`)
    type = shape
  } else if (type === "pattern" && shape !== "pattern") {
    const line = (
      { steps: "kick: ", notes: "guitar: notes ", chords: "piano: chords " } as Record<
        string,
        string
      >
    )[shape]
    err(
      ln,
      `${shown} is ${shape}, not a pattern. Write ${shape} ${name} = ${shown}, ` +
        `or give them an instrument: pattern ${name} = ${line}${shown}`,
    )
    return null
  } else if (
    (type === "chords" || type === "notes") &&
    !lengthPrefix(value).has &&
    braces.length > 0 &&
    braces.every((b) => !b.lines.some((l) => TRACK_RE.test(headOf(l.parts))))
  ) {
    // chords verse = { ... } holding chords, not instruments' lines
    err(ln, type === "chords" ? CHORDS_BLOCK : NOTES_BLOCK)
    return null
  } else if (
    type !== shape &&
    (type === "notes"
      ? /[{(]/.test(withoutOf(value)) ||
        PLACE_RE.test(value) ||
        EVERY_RE.test(value) ||
        TRACK_RE.test(value)
      : patternText(parts))
  ) {
    // Anything else that isn't the declared type is said more exactly by defineWord. A
    // length is notes too (notes gap = 1 bars rest), so only braces and lines say pattern.
    err(ln, `That's a pattern, not ${type}. Write pattern ${name} = ...`)
    return null
  }
  return type === "pattern"
    ? { kind: "blockdef", ln, name, value: parts }
    : { kind: "word", ln, type: type as Type, name, value: parts }
}
