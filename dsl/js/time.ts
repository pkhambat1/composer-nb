/* Time: meters, ticks, lengths, the arithmetic a number can be written as, whether what
   repeats fits, and swing. The one place time arithmetic lives. A time is counted in ticks,
   TPQ to a quarter note; seconds come from the tempo only at the end. */

import { message } from "./diagnostics.ts"

export const TPQ = 96 // ticks per quarter note: fine enough for 1/32 notes and triplets
// The longest a length can be, and a block's layers can take to line up again
export const MAX_BARS = 64
// The longest a cell can play, in seconds
export const MAX_SECONDS = 600

// The part of a cell's state that says how its time goes. Callers pass the whole state.
export type Timing = {
  groups: number[] // the bar's beats as felt: 3+4 over 8 is [3, 4]
  unit: number // the note a beat is: 8 in 7 over 8
  tempo: number // quarter notes a minute
  swing: number // where the off-beat eighth falls, as a percentage of the beat: 50 is straight
  stepTicks: number // how long a step is
  key: string
  mode: string
}

// Reports a mistake on a line of the cell
export type Report = (line: number, msg: string) => void

// A time the way it's written: 7 over 8, or 3+4 over 4.
export function timeLabel(s: Timing): string {
  return `${s.groups.join("+")} over ${s.unit}`
}

// Bar length in quarter notes (a beat is always a quarter note).
export function barQuarters(s: Timing): number {
  return (s.groups.reduce((a, b) => a + b, 0) * 4) / s.unit
}

// The last 16th a bar reaches, counted 1 e & a: a 7 over 8 bar ends on 4e.
export function lastCount(s: Timing): string {
  const n = Math.round(barQuarters(s) * 4) - 1
  return Math.floor(n / 4) + 1 + ["", "e", "&", "a"][n % 4]
}

// ---------------------------------------------------------------------------
// Numbers: wherever a number goes, arithmetic goes, and / only ever divides.
// ---------------------------------------------------------------------------

// A number as it was written, each node with its value: 3+4 is a "+" of two "num"s.
export type Arith =
  | { op: "num"; value: number; whole: boolean }
  | { op: "()" | "neg"; e: Arith; value: number }
  | { op: "+" | "-" | "*" | "/"; l: Arith; r: Arith; value: number }

// Arithmetic over `src`: + - * / and brackets. sumAt parses from a position and returns
// the expression tree and where it ended, or null.
export function numbers(src: string) {
  let i = 0
  const ws = () => {
    while (src[i] === " ") i++
  }
  const atom = (): Arith | null => {
    ws()
    if (src[i] === "(") {
      i++
      const e = sum()
      ws()
      if (!e || src[i] !== ")") return null
      i++
      return { op: "()", e, value: e.value }
    }
    if (src[i] === "-") {
      i++
      const e = atom()
      return e && { op: "neg", e, value: -e.value }
    }
    const m = /^\d+(\.\d+)?/.exec(src.slice(i))
    if (!m) return null
    i += m[0].length
    return { op: "num", value: Number(m[0]), whole: !m[1] }
  }
  // Reads `first (op next)*` for the given operators, stopping before anything else.
  type Op = "+" | "-" | "*" | "/"
  const chain =
    (next: () => Arith | null, ops: string, apply: (op: Op, a: number, b: number) => number) =>
    (): Arith | null => {
      let l = next()
      while (l) {
        const back = i
        ws()
        const op = src[i] as Op
        if (!ops.includes(op)) {
          i = back
          break
        }
        i++
        const r = next()
        if (!r) return null
        l = { op, l, r, value: apply(op, l.value, r.value) }
      }
      return l
    }
  const product = chain(atom, "*/", (op, a, b) => (op === "*" ? a * b : a / b))
  const sum = chain(product, "+-", (op, a, b) => (op === "+" ? a + b : a - b))
  const sumAt = (pos: number) => {
    i = pos
    const e = sum()
    return e && Number.isFinite(e.value) ? { e, end: i } : null
  }
  return { sumAt }
}

// The whole text as one number, or null if it isn't arithmetic.
export function evalNumber(text: unknown): Arith | null {
  const src = String(text).trim()
  const n = numbers(src).sumAt(0)
  return n && n.end === src.length ? n.e : null
}

export const nearWhole = (n: number) => Math.abs(n - Math.round(n)) < 1e-9

// The whole numbers a count is written as: 7 → [7], 3+4 → [3, 4] (felt as 3 then 4).
// null if it's anything else.
export function sumTerms(node: Arith): number[] | null {
  const bare = node.op === "()" ? node.e : node
  if (bare.op === "()") return sumTerms(bare)
  if (bare.op === "num") return bare.whole && bare.value > 0 ? [bare.value] : null
  if (bare.op !== "+")
    return nearWhole(bare.value) && bare.value > 0 ? [Math.round(bare.value)] : null
  const l = sumTerms(bare.l)
  const r = sumTerms(bare.r)
  return l && r ? [...l, ...r] : null
}

// A number for a message, to four places at most: 1.5, 0.3333
export const fmt = (n: number) => String(+n.toFixed(4))

// ---------------------------------------------------------------------------
// Lengths: always plural, so bars only ever says how long and bar only ever says which.
// ---------------------------------------------------------------------------

