/* Steps: what a drum's line plays. Words hold one character per step (x hit, ^ accent,
   ~ ghost, d double, - nothing). Spaces join words, n* repeats a word or parenthesized
   sequence, and a final ...word fills the containing block. Layers in braces play
   together until they line up. */
import { buildChord } from "../chords.ts"
import { misplaced } from "../check.ts"
import { blockBeside } from "../eval.ts"
import { TRACK_RE } from "../lines.ts"
import { keyOf, withInLayers } from "../settings.ts"
import { NAME_LIKE } from "../resolve.ts"
import { isIntervalCall, callSegments } from "../intervals.ts"
import { bracesIn, headOf, onlyBraces, textOf, sourceOf } from "../parts.ts"
import { atCursor, reportIn, type At } from "../diagnostics.ts"
import { SourceText, locatedTokens, tokenSources, repeatTokens } from "../source.ts"
import type { Braces, Line, Piece, State } from "../state.ts"
import {
  barQuarters,
  count,
  lastCount,
  lcm,
  MAX_BARS,
  meterOf,
  timeLabel,
  TPQ,
  type Report,
} from "../time.ts"
import { grouped, noteSteps, period, spaceNotes } from "./notes.ts"

// How a drum is hit
export type Mods = { accent?: boolean; ghost?: boolean; double?: boolean }
// A drum's line: its name (snare.ghost), the drum and how it's hit (snare, ghost), and what
// it holds
export type DrumPart = {
  name: string
  ln: number
  drum?: string
  art?: string
  value?: Piece[]
  layer?: boolean
}
// One hit, as it sounds: the sound (inst and art), the line it came from (lane)
export type DrumHit = {
  inst: string
  art: string
  lane: string
  kit?: string
  tick: number
  vel: number
  accent?: boolean
  ghost?: boolean
  double?: boolean
  line: number
  hidden?: boolean // the second stroke of a double
  gap?: number
}
// A drum's line, read: how long it is, and its hits for as long as it's played
export type DrumClip = {
  kind: "drum"
  ticks: number
  open?: boolean // it ends in ..., so it has no length of its own
  expand(total: number, loop: boolean): DrumHit[]
}
// A beat of a bar, read
type Beat = { tick: number; mods: Mods; tok: string }
// One layer of a block of steps, and its text as it's written
type Layer = { run: string; toEnd: boolean; fill?: string | null; ln: number; text: string }

