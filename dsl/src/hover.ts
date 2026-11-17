/* Built-in help shared by editors. Looking up a word never evaluates the cell, so help
   remains available while an expression is incomplete. */
import { Lexer } from "./lexer.ts"
import type { Span } from "./syntax.ts"
import {
  INTERVALS,
  KITS,
  MODES,
  PARTS,
  PITCHED,
  SETTINGS,
  SETTING_EXAMPLE,
  SOUNDS,
} from "./vocab.ts"

export type Documentation = {
  signature: string
  description: string
  example: string
  page: string
}
const doc = (
  signature: string,
  description: string,
  example: string,
  page: string,
): Documentation => ({ signature, description, example, page })

const keywords: Record<string, Documentation> = {
  play: doc(
    "play music [for length]",
    "Plays an instrument line, a named pattern or block, or a parenthesized sequence. Each play creates one output.",
    "play piano: notes 1--- 3---",
    "language/play",
  ),
  print: doc(
    "print(value, ...)",
    "Displays the notes or chords a value means in the active key and mode, without playing audio. Bare degrees are notes; use chords to inspect harmony.",
    "print(third(1), chords fifth(1))",
    "functions/print",
  ),
  set: doc(
    "set setting value",
    "Changes a setting for the rest of this cell and the cells below it.",
    "set tempo 90",
    "language/scope#set",
  ),
  with: doc(
    "with setting value, ... { ... }",
    "Applies settings inside these braces. Settings and names defined inside stay inside.",
    "with key D, mode minor { play piano: notes 1--- }",
    "language/scope#with",
  ),
  steps: doc(
    "steps name = step words",
    "A drum rhythm: x is a hit, ^ an accent, ~ a ghost, d a double and - silence. n* repeats a word or group.",
    "steps beat = x--- --x-",
    "drums/steps",
  ),
  notes: doc(
    "notes name = note words",
    "A single voice of pitches or scale degrees. Notes, holds and rests divide each bar evenly; | starts the next bar. - sustains, _ is silence and n* repeats a word or group. Use every for fixed-step timing.",
    "play piano: notes 1 3 5 -",
    "pitched/notes",
  ),
  chords: doc(
    "chords name = chart",
    "A chart of chord symbols, scale degrees or calls. Chords split each bar evenly; | starts the next bar, - holds, _ rests and % repeats the preceding bar.",
    "play piano: chords 1 4 | 5 1",
    "pitched/chords",
  ),
  extend: doc(
    "extend(chart: chords, modifier: suffix) → chords",
    "Applies one suffix to every chord, preserving rhythm, roots and slash basses. A quality such as maj7 replaces the existing quality; add9, sus4 and alterations modify the existing tones. Accepts chords only; nest calls for successive changes.",
    "print(extend(1 2 | 5 1, add9))",
    "functions/extend",
  ),
  pattern: doc(
    "pattern name = [length] { ... }",
    "Parts sound together and their lines repeat. With no explicit length, the pattern ends when its parts line up again.",
    "pattern groove = { kick: x---, hat: x- }",
    "language/patterns#pattern",
  ),
  block: doc(
    "block name = [length] { ... }",
    "Parts sound together, each playing once. Use a block for a finite phrase or fill.",
    "play block { kick: x---, snare: --x- }",
    "language/patterns#block",
  ),
  for: doc(
    "play music for length",
    "Sets the exact length of this play's output. Music is cut off at that length; any unfilled time is silent.",
    "play pattern { kick: x--- } for 4 bars",
    "language/play#duration",
  ),
  every: doc(
    "every number beats music",
    "Sets a fixed length for drum and note steps. Beats are quarter notes. Drums normally use quarter-beat steps; notes normally divide each bar evenly. Chords keep dividing bars.",
    "play block { every 1/3 beats { hat: x } }",
    "language/patterns#every",
  ),
  on: doc(
    "music on bar first [to last]",
    "Places a part at a bar within a containing pattern or block. Bar numbers start at 1.",
    "play block { block { crash: x } on bar 2 }",
    "language/patterns#on-bar",
  ),
  bar: doc(
    "music on bar first [to last]",
    "The bar at which a placed part starts, counted from 1 inside its containing block.",
    "play block { block { crash: x } on bar 2 }",
    "language/patterns#on-bar",
  ),
  to: doc(
    "on bar first to last",
    "Includes every bar from the first through the last in a placement.",
    "play block { pattern { hat: x- } on bar 2 to 4 }",
    "language/patterns#on-bar",
  ),
  bars: doc(
    "number bars",
    "A length measured in the current time signature. Always plural, including 1 bars. Lengths may use arithmetic.",
    "play pattern { kick: x--- } for 2 bars",
    "language/expressions#lengths",
  ),
  beats: doc(
    "every number beats music",
    "Quarter-note beats, independent of the time signature. Fractions such as 1/3 create tuplets.",
    "play block { every 1/3 beats { hat: x } }",
    "language/expressions#lengths",
  ),
  over: doc(
    "set time numerator over denominator",
    "Separates the number of beats in a time signature from the note value counted. The numerator may group beats with +.",
    "set time 3+4 over 8",
    "language/settings#time",
  ),
  in: doc(
    "hits in steps",
    "Spreads this many drum hits as evenly as possible across this many steps, up to 64 steps.",
    "play kick: 3 in 8",
    "drums/steps#euclidean-rhythms",
  ),
  rest: doc(
    "- / _",
    "Reserved word. Write - for drum silence, _ for note or chord silence, and - to sustain a note or chord.",
    "play piano: notes 1--- ____",
    "pitched/notes",
  ),
}

