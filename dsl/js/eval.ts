/* Evaluating: a block's lines, read in order, into a clip. Its instruments' lines, its
   patterns and groups, what's in a bar and what plays at its own pace all sound together;
   a pattern is checked where it's defined and played where it's played. */
import {
  anonCtx,
  blockCtx,
  layer,
  paceCtx,
  placeCtx,
  playCtx,
  shift,
  withCtx,
  type Clip,
  type Ctx,
  type Repeated,
} from "./clips.ts"
import { defineBlock, defineWord } from "./declare.ts"
import { classify, paceTicks, readPart, type PartLine, type ReadLine } from "./lines.ts"
import { Scope, undefinedName } from "./resolve.ts"
import type { Item, Playable } from "./sequence.ts"
import { pacing, setInBlock, withState } from "./settings.ts"
import { cloneState, type Line, type Section, type State } from "./state.ts"
import { meterOf, type Report } from "./time.ts"

// What plays in a block: its instruments' lines, patterns, bars and paces.
export const PLAYS: readonly string[] = ["part", "sequence", "placed", "paced"]

// Inside a block, settings go on a with, which holds the lines they're for.

// Reads a block's lines in order, so each one sees the names given before it. Names are
// defined in `st`, and each line that plays keeps the state as it was there, in `l.st`.
// `named` is called with each pattern that gets a name. A block's lines play together, so
// a with on a line of its own that sets its own time, tempo or swing has to be the only
// line that plays.
function readLines(
  lines: Line[],
  st: State,
  err: Report,
  named?: (sec: Section) => void,
): ReadLine[] {
  const read: ReadLine[] = []
  for (const line of lines) {
    const l = classify(line, err, st)
    if (!l) continue
    read.push(l)
    if (PLAYS.includes(l.kind)) (l as { st?: State }).st = cloneState(st)
    if (l.kind === "setting") err(l.ln, setInBlock(l))
    else if (l.kind === "word") defineWord(l.type, l.name, l.value, l.ln, st, err, l.blocks)
    else if (l.kind === "blockdef") {
      const sec = defineBlock(l, st, err)
      if (sec && named) named(sec)
    }
  }
  if (read.filter((l) => PLAYS.includes(l.kind)).length < 2) return read
  return read.filter((l) => {
    const own = l.kind === "sequence" && l.items[0].with && pacing(l.items[0].with)
    if (!own) return true
    err(
      l.ln,
      `The lines of a play or a pattern play together, so they share one ${own.name}. Put the with around the whole play, ` +
        `with ${own.name} ${own.value} { play ... }, or on a part that plays in order: ( with ${own.name} ${own.value} { ... } )`,
    )
    return false
  })
}

// What something that repeats is called when it doesn't fit.
export const loopName = (it: Item) =>
  it.name || (it.items ? "This group" : it.with ? "This with" : "This pattern")

// A block of steps is the whole of what it's written on: a kit piece's line, a layer, or
// the steps a name holds. That way two blocks never sit in a row, where a newline between
// them would be all that told together from in order. Steps go in a row with a block by name.
export const blockBeside = (what: string, written: (fig: string) => string, fig = "fig") =>
  `A block is everything ${what}, so nothing goes beside it. ` +
  `To put steps in a row with a block, name it: steps ${fig} = { ... } and ${written(fig)}`

// Each instrument has one line in a block. Its layers go in a block on that line.
const secondLine = (name: string, where: string) =>
  `${name} already has a line ${where}. To layer it, put its lines in a block: ${name}: { ... }`

// Lines in braces are one block: they play together, and what's defined inside stays
// inside. `bars` is the length written in front of the block, if any. In a pattern every
// line repeats; in a play a line of patterns repeats only when it's one pattern on its own.
// What's put in a bar (bar 2 { ... }) plays there once each time through the block.
export function blockClip(
  lines: Line[],
  state: State,
  err: Report,
  ctx: Ctx,
  stack: string[],
  bars = 0,
): Clip | null {
  const st = cloneState(state)
  const read = readLines(lines, st, err)
  // The block's time, tempo and swing, which all of its lines share
  const head = st
  const parts: PartLine[] = []
  for (const l of read) {
    if (l.kind !== "part") continue
    if (parts.some((p) => p.name === l.name)) {
      err(l.ln, secondLine(l.name, ctx.where))
      continue
    }
    parts.push(l)
  }
  const once: Clip[] = []
  const repeated: Repeated[] = []
  for (const l of read) {
    if (l.kind !== "sequence") continue
    const clip = sequenceClip(l.items, l.st!, err, l.ln, stack)
    if (!clip) return null
    // A pattern or a group on a line of its own repeats until what it's in ends.
    repeated.push({ clip, what: loopName(l.items[0]), ln: l.ln })
  }
  for (const l of read) {
    if (l.kind !== "paced") continue
    // What's after every is a pattern of its own, where a step lasts that long.
    const ticks = paceTicks(l, l.st!, err)
    if (!ticks) return null
    const clip = blockClip([l.line], { ...l.st!, stepTicks: ticks }, err, paceCtx(l.ln), stack)
    if (!clip) return null
    repeated.push({ clip, what: "This pattern", ln: l.ln })
  }
  for (const l of read) {
    if (l.kind !== "placed") continue
    // What's in a bar repeats to fill it, and plays once each time through this block.
    const clip = blockClip(l.lines, l.st!, err, placeCtx(l), stack, l.to - l.from + 1)
    if (!clip) return null
    const { barTicks, secPerTick } = meterOf(head)
    const at = (l.from - 1) * barTicks * secPerTick
    once.push({ ...shift(clip, at, false), durSec: at + clip.durSec, ln: l.ln, until: l.to })
  }
  if (!parts.length && !once.length && !repeated.length) {
    // A line that's already been reported as a mistake doesn't need this too.
    if (lines.length && read.length === lines.length) {
      err(lines[0].ln, `Nothing to play ${ctx.where}`)
    }
    return null
  }
  return layer(parts, once, repeated, head, bars, err, ctx)
}

