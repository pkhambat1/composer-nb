/* Declarations: name = value, with its type in front. A declaration's value is read as
   the type it says (steps, sticking, notes, chords) and defined in its scope, or, for a
   pattern, kept as lines to play where it's played. A value that isn't the type it says,
   or a missing type, is said here. */
import { buildChord, isRoman } from "./chords.js"
import { blockBeside } from "./eval.ts"
import { EVERY_RE, PLACE_RE, TRACK_RE, TYPED_RE, DEF_RE, type DeclLine } from "./lines.ts"
import { closest, NAME_LIKE, nameProblem, Scope } from "./resolve.ts"
import { keyOf } from "./settings.ts"
import type { LineBlock, Section, State } from "./state.ts"
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
  STICKING_HELP,
  STICKING_RE,
  tokenize,
  type Blocks,
} from "./values/steps.ts"
import { SETTINGS, TYPES, type Type } from "./vocab.ts"

// What a value reads as, from how it's written
type Shape = "steps" | "sticking" | "notes" | "chords" | "pattern"
const among = (list: readonly string[], word: string) => list.includes(word)

// A block written inside a line: {#1} on the line, and the block in the line's `blocks`.
export const BLOCK_KEY = /^\{#\d+\}$/
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
// is what follows the =, with its blocks already read (as {#1}, kept in `blocks`). A
// length in front is the pattern's own.
function namedBlock(name: string, value: string, ln: number, blocks: Blocks): Section {
  const len = lengthPrefix(value)
  const only = /^\{#\d+\}$/.exec(len.rest)
  if (only && blocks?.[only[0]]) {
    return { name, ln, lines: blocks[only[0]].lines, bars: len.bars, has: len.has }
  }
  if (len.has && TRACK_RE.test(len.rest)) {
    return { name, ln, lines: [{ ln, text: len.rest }], bars: len.bars, has: true }
  }
  // A length in front of anything else measures that, not the pattern: 8 bars loop verse
  return { name, ln, lines: [{ ln, text: value, blocks }], bars: 0, has: false }
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
  value: string,
  ln: number,
  state: State,
  err: Report,
  blocks: Blocks = null,
): void {
  const problem = new Scope(state).problem(type, name, value)
  if (problem) return err(ln, problem)
  if (type === "sticking") {
    // sticking para = RLRR LRLL: a hand for each step
    const tokens: string[] = []
    for (const t of tokenize(value)) {
      const w = state.words[t]
      if (t === "|" || STICKING_RE.test(t)) tokens.push(t)
      else if (w?.type === "sticking") tokens.push(...w.tokens)
      else if (w) return err(ln, `${t} is ${w.type}, so it can't go in a sticking`)
      else return err(ln, `"${t}" isn't a sticking. ${STICKING_HELP}`)
    }
    if (!tokens.length) return err(ln, `sticking ${name} = needs something after the =`)
    new Scope(state).defineWord(name, { type, tokens, line: ln })
    return
  }
  if (type === "notes") {
    // notes riff = E---F# E-E--: one line of notes, drawn on the steps, with any lengths
    // written out as the steps they hold
    const parts = noteParts(value, state, err, ln, null)
    if (!parts) return
    if (parts.open) {
      return err(
        ln,
        `A name's notes have a length of their own. ... is the rest of a block, so it goes on the instrument's line: piano: ${name}, ...rest`,
      )
    }
    const tokens: string[] = []
    for (const t of parts.tokens) {
      const w = state.words[t]
      if (blocks?.[t]) return err(ln, NOTES_BLOCK)
      else if (w && w.type !== "notes") {
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
  if (type === "steps") {
    if (blocks && !BLOCK_KEY.test(value.trim())) {
      const fig = name === "fig" ? "part" : "fig"
      return err(
        ln,
        blockBeside(`${name} holds`, (f: string) => `steps ${name} = x--- ${f}`, fig),
      )
    }
    const parts = stepParts(value, blocks, state, err, ln)
    if (!parts) return
    if (parts.toEnd) {
      return err(
        ln,
        `A name's steps have a length of their own. ... is the rest of a block, so it goes on the drum's line: snare: ${name}, ...rest`,
      )
    }
    written = parts.tokens
  } else written = tokenize(value)
  if (type === "steps" && listsBeats(written)) {
    // steps backbeat = 2 4: beats, as steps
    const run = beatsAsSteps({ name, art: "hit", ln, blocks }, written, state, err)
    if (run == null) return
    // A list of beats is a bar long by type, so it's never a repeat of a shorter figure
    new Scope(state).defineWord(name, { type, tokens: [run], line: ln, beats: true })
    return
  }
  const key = keyOf(state)!
  const tokens: string[] = []
  for (const t of written) {
    const w = state.words[t]
    if (blocks?.[t]) {
      // steps ghosts = { ... }: a block of steps is steps
      if (type !== "steps") return err(ln, CHORDS_BLOCK)
      const run = stepBlock(blocks[t]!, state, err)
      if (run == null) return
      tokens.push(run)
    } else if (w && w.type !== type) return err(ln, `${t} is ${w.type}, so it can't go in ${type}`)
    else if (w) tokens.push(...(type === "steps" ? w.tokens : ["|", ...w.tokens, "|"]))
    else if (state.sections[t]) {
      return err(ln, `${t} is a pattern, so it can't go in ${type}`)
    } else if (
      type === "steps" ? isStepRun(t) || t === "|" : CHORD_MARKS.includes(t) || buildChord(t, key)
    ) {
      tokens.push(t)
    } else if (NAME_LIKE.test(t) && !isRoman(t) && !/^[-xd]+$/.test(t)) {
      return err(ln, `"${t}" isn't defined above. Name it first: ${type} ${t} = ...`)
    } else if (type === "chords" && t.includes("@")) {
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
  text: string,
): { type: string | null; name: string; value: string } | null {
  const typed = TYPED_RE.exec(text)
  if (typed) return { type: typed[1], name: typed[2], value: typed[3].trim() }
  const def = DEF_RE.exec(text)
  return def ? { type: null, name: def[1], value: def[2].trim() } : null
}

// Whether a value is written as a pattern: braces, a length, or an instrument's line.
export function patternText(value: string): boolean {
  const len = lengthPrefix(value)
  if (len.has || /[{(]/.test(len.rest) || PLACE_RE.test(value) || EVERY_RE.test(value)) return true
  const track = TRACK_RE.exec(value)
  return !!track && !/\s/.test(track[1])
}

// Whether a token can be part of steps: a step run, a name of steps, a beat, a bar line,
// or a block of steps.
function stepsToken(t: string, st: State, blocks: Blocks): boolean {
  const block = blocks?.[t]
  if (block) return holdsSteps(block, st)
  return isStepRun(t) || st.words[t]?.type === "steps" || BEAT_RE.test(t) || t === "|" || t === "%"
}

// Whether everything in a block is steps (or beats, or names of steps): a drum's layers.
function holdsSteps(block: LineBlock, st: State): boolean {
  return block.lines.every((l) => tokenize(l.text).every((t) => stepsToken(t, st, l.blocks)))
}

// What a value is, from how it's written: a pattern (braces, a length, an instrument's
// line, or other patterns' names), steps, notes or chords. Braces holding steps are steps.
function shapeOf(value: string, st: State, blocks: Blocks = null): Shape {
  // A length in front of rest or steps is steps: 2 beats rest, dd. So are hits spread
  // over steps: 3 in 8
  const drawn = (text: string) => tokenize(text).every((t) => stepsToken(t, st, blocks))
  const measured = (text: string) => {
    if (EUCLID_RE.test(text)) return true
    const len = lengthAt(text)
    return !!len && (len.thing === "rest" || (len.thing !== "" && drawn(len.thing)))
  }
  const parts = value.split(",").map((p) => p.trim())
  if (parts.some(measured) && parts.every((p) => measured(p) || drawn(p))) return "steps"
  if (
    tokenize(value).every(
      (t) => t === "|" || STICKING_RE.test(t) || st.words[t]?.type === "sticking",
    )
  ) {
    return "sticking"
  }
  const tokens = tokenize(value)
  const stepsLike = tokens.every((t) => stepsToken(t, st, blocks))
  if (stepsLike && tokens.some((t) => blocks?.[t])) return "steps"
  if (patternText(value)) return "pattern"
  // Beats, which are steps written by where they hit: -|3 dd
  if (stepsLike && tokens.some((t) => BEAT_RE.test(t))) return "steps"
  if (tokens.some((t) => st.sections[t])) return "pattern"
  const key = keyOf(st)!
  const steps = tokens.every((t) => isStepRun(t) || t === "|" || st.words[t]?.type === "steps")
  const chords = tokens.every(
    (t) => CHORD_MARKS.includes(t) || st.words[t]?.type === "chords" || buildChord(t, key),
  )
  // Only rests and bar lines are both (- - | -), and they're steps.
  if (steps && chords) return "steps"
  if (steps || chords) return steps ? "steps" : "chords"
  // Letters on their own (F G) read as a chart above; with - or _ among them, as notes.
  const notes = tokens.every((t) => t === "|" || noteSteps(t) || st.words[t]?.type === "notes")
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
  const sec = namedBlock(l.name, l.value, l.ln, l.blocks)
  if (sec.has && !checkBars(sec.bars, l.ln, err)) return null
  new Scope(st).definePattern(sec)
  return sec
}

// A declaration, sorted into a word (steps or chords) or a named pattern ("blockdef").
// Reports a missing type, or a value that isn't the type it says, and returns null for
// mistakes that leave nothing to define.
export function classifyDecl(
  { type, name, value }: { type: string | null; name: string; value: string },
  { ln, blocks }: { ln: number; blocks?: Blocks },
  err: Report,
  st: State,
): DeclLine | null {
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
  const shape = shapeOf(value, st, blocks)
  // How the value reads in a message, with its blocks as { ... }
  let shown = value.replace(/\{#\d+\}/g, "{ ... }").replace(/\s+/g, " ")
  if (shape === "notes") shown = spaceNotes(shown)
  if (!type) {
    if (!patternText(value)) {
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
      { steps: "kick: ", notes: "guitar: ", chords: "piano: chords " } as Record<string, string>
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
    tokenize(value).some((t) => blocks?.[t]) &&
    tokenize(value).every(
      (t) => !blocks?.[t] || !blocks[t]!.lines.some((l) => TRACK_RE.test(l.text)),
    )
  ) {
    // chords verse = { ... } holding chords, not instruments' lines
    err(ln, type === "chords" ? CHORDS_BLOCK : NOTES_BLOCK)
    return null
  } else if (
    type !== shape &&
    (type === "notes"
      ? /[{(]/.test(value) || PLACE_RE.test(value) || EVERY_RE.test(value) || TRACK_RE.test(value)
      : patternText(value))
  ) {
    // Anything else that isn't the declared type is said more exactly by defineWord. A
    // length is notes too (notes gap = 1 bars rest), so only braces and lines say pattern.
    err(ln, `That's a pattern, not ${type}. Write pattern ${name} = ...`)
    return null
  }
  return type === "pattern"
    ? { kind: "blockdef", ln, name, value, blocks }
    : { kind: "word", ln, type: type as Type, name, value, blocks }
}