const SUB: Record<string, number> = { "": 0, e: 0.25, "&": 0.5, a: 0.75 }
// Steps say how a drum is hit, never which sound (that's the line's name): x hit,
// ^ accent, ~ ghost, d double, - nothing.
export const STEPS: Record<string, Mods> = {
  x: {},
  "^": { accent: true },
  "~": { ghost: true },
  d: { double: true },
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

// Remove interval calls before looking for sequence groups.
export const withoutCalls = (text: string) =>
  tokenize(text)
    .filter((token) => !isIntervalCall(token))
    .join(" ")

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

export const isStep = (c: string) => c === "-" || !!STEPS[c]
// Steps are typed without spaces (x--x---), but spaces between them are fine too.
export const isStepRun = (t: string) => t.length > 0 && [...t].every(isStep)
// The snare's ghost notes have a line of their own, so a ghost note on the snare's main
// line, or an accent or ghost on snare.ghost, is a mistake. Says why, or null.
function ghostLineProblem(part: DrumPart, ghost?: boolean, accent?: boolean): string | null {
  if (part.name === "snare" && ghost) {
    return "the snare's ghost notes go on a line of their own: snare.ghost: --x-"
  }
  if (part.art !== "ghost") return null
  if (accent) return "snare.ghost hits are ghost notes, so they can't be accented"
  if (ghost) return "every hit on snare.ghost is a ghost note already, so write x"
  return null
}

// `inst` and `art` pick the sound (ride + bell); `lane` is the line it came from.
function hit(part: DrumPart, tick: number, mods: Mods, kit: string): DrumHit {
  const ghost = mods.ghost || part.art === "ghost" // every hit on snare.ghost is one
  return {
    inst: part.drum!,
    art: part.art!,
    lane: part.name,
    kit,
    tick,
    vel: mods.accent ? 1 : ghost ? 0.3 : 0.7,
    accent: !!mods.accent,
    ghost,
    double: !!mods.double,
    line: part.ln,
  }
}

function pushHit(
  out: DrumHit[],
  part: DrumPart,
  tick: number,
  mods: Mods,
  doubleGap: number,
  kit: string,
) {
  const ev = hit(part, tick, mods, kit)
  out.push(ev)
  if (mods.double) out.push({ ...ev, tick: tick + doubleGap, hidden: true, gap: doubleGap })
}

// A beat, with how it's hit in front when that isn't a plain hit: 4, 2e, ^4, ~3a, d3&
export const BEAT_RE = /^([\^~dx])?(\d+)(e|&|a)?$/
// Whether a line lists beats (2e ^4) rather than steps (x-x-). The two never mix.
export const listsBeats = (tokens: string[]) => tokens.some((t) => /^[\^~dx]?\d/.test(t))

// Beats: crash: 1, snare: 2e ^4 — the beats a drum hits on in every bar, counted 1 e & a.
// A beat on its own is a plain hit, and a step in front says another way to hit it: ^4
// (accent), ~3a (ghost), d3 (double). Nothing else goes on the line, and what happens in
// one bar only goes in that bar (bar 2 { ... }).
// Returns the bar's hits ({ tick, mods, tok }) as a list of one bar, or null.
function readBeats(
  part: DrumPart,
  tokens: string[],
  st: State,
  _barTicks: number,
  err: Report,
): Beat[][] | null {
  const qpb = barQuarters(st)
  const hits: Beat[] = []
  let ok = true
  const fail = (msg: string, at: string) => {
    err(part.ln, msg, at)
    ok = false
  }
  // Steps, bar lines or a block beside beats: a line is one or the other.
  const notBeat = (t: string) =>
    t === "|" || t === "%" || isStepRun(t) || st.words[t]?.type === "steps"
  const stray = tokens.find(notBeat)
  if (stray) {
    const drum = part.drum ? part.name : "snare"
    fail(
      "Beats are one bar's hits, with nothing else on the line. To say how a beat is hit, " +
        `put its step in front: ^4 (accent), ~4 (ghost), d4 (double). For one bar only, name it: bar 2 ${drum}: 2 4`,
      stray,
    )
    return null
  }
  for (const tok of tokens) {
    const m = BEAT_RE.exec(tok)
    const word = st.words[tok]
    if (m) {
      const [, step = "x", count, sub = ""] = m
      const beat = count + sub
      const q = Number(count) - 1 + SUB[sub]
      const mods = STEPS[step]
      const problem = ghostLineProblem(part, mods.ghost, mods.accent)
      if (m[1] === "x") {
        fail(`${tok}: a beat on its own is already a plain hit, so write ${beat}`, tok)
      } else if (problem) {
        fail(`"${tok}": ${problem}`, tok)
      } else if (Number(count) < 1 || q > qpb - 1e-9) {
        fail(
          `${beat} is past the end of a ${timeLabel(st)} bar, which ends on ${lastCount(st)}`,
          tok,
        )
      } else if (hits.some((h) => h.tick === Math.round(q * TPQ))) {
        fail(`${beat} is on this line twice`, tok)
      } else hits.push({ tick: Math.round(q * TPQ), mods, tok })
    } else if (word) {
      fail(misplaced(tok, word.type, { line: "drum", beats: true })!, tok)
    } else if (st.sections[tok]) {
      fail(misplaced(tok, st.sections[tok].type, { line: "drum", beats: true })!, tok)
    } else {
      fail(
        `"${tok}" isn't a beat. Beats look like 1, 2&, 3e or 4a, or ^4 with a step in front`,
        tok,
      )
    }
  }
  if (!ok) return null
  hits.sort((a, b) => a.tick - b.tick)
  return [hits]
}

export function beatPattern(
  part: DrumPart,
  tokens: string[],
  st: State,
  barTicks: number,
  err: Report,
): DrumClip | null {
  const bars = readBeats(part, tokens, st, barTicks, err)
  if (!bars) return null
  const stepTicks = st.stepTicks
  return {
    kind: "drum",
    ticks: bars.length * barTicks,
    expand(total: number, loop: boolean) {
      const out: DrumHit[] = []
      for (let b = 0; b * barTicks < total && (loop || b < bars.length); b++) {
        for (const h of bars[b % bars.length]) {
          if (b * barTicks + h.tick < total)
            pushHit(out, part, b * barTicks + h.tick, h.mods, stepTicks / 2, st.kit)
        }
      }
      return out
    },
  }
}

// The step that hits a drum this way: x, ^, ~ or d.
function stepLetter(mods: Mods): string {
  return mods.double ? "d" : mods.ghost ? "~" : mods.accent ? "^" : "x"
}

// Beats written as steps, so they can be named as steps or layered with them: each bar on
// the step grid. Null, after saying why, when the bars or beats aren't on it.
export function beatsAsSteps(
  part: DrumPart,
  tokens: string[],
  st: State,
  err: Report,
): string | null {
  const { barTicks } = meterOf(st)
  const bars = readBeats(part, tokens, st, barTicks, err)
  if (!bars) return null
  const stepTicks = st.stepTicks
  if (barTicks % stepTicks) {
    err(
      part.ln,
      `A ${timeLabel(st)} bar isn't a whole number of steps, so these beats can't be steps`,
      tokens.join(" "),
    )
    return null
  }
  const perBar = barTicks / stepTicks
  const run = Array(bars.length * perBar).fill("-")
  for (let b = 0; b < bars.length; b++) {
    for (const h of bars[b]) {
      if (h.tick % stepTicks) {
        err(part.ln, `${h.tok} isn't on a step, so these beats can't be steps`, h.tok)
        return null
      }
      run[b * perBar + h.tick / stepTicks] = stepLetter(h.mods)
    }
  }
  return run.join("")
}

export const STEP_HELP = "Use x (hit), ^ (accent), ~ (ghost), d (double) or - (nothing)"
// What isn't a step in a word of steps: the first run of characters that aren't steps
// (the q in x-q-), or the whole word when none of it is steps
const notSteps = (word: string) => /[^-x^~d]+/.exec(word)?.[0] ?? word

// One step character → hit modifiers; null for -, undefined when it isn't valid here. A
// mistake is marked on the step itself, or on `at` when the step isn't written on this line
// (it's in the name of steps `at`).
function stepMods(
  c: string,
  part: DrumPart,
  err: Report,
  where: string,
  at: At = c,
): Mods | null | undefined {
  if (c === "-") return null
  const mods = STEPS[c]
  const problem = ghostLineProblem(part, mods.ghost, mods.accent)
  if (problem) {
    err(part.ln, `"${c}"${where}: ${problem}`, at)
    return undefined
  }
  return mods
}

// 3 in 8: this many hits, spread as evenly as they go over this many steps.
export const EUCLID_RE = /^(\d+)\s+in\s+(\d+)$/
// Bjorklund's algorithm: pairs the hits with the rests until the remainder is one group,
// which spreads the hits as evenly as whole steps allow. 3 in 8 is x--x--x-, the tresillo.
function bjorklund(hits: number, steps: number): string {
  let main = Array.from({ length: hits }, () => "x")
  let rem = Array.from({ length: steps - hits }, () => "-")
  while (rem.length > 1) {
    const n = Math.min(main.length, rem.length)
    const paired = main.slice(0, n).map((s, i) => s + rem[i])
    rem = main.length > n ? main.slice(n) : rem.slice(n)
    main = paired
  }
  return main.join("") + rem.join("")
}

// A drum's line, as finite step words followed optionally by ...word. Bounded
// repetitions are expanded with a limit before allocating; a bar marker remains in the
// token stream so its position is checked after all repeats have expanded.
export function stepParts(
  value: string,
  st: State,
  err: Report,
  ln: number,
  part: DrumPart | null = null,
  repeats = true,
): { tokens: string[]; toEnd: boolean; fill: string | null } | null {
  let at = 0
  let failed = false
  let toEnd = false
  let fill: string | null = null
  const limit = Math.floor((MAX_BARS * meterOf(st).barTicks) / st.stepTicks)
  // A mistake is marked on `where`, the text of `value` it's about, as it's written
  const fail = (msg: string, where: string, from?: number): null => {
    if (!failed) err(ln, msg, atCursor(err, value, at, where, from))
    failed = true
    return null
  }
  const ws = () => {
    while (/\s/.test(value[at] ?? "") && at < value.length) at++
  }
  const knownRun = (word: string): string | null => {
    if (isStepRun(word)) return word
    const named = st.words[word]
    return named?.type === "steps" ? named.tokens.filter((t) => t !== "|").join("") : null
  }
  const wordRun = (word: string): string | null => {
    const known = knownRun(word)
    if (known != null) return known
    const named = st.words[word]
    if (named) return fail(misplaced(word, named.type, { line: "drum", part: part?.name })!, word)
    if (st.sections[word]) {
      return fail(
        misplaced(word, st.sections[word].type, { line: "drum", part: part?.name })!,
        word,
      )
    }
    if (NAME_LIKE.test(word))
      return fail(`"${word}" isn't defined above. Name it first: steps ${word} = ^-x-`, word)
    if (part && noteSteps(word)?.some((s) => s && !s.cut))
      return fail(
        `"${word}" is notes, and ${part.name} is a drum. Notes go on a pitched instrument's line: guitar: notes ${spaceNotes(word)}`,
        word,
      )
    if (part && buildChord(word, keyOf(st)!))
      return fail(
        `"${word}" is a chord, and ${part.name} is a drum. Chords go on a pitched instrument's line: piano: chords ${word}`,
        word,
      )
    return fail(`"${word}" isn't a step word. ${STEP_HELP}`, notSteps(word))
  }
  const size = (tokens: string[], strict = false) =>
    tokens.reduce(
      (n, t) => n + (t === "|" ? 0 : ((strict ? wordRun(t) : knownRun(t))?.length ?? 0)),
      0,
    )
  // A step word, which `needs` (the repeat or ... in front of it) is missing when it isn't there
  const word = (needs: string): string | null => {
    const found = /^[^\s()|*]+/.exec(value.slice(at))?.[0]
    if (!found) return fail("A repeat needs a step word or a group: 3*x- or 2*(x- --^)", needs)
    at += found.length
    if (found === "rest")
      return fail("A step of silence is -. Repeat silence with 8*- or fill with ...-", found)
    if (/^(?:steps?|beats?|bars?)$/.test(found))
      return fail(
        "Kit lines use step words, not lengths: repeat with 4*x- or fill the block with ...x-",
        found,
      )
    if (/^[\^~dx]?\d/.test(found))
      return fail("Kit lines use step words, not beat lists: draw the hits with x and -", found)
    // Plain words keep their spelling for the owning declaration or drum to diagnose.
    // Repeats and fills resolve them here because their lengths must be known now.
    return found
  }
  const atom = (depth: number): string[] | null => {
    const start = at
    const counted = /^([^\s()|*]+)\s*\*/.exec(value.slice(at))
    if (counted) {
      const n = Number(counted[1])
      if (!/^\d+$/.test(counted[1]) || !Number.isSafeInteger(n) || n < 2)
        return fail("A repeat count is an integer of at least 2: 2*x- or 3*(x- --^)", counted[1])
      at += counted[0].length
      ws()
      let tokens: string[] | null
      if (value[at] === "(") {
        const open = at
        if (depth >= 64) return fail("Step repeats are nested too deeply", "(", open)
        at++
        tokens = sequence(depth + 1)
        if (!tokens) return null
        if (value[at] !== ")") return fail("A step repeat's ( is missing its )", "(", open)
        at++
        if (!tokens.length)
          return fail("A step repeat's parentheses need at least one word", value.slice(open, at))
      } else {
        const from = at
        const one = word(counted[0])
        tokens =
          one == null ? null : locatedTokens([one], err.source && [err.source.slice(from, at)])
      }
      if (!tokens) return null
      const length = size(tokens, true)
      if (failed) return null
      if (!length || n > limit / length || n * tokens.length > limit * 2)
        return fail(`A step sequence can be at most ${MAX_BARS} bars long`, value.slice(start, at))
      return repeatTokens(tokens, n)
    }
    // Euclidean words can sit beside ordinary words without punctuation.
    const euclid = /^(\d+)\s+in\s+(\d+)(?=\s|[)|]|$)/.exec(value.slice(at))
    if (euclid) {
      const [hits, steps] = [Number(euclid[1]), Number(euclid[2])]
      if (hits < 1 || hits > steps)
        return fail(`${euclid[0]} needs at least as many steps as hits`, euclid[0])
      if (steps > 64)
        return fail(`${euclid[0]} is more than 64 steps. Spread the hits over fewer`, euclid[0])
      at += euclid[0].length
      return locatedTokens([bjorklund(hits, steps)], err.source && [err.source.slice(start, at)])
    }
    if (value[at] === "(") return fail("Parentheses in steps need a repeat count: 2*(x- --^)", "(")
    const one = word(value[at])
    return one == null ? null : locatedTokens([one], err.source && [err.source.slice(start, at)])
  }
  const sequence = (depth: number): string[] | null => {
    const tokens: string[] = []
    const sources: SourceText[] = []
    const result = () => locatedTokens(tokens, err.source && sources)
    const begin = at
    let length = 0
    for (;;) {
      ws()
      if (at >= value.length || value[at] === ")") return result()
      if (value[at] === "|") {
        tokens.push("|")
        if (err.source) sources.push(err.source.slice(at, at + 1))
        at++
        continue
      }
      if (value.startsWith("...", at)) {
        if (depth)
          return fail(
            "... fills the containing block, so it cannot go inside a bounded repeat",
            "...",
          )
        at += 3
        ws()
        const one = word("...")
        if (one == null) return null
        fill = wordRun(one)
        if (fill == null) return null
        toEnd = true
        ws()
        if (at < value.length)
          return fail(
            "... is the rest of the block, so nothing goes after its word",
            value.slice(at),
          )
        return result()
      }
      const start = at
      const more = atom(depth)
      if (!more) return null
      length += size(more)
      if (failed) return null
      if (length > limit || tokens.length + more.length > limit * 2)
        return fail(`A step sequence can be at most ${MAX_BARS} bars long`, value.slice(begin, at))
      tokens.push(...more)
      if (err.source)
        sources.push(...(tokenSources(more) ?? more.map(() => err.source!.slice(start, at))))
      // The repeat or word just read, and what touches it
      if (at < value.length && !/[\s)|]/.test(value[at]))
        return fail(
          "Put a space between step words and repeats: x- 2*(-- ^-)",
          value.slice(start, at) + /^[^\s|)]*/.exec(value.slice(at))![0],
        )
    }
  }
  if (value.includes(","))
    return fail("Kit lines separate step words with spaces, not commas: x- --^ ...-", ",")
  const lengthWord = /\b(?:steps?|beats?|bars?)\b/.exec(value)
  if (lengthWord)
    return fail(
      "Kit lines use step words, not lengths: repeat with 4*x- or fill the block with ...x-",
      lengthWord[0],
    )
  const out = sequence(0)
  if (!out) return null
  if (at < value.length) return fail("This ) doesn't close a step repeat", ")")
  if (!out.length && !toEnd) return fail("A kit line needs step words: x- --^", value)
  if (repeats && !toEnd) {
    const runs = out.filter((t) => t !== "|").map(knownRun)
    const run = runs.join("")
    const p = !runs.includes(null) && !/^-*$/.test(run) ? period(run) : 0
    if (p) {
      const short = grouped(run.slice(0, p))
      const head = part ? `${part.name}: ` : ""
      return fail(
        `${head}${value} repeats ${short}. Write ${head}${short}: a pattern repeats it. ` +
          "Use a block to play an explicit finite sequence once",
        value,
      )
    }
  }
  return { tokens: out, toEnd, fill }
}

