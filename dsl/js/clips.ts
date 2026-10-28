/* Clips: what lines sound like together. A clip is events in seconds from its start, the
   drums' and the pitched instruments', and spans that say what bar grid is over them.
   layer plays a block's lines, and the clips already made from its patterns, together:
   whatever repeats fits, the lower line wins a moment, and swing moves the sound. */
import type { PartLine, Played } from "./lines.ts"
import { readPart } from "./lines.ts"
import type { State } from "./state.ts"
import {
  checkLoops,
  fmt,
  lcm,
  MAX_BARS,
  meterOf,
  nearWhole,
  sayTicks,
  swingWarp,
  type Report,
} from "./time.ts"
import type { ChordEvent } from "./values/chart.ts"
import type { NoteEvent } from "./values/notes.ts"
import type { DrumHit } from "./values/steps.ts"

// Where an event sounds, in seconds from its clip's start
export type Timed = { secStart: number; secDur?: number; secSwing?: number; gapSec?: number }
export type SoundEvent = (NoteEvent | ChordEvent) & Timed
export type NoteSound = NoteEvent & Timed
export type ChordSound = ChordEvent & Timed
export const isNote = (e: SoundEvent): e is NoteSound => "note" in e
export const isChord = (e: SoundEvent): e is ChordSound => "chord" in e
export type HitEvent = DrumHit & Timed
// A stretch of a clip with one meter and tempo: the bar grid over it
export type Span = ReturnType<typeof meterOf> & { startSec: number; durSec: number }
export type Clip = {
  durSec: number
  events: SoundEvent[]
  drumEvents: HitEvent[]
  spans: Span[]
  ln?: number // the line it was played from
  until?: number // put in a bar: the last bar it's in
}
// A clip that repeats to fill what it's in, what to call it, and its line
export type Repeated = { clip: Clip; what: string; ln: number }
// Where something is played from, for its length and its messages
export type Ctx = {
  ln?: number
  repeats: boolean // in a pattern, everything repeats until it ends
  where: string
  what: string
  sized?: string
  cuts?: boolean // a play with a length of its own stops there
}

// Where something is being played from. In a pattern everything repeats until it ends; in
// a play, lines play once and only patterns repeat.
export const blockCtx = (name: string, ln: number): Ctx => ({
  ln,
  repeats: true,
  where: `in ${name}`,
  what: name,
  sized: `pattern ${name} = 4 bars {`,
})
export const playCtx = (ln: number): Ctx => ({
  ln,
  repeats: false,
  where: "in this play",
  what: "This play",
  sized: "play 4 bars { ... }",
})
// A play's own length is how long its output is: what's in it is cut there, so it doesn't
// have to fit.
export const outputCtx = (ln: number): Ctx => ({ ...playCtx(ln), cuts: true })
export const anonCtx = (ln: number): Ctx => ({
  ln,
  repeats: true,
  where: "in this pattern",
  what: "This pattern",
  sized: "4 bars { ... }",
})
// A with's block is a pattern of its own, played with the with's settings.
export const withCtx = (ln: number, shown: string): Ctx => ({
  ...anonCtx(ln),
  where: "in this with",
  what: "This with",
  sized: `4 bars ${shown} { ... }`,
})
// What plays at its own pace is a pattern of its own, whose length comes from its lines
// or from a length in front of its braces.
export const paceCtx = (ln: number): Ctx => ({
  ...anonCtx(ln),
  where: "at this pace",
  sized: "every 3 steps 4 bars { ... }",
})
// What plays in a bar is a pattern that lasts that bar.
export const placeCtx = (l: { ln: number; from: number; to: number }): Ctx => {
  const bars = l.from === l.to ? `bar ${l.from}` : `bar ${l.from} to ${l.to}`
  return { ln: l.ln, repeats: true, where: `in ${bars}`, what: `What's in ${bars}` }
}

// `clip` played end to end until `durSec`. The last time through may be cut short.
function tile(clip: Clip, durSec: number): Clip {
  const out: Omit<Clip, "durSec"> = { events: [], drumEvents: [], spans: [] }
  if (!(clip.durSec > 0)) return { ...out, durSec } // nothing to repeat
  const times = Math.ceil(durSec / clip.durSec - 1e-6)
  for (let k = 0; k < times; k++) {
    const moved = shift(clip, k * clip.durSec, k > 0)
    out.events.push(...moved.events)
    out.drumEvents.push(...moved.drumEvents)
    out.spans.push(...moved.spans)
  }
  return { ...out, durSec }
}