// "3 bars groove" → { bars: 3, rest: "groove" }. A length goes in front of what it measures.
export function lengthPrefix(text: string) {
  const n = /^[\d(]/.test(text) ? numbers(text).sumAt(0) : null
  const m = n && /^\s*bars(?![A-Za-z0-9])\s*/.exec(text.slice(n.end))
  return n && m
    ? { has: true, bars: n.e.value, rest: text.slice(n.end + m[0].length).trim() }
    : { has: false, bars: 0, rest: text }
}

// "2 beats rest" → the length in front and what it measures, or null if `text` doesn't
// start with a length.
export function lengthAt(text: string) {
  const n = /^[\d(]/.test(text) ? numbers(text).sumAt(0) : null
  const m = n && /^\s*(steps|beats|bars)(?![A-Za-z0-9])\s*/.exec(text.slice(n.end))
  if (!n || !m) return null
  const end = n.end + m[0].length
  return {
    n: n.e.value,
    unit: m[1],
    shown: text.slice(0, end).trim(),
    thing: text.slice(end).trim(),
  }
}

// Lengths are always plural, whatever the number (1 bars), so that bar only ever says which
// bar. Says so for "1 bar", "2 beat" or "8 step", and returns whether it did.
export function singularLength(text: string, ln: number, err: Report): boolean {
  const m = /(\S*(?:\d|\)))\s+(bar|beat|step)(?![A-Za-z0-9])/.exec(text)
  if (!m) return false
  err(ln, `Lengths are always plural, whatever the number: ${m[1]} ${m[2]}s`)
  return true
}

// ---------------------------------------------------------------------------
// Meters and ticks
// ---------------------------------------------------------------------------

// What a block's time is, worked out from the state it plays with.
export function meterOf(st: Timing) {
  const barTicks = Math.round(barQuarters(st) * TPQ)
  const secPerTick = 60 / (st.tempo * TPQ)
  return {
    time: timeLabel(st),
    groups: st.groups,
    unit: st.unit,
    tempo: st.tempo,
    swing: st.swing,
    key: st.key,
    mode: st.mode,
    barTicks,
    secPerTick,
  }
}

export const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
export const lcm = (a: number, b: number) => (a / gcd(a, b)) * b
// A count of something for a message: 1 bar, 3 bars
export const count = (n: number, word: string) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`

// A length as it's written: 1 bars, 3 beats, 7 steps. Always plural.
export function lengthText(ticks: number, st: Timing): string {
  const { barTicks } = meterOf(st)
  if (ticks % barTicks === 0) return `${fmt(ticks / barTicks)} bars`
  if (ticks % st.stepTicks === 0) return `${fmt(ticks / st.stepTicks)} steps`
  return `${fmt(ticks / TPQ)} beats`
}

// A length the way it's said: 3 bars, 7 steps, 1.5 beats, 1 bar.
export function sayTicks(ticks: number, st: Timing, barTicks: number): string {
  if (ticks % barTicks === 0) return count(ticks / barTicks, "bar")
  if (ticks % st.stepTicks === 0) return count(ticks / st.stepTicks, "step")
  return count(ticks / TPQ, "beat")
}

// Something that repeats: what it's called in a message, how long it is, and its line
export type Loop = { what: string; ticks: number; ln: number }

// Anything that repeats has to fit what it's in a whole number of times. Reports each of
// `loops` that doesn't fit `total` ticks, and where they'd all fit. Returns whether they
// all do.
export function checkLoops(
  loops: Loop[],
  total: number,
  st: Timing,
  barTicks: number,
  err: Report,
): boolean {
  // A pattern that sets its own tempo can come out at no whole number of ticks here.
  const whole = (l: Loop) => l.ticks > 0 && nearWhole(l.ticks)
  const bad = loops.filter((l) => !whole(l) || total % Math.round(l.ticks))
  if (!bad.length) return true
  const every =
    loops.filter(whole).reduce((a, l) => lcm(a, Math.round(l.ticks)), barTicks) / barTicks
  const when = every === 1 ? "every bar" : `every ${fmt(every)} bars`
  const hint = message("fit.hint", { many: loops.length > 1, when })
  const length = sayTicks(total, st, barTicks)
  for (const l of bad) {
    err(
      l.ln,
      whole(l)
        ? message("fit.whole", {
            what: l.what,
            length: sayTicks(Math.round(l.ticks), st, barTicks),
            total: length,
            hint,
          })
        : message("fit.ownTempo", { what: l.what, total: length }),
    )
  }
  return false
}

// How swing moves a tick: the first half of each beat stretches to swing% of it and the
// second half shrinks to fit, so the off-beat eighth falls late and everything between
// moves with it. Null when the swing is straight.
export function swingWarp(st: Timing): ((tick: number) => number) | null {
  const s = st.swing / 100
  if (s === 0.5) return null
  return (tick) => {
    const beat = Math.floor(tick / TPQ)
    const pos = (tick - beat * TPQ) / TPQ
    const moved = pos < 0.5 ? (pos / 0.5) * s : s + ((pos - 0.5) / 0.5) * (1 - s)
    return (beat + moved) * TPQ
  }
}