// Why a | in steps is in the wrong place, after `n` steps, or null if a bar ends there.
export function barLineProblem(n: number, st: State): string | null {
  const { barTicks } = meterOf(st)
  if ((n * st.stepTicks) % barTicks === 0) return null
  return (
    `This | isn't at the end of a bar: it's after ${count(n, "step")}, ` +
    `and a ${timeLabel(st)} bar is ${count(barTicks / st.stepTicks, "step")}`
  )
}

// Where to mark a mistake in the steps after ... in `text`: the step itself when the steps
// are written there (...~-), or the name they're written as (...fill).
function fillWord(text: string) {
  const word = /\.\.\.\s*([^\s()|*]+)/.exec(text)?.[1]
  return (c: string) => (word && !isStepRun(word) ? word : c)
}

// Steps: kick: x--x--- — one character per step, each one step long. Spaces are for the
// eye, and so is |, which has to fall where a bar ends. An `open` line ended in ...: its
// hits play once from the start, then `fill` repeats to the end (or nothing does), and it
// has no length to give the block it's in.
export function stepPattern(
  part: DrumPart,
  tokens: string[],
  st: State,
  err: Report,
  open = false,
  fill: string | null = null,
): DrumClip | null {
  const outerReport = err
  const steps: (Mods | null)[] = []
  let ok = true
  // A mistake in a name's steps is marked on the name, `viaWord`, which is what's written here
  const barLine = (viaWord?: string) => {
    const problem = ok && barLineProblem(steps.length, st)
    if (!problem) return
    err(part.ln, problem, viaWord ?? "|")
    ok = false
  }
  const addRun = (tok: string, viaWord?: string) => {
    const where = viaWord ? ` (in ${viaWord})` : ""
    const at = viaWord ?? tok
    if (!isStepRun(tok)) {
      if (NAME_LIKE.test(tok)) {
        err(
          part.ln,
          st.sections[tok]
            ? misplaced(tok, st.sections[tok].type, { line: "drum", part: part.name })!
            : `"${tok}" isn't defined above. Name it first: steps ${tok} = ^-x-`,
          at,
        )
      } else if (noteSteps(tok)?.some((s: { cut?: boolean } | null) => s && !s.cut)) {
        err(
          part.ln,
          `"${tok}"${where} is notes, and ${part.name} is a drum. Notes go on a pitched instrument's line: guitar: notes ${spaceNotes(tok)}`,
          at,
        )
      } else if (buildChord(tok, keyOf(st)!)) {
        err(
          part.ln,
          `"${tok}"${where} is a chord, and ${part.name} is a drum. Chords go on a pitched instrument's line: piano: chords ${tok}`,
          at,
        )
      } else {
        err(part.ln, `"${tok}"${where} isn't a step. ${STEP_HELP}`, viaWord ?? notSteps(tok))
      }
      ok = false
      return
    }
    for (const c of tok) {
      const s = stepMods(c, part, err, where, viaWord)
      if (s === undefined) ok = false
      else steps.push(s)
    }
  }
  for (const [index, tok] of tokens.entries()) {
    err = reportIn(outerReport, tokenSources(tokens)?.[index])
    if (tok === "|") {
      barLine()
      continue
    }
    const w = st.words[tok]
    if (!w) {
      addRun(tok)
      continue
    }
    const problem = misplaced(tok, w.type, { line: "drum", part: part.name })
    if (problem) {
      err(part.ln, problem, tok)
      ok = false
      continue
    }
    for (const t of w.tokens) t === "|" ? barLine(tok) : addRun(t, tok)
  }
  // ...x-: the steps that repeat to the end, checked as this drum's
  err = outerReport
  const fillAt = fillWord(textOf(part.value ?? []))
  const filler = fill
    ? [...fill].map((c) => stepMods(c, part, err, " (after ...)", fillAt(c)))
    : null
  if (filler?.includes(undefined)) ok = false
  if (!ok) return null
  if (!steps.length && !filler) {
    err(part.ln, `${part.name} has nothing to play`, textOf(part.value ?? []) || part.name)
    return null
  }
  const stepTicks = st.stepTicks
  return {
    kind: "drum",
    ticks: steps.length * stepTicks,
    open,
    expand(total: number, loop: boolean) {
      const out: DrumHit[] = []
      for (let k = 0; k * stepTicks < total; k++) {
        let s: Mods | null | undefined
        if (k < steps.length) s = steps[k]
        else if (filler) s = filler[(k - steps.length) % filler.length]
        else if (loop && !open) s = steps[k % steps.length]
        else break
        if (s) pushHit(out, part, k * stepTicks, s, stepTicks / 2, st.kit)
      }
      return out
    },
  }
}

