/* Types where names are used. LINE_TAKES says what each kind of line takes, and misplaced
   says why a name of another type can't go there. Every line's reader asks here, so this
   table is the one place that says which type goes where: a new type is a row in it. */
import { message } from "./diagnostics.ts"
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

// Why `name`, which is `type`, can't be used where `use` says, or null when it can.
export function misplaced(name: string, type: Type, use: Use): string | null {
  // Beats are hits counted in a bar, so no name goes in a list of them
  if (use.line === "drum" && use.beats) {
    return type === "pattern" || type === "block"
      ? message("misplaced.ownLine", { name, type })
      : message("misplaced.beats", { name, type })
  }
  if (LINE_TAKES[use.line] === type || (use.line === "own" && type === "block")) return null
  switch (use.line) {
    case "drum":
      if (use.layer) return message("misplaced.layer", { name, type })
      if (type === "pattern" || type === "block")
        return message("misplaced.ownLine", { name, type })
      return message("misplaced.drum", { name, type })
    case "pitched":
      if (type === "steps") return message("misplaced.stepsOnPitched", { name, part: use.part })
      if (type === "chords") {
        return use.chart
          ? message("misplaced.chordsInFront", { name, part: use.part, text: use.text })
          : message("misplaced.chordsAmongNotes", { name })
      }
      if (type === "notes") return message("misplaced.notesInFront", { name, part: use.part })
      return message("misplaced.ownLine", { name, type })
    case "chart":
      if (type === "steps") return message("misplaced.stepsAmongChords", { name })
      if (type === "notes") return message("misplaced.notesAmongChords", { name })
      return message("misplaced.ownLine", { name, type })
    case "own":
      if (type === "steps") return message("misplaced.stepsOnOwn", { name })
      return message("misplaced.onInstrument", { name, type })
    default:
      return unhandled(use)
  }
}