// Plays instrument lines (`parts`) and already-evaluated clips together from the same
// start. `once` clips play once; `repeated` ones ({ clip, what, ln }) repeat to fill. A
// `once` clip that was put in a bar says the last bar it's in (`until`).
// In a pattern (ctx.repeats) the lines repeat too, and without `bars` it lasts until
// everything in it lines up again. In a play the lines play once, and it lasts as long as
// the longest thing in it. Whatever repeats has to fit, except in a play with a length of
// its own (ctx.cuts), which stops there. A line ended in ... (`open`) plays once, has no
// say in the length, and has to fit in it.
export function layer(
  parts: PartLine[],
  once: Clip[],
  repeated: Repeated[],
  st: State,
  bars: number,
  err: Report,
  ctx: Ctx,
): Clip | null {
  const meter = meterOf(st)
  const { barTicks, secPerTick } = meter
  const read = parts
    .map((p) => readPart(p, p.st ?? st, barTicks, err))
    .filter((p): p is Played => p !== null)
  if (read.length < parts.length) return null
  if (!read.length && !once.length && !repeated.length) return null
  // One pattern or group on its own, with no length to fill, is what it plays: it may be
  // at a pace of its own, which this block's bars don't measure.
  if (!bars && !read.length && !once.length && repeated.length === 1) return repeated[0].clip
  // What plays together shares one time, tempo and swing. Something that changes them,
  // inside a group, plays at its own pace, so it can only sound on its own.
  if (read.length + once.length + repeated.length > 1) {
    const paced: Repeated[] = [
      ...once.map((c) => ({ clip: c, what: "What's in this bar", ln: c.ln! })),
      ...repeated,
    ]
    for (const r of paced) {
      const own = r.clip.spans.find(
        (s) => s.time !== meter.time || s.tempo !== meter.tempo || s.swing !== meter.swing,
      )
      if (!own) continue
      const which = own.time !== meter.time ? "time" : own.tempo !== meter.tempo ? "tempo" : "swing"
      err(
        r.ln,
        `${r.what} changes the ${which}, so it can't sound together with other lines. ` +
          `Play it on its own, or put the with around the whole play: with ${which} ${which === "time" ? own.time : which === "tempo" ? own.tempo : own.swing ? "on" : "off"} { play ... }`,
      )
      return null
    }
  }
  const fixed = read.filter((p) => !("open" in p && p.open))
  const loops = [
    ...(ctx.repeats
      ? fixed.map((p) => ({ what: `The ${p.part.name} line`, ticks: p.ticks, ln: p.part.ln }))
      : []),
    ...repeated.map((r) => ({ ...r, ticks: r.clip.durSec / secPerTick })),
  ]
  const placed = once.filter((c) => c.until).sort((a, b) => b.until! - a.until!)[0]
  const named = placed ? placed.until! * barTicks : 0 // through the last bar that's named
  const lengths = [
    ...fixed.map((p) => p.ticks),
    ...[...once, ...repeated.map((r) => r.clip)].map((c) => Math.round(c.durSec / secPerTick)),
  ]
  if (!bars && !lengths.length) {
    err(
      ctx.ln ?? read[0].part.ln,
      `Every line ${ctx.where} ends in ..., so nothing says how long it is. Say so: ${ctx.sized}`,
    )
    return null
  }
  let totalTicks: number
  if (bars) {
    totalTicks = Math.round(bars * barTicks)
    // A length too short for a single tick would be a clip of no length, which nothing
    // can be filled with.
    if (totalTicks < 1) {
      err(ctx.ln!, `${fmt(bars)} bars is shorter than the shortest note, so nothing fits in it`)
      return null
    }
  } else if (ctx.repeats) {
    const whole = loops.filter((l) => nearWhole(l.ticks)).map((l) => Math.round(l.ticks))
    totalTicks = whole.reduce(lcm, 1)
    // ...and long enough to have the bars it names
    totalTicks *= Math.max(1, Math.ceil(named / totalTicks))
    if (totalTicks > MAX_BARS * barTicks) {
      err(
        ctx.ln ?? loops[0].ln,
        `What's ${ctx.where} only lines up again after more than ${MAX_BARS} bars. ` +
          `Say how long it is: ${ctx.sized}`,
      )
      return null
    }
  } else totalTicks = Math.max(...lengths)
  if (named > totalTicks) {
    err(
      placed.ln!,
      `${ctx.what} is ${sayTicks(totalTicks, st, barTicks)} long, so it has no bar ${placed.until}`,
    )
    return null
  }
  if (!(ctx.cuts && bars) && !checkLoops(loops, totalTicks, st, barTicks, err)) return null
  for (const p of read) {
    if ("open" in p && p.open && p.ticks > totalTicks && !(ctx.cuts && bars)) {
      err(
        p.part.ln,
        `${ctx.what} is ${sayTicks(totalTicks, st, barTicks)} long, and the ${p.part.name} ` +
          `line's hits run ${sayTicks(p.ticks, st, barTicks)} before its ...`,
      )
      return null
    }
  }
  const durSec = totalTicks * secPerTick
  // Swing moves the sound, not the writing: secSwing is how much later a hit plays than
  // where it's written, and the grid and the sheet stay straight.
  const warp = swingWarp(st)
  const late = (tick: number) => (warp ? { secSwing: (warp(tick) - tick) * secPerTick } : {})
  const own = read.map((p) => {
    const line: Clip = { ln: p.part.ln, durSec: 0, events: [], drumEvents: [], spans: [] }
    for (const e of p.expand(totalTicks, ctx.repeats && !("open" in p && p.open))) {
      if ("lane" in e) {
        // A double's second stroke keeps how far it is from the first, to go with it.
        const gap = e.gap ? { gapSec: e.gap * secPerTick } : {}
        line.drumEvents.push({ ...e, secStart: e.tick * secPerTick, ...gap, ...late(e.tick) })
      } else {
        line.events.push({
          ...e,
          secStart: e.tick * secPerTick,
          secDur: (e as { ticks: number }).ticks * secPerTick,
          ...late(e.tick),
        })
      }
    }
    return line
  })
  const clips: Clip[] = [...once, ...repeated.map((r) => ({ ...tile(r.clip, durSec), ln: r.ln }))]
  // In the order they're written, so what plays at the same moment keeps that order.
  const all = [...own, ...clips].sort((a, b) => a.ln! - b.ln!)
  const inside = (e: Timed) => e.secStart < durSec - 1e-9
  const moment = (e: Timed) => Math.round(e.secStart * 1e6)
  // Where two lines give an instrument a note at the same moment, the lower line's is the
  // one played, as with a drum. Layers in an instrument's block are voices of their own.
  const sounded = new Map<string, { from: number; e: SoundEvent }>() // instrument, voice and moment → the line that won, and its note
  const lost = new Set<SoundEvent>()
  all.forEach((c, from) => {
    for (const e of c.events) {
      if (!("note" in e) || !inside(e)) continue
      const at = `${e.instrument} ${e.voice} ${moment(e)}`
      const had = sounded.get(at)
      if (had && had.from !== from) lost.add(had.e)
      sounded.set(at, { from, e })
    }
  })
  const events = all
    .flatMap((c) => c.events)
    .filter((e) => inside(e) && !lost.has(e))
    // A note still sounding at the end stops there.
    .map((e) => (e.secStart + e.secDur! > durSec ? { ...e, secDur: durSec - e.secStart } : e))
  // A hi-hat can't be open and closed at once, so an open hit replaces a closed one at the
  // same moment. The next hi-hat hit closes it.
  const opened = new Set(
    all.flatMap((c) => c.drumEvents.filter((e) => e.lane === "hat.open").map(moment)),
  )
  // Where two lines hit the same drum at the same moment, the lower line wins, as in a
  // block of steps. A rest never does, and a double's second stroke goes with its first.
  const hits = new Map<string, { from: number; strokes: HitEvent[] }>() // drum and moment → the line that won, and its strokes there
  all.forEach((c, from) => {
    for (const e of c.drumEvents) {
      if (!inside(e) || (e.lane === "hat" && opened.has(moment(e)))) continue
      const at = `${e.lane} ${Math.round((e.secStart - (e.gapSec || 0)) * 1e6)}`
      const had = hits.get(at)
      if (had?.from === from) had.strokes.push(e)
      else hits.set(at, { from, strokes: [e] })
    }
  })
  const drumEvents = [...hits.values()].flatMap((h) => h.strokes)
  events.sort((a, b) => a.secStart - b.secStart)
  drumEvents.sort((a, b) => a.secStart - b.secStart)
  // The grid follows the longest sequence, then this block's own bars after it.
  const lead = clips
    .filter((c) => !c.until)
    .reduce<Clip | null>((a, c) => (!a || c.durSec > a.durSec ? c : a), null)
  const spans: Span[] = []
  let covered = 0
  if (lead) {
    for (const sp of lead.spans) {
      if (sp.startSec >= durSec - 1e-9) continue
      spans.push({ ...sp, durSec: Math.min(sp.durSec, durSec - sp.startSec) })
    }
    covered = Math.min(lead.durSec, durSec)
  }
  if (durSec > covered + 1e-9) spans.push({ ...meter, startSec: covered, durSec: durSec - covered })
  return { durSec, events, drumEvents, spans }
}

export function shift(clip: Clip, by: number, again: boolean): Omit<Clip, "durSec"> {
  return {
    events: clip.events.map((e) => ({
      ...e,
      secStart: e.secStart + by,
      repeat: e.repeat || again,
    })),
    drumEvents: clip.drumEvents.map((e) => ({ ...e, secStart: e.secStart + by })),
    spans: clip.spans.map((s) => ({ ...s, startSec: s.startSec + by })),
  }
}
