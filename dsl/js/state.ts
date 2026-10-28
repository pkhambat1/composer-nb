/* A cell's state: its settings and the names it has, as the engine carries them from line to
   line, into blocks, and from cell to cell. Also the shapes the engine reads a cell into:
   a line, which holds its text and the blocks written in it, in order, and a named pattern. */
import { TPQ, timeLabel, type Timing } from "./time.ts"
import type { Setting, Type } from "./vocab.ts"

// A name of steps, sticking, notes or chords, and what it holds, as tokens
export type Word = {
  type: Type
  tokens: string[]
  line: number
  beats?: boolean // it holds beats (snare: 2 4), which may be written once in a pattern
  above?: boolean // it came from a cell above, so this cell can define it again
}

// A block written in a line: its own lines. { kick: x--- } in play { kick: x--- }
export type Braces = { kind: "braces"; ln: number; lines: Line[] }
// What a line holds, in order: text as it was written, and the blocks written in it
export type Piece = string | Braces

// One line as the engine reads it (parts.ts reads its parts). A line that plays keeps the
// state it plays with in `st`.
export type Line = { ln: number; parts: Piece[]; st?: State }

// A pattern with a name: its lines and the length written in front of it, if any
export type Section = {
  name: string
  ln: number
  lines: Line[]
  bars: number
  has: boolean // whether a length was written in front
  above?: boolean // it came from a cell above, so this cell can define it again
  names?: { words: Record<string, Word>; sections: Record<string, Section> } // where it was written
}

export type State = Timing & {
  transpose: number // semitones that what's pitched sounds from what's written
  octave: number
  kit: string
  sounds: Record<string, string> // instrument → its sound, where it isn't the first one
  words: Record<string, Word> // names for steps, sticking, notes and chords
  sections: Record<string, Section> // names for patterns
}

export function initialState(): State {
  return {
    groups: [4],
    unit: 4,
    tempo: 120,
    swing: false, // whether the eighths swing
    stepTicks: TPQ / 4, // a step is a 16th note, unless every says otherwise
    key: "C", // the root degrees and numerals count from
    mode: "major", // which only changes how the music is written: its signature and spelling
    transpose: 0,
    octave: 3,
    kit: "rock",
    sounds: {},
    words: {},
    sections: {},
  }
}

// A copy that can change without changing `s`: a block's state, or the next line's
export function cloneState(s: State): State {
  return {
    ...s,
    groups: [...s.groups],
    sounds: { ...s.sounds },
    words: { ...s.words },
    sections: { ...s.sections },
  }
}

// A setting as a state has it, the way the cells below are told about it: tempo 90.
export const describe = (name: Setting, s: State) =>
  `${name} ${name === "time" ? timeLabel(s) : name === "swing" ? (s.swing ? "on" : "off") : s[name]}`