// A drum's block of steps, one layer a line: snare.ghost: { --x- / ------------ddd- }.
// The layers play together, each repeating until they all line up again, and where two
// hit the same step the lower line wins. A rest never does, so a layer only changes the
// steps it hits. A layer ended in ... plays once (then its fill, if it has one) and doesn't
// count toward the length. Returns the steps as one run (--x---x---x-ddd-), or null after
// saying what's wrong. With `part`, each layer is checked as that drum's steps, on its own
// line.
export function stepBlock(
  block: Braces,
  st: State,
  err: Report,
  part: DrumPart | null = null,
  repeats = false,
): string | null {
  const layers: (Layer | null)[] = []
  for (const line of block.lines) layers.push(stepLayer(line, st, err, part, repeats))
  if (layers.includes(null)) return null
  const all = layers as Layer[]
  const fixed = all.filter((l) => !l.toEnd)
  // A mistake in the block as a whole is marked on its {
  if (!fixed.length) {
    err(
      block.ln,
      "Every layer here ends in ..., so nothing says how long the block is. One layer needs a length of its own",
      "{",
    )
    return null
  }
  const length = fixed.reduce((a, l) => lcm(a, l.run.length), 1)
  if (length * st.stepTicks > MAX_BARS * meterOf(st).barTicks) {
    err(block.ln, `This block's layers only line up again after more than ${MAX_BARS} bars`, "{")
    return null
  }
  for (const l of all) {
    if (l.toEnd && l.run.length > length) {
      err(
        l.ln,
        `This layer's hits run ${count(l.run.length, "step")} before its ..., and the block is only ${count(length, "step")} long`,
        l.text,
      )
      return null
    }
  }
  let run = ""
  for (let k = 0; k < length; k++) {
    let step = "-"
    for (const l of all) {
      let c: string
      if (!l.toEnd) c = l.run[k % l.run.length]
      else if (k < l.run.length) c = l.run[k]
      else c = l.fill ? l.fill[(k - l.run.length) % l.fill.length] : "-"
      if (c !== "-") step = c
    }
    run += step
  }
  return run
}

