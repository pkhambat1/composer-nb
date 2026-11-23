import { describe, it, expect, vi } from "vitest"
import {
  play,
  firstError,
  allErrors,
  labels,
  notes,
  hits,
  durations,
  played,
  sound,
} from "./helpers.ts"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../src/music-engine.ts")

describe("time", () => {
  it("is two numbers: how many, over which note", () => {
    // A bar of seven eighth notes at 120 is 1.75 seconds.
    expect(durations("set time 7 over 8\nplay kick: x 13*-")).toEqual([1.75])
    expect(durations("set time 14 over 16\nplay kick: x 13*-")).toEqual([1.75])
    expect(durations("set time 4 over 4\nplay kick: x 15*-")).toEqual([2])
    expect(durations("set time 3 over 4\nplay kick: x 11*-")).toEqual([1.5])
    expect(durations("set time 6 over 8\nplay kick: x 11*-")).toEqual([1.5])
  })

  it("keeps 6 over 8 and 3 over 4 apart, though they'd divide to the same number", () => {
    const time = (src: string) => parseSource(src).outputs[0].blocks[0].time
    expect(time("set time 6 over 8\nplay kick: x 11*-")).toBe("6 over 8")
    expect(time("set time 3 over 4\nplay kick: x 11*-")).toBe("3 over 4")
  })

  it("takes arithmetic for either number, and remembers a sum as the grouping", () => {
    const p = parseSource("set time 3+4 over 4\nplay kick: x 27*-")
    expect(p.errors).toEqual([])
    expect(p.outputs[0].durSec).toBe(3.5)
    expect(p.outputs[0].blocks[0].time).toBe("3+4 over 4")
    expect(p.outputs[0].blocks[0].groups).toEqual([3, 4])
    expect(durations("set time (3 + 4) over 2*2\nplay kick: x 27*-")).toEqual([3.5])
  })

  it("isn't a division", () => {
    expect(firstError("set time 7/8")).toMatch(
      /\/ is division, so 7\/8 is the number 0.875, not a time. Write set time 7 over 8/,
    )
    expect(firstError("set time (3+4)/4")).toMatch(/Write set time 3\+4 over 4/)
    expect(firstError("set time 0.875")).toMatch(/time is how many notes over which note/)
    expect(firstError("set time 7 8")).toMatch(/time is how many notes over which note/)
  })

  it("only counts whole notes of a real note value", () => {
    expect(firstError("set time 3.5 over 4")).toMatch(/first number of time is how many/)
    expect(firstError("set time 7 over 3")).toMatch(
      /second number of time is the note being counted/,
    )
    expect(firstError("pattern over = { kick: x }")).toMatch(/over already means something/)
  })

  it("counts a beat as a quarter note in any time", () => {
    const p = parseSource("set time 7 over 8\nplay kick: x 5*- x 6*- x")
    expect(p.errors).toEqual([])
    expect(hits(p.outputs[0], "kick").map((e) => e.secStart * 2)).toEqual([0, 1.5, 3.25])
    expect(firstError("set time 7 over 8\nplay kick: 4&")).toMatch(/not beat lists/)
  })
})

