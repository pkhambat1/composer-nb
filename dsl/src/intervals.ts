/* Scale-relative interval calls. Parsing keeps the argument symbolic: a named
   phrase is evaluated in the key and mode where it plays, not where it was named. */
import { letterStep, midiToName, type Key } from "./chords.ts"
import { message } from "./diagnostics.ts"
import { locatedTokens, tokenSources, type SourceText } from "./source.ts"
import { CHORD_TONES, INTERVALS, type ChordTone, type ToneShifts } from "./vocab.ts"

export type IntervalCall = {
  name: keyof typeof INTERVALS | "note" | "chord" | "modify" | "voice"
  body: string
  count: number
  end: number
  prefix: string
  shifts?: ToneShifts
  modifier?: string
}
export type CallResult = { call: IntervalCall; error?: never } | { error: string; call?: never }

// Split only outside parentheses; commas inside a call belong to that call.
export function splitOutside(text: string, separator: string): string[] {
  const parts: string[] = []
  let start = 0
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(" || text[i] === "{") depth++
    else if (text[i] === ")" || text[i] === "}") depth--
    else if (text[i] === separator && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

export const isIntervalCall = (text: string) => /^[\^~]?[a-z][A-Za-z0-9]*\s*\(/.test(text)

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
    if (
      !head ||
      (head[2] &&
        !Object.hasOwn(INTERVALS, head[1]) &&
        !["note", "chord", "modify", "voice"].includes(head[1]))
    ) {
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
  const name = head[2] as IntervalCall["name"]
  if (!Object.hasOwn(INTERVALS, name) && !["note", "chord", "modify", "voice"].includes(name))
    return { error: message("interval.unknown", { name }) }
  let depth = 1
  let end = head[0].length
  for (; end < text.length && depth; end++) {
    if (text[end] === "(") depth++
    else if (text[end] === ")") depth--
    if (depth > 32) return { error: message("interval.nested") }
  }
  if (depth) return { error: message("interval.unclosed", { name }) }
  const args = splitOutside(text.slice(head[0].length, end - 1), ",")
  if (name === "voice") {
    if (args.length !== 2 || !args[0].trim() || !/^\{[\s\S]*\}$/.test(args[1].trim()))
      return { error: "voice takes chords and an octave-shift object: voice(2m9, { fifth: 1 })" }
    const shifts: ToneShifts = {}
    const body = args[1].trim().slice(1, -1).trim()
    const entries = body ? body.split(",") : []
    if (entries.at(-1)?.trim() === "") entries.pop()
    for (const entry of entries) {
      const match = /^\s*([A-Za-z][A-Za-z0-9]*)\s*:\s*([+-]?\d+)\s*$/.exec(entry)
      if (!match)
        return {
          error: "Each voice shift is a chord tone and an integer number of octaves: fifth: 1",
        }
      const tone = match[1] as ChordTone
      if (!Object.hasOwn(CHORD_TONES, tone))
        return { error: `Unknown chord tone "${tone}". Use ${Object.keys(CHORD_TONES).join(", ")}` }
      if (Object.hasOwn(shifts, tone)) return { error: `voice specifies ${tone} more than once` }
      const shift = Number(match[2])
      if (!Number.isSafeInteger(shift) || Math.abs(shift) > 10)
        return {
          error:
            "A voice shift is an integer from -10 to 10 octaves; resulting pitches must fit MIDI 0 to 127",
        }
      shifts[tone] = shift
    }
    return { call: { name, body: args[0].trim(), count: 0, end, prefix: head[1], shifts } }
  }
  if (name === "note" || name === "chord" || name === "modify") {
    const expected = name === "modify" ? 2 : 1
    if (args.length !== expected || args.some((arg) => !arg.trim()))
      return {
        error:
          name === "modify"
            ? "modify takes a chord and modifiers: modify(chord(1), sus2)"
            : `${name} takes one musical value: ${name}(1)`,
      }
    const modifier = name === "modify" ? args[1].trim() : undefined
    if (
      modifier &&
      !/^(?:(?:sus[24]?|add[#b]?(?:1[0-3]|[2-9])|[#b](?:1[0-3]|[2-9])))+$/.test(modifier)
    )
      return { error: "Use chord modifiers such as sus2, sus4, add9, b5 or #11" }
    return { call: { name, body: args[0].trim(), count: 0, end, prefix: head[1], modifier } }
  }
  if (args.length > 2) return { error: message("interval.arguments", { name }) }
  const body = args[0].trim()
  if (!body) return { error: message("interval.needsValue", { name }) }
  const count = args.length === 1 ? 1 : Number(args[1].trim())
  if (
    args.length === 2 &&
    (!/^[+-]?\d+$/.test(args[1].trim()) || !Number.isSafeInteger(count) || Math.abs(count) > 64)
  )
    return { error: message("interval.count", { name }) }
  return { call: { name, body, count, end, prefix: head[1] } }
}

export const wrapInterval = (call: IntervalCall, value: string) =>
  call.name === "note" || call.name === "chord"
    ? call.prefix + value
    : call.name === "voice"
      ? `voice(${value}, { ${Object.entries(call.shifts!)
          .map(([tone, shift]) => `${tone}: ${shift}`)
          .join(", ")} })`
      : call.name === "modify"
        ? `modify(${value}, ${call.modifier})`
        : `${call.prefix}${call.name}(${value}, ${call.count})`

export function intervalSteps(call: IntervalCall, key: Key): number {
  if (
    call.name === "note" ||
    call.name === "chord" ||
    call.name === "modify" ||
    call.name === "voice"
  )
    return 0
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

export function tokenize(value: string, source?: SourceText): string[] {
  const words: string[] = []
  let word = ""
  let afterCall = false
  const flush = () => {
    if (word) words.push(word)
    word = ""
  }
  for (const segment of callSegments(value)) {
    if (segment.call) {
      flush()
      word = segment.text
      afterCall = true
      continue
    }
    for (const c of segment.text) {
      if (afterCall && /[-_]/.test(c)) flush()
      afterCall = false
      if (/[\s,|]/.test(c)) {
        flush()
        if (c === "|") words.push(c)
      } else word += c
    }
  }
  flush()
  let offset = 0
  return locatedTokens(
    words,
    source &&
      words.map((word) => {
        const start = value.indexOf(word, offset)
        offset = start + word.length
        return source.slice(start, offset)
      }),
  )
}

// Split tokens on bar lines; empty bars (e.g. from a leading |) are dropped.
export function splitBars(tokens: string[]): string[][] {
  const sources = tokenSources(tokens)
  const bars: string[][] = [locatedTokens([], sources && [])]
  for (const [i, t] of tokens.entries()) {
    if (t === "|") bars.push(locatedTokens([], sources && []))
    else {
      bars[bars.length - 1].push(t)
      if (sources) tokenSources(bars[bars.length - 1])!.push(sources[i])
    }
  }
  return bars.filter((b) => b.length)
}

// A constructor fixes the value's type; interval functions preserve it.
export function constructedType(
  text: string,
  words: Record<string, { type: string }> = {},
  depth = 0,
): "notes" | "chords" | null {
  if (depth > 32) return null
  const type = words[text]?.type
  if (type === "notes" || type === "chords") return type
  const call = intervalCall(text)?.call
  if (!call) return null
  if (call.name === "note") return "notes"
  if (call.name === "chord" || call.name === "modify" || call.name === "voice") return "chords"
  return constructedType(call.body, words, depth + 1)
}