// One layer in a block of steps: steps, names of steps or blocks of steps, in a row.
// Returns { run, toEnd, fill, ln }, or null.
function stepLayer(
  line: Line,
  st: State,
  err: Report,
  part: DrumPart | null,
  repeats: boolean,
): Layer | null {
  const layer = stepLayerRun(line, st, err, part, repeats)
  return layer && { ...layer, ln: line.ln, text: textOf(line.parts) }
}

function stepLayerRun(
  line: Line,
  st: State,
  err: Report,
  part: DrumPart | null,
  repeats: boolean,
): Omit<Layer, "ln" | "text"> | null {
  err = reportIn(err, sourceOf(line.parts))
  const fail = (msg: string, at: string) => {
    err(line.ln, msg, at)
    return null
  }
  const text = textOf(line.parts)
  const track = TRACK_RE.exec(headOf(line.parts))
  if (track) {
    return fail(
      `A block of steps holds step layers separated by commas, like --x-, ----^-. ${text} is an instrument's line, which goes in a pattern`,
      track[1],
    )
  }
  if (/^with(\s|\{|$)/.test(text)) {
    return fail(
      part
        ? withInLayers(part.name)
        : "A with holds lines that play, so it goes around a drum's line, not among its steps",
      "with",
    )
  }
  if (bracesIn(line.parts).length) {
    // A layer that's a block is that block's steps. What's beside it is the mistake.
    const only = onlyBraces(line.parts)
    const beside = line.parts.find((p): p is string => typeof p === "string" && !!p.trim())
    if (!only)
      return fail(
        blockBeside("in its layer", (fig: string) => `x--- ${fig}`),
        beside ?? "{",
      )
    const run = stepBlock(only, st, err, part, repeats)
    return run == null ? null : { run, toEnd: false, fill: null }
  }
  const here = part ? { ...part, ln: line.ln } : null
  const parts = stepParts(text, st, err, line.ln, here, repeats)
  if (!parts) return null
  const { tokens, toEnd, fill } = parts
  // Each step of this layer has to be one this drum can play. A mistake is marked on the
  // step, or on `at` for steps written as a name.
  const check = (run: string, where: string, at: (c: string) => string = (c) => c) => {
    if (!part) return true
    const here = { ...part, ln: line.ln }
    return [...run].every((c) => stepMods(c, here, err, where, at(c)) !== undefined)
  }
  if (fill && !check(fill, " (after ...)", fillWord(text))) return null
  let run = ""
  for (const tok of tokens) {
    const w = st.words[tok]
    if (tok === "|") {
      const problem = barLineProblem(run.length, st)
      if (problem) return fail(problem, "|")
    } else if (w?.type === "steps") {
      const named = w.tokens.filter((t) => t !== "|").join("")
      if (!check(named, ` (in ${tok})`, () => tok)) return null
      run += named
    } else if (isStepRun(tok)) {
      if (!check(tok, "")) return null
      run += tok
    } else if (w) {
      return fail(misplaced(tok, w.type, { line: "drum", layer: true })!, tok)
    } else if (st.sections[tok]) {
      return fail(misplaced(tok, st.sections[tok].type, { line: "drum", layer: true })!, tok)
    } else if (NAME_LIKE.test(tok)) {
      return fail(`"${tok}" isn't defined above. Name it first: steps ${tok} = ^-x-`, tok)
    } else return fail(`"${tok}" isn't a step. ${STEP_HELP}`, notSteps(tok))
  }
  return { run, toEnd, fill }
}