const settings: Record<(typeof SETTINGS)[number], string> = {
  time: "Time signature: a positive beat count over 1, 2, 4, 8 or 16. Use + to group beats.",
  tempo: "Quarter notes per minute, from 20 to 400.",
  swing: "on delays the off-beat eighths to a triplet feel; off plays them evenly.",
  key: "The tonic note, A to G with an optional # or b. Set the mode separately.",
  mode: `The scale used for degrees and interval functions: ${MODES.join(", ")}.`,
  transpose:
    "Playback transposition in semitones, from -12 to 12. Written pitches and interval calculations keep their meaning.",
  octave:
    "The default octave for notes without an explicit register, from 1 to 6. This setting is separate from the octave(...) function.",
  kit: `The drum sound set: ${KITS.join(" or ")}.`,
}

export function documentation(word: string, asSetting = false): Documentation | null {
  if (Object.hasOwn(INTERVALS, word) && !asSetting) {
    const distance = INTERVALS[word as keyof typeof INTERVALS] - 1
    const octaves = Math.floor(distance / 7)
    const steps = distance % 7
    const movement =
      [
        octaves && `${octaves} octave${octaves === 1 ? "" : "s"}`,
        steps && `${steps} scale position${steps === 1 ? "" : "s"}`,
      ]
        .filter(Boolean)
        .join(" and ") || "zero scale positions"
    return doc(
      `${word}(value: notes | chords, count: integer = 1) → notes | chords`,
      `Moves every pitch up by ${movement} in the active key and mode, preserving rhythm. count is an integer from -64 to 64; negative counts move down and 0 leaves pitches unchanged. Chords move tone by tone.`,
      `print(${word}(1), ${word}(1, -1))`,
      "functions/intervals",
    )
  }
  if (Object.hasOwn(settings, word)) {
    const name = word as keyof typeof settings
    return doc(
      `set ${name} ${SETTING_EXAMPLE[name]}`,
      settings[name],
      `set ${name} ${SETTING_EXAMPLE[name]}`,
      `language/settings#${name}`,
    )
  }
  if (Object.hasOwn(keywords, word)) return keywords[word]
  if (PARTS.includes(word)) {
    const pitched = (PITCHED as readonly string[]).includes(word)
    const sounds = SOUNDS[word as keyof typeof SOUNDS]
    return doc(
      `${word}: ${pitched ? "notes | chords" : "steps"}`,
      pitched
        ? `Plays notes or chords. Say which type after the colon.${sounds ? ` Sounds: ${sounds.join(", ")}.` : ""}`
        : "A drum lane. Draw hits with x, accents with ^, doubles with d and silence with -. Each drum has one line; put layers inside braces.",
      `play ${word}: ${pitched ? "notes 1--- 3---" : "x--- --x-"}`,
      pitched ? "pitched/instruments" : "drums/kit",
    )
  }
  return null
}

export function hoverAt(
  source: string,
  line: number,
  col: number,
): (Documentation & { span: Span }) | null {
  const token = Lexer.tokens(source).find(
    (t) => t.kind === "text" && t.span.line === line && t.span.col <= col && col < t.span.endCol,
  )
  if (!token) return null
  for (const m of token.text.matchAll(/[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*/g)) {
    const start = token.span.col + m.index!
    if (col < start || col >= start + m[0].length) continue
    // A keyword embedded in a larger token (thirdish, 3third) isn't that built-in.
    if (m.index! > 0 && /[A-Za-z0-9_]/.test(token.text[m.index! - 1])) return null
    const before = token.text.slice(0, m.index!)
    const asSetting =
      /\b(?:set|with)\s*$/.test(before) || (/\bwith\b/.test(before) && /,\s*$/.test(before))
    const help = documentation(m[0], asSetting)
    return (
      help && { ...help, span: { line, col: start, endLine: line, endCol: start + m[0].length } }
    )
  }
  return null
}
