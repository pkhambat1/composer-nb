/* Steps: what a drum's line plays. One character per step (x hit, ^ accent, ~ ghost,
   d double, - nothing), or one bar's beats (2 4, ^4), or parts with lengths in front
   (2 beats rest, ...x-), or hits spread over steps (3 in 8), or a block of layers that
   repeat until they line up. Also stickings: which hand plays each step. */
import { buildChord } from "../chords.js"
import {
  blockBeside,
  BLOCK_KEY,
  grouped,
  keyOf,
  NAME_LIKE,
  noteSteps,
  period,
  spaceNotes,
  TRACK_RE,
  withInLayers,
} from "../language.js"
import type { Line, LineBlock, State } from "../state.ts"
import {
  barQuarters,
  count,
  lastCount,
  lcm,
  lengthAt,
  lengthText,
  MAX_BARS,
  meterOf,
  nearWhole,
  singularLength,
  timeLabel,
  TPQ,
  type Report,
} from "../time.ts"
import { UNITS } from "../vocab.ts"

const UNITS_ANY: readonly string[] = UNITS

// How a drum is hit
export type Mods = { accent?: boolean; ghost?: boolean; double?: boolean }
// A drum's line: its name (snare.ghost), the drum and how it's hit (snare, ghost), what it
// holds and the blocks written in it
export type DrumPart = {
  name: string
  ln: number
  drum?: string
  art?: string
  value?: string
  blocks?: Blocks
  layer?: boolean
}
export type Blocks = Record<string, LineBlock> | null | undefined
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
  hand?: string // a sticking's R or L
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
// One layer of a block of steps
type Layer = { run: string; toEnd: boolean; fill?: string | null; ln: number }

// The hands of a sticking line: R, L, or - for a step with no hand named
export const STICKING_RE = /^[RL-]+$/

const SUB: Record<string, number> = { "": 0, e: 0.25, "&": 0.5, a: 0.75 }
// Steps say how a drum is hit, never which sound (that's the line's name): x hit,
// ^ accent, ~ ghost, d double, - nothing.
export const STEPS: Record<string, Mods> = {
  x: {},
  "^": { accent: true },
  "~": { ghost: true },
  d: { double: true },
}

export function tokenize(value: string): string[] {
  return value.replace(/,/g, " ").replace(/\|/g, " | ").trim().split(/\s+/).filter(Boolean)
}

