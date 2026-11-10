/* Scale-relative interval calls. Parsing keeps the argument symbolic: a named
   phrase is evaluated in the key and mode where it plays, not where it was named. */
import { letterStep, midiToName, type Key } from "./chords.ts"
import { INTERVALS } from "./vocab.ts"

export type IntervalCall = {
  name: keyof typeof INTERVALS
  body: string
  count: number
  end: number
  prefix: string
}
export type CallResult = { call: IntervalCall; error?: never } | { error: string; call?: never }

// Split only outside parentheses; commas inside a call belong to that call.
export function splitOutside(text: string, separator: string): string[] {
  const parts: string[] = []
  let start = 0
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++
    else if (text[i] === ")") depth--
    else if (text[i] === separator && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

export const isIntervalCall = (text: string) => /^[\^~]?[a-z][A-Za-z0-9]*\s*\(/.test(text)
export const OCTAVE_HELP =
  "Octave apostrophes are no longer supported. Use octave(1) to move up, octave(1, -1) to move down, or a higher degree such as 8 or 15"

// Keep calls intact when splitting a musical line, including malformed calls
// whose closing parenthesis is still being typed. The editor uses the same spans
// without changing a single character of the source.
export function callSegments(text: string): { text: string; call: boolean }[] {
  const segments: { text: string; call: boolean }[] = []
  let start = 0
  for (let i = 0; i < text.length; ) {
    const head =
      (i === 0 || /[\s,|_*(-]/.test(text[i - 1]) || text.slice(i - 3, i) === "...") &&
      /^[\^~]?([a-z][A-Za-z0-9]*)(\s*)\(/.exec(text.slice(i))
    if (!head || (head[2] && !Object.hasOwn(INTERVALS, head[1]))) {
      i++
      continue
    }
    let end = i + head[0].length
    let depth = 1
    for (; end < text.length && depth; end++) {
      if (text[end] === "(") depth++
      else if (text[end] === ")") depth--
    }
    if (start < i) segments.push({ text: text.slice(start, i), call: false })
    segments.push({ text: text.slice(i, end), call: true })
    start = i = end
  }
  if (start < text.length) segments.push({ text: text.slice(start), call: false })
  return segments
}

export function intervalCall(text: string): CallResult | null {
  const head = /^([\^~]?)([a-z][A-Za-z0-9]*)\s*\(/.exec(text)
  if (!head) return null
  const name = head[2] as keyof typeof INTERVALS
  if (!Object.hasOwn(INTERVALS, name))
    return {
      error: `"${name}" isn't an interval function. Use second(...), third(...), fourth(...), fifth(...), or octave(...)`,
    }
  let depth = 1
  let end = head[0].length
  for (; end < text.length && depth; end++) {
    if (text[end] === "(") depth++
    else if (text[end] === ")") depth--
    if (depth > 32) return { error: "Interval functions can nest at most 32 levels" }
  }
  if (depth) return { error: `${name}(...) is missing its closing )` }
  const args = splitOutside(text.slice(head[0].length, end - 1), ",")
  if (args.length > 2)
    return { error: `${name} takes a value and an optional integer count: ${name}(phrase, 2)` }
  const body = args[0].trim()
  if (!body) return { error: `${name} needs notes or chords inside its parentheses: ${name}(1)` }
  const count = args.length === 1 ? 1 : Number(args[1].trim())
  if (
    args.length === 2 &&
    (!/^[+-]?\d+$/.test(args[1].trim()) || !Number.isSafeInteger(count) || Math.abs(count) > 64)
  )
    return { error: `${name}'s count is an integer from -64 to 64: ${name}(phrase, -1)` }
  return { call: { name, body, count, end, prefix: head[1] } }
}

export const wrapInterval = (call: IntervalCall, value: string) =>
  `${call.prefix}${call.name}(${value}, ${call.count})`

export function intervalSteps(call: IntervalCall, key: Key): number {
  const n = INTERVALS[call.name] - 1
  return (Math.floor(n / 7) * key.scale.length + (n % 7)) * call.count
}

const LETTERS = "CDEFGAB"
const NATURAL = [0, 2, 4, 5, 7, 9, 11]
const mod = (n: number, size: number) => ((n % size) + size) % size

// Move by scale positions, carrying any chromatic offset from the written scale
// degree. B -> F in C major; Bb -> Fb. In whole tone, a missing letter counts
// from the preceding scale degree, carrying its chromatic offset in the same way.
export function moveInScale(midi: number, spelling: string, key: Key, steps: number) {
  const source =
    /^([A-G])([#b]*)(-?\d+)$/.exec(spelling) ?? /^([A-G])([#b]*)(-?\d+)$/.exec(midiToName(midi))!
  if (steps % key.scale.length === 0) {
    const octaves = steps / key.scale.length
    return {
      midi: midi + 12 * octaves,
      name: source[1] + source[2] + (Number(source[3]) + octaves),
      spell: {
        letter: source[1],
        alter: [...source[2]].reduce((n, c) => n + (c === "#" ? 1 : -1), 0),
      },
    }
  }
  const rootLetter = LETTERS.indexOf(key.root[0])
  const position = (Number(source[3]) + 1) * 7 + LETTERS.indexOf(source[1]) - rootLetter
  const cycle = Math.floor(position / 7)
  const letter = mod(position, 7)
  const letters = key.scale.map((_, i) => letterStep(key, i + 1))
  const degree = letters.findLastIndex((l) => l <= letter)
  const alteration = midi - (cycle * 12 + key.tonicSemis + key.scale[degree])
  const target = cycle * key.scale.length + degree + steps
  const targetCycle = Math.floor(target / key.scale.length)
  const targetDegree = mod(target, key.scale.length)
  const moved = targetCycle * 12 + key.tonicSemis + key.scale[targetDegree] + alteration
  const targetLetter = targetCycle * 7 + rootLetter + letters[targetDegree]
  const index = mod(targetLetter, 7)
  const octave = Math.floor(targetLetter / 7) - 1
  const acc = moved - ((octave + 1) * 12 + NATURAL[index])
  const name = LETTERS[index] + (acc > 0 ? "#".repeat(acc) : "b".repeat(-acc)) + octave
  return { midi: moved, name, spell: { letter: LETTERS[index], alter: acc } }
}
