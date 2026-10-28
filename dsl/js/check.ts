/* Types where names are used. LINE_TAKES says what each kind of line takes, and misplaced
   says why a name of another type can't go there. Every line's reader asks here, so this
   table is the one place that says which type goes where: a new type is a row in it. */
import { unhandled } from "./syntax.ts"
import type { Type } from "./vocab.ts"

// The kinds of line a name can be used on
export type LineKind = "drum" | "pitched" | "chart" | "own"

// What each kind of line takes: a drum's line steps, an instrument's line notes, a chart
// (after chords) chords, and a line of its own patterns.
export const LINE_TAKES = {
  drum: "steps",
  pitched: "notes",
  chart: "chords",
  own: "pattern",
} as const satisfies Record<LineKind, Type>

// Where a name is used: the kind of line, and what a message needs to say about it
export type Use =
  | { line: "drum"; part?: string; layer?: boolean; beats?: boolean }
  | { line: "pitched"; part: string; text: string; chart: boolean }
  | { line: "chart" }
  | { line: "own" }

// Where a name of each type goes, for a message that sends it there
const ownLine = (name: string) =>
  `${name} is a pattern, so it goes on a line of its own, not on an instrument's line`

// Why `name`, which is `type`, can't be used where `use` says, or null when it can.
export function misplaced(name: string, type: Type, use: Use): string | null {
  // Beats are hits counted in a bar, so no name goes in a list of them
  if (use.line === "drum" && use.beats) {
    return type === "pattern"
      ? ownLine(name)
      : `${name} is ${type}, which don't go in a list of beats`
  }
  if (LINE_TAKES[use.line] === type) return null
  switch (use.line) {
    case "drum":
      if (use.layer)
        return `${name} is ${type === "pattern" ? "a pattern" : type}, so it can't be a layer of steps`
      if (type === "pattern") return ownLine(name)
      return `${name} is ${type}, so it goes on a line like piano: ${type} ${name}, not on a drum's`
    case "pitched":
      if (type === "steps")
        return `${name} is steps, so it goes on a drum's line, not on ${use.part}'s`
      if (type === "chords") {
        return use.chart
          ? `${name} is chords, so chords goes in front of it: ${use.part}: chords ${use.text}`
          : `${name} is chords, and the rest of this line is notes. A line plays one or the other`
      }
      if (type === "notes")
        return `${name} is notes, so notes goes in front of it: ${use.part}: notes ${name}`
      return ownLine(name)
    case "chart":
      if (type === "steps") return `${name} is steps, so it goes on a drum's line, not among chords`
      if (type === "notes") {
        return `${name} is notes, and the rest of this line is chords. A line plays one or the other`
      }
      return ownLine(name)
    case "own":
      if (type === "steps") return `${name} is steps, so it goes on a drum's line: hat: ${name}`
      return `${name} is ${type}, so it goes on an instrument's line: piano: ${type} ${name}`
    default:
      return unhandled(use)
  }
}