// Split tokens on bar lines; empty bars (e.g. from a leading |) are dropped.
export function splitBars(tokens: string[]): string[][] {
  const bars: string[][] = [[]]
  for (const t of tokens) {
    if (t === "|") bars.push([])
    else bars[bars.length - 1].push(t)
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
  const fail = (msg: string) => {
    err(part.ln, msg)
    ok = false
  }
  // Steps, bar lines or a block beside beats: a line is one or the other.
  const notBeat = (t: string) =>
    t === "|" || t === "%" || isStepRun(t) || st.words[t]?.type === "steps" || !!part.blocks?.[t]
  if (tokens.some(notBeat)) {
    const drum = part.drum ? part.name : "snare"
    fail(
      "Beats are one bar's hits, with nothing else on the line. To say how a beat is hit, " +
        `put its step in front: ^4 (accent), ~4 (ghost), d4 (double). For one bar only, name it: bar 2 ${drum}: 2 4`,
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
        fail(`${tok}: a beat on its own is already a plain hit, so write ${beat}`)
      } else if (problem) {
        fail(`"${tok}": ${problem}`)
      } else if (Number(count) < 1 || q > qpb - 1e-9) {
        fail(`${beat} is past the end of a ${timeLabel(st)} bar, which ends on ${lastCount(st)}`)
      } else if (hits.some((h) => h.tick === Math.round(q * TPQ))) {
        fail(`${beat} is on this line twice`)
      } else hits.push({ tick: Math.round(q * TPQ), mods, tok })
    } else if (word) {
      fail(`${tok} is ${word.type}, which don't go in a list of beats`)
    } else if (st.sections[tok]) {
      fail(`${tok} is a pattern, so it goes on a line of its own, not on an instrument's line`)
    } else {
      fail(`"${tok}" isn't a beat. Beats look like 1, 2&, 3e or 4a, or ^4 with a step in front`)
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
export function beatsAsSteps(part: DrumPart, tokens: string[], st: State, err: Report): string | null {
  const { barTicks } = meterOf(st)
  const bars = readBeats(part, tokens, st, barTicks, err)
  if (!bars) return null
  const stepTicks = st.stepTicks
  if (barTicks % stepTicks) {
    err(
      part.ln,
      `A ${timeLabel(st)} bar isn't a whole number of steps, so these beats can't be steps`,
    )
    return null
  }
  const perBar = barTicks / stepTicks
  const run = Array(bars.length * perBar).fill("-")
  for (let b = 0; b < bars.length; b++) {
    for (const h of bars[b]) {
      if (h.tick % stepTicks) {
        err(part.ln, `${h.tok} isn't on a step, so these beats can't be steps`)
        return null
      }
      run[b * perBar + h.tick / stepTicks] = stepLetter(h.mods)
    }
  }
  return run.join("")
}

export const STEP_HELP = "Use x (hit), ^ (accent), ~ (ghost), d (double) or - (nothing)"

// One step character → hit modifiers; null for -, undefined when it isn't valid here.
function stepMods(c: string, part: DrumPart, err: Report, where: string): Mods | null | undefined {
  if (c === "-") return null
  const mods = STEPS[c]
  const problem = ghostLineProblem(part, mods.ghost, mods.accent)
  if (problem) {
    err(part.ln, `"${c}"${where}: ${problem}`)
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

export const STICKING_HELP = "A sticking is a hand for each step, R, L or -: sticking: RLRR LRLL"

// sticking: RLRR LRLL — which hand plays each step. Its events go with the hands' hits at
// the same moments, which the grid and the sheet show as R and L.
export function stickingPattern(part: DrumPart, st: State, err: Report): DrumClip | null {
  const hands: (string | null)[] = []
  let ok = true
  for (const tok of tokenize(part.value ?? "")) {
    const w = st.words[tok]
    const runs =
      tok === "|" ? ["|"] : STICKING_RE.test(tok) ? [tok] : w?.type === "sticking" ? w.tokens : null
    if (!runs) {
      err(
        part.ln,
        w
          ? `${tok} is ${w.type}, so it can't go in a sticking`
          : `"${tok}" isn't a sticking. ${STICKING_HELP}`,
      )
      ok = false
      continue
    }
    for (const r of runs) {
      if (r === "|") {
        const problem = barLineProblem(hands.length, st)
        if (problem) {
          err(part.ln, problem)
          ok = false
        }
      } else hands.push(...[...r].map((c) => (c === "-" ? null : c)))
    }
  }
  if (!ok) return null
  if (!hands.some(Boolean)) {
    err(part.ln, "This sticking names no hand. Put R or L on the steps the hands play")
    return null
  }
  const stepTicks = st.stepTicks
  return {
    kind: "drum",
    ticks: hands.length * stepTicks,
    expand(total: number, loop: boolean) {
      const out: DrumHit[] = []
      for (let k = 0; k * stepTicks < total && (loop || k < hands.length); k++) {
        const hand = hands[k % hands.length]
        if (hand) {
          out.push({
            inst: "sticking",
            art: "hit",
            lane: "sticking",
            hand,
            tick: k * stepTicks,
            vel: 0,
            line: part.ln,
          })
        }
      }
      return out
    },
  }
}

// A line's parts: what's between its commas. A bar line ends a part too when a length or
// ... starts the next one, so a line continued at a bar can go on with a length:
// D3---E3--- |1 bars rest is D3---E3--- | and 1 bars rest. The | stays, and is checked.
export function partsOf(value: string): string[] {
  return value
    .replace(/\|(?=\s*(?:\.\.\.|[\d(][^,|]*?\s(?:steps|beats|bars)(?![A-Za-z0-9])))/g, (bar, at) =>
      value.slice(0, at).trim() ? "|," : bar,
    )
    .split(",")
    .map((p) => p.trim())
}

// What a length measures, when it isn't rest: steps, written out as one run of letters.
export function figureRun(
  text: string,
  blocks: Blocks,
  st: State,
  err: Report,
  ln: number,
  part: DrumPart | null,
): string | null {
  let run = ""
  for (const tok of tokenize(text)) {
    const w = st.words[tok]
    if (tok === "|") continue
    if (blocks?.[tok]) {
      const inner = stepBlock(blocks[tok], st, err, part)
      if (inner == null) return null
      run += inner
    } else if (w?.type === "steps") run += w.tokens.filter((t) => t !== "|").join("")
    else if (isStepRun(tok)) run += tok
    else {
      err(
        ln,
        `"${tok}" can't be measured by a length. A length measures rest or steps, up to the next comma: 2 beats rest, 2 beats x-`,
      )
      return null
    }
  }
  return run
}

// A drum's line, as tokens of steps. Its parts are separated by commas. A part is steps as
// they're drawn (x--x, with spaces for the eye) or a length in front of what fills it:
// 2 beats rest is silence that long, and 2 beats x- repeats x- for that long. A length's
// part comes back as the steps it stands for. A line of beats (2e 4) passes through.
// The length ... is what's left of the block the line is in, so a last part ...rest is
// silence to the end (`toEnd`), and ...x- is x- repeated to the end (`toEnd`, with the
// steps as `fill`). Returns { tokens, toEnd, fill }, or null after saying what's wrong.
export function stepParts(
  value: string,
  blocks: Blocks,
  st: State,
  err: Report,
  ln: number,
  part: DrumPart | null = null,
): { tokens: string[]; toEnd: boolean; fill: string | null } | null {
  const fail = (msg: string) => {
    err(ln, msg)
    return null
  }
  const parts = partsOf(value)
  const beats = (p: string) => p !== "" && tokenize(p).every((t) => BEAT_RE.test(t))
  if (parts.length > 1 && parts.every(beats)) {
    return fail(`A list of beats takes spaces, not commas: ${parts.join(" ")}`)
  }
  const { barTicks } = meterOf(st)
  const out: string[] = []
  let toEnd = false
  let fill: string | null = null
  let measured = false // whether a part was a length or hits spread over steps
  let drawn: string | null = null // the part before, when it was drawn steps
  for (const [i, text] of parts.entries()) {
    if (!text)
      return fail("A comma goes between two parts of a line, so something goes on each side")
    // 3 in 8: hits spread as evenly as they go over the steps, a part of its own
    const euclid = EUCLID_RE.exec(text)
    if (euclid) {
      const [hits, steps] = [Number(euclid[1]), Number(euclid[2])]
      if (hits < 1 || hits > steps)
        return fail(
          `${text} puts ${hits} hits in ${steps} steps, so it needs at least as many steps as hits`,
        )
      if (steps > 64) return fail(`${text} is more than 64 steps. Spread the hits over fewer`)
      out.push(bjorklund(hits, steps))
      drawn = null
      measured = true
      continue
    }
    const inAt = tokenize(text).indexOf("in")
    if (inAt > 0) {
      const tokens = tokenize(text)
      const [a, b] = [tokens[inAt - 1], tokens[inAt + 1]]
      if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
        const before = tokens.slice(0, inAt - 1).join(" ")
        const after = tokens.slice(inAt + 2).join(" ")
        return fail(
          `${a} in ${b} is a part of its own, so put a comma ${before ? "before" : "after"} it: ${[before, `${a} in ${b}`, after].filter(Boolean).join(", ")}`,
        )
      }
      return fail("in goes between two numbers: 3 in 8 spreads 3 hits over 8 steps")
    }
    const rest = /^\.\.\.\s*(.*)$/.exec(text)
    if (rest) {
      // ...rest or ...x-: to the end of the block
      if (i < parts.length - 1) {
        return fail("... is the rest of the block, so nothing goes after it")
      }
      const thing = rest[1].trim()
      if (!thing)
        return fail(
          "... needs what fills the rest of the block: ...rest, or steps to repeat: ...x-",
        )
      if (thing === "rest") {
        if (parts.length === 1) {
          return fail("...rest on its own plays nothing. Put the hits in front of it: -xx, ...rest")
        }
        toEnd = true
        continue
      }
      const fig = figureRun(thing, blocks, st, err, ln, part)
      if (fig == null) return null
      if (!fig || /^-+$/.test(fig)) return fail("Silence to the end of the block is ...rest")
      toEnd = true
      fill = fig
      continue
    }
    if (text.includes("...")) {
      return fail(
        `... starts its own part, so a comma goes before it: ${text.replace(/\s*\.\.\./, ", ...")}`,
      )
    }
    const len = lengthAt(text)
    if (!len) {
      const tokens = tokenize(text)
      if (tokens.includes("every")) {
        return fail(
          `every goes in front of the line, not inside it: every 3 steps ${part?.drum ? part.name : "kick"}: x-xx`,
        )
      }
      const unit = tokens.findIndex((t) => UNITS_ANY.includes(t))
      if (unit > 0) {
        const [before, length] = [tokens.slice(0, unit - 1), tokens.slice(unit - 1)]
        return fail(
          before.length
            ? `A length starts its own part, so put a comma before it: ${before.join(" ")}, ${length.join(" ")}`
            : `${length.slice(0, 2).join(" ")} needs a number in front: 2 ${tokens[unit]} rest`,
        )
      }
      if (unit === 0) return fail(`${tokens[0]} needs a number in front: 2 ${tokens[0]} rest`)
      if (tokens.includes("rest")) {
        return fail(
          "rest takes a length in front: 2 beats rest, or ...rest for the rest of the block. One step of rest is -",
        )
      }
      if (parts.length > 1 && tokens.some((t) => BEAT_RE.test(t))) {
        return fail(
          "Beats don't go on a line with lengths or commas. Draw those hits in steps: 2 beats rest, x---",
        )
      }
      if (drawn != null) {
        return fail(`A comma ends a length. Between steps a space is enough: ${drawn} ${text}`)
      }
      out.push(...tokens)
      drawn = text
      continue
    }
    drawn = null
    const unitTicks = (
      { steps: st.stepTicks, beats: TPQ, bars: barTicks } as Record<string, number>
    )[len.unit]
    const steps = (len.n * unitTicks) / st.stepTicks
    if (!(len.n > 0) || len.n * unitTicks > MAX_BARS * barTicks) {
      return fail(`A length is more than nothing, and up to ${MAX_BARS} bars: 2 beats rest`)
    }
    if (!nearWhole(steps)) {
      return fail(`${len.shown} isn't a whole number of steps, so steps can't fill it`)
    }
    const n = Math.round(steps)
    if (!len.thing) {
      return fail(
        `${len.shown} of what? Write ${len.shown} rest, or the steps to repeat: ${len.shown} x-`,
      )
    }
    measured = true
    if (len.thing === "rest") {
      out.push("-".repeat(n))
      continue
    }
    // A length runs to the next comma, so more after rest, or another length, needs one
    const things = tokenize(len.thing)
    const next = things.findIndex((t, k) => k > 0 && UNITS_ANY.includes(t))
    if (things[0] === "rest" || next > 0) {
      const cut = things[0] === "rest" ? 1 : next - 1
      return fail(
        `A comma ends a length, so put one here: ${len.shown} ${things.slice(0, cut).join(" ")}, ${things.slice(cut).join(" ")}`,
      )
    }
    const fig = figureRun(len.thing, blocks, st, err, ln, part)
    if (fig == null) return null
    if (!fig || /^-+$/.test(fig)) return fail(`Silence for a length is rest: ${len.shown} rest`)
    if (n % fig.length) {
      return fail(
        `${len.thing} is ${count(fig.length, "step")} long, which doesn't fit ${len.shown} a whole number of times`,
      )
    }
    out.push(fig.repeat(n / fig.length))
    measured = true
  }
  // Steps drawn as the same figure more than once: a pattern repeats it, and a length plays
  // it for as long as it's written once.
  if (!measured && !toEnd && !listsBeats(out)) {
    let run = ""
    let plain = true
    for (const t of out) {
      const w = st.words[t]
      if (t === "|") continue
      if (w?.type === "steps" && !w.beats) run += w.tokens.filter((x) => x !== "|").join("")
      else if (isStepRun(t)) run += t
      else plain = false // a block, beats, or a mistake that's said where it's read
    }
    const p = plain && !/^-*$/.test(run) ? period(run) : 0
    if (p) {
      const short = grouped(run.slice(0, p))
      const head = part ? `${part.name}: ` : ""
      return fail(
        `${head}${value} repeats ${short}. Write ${head}${short}: a pattern repeats it. ` +
          `To play it once for that long, put the length in front: ${head}${lengthText(run.length * st.stepTicks, st)} ${short}`,
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
  const steps: (Mods | null)[] = []
  let ok = true
  const barLine = () => {
    const problem = ok && barLineProblem(steps.length, st)
    if (!problem) return
    err(part.ln, problem)
    ok = false
  }
  const addRun = (tok: string, viaWord?: string) => {
    const where = viaWord ? ` (in ${viaWord})` : ""
    if (!isStepRun(tok)) {
      if (NAME_LIKE.test(tok)) {
        err(
          part.ln,
          st.sections[tok]
            ? `${tok} is a pattern, so it goes on a line of its own, not on an instrument's line`
            : `"${tok}" isn't defined above. Name it first: steps ${tok} = ^-x-`,
        )
      } else if (noteSteps(tok)?.some((s: { cut?: boolean } | null) => s && !s.cut)) {
        err(
          part.ln,
          `"${tok}"${where} is notes, and ${part.name} is a drum. Notes go on a pitched instrument's line: guitar: ${spaceNotes(tok)}`,
        )
      } else if (buildChord(tok, keyOf(st)!)) {
        err(
          part.ln,
          `"${tok}"${where} is a chord, and ${part.name} is a drum. Chords go on a pitched instrument's line: piano: chords ${tok}`,
        )
      } else {
        err(part.ln, `"${tok}"${where} isn't a step. ${STEP_HELP}`)
      }
      ok = false
      return
    }
    for (const c of tok) {
      const s = stepMods(c, part, err, where)
      if (s === undefined) ok = false
      else steps.push(s)
    }
  }
  for (const tok of tokens) {
    if (tok === "|") {
      barLine()
      continue
    }
    const block = part.blocks?.[tok]
    if (block) {
      const run = stepBlock(block, st, err, part)
      if (run == null) ok = false
      else addRun(run)
      continue
    }
    const w = st.words[tok]
    if (!w) {
      addRun(tok)
      continue
    }
    if (w.type !== "steps") {
      err(
        part.ln,
        w.type === "sticking"
          ? `${tok} is a sticking, so it goes on the sticking line: sticking: ${tok}`
          : `${tok} is ${w.type}, so it goes on a line like piano: ${w.type === "chords" ? "chords " : ""}${tok}, not on a drum's`,
      )
      ok = false
      continue
    }
    for (const t of w.tokens) t === "|" ? barLine() : addRun(t, tok)
  }
  // ...x-: the steps that repeat to the end, checked as this drum's
  const filler = fill ? [...fill].map((c) => stepMods(c, part, err, " (after ...)")) : null
  if (filler?.includes(undefined)) ok = false
  if (!ok) return null
  if (!steps.length && !filler) {
    err(part.ln, `${part.name} has nothing to play`)
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
  block: LineBlock,
  st: State,
  err: Report,
  part: DrumPart | null = null,
): string | null {
  const layers: (Layer | null)[] = []
  for (const line of block.lines) layers.push(stepLayer(line, st, err, part))
  if (layers.includes(null)) return null
  const all = layers as Layer[]
  const fixed = all.filter((l) => !l.toEnd)
  if (!fixed.length) {
    err(
      block.ln,
      "Every layer here ends in ..., so nothing says how long the block is. One layer needs a length of its own",
    )
    return null
  }
  const length = fixed.reduce((a, l) => lcm(a, l.run.length), 1)
  if (length * st.stepTicks > MAX_BARS * meterOf(st).barTicks) {
    err(block.ln, `This block's layers only line up again after more than ${MAX_BARS} bars`)
    return null
  }
  for (const l of all) {
    if (l.toEnd && l.run.length > length) {
      err(
        l.ln,
        `This layer's hits run ${count(l.run.length, "step")} before its ..., and the block is only ${count(length, "step")} long`,
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
function stepLayer(line: Line, st: State, err: Report, part: DrumPart | null): Layer | null {
  const layer = stepLayerRun(line, st, err, part)
  return layer && { ...layer, ln: line.ln }
}

function stepLayerRun(
  line: Line,
  st: State,
  err: Report,
  part: DrumPart | null,
): Omit<Layer, "ln"> | null {
  const fail = (msg: string) => {
    err(line.ln, msg)
    return null
  }
  if (TRACK_RE.test(line.text)) {
    return fail(
      `A block of steps holds steps, one layer a line, like --x-. ${line.text} is an instrument's line, which goes in a pattern`,
    )
  }
  if (/^with(\s|\{|$)/.test(line.text)) {
    return fail(
      part
        ? withInLayers(part.name)
        : "A with holds lines that play, so it goes around a drum's line, not among its steps",
    )
  }
  if (singularLength(line.text, line.ln, err)) return null
  if (line.blocks && !BLOCK_KEY.test(line.text.trim())) {
    return fail(blockBeside("in its layer", (fig: string) => `x--- ${fig}`))
  }
  const here = part ? { ...part, ln: line.ln } : null
  const parts = stepParts(line.text, line.blocks, st, err, line.ln, here)
  if (!parts) return null
  const { tokens, toEnd, fill } = parts
  // Each step of this layer has to be one this drum can play
  const check = (run: string, where: string) => {
    if (!part) return true
    const here = { ...part, ln: line.ln }
    return [...run].every((c) => stepMods(c, here, err, where) !== undefined)
  }
  if (fill && !check(fill, " (after ...)")) return null
  if (listsBeats(tokens)) {
    // A layer of beats: 2 4
    const where: DrumPart = {
      name: "steps",
      art: "hit",
      ...part,
      ln: line.ln,
      blocks: line.blocks,
      layer: true,
    }
    const run = beatsAsSteps(where, tokens, st, err)
    return run == null ? null : { run, toEnd: false }
  }
  let run = ""
  for (const tok of tokens) {
    const w = st.words[tok]
    if (tok === "|") {
      const problem = barLineProblem(run.length, st)
      if (problem) return fail(problem)
    } else if (line.blocks?.[tok]) {
      const inner = stepBlock(line.blocks[tok], st, err, part)
      if (inner == null) return null
      run += inner
    } else if (w?.type === "steps") {
      const named = w.tokens.filter((t) => t !== "|").join("")
      if (!check(named, ` (in ${tok})`)) return null
      run += named
    } else if (isStepRun(tok)) {
      if (!check(tok, "")) return null
      run += tok
    } else if (w) {
      return fail(`${tok} is ${w.type}, so it can't be a layer of steps`)
    } else if (st.sections[tok]) {
      return fail(`${tok} is a pattern, so it can't be a layer of steps`)
    } else if (NAME_LIKE.test(tok)) {
      return fail(`"${tok}" isn't defined above. Name it first: steps ${tok} = ^-x-`)
    } else return fail(`"${tok}" isn't a step. ${STEP_HELP}`)
  }
  return { run, toEnd, fill }
}