// Plays a pattern, with or without a name, with the settings in effect where it's played.
export function sectionClip(
  sec: Playable,
  state: State,
  err: Report,
  ln: number,
  stack: string[],
): Clip | null {
  if (sec.shown)
    return blockClip(sec.lines, state, err, withCtx(sec.ln, sec.shown), stack, sec.bars)
  if (sec.anon) return blockClip(sec.lines, state, err, anonCtx(sec.ln), stack, sec.bars)
  if (stack.includes(sec.name!)) {
    err(ln, `${sec.name} plays itself, so it would never end`)
    return null
  }
  return blockClip(
    sec.lines,
    Scope.playing(sec as Section, state),
    err,
    blockCtx(sec.name!, ln),
    [...stack, sec.name!],
    sec.bars,
  )
}

// Checks a pattern when it's defined, so its mistakes show even if it's never played.
// `owner` is the pattern a block without a name sits in, if any.
export function checkSection(
  sec: Playable,
  state: State,
  err: Report,
  owner: string | null | undefined = sec.anon ? null : sec.name,
): void {
  const where = sec.anon ? "this pattern" : sec.name
  const st = cloneState(state)
  const read = readLines(sec.lines, st, err, (named) => checkSection(named, st, err))
  const parts = read.filter((l) => l.kind === "part")
  parts.forEach((l, i) => {
    if (parts.slice(0, i).some((p) => p.name === l.name)) {
      err(l.ln, secondLine(l.name, `in ${where}`))
    }
    readPart(l, l.st!, meterOf(l.st!).barTicks, err)
  })
  const names = (items: Item[], ln: number, at: State) => {
    for (const it of items) {
      if (it.items) names(it.items, ln, at)
      else if (it.block) {
        // a with's block is checked with its settings
        const inner = it.with ? withState(it.with, at, ln, err) : at
        if (inner) checkSection(it.block, inner, err, owner)
      } else if (it.name === owner) err(ln, `${owner} plays itself, so it would never end`)
      else if (!at.sections[it.name!]) err(ln, undefinedName(it.name!, at))
    }
  }
  for (const l of read) {
    if (l.kind === "sequence") names(l.items, l.ln, l.st!)
    // What's in a bar is a pattern of its own
    else if (l.kind === "placed") {
      checkSection({ anon: true, ln: l.ln, lines: l.lines, bars: 0 }, l.st!, err, owner)
    } else if (l.kind === "paced") {
      // ...and so is what plays at its own pace, where a step lasts that long
      const ticks = paceTicks(l, l.st!, err)
      const inner = ticks ? { ...l.st!, stepTicks: ticks } : l.st!
      checkSection({ anon: true, ln: l.ln, lines: [l.line], bars: 0 }, inner, err, owner)
    }
  }
  // A line that's already been reported as a mistake doesn't need this too.
  const playable = read.some((l) => PLAYS.includes(l.kind))
  if (!playable && read.length === sec.lines.length) {
    err(sec.ln, sec.anon ? "This pattern has nothing to play" : `${sec.name} has nothing to play`)
  }
}

// Patterns in a row, one after another. A length in front of one repeats it for that long.
export function sequenceClip(
  items: Item[],
  state: State,
  err: Report,
  ln: number,
  stack: string[] = [],
): Clip | null {
  let t = 0
  const out: Omit<Clip, "durSec"> = { events: [], drumEvents: [], spans: [] }
  const seen = new Set<string>()
  for (const it of items) {
    const sec: Playable | null | undefined = it.items ? null : it.block || state.sections[it.name!]
    if (!it.items && !sec) {
      err(ln, undefinedName(it.name!, state))
      return null
    }
    // A with's block plays with its settings, and what's around it keeps its own
    const inner = it.with ? withState(it.with, state, ln, err) : state
    if (!inner) return null
    // A length in front of a pattern's name repeats it for that long. In front of braces
    // it is the block's own length, which is the same thing when the block has one, and
    // the only thing when its lines end in ... and it has none.
    let clip: Clip | null = it.items
      ? sequenceClip(it.items, state, err, ln, stack)
      : it.block
        ? sectionClip(
            { ...sec!, bars: it.bars || sec!.bars, shown: it.shown },
            inner,
            err,
            ln,
            stack,
          )
        : sectionClip(sec!, state, err, ln, stack)
    if (!clip) return null
    if (it.bars && !it.block) {
      const what = loopName(it)
      clip = layer([], [], [{ clip, what, ln }], state, it.bars, err, playCtx(ln))
      if (!clip) return null
    }
    const moved = shift(clip, t, it.name != null && seen.has(it.name))
    out.events.push(...moved.events)
    out.drumEvents.push(...moved.drumEvents)
    out.spans.push(...moved.spans)
    t += clip.durSec
    if (it.name) seen.add(it.name)
  }
  return { ...out, durSec: t }
}
