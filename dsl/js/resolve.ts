/* Names: what can be one, where one is defined, and what it refers to. A name is defined
   once in a cell, inside its blocks too, and a later cell may define it again. A Scope is
   where a cell's or a block's names are: the one place a name is defined, so the rules
   above can't be got round. A named pattern keeps the names it was written with, so what
   it refers to doesn't change when a later cell defines a name again: names bind where
   they're written. (Settings are different: a pattern plays with the settings where it's
   played.) */
import { buildChord, parseKey } from "./chords.ts"
import { misplaced } from "./check.ts"
import { message } from "./diagnostics.ts"
import type { Section, State, Word } from "./state.ts"
import { noteSteps } from "./values/notes.ts"
import { tokenize } from "./values/steps.ts"
import { DRUMS, KEYWORDS, LANES, PARTS, PITCHED, SETTINGS, SPLIT } from "./vocab.ts"

// A token that reads as a name: a lowercase letter, then letters and digits (riff, partA)
export const NAME_LIKE = /^[a-z][A-Za-z0-9]+$/
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii"]
// Words that already mean something
const TAKEN = new Set<string>([...SETTINGS, ...DRUMS, ...PARTS, ...KEYWORDS])
const among = (list: readonly string[], word: string) => list.includes(word)

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

  pattern(name: string): Section | undefined {
    return this.#st.sections[name]
  }

  // Why `name` can't be defined here as `type` with `value`, or null.
  problem(type: string, name: string, value: string): string | null {
    return nameProblem(name, value) || nameRule(type, name, this.#st)
  }

  // A name of steps, sticking, notes or chords
  defineWord(name: string, word: Word): void {
    delete this.#st.sections[name]
    this.#st.words[name] = word
  }

  // A named pattern, which keeps the names it was written with
  definePattern(sec: Section): void {
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

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return d[a.length][b.length]
}

export const closest = (name: string, names: readonly string[]): [string, number] =>
  names.map((n): [string, number] => [n, editDistance(name, n)]).sort((a, b) => a[1] - b[1])[0]

// For `name: value` where name isn't an instrument.
export function unknownInstrument(name: string): string {
  // The closed hi-hat is the plain one, which is what most people reach for first
  if (/^hat\.(close|closed|shut)$/.test(name)) {
    return "The closed hi-hat is hat on its own; hat.open is the open one, and hat.pedal the foot"
  }
  if (among(SPLIT, name)) {
    const lanes = LANES.filter((l) => l.startsWith(name + "."))
    return `"${name}" isn't a drum. The ${name}s are ${lanes.slice(0, -1).join(", ")} and ${lanes.at(-1)}`
  }
  if (name.includes(".")) {
    const drum = name.split(".")[0]
    if (among(PITCHED, drum)) {
      const sounds = PITCHED.filter((p) => p.startsWith(drum + "."))
      return sounds.length
        ? `"${name}" isn't an instrument. ${drum}'s other sound is ${sounds.join(", ")}`
        : `"${name}" isn't an instrument. ${drum} has one sound: ${drum}: F---G---`
    }
    const close = LANES.find((l) => l.includes(".") && editDistance(name, l) <= 2)
    if (close) return `"${name}" isn't a drum. Did you mean ${close}?`
    if (among(SPLIT, drum)) {
      const lanes = LANES.filter((l) => l.startsWith(drum + "."))
      return `"${name}" isn't a drum. The ${drum}s are ${lanes.slice(0, -1).join(", ")} and ${lanes.at(-1)}`
    }
    const second = LANES.filter((l) => l.includes(".") && !among(SPLIT, l.split(".")[0]))
    return `"${name}" isn't a drum. Drums with a second sound: ${second.join(", ")}`
  }
  const best = closest(name, PARTS)
  if (best[1] <= 2) return `"${name}" isn't an instrument. Did you mean ${best[0]}?`
  return `"${name}" isn't an instrument. Instruments: ${PARTS.join(", ")}`
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
        ? "F---G---"
        : "x--x---"
      : (chart ? "chords " : "") + value
    return `${n} is an instrument, so it takes a colon: ${n}: ${plays}`
  }
  if (TAKEN.has(n) || /^x\d+$/.test(name))
    return `${name} already means something, so pick another name`
  if (/^d\d+[ea]?$/.test(name)) return `${name} is a double on a beat, so pick another name`
  return null
}

// The rule for a name of any type: a lowercase letter, then letters and digits, with a capital
// for each new word (partA, countIn); at least two characters, since single letters are
// steps; not a numeral; and not a name already in scope, carried in from a cell above or
// not, with other capitals (partA, then parta). The message, or null.
function nameRule(type: string, name: string, st: State): string | null {
  if (!/^[a-z]/.test(name))
    return `Names start with a lowercase letter: ${type} ${name[0].toLowerCase()}${name.slice(1)}`
  if (name.length < 2) return "Names need at least two characters, because single letters are steps"
  if (among(ROMAN, name)) return `${name} is a chord, so pick another name`
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
  return twin
    ? `${name} differs from ${twin} only in its capitals, so pick another name or write ${twin}`
    : null
}

export function undefinedName(name: string, st: State): string {
  const word = st.words[name]
  if (word) {
    return misplaced(name, word.type, { line: "own" })!
  }
  // Bridge can't have been named, so the message is the rule, not how to name it
  if (!/^[a-z]/.test(name)) {
    return `"${name}" can't be a name, since names start with a lowercase letter: ${name[0].toLowerCase()}${name.slice(1)}`
  }
  const names = Object.keys(st.sections)
  return names.length
    ? `"${name}" isn't defined. Patterns so far: ${names.join(", ")}`
    : `"${name}" isn't defined. Name it first: pattern ${name} = { ... }`
}
