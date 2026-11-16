/* Names: what can be one, where one is defined, and what it refers to. A name is defined
   once in a cell, inside its blocks too, and a later cell may define it again. A Scope is
   where a cell's or a block's names are: the one place a name is defined, so the rules
   above can't be got round. A named pattern keeps the names it was written with, so what
   it refers to doesn't change when a later cell defines a name again: names bind where
   they're written. (Settings are different: a pattern plays with the settings where it's
   played.) */
import { buildChord, parseKey } from "./chords.ts"
import { misplaced } from "./check.ts"
import { closest, editDistance, message } from "./diagnostics.ts"
import type { Section, State, Word } from "./state.ts"
import { noteSteps } from "./values/notes.ts"
import { among, DRUMS, KEYWORDS, LANES, PARTS, PITCHED, SETTINGS, SPLIT } from "./vocab.ts"
import { tokenize } from "./intervals.ts"

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii"]
// Words that already mean something
const TAKEN = new Set<string>([...SETTINGS, ...DRUMS, ...PARTS, ...KEYWORDS])

// The names a cell or a block can see, and the one way to define one there.
export class Scope {
  readonly #st: State

  constructor(st: State) {
    this.#st = st
  }

  // A cell's state, from the state the cells above left: their names are marked as from
  // above, so this cell can define them again.
  static forCell(inherited: State, clone: (s: State) => State): State {
    const st = clone(inherited)
    for (const n in st.words) st.words[n] = { ...st.words[n], above: true }
    for (const n in st.sections) st.sections[n] = { ...st.sections[n], above: true }
    return st
  }

  word(name: string): Word | undefined {
    return this.#st.words[name]
  }

  section(name: string): Section | undefined {
    return this.#st.sections[name]
  }

  // Why `name` can't be defined here as `type` with `value`, or null.
  problem(type: string, name: string, value: string): string | null {
    return nameProblem(name, value) || nameRule(type, name, this.#st)
  }

  // A name of steps, notes or chords
  defineWord(name: string, word: Word): void {
    delete this.#st.sections[name]
    this.#st.words[name] = word
  }

  // A named pattern, which keeps the names it was written with
  defineSection(sec: Section): void {
    const st = this.#st
    delete st.words[sec.name]
    st.sections[sec.name] = {
      ...sec,
      names: { words: { ...st.words }, sections: { ...st.sections } },
    }
  }

  // The state a pattern plays with: the settings where it's played, and the names where it
  // was written, itself among them.
  static playing(sec: Section, at: State): State {
    if (!sec.names) return at
    return {
      ...at,
      words: sec.names.words,
      sections: { ...sec.names.sections, [sec.name]: sec },
    }
  }
}

// For `name: value` where name isn't an instrument.
export function unknownInstrument(name: string): string {
  // The closed hi-hat is the plain one, which is what most people reach for first
  if (/^hat\.(close|closed|shut)$/.test(name)) {
    return message("instrument.closedHat")
  }
  if (among(SPLIT, name)) {
    const lanes = LANES.filter((l) => l.startsWith(name + "."))
    return message("instrument.notDrumSplit", { name, drum: name, lanes })
  }
  if (name.includes(".")) {
    const drum = name.split(".")[0]
    if (among(PITCHED, drum)) {
      const sounds = PITCHED.filter((p) => p.startsWith(drum + "."))
      return sounds.length
        ? message("instrument.otherSound", { name, drum, sounds })
        : message("instrument.oneSound", { name, drum })
    }
    const close = LANES.find((l) => l.includes(".") && editDistance(name, l) <= 2)
    if (close) return message("instrument.nearDrum", { name, close })
    if (among(SPLIT, drum)) {
      const lanes = LANES.filter((l) => l.startsWith(drum + "."))
      return message("instrument.notDrumSplit", { name, drum, lanes })
    }
    const second = LANES.filter((l) => l.includes(".") && !among(SPLIT, l.split(".")[0]))
    return message("instrument.drumSounds", { name, second })
  }
  const best = closest(name, PARTS)
  if (best[1] <= 2) return message("instrument.near", { name, best: best[0] })
  return message("instrument.unknown", { name, parts: PARTS })
}

// Why `name` can't be defined, or null if it can.
export function nameProblem(name: string, value: string): string | null {
  const n = name.toLowerCase()
  if (among(PARTS, n)) {
    const pitched = among(PITCHED, n)
    // guitar = Am F: a chart, which has chords in front of it on the instrument's line
    const chart =
      pitched && tokenize(value).some((t) => !noteSteps(t) && buildChord(t, parseKey("C")))
    const plays = value.startsWith("{")
      ? pitched
        ? "notes F---G---"
        : "x--x---"
      : (chart ? "chords " : pitched ? "notes " : "") + value
    return message("name.instrument", { name: n, plays })
  }
  if (TAKEN.has(n) || /^x\d+$/.test(name)) return message("name.taken", { name })
  if (/^d\d+[ea]?$/.test(name)) return message("name.double", { name })
  return null
}

// The rule for a name of any type: a lowercase letter, then letters and digits, with a capital
// for each new word (partA, countIn); at least two characters, since single letters are
// steps; not a numeral; and not a name already in scope, carried in from a cell above or
// not, with other capitals (partA, then parta). The message, or null.
function nameRule(type: string, name: string, st: State): string | null {
  if (!/^[a-z]/.test(name))
    return message("name.lowercase", {
      type,
      fixed: `${name[0].toLowerCase()}${name.slice(1)}`,
    })
  if (name.length < 2) return message("name.tooShort")
  if (among(ROMAN, name) || /^b[1-9]\d*(?:\d|sus|add|maj|min|dim|dom|aug|m|M|b|#)*$/.test(name))
    return message("name.chord", { name })
  // A name is defined once in a cell: not again, and not inside a block when it's defined
  // outside it. A name from a cell above can be defined again here.
  const word = st.words[name] as Word | undefined
  const same = word ?? (st.sections[name] as Section | undefined)
  if (same && !same.above) {
    return message("name.defined", { name, line: word ? word.line : (same as Section).ln })
  }
  const twin = [...Object.keys(st.words), ...Object.keys(st.sections)].find(
    (n) => n !== name && n.toLowerCase() === name.toLowerCase(),
  )
  return twin ? message("name.capitals", { name, twin }) : null
}

export function undefinedName(name: string, st: State): string {
  const word = st.words[name]
  if (word) {
    return misplaced(name, word.type, { line: "own" })!
  }
  // Bridge can't have been named, so the message is the rule, not how to name it
  if (!/^[a-z]/.test(name)) {
    return message("name.cantBe", { name, fixed: `${name[0].toLowerCase()}${name.slice(1)}` })
  }
  const names = Object.keys(st.sections)
  return names.length
    ? message("name.undefinedPatterns", { name, names })
    : message("name.undefined", { name })
}