describe("lengths", () => {
  const AB = "pattern aa = { piano: chords C }\npattern bb = { piano: chords G }\n"

  it("go in front of what they measure", () => {
    const want = sound("pattern gg = { kick: x--- }\nplay gg for 2 bars")
    expect(
      hits(parseSource("pattern gg = { kick: x--- }\nplay gg for 2 bars").outputs[0], "kick"),
    ).toHaveLength(8)
    expect(sound("pattern gg = 2 bars { kick: x--- }\nplay gg")).toBe(want)
    expect(sound("pattern gg = 2 bars {\n  kick: x---\n}\nplay gg")).toBe(want)
    expect(sound("pattern gg = { kick: x--- }\nplay block { 2 bars gg }")).toBe(want)
    expect(sound("play block {\n  pattern { kick: x--- }\n} for 2 bars")).toBe(want)
    expect(sound("play block {\n  2 bars pattern { kick: x--- }\n}")).toBe(want)
  })

  it("take any arithmetic", () => {
    expect(durations("pattern gg = { kick: x--- }\nplay gg for (1+2) bars")).toEqual([6])
    expect(durations("pattern gg = { kick: x--- }\nplay gg for 1/2 bars")).toEqual([1])
    expect(durations("pattern gg = { kick: x--- }\nplay gg for 1 bars")).toEqual([2])
  })

  it("cut a play's lines that are longer, and leave room after ones that are shorter", () => {
    expect(labels("play block { piano: chords C|G } for 1 bars")).toEqual(["C"])
    expect(durations("play block { piano: chords C|G } for 3 bars")).toEqual([6])
    expect(labels("play block { piano: chords C|G } for 3 bars")).toEqual(["C", "G"])
  })

  it("repeat a pattern for that long", () => {
    const o = parseSource("pattern beat = { kick: x--- }\nplay beat for 2 bars").outputs[0]
    expect(o.durSec).toBe(4)
    expect(hits(o, "kick")).toHaveLength(8)
    expect(labels(AB + "play (aa bb) for 4 bars")).toEqual(["C", "G", "C", "G"])
    // what repeats is the pattern at its own length
    const g = "pattern gg = 1 bars { kick: x--- }\n"
    expect(hits(parseSource(g + "play gg for 2 bars").outputs[0], "kick")).toHaveLength(8)
  })

  it("aren't needed: a pattern lasts until its lines line up again", () => {
    expect(durations("pattern gg = { kick: x--- }\nplay gg")).toEqual([0.5])
    // 4, 3 and 5 steps line up after 60
    const poly = "pattern poly = {\n  kick: x---,\n  tom.floor: x--,\n  snare: x----\n}\nplay poly"
    expect(durations(poly)).toEqual([7.5])
    expect(durations("play kick: x--")).toEqual([2])
    const odd =
      "pattern odd = {\n  kick: x------,\n  snare: x--------,\n  hat: x----------,\n  tom.high: x------------\n}\nplay odd"
    expect(firstError(odd)).toMatch(
      /What's in odd only lines up again after more than 64 bars. Say how long it is: pattern odd = 4 bars \{/,
    )
  })

  it("distinguish intrinsic lengths from a play duration", () => {
    expect(firstError("pattern gg = {\n  kick: x\n} 3 bars")).toMatch(/pattern gg = 3 bars \{/)
    expect(firstError("play block {\n  kick: x\n} 2 bars")).toMatch(
      /play block \{ \.\.\. \} for 2 bars/,
    )
  })

  it("explain lengths that don't work", () => {
    expect(firstError("bars: 8*- x 7*-")).toMatch(
      /pattern groove = 3 bars \{, or play groove for 3 bars/,
    )
    // A length that rounds to no ticks at all used to hang the parser when repeated
    expect(firstError("pattern pp = 0.001 bars { kick: x--- }\nplay pp for 4 bars")).toBe(
      "0.001 bars is shorter than the shortest note, so nothing fits in it",
    )
    expect(firstError("play block { kick: x--- } for 0.001 bars")).toMatch(
      /shorter than the shortest note/,
    )
    expect(firstError("play block { kick: x- } for 0 bars")).toMatch(/A length is a number of bars/)
    expect(firstError("play  for 3 bars")).toMatch(/play needs music before for/)
    expect(firstError("pattern gg = { kick: x }\nplay 3 gg")).toMatch(/needs bars after it/)
    expect(firstError("pattern gg = { kick: x } 3 bars")).toMatch(/pattern gg = 3 bars \{/)
    expect(firstError("pattern gg = { kick: x } nope")).toMatch(/"nope" isn't defined/)
    expect(firstError("pattern gg = pattern { kick: x } nope")).toMatch(
      /gg is a pattern, so its braces take no type/,
    )
  })
})

describe("partial final repetitions", () => {
  it("allows a bounded pattern to finish partway through its line", () => {
    const p = parseSource("pattern groove = 4 bars { piano: chords C|F|G }\nplay(groove)")
    expect(p.errors).toEqual([])
    expect(p.totalSec).toBe(8)
    expect(p.chords.map((e) => e.label)).toEqual(["C", "F", "G", "C"])
  })
  it("applies the same boundary to named patterns and inline plays", () => {
    const body = "{ kick: x | x | x, hat: x--- }"
    expect(sound("pattern groove = 4 bars " + body + "\nplay(groove)")).toBe(
      sound("play(pattern(" + body + ")) for 4 bars"),
    )
  })
  it("clips nested patterns and groups at their container's end", () => {
    for (const source of [
      "pattern groove = { kick: x | x | x }\nblock song = 4 bars { groove }\nplay(song)",
      "pattern aa = { piano: chords C }\npattern bb = { piano: chords G }\nplay({ 3 bars (aa bb) })",
    ]) {
      const p = parseSource(source)
      expect(p.errors).toEqual([])
      expect([...p.events, ...p.drumEvents].every((e) => e.secStart < p.totalSec)).toBe(true)
    }
  })
})

describe("lengths are always plural", () => {
  it("so bars says how long, and bar says which", () => {
    expect(durations("pattern gg = { kick: x--- }\nplay gg for 1 bars")).toEqual([2])
    expect(firstError("pattern gg = { kick: x--- }\nplay 1 bar gg")).toMatch(
      /Lengths are always plural, whatever the number: 1 bars/,
    )
    expect(firstError("pattern gg = 3 bar { kick: x--- }")).toMatch(/3 bars/)
    expect(firstError("play block {\n  2 bar { kick: x- }\n}")).toMatch(/2 bars/)
    expect(firstError("play snare: 1 beat rest, x---")).toMatch(/1 beats/)
    expect(firstError("play snare: {\n  1 step rest, x\n}")).toMatch(/not lengths/)
    expect(firstError("play (1+1) bar { kick: x- }")).toMatch(/\(1\+1\) bars/)
  })
})

describe("what plays in a bar", () => {
  it("repeats a placed pattern in the named range on every pass", () => {
    const o = parseSource(
      "pattern gg = 2 bars { kick: x---, pattern { snare: 4*- x 3*- } on bar 2 }\nplay gg for 4 bars",
    ).outputs[0]
    expect(hits(o, "kick")).toHaveLength(16)
    expect(hits(o, "snare").map((e) => e.secStart)).toEqual([2.5, 3.5, 6.5, 7.5])
  })
  it("gives named and inline block placements the same sound", () => {
    const prefix = "block lift = { snare.ghost: 8*- dd, hat.open: 10*- ^, hat.pedal: 12*- x- }\n"
    const groove =
      "pattern groove = { kick: x--x---, snare: 5*- x-, snare.ghost: --x----, hat: ^-x-, lift on bar 2 }\nwith time 7 over 8, tempo 90 { play groove for 4 bars }"
    expect(played(prefix + groove)).toEqual(
      played(
        groove.replace(
          "lift on bar 2",
          "block { snare.ghost: 8*- dd, hat.open: 10*- ^, hat.pedal: 12*- x- } on bar 2",
        ),
      ),
    )
  })
  it("adds without removing the groove and lets a later hit win", () => {
    const o = parseSource("pattern gg = { snare: x---, pattern { snare: ^--- } on bar 2 }\nplay gg")
      .outputs[0]
    expect(hits(o, "snare").map((e) => e.accent)).toEqual([
      ...Array(4).fill(false),
      ...Array(4).fill(true),
    ])
    const p = parseSource(
      "pattern gg = { kick: x---, 1 bars block { snare: 4*- x } on bar 2 }\nplay gg",
    )
    expect(p.errors).toEqual([])
    expect(hits(p.outputs[0], "kick")).toHaveLength(8)
    expect(hits(p.outputs[0], "snare")).toHaveLength(1)
  })
  it("extends implicit duration and rejects invalid ranges and old syntax", () => {
    expect(durations("pattern gg = { kick: x---, block { crash: x } on bar 3 }\nplay gg")).toEqual([
      6,
    ])
    for (const line of [
      "bar 2 { crash: x }",
      "block { crash: x } on bar 0",
      "block { crash: x } on bar 3 to 2",
    ]) {
      expect(parseSource("play block { " + line + " }").errors.length, line).toBeGreaterThan(0)
    }
    expect(firstError("play block { block { crash: x } on bar 2 } for 1 bars")).toMatch(
      /has no bar 2/,
    )
  })
})
