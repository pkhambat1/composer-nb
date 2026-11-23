import { describe, it, expect, vi } from "vitest"
import { play, firstError, labels, hits, durations, sound } from "./helpers.ts"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../src/music-engine.ts")

const WHAT_HAPPENS_NOW = `// what happens now: crash once, the groove repeating under it
set time 7 over 8

pattern groove = 3 bars {
  kick: x--x---,
  snare: ----x--,
  ride.bell: x--
}

play block {
  crash: x 13*-,
  groove
} for 6 bars`

describe("play", () => {
  it("gives one output each", () => {
    const p = parseSource("play kick: x--x\nplay snare: --x-")
    expect(p.errors).toEqual([])
    expect(p.outputs.map((o) => o.drumEvents.map((e) => e.lane))).toEqual([
      ["kick", "kick"],
      ["snare"],
    ])
  })

  it("plays everything in its braces together, so a hit can play once over a pattern", () => {
    const p = parseSource(WHAT_HAPPENS_NOW)
    expect(p.errors).toEqual([])
    expect(p.outputs).toHaveLength(1)
    const o = p.outputs[0]
    expect(o.durSec).toBe(10.5)
    expect(hits(o, "crash").map((e) => e.secStart)).toEqual([0])
    expect(hits(o, "ride.bell")).toHaveLength(28)
    expect(hits(o, "kick")).toHaveLength(24)
    expect(hits(o, "snare")).toHaveLength(12)
    expect(o.blocks.map((b) => [b.time, b.bars])).toEqual([["7 over 8", 6]])
  })

  it("takes one line or a block, and they mean the same", () => {
    const groove =
      "set time 7 over 8\npattern groove = 3 bars {\n  ride.bell: x--,\n  kick: x--x---\n}\n"
    const want = sound(groove + "play groove for 6 bars")
    expect(sound(groove + "play block { 6 bars groove }")).toBe(want)
    expect(sound(groove + "play block {\n  6 bars groove\n}")).toBe(want)
    expect(sound(groove + "play block {\n  groove\n} for 6 bars")).toBe(want)
    expect(sound("play kick: x--x")).toBe(sound("play block {\n  kick: x--x\n}"))
  })

  it("lasts as long as the longest thing in it", () => {
    const one = "pattern one = { piano: chords C }\n"
    expect(durations(one + play("piano: chords F|G|A", "one"))).toEqual([6])
    expect(durations(one + play("crash: x 15*-", "(one one one one)"))).toEqual([8])
  })

  it("explains mistakes in play lines", () => {
    expect(firstError("play nope")).toMatch(
      /"nope" isn't defined. Name it first: pattern nope = \{ \.\.\. \}/,
    )
    expect(firstError("pattern aa = { piano: chords C }\nplay nope")).toMatch(
      /"nope" isn't defined. Patterns so far: a/,
    )
    expect(firstError("pattern aa = { piano: chords C }\nplay (aa")).toMatch(/missing its \)/)
  })

  it("refuses an output over 10 minutes long", () => {
    const p = parseSource("set tempo 20\npattern aa = { piano: chords C }\nplay aa for 64 bars")
    expect(p.errors[0].msg).toMatch(/over 10 minutes/)
    expect(p.outputs).toEqual([])
  })
})

describe("playing in order", () => {
  const AB = "pattern aa = { piano: chords C }\npattern bb = { piano: chords G }\n"

  it("plays what's in ( ) one after another, and a line plays one thing", () => {
    expect(labels(AB + "play (aa bb bb)")).toEqual(["C", "G", "G"])
    expect(labels(AB + "play (aa bb) for 4 bars")).toEqual(["C", "G", "C", "G"])
    expect(labels(AB + "play (aa 2 bars bb aa)")).toEqual(["C", "G", "G", "C"])
    expect(labels(AB + "play ((aa bb) bb)")).toEqual(["C", "G", "G"])
    // a newline in a group is a space
    expect(labels(AB + "play (\n  aa\n  bb\n)")).toEqual(["C", "G"])
    expect(firstError(AB + "play aa bb")).toBe("What plays in order goes in brackets: (aa bb)")
    expect(firstError(AB + "play aa 2 bars bb")).toBe(
      "What plays in order goes in brackets: (aa 2 bars bb)",
    )
    expect(firstError(AB + "play aa nope")).toMatch(/"nope" isn't defined/)
    expect(firstError(AB + "play ()")).toMatch(/These brackets have nothing in them/)
    expect(firstError(AB + "play aa)")).toMatch(/This \) doesn't close anything/)
  })

  it("keeps * for arithmetic, since a length in front is how to repeat", () => {
    expect(firstError(AB + "play aa * 2")).toMatch(
      /\* only multiplies numbers. To repeat, put a length in front: 4 bars a/,
    )
    expect(firstError(AB + "play (aa bb) * 2")).toMatch(/4 bars \( \.\.\. \)/)
    expect(firstError(AB + "play (pattern { piano: chords F } * 2)")).toMatch(
      /4 bars pattern \{ \.\.\. \}/,
    )
    expect(labels(AB + "play (aa bb) for 2*2 bars")).toEqual(["C", "G", "C", "G"])
  })
})

describe("patterns repeat, and a play's own lines play once", () => {
  const AB = "pattern aa = { piano: chords C }\npattern bb = { piano: chords G }\n"

  it("repeats every line in a pattern until it ends", () => {
    const o = parseSource(
      "pattern beat = 2 bars {\n  kick: x---,\n  snare: 4*- x 3*-,\n  piano: chords C\n}\nplay beat",
    ).outputs[0]
    expect(hits(o, "kick")).toHaveLength(8)
    expect(hits(o, "snare")).toHaveLength(4)
    expect(o.chords.map((e) => e.label)).toEqual(["C", "C"])
  })

  it("plays a play's own lines once", () => {
    const o = parseSource("play kick: x--- for 2 bars").outputs[0]
    expect(o.durSec).toBe(4)
    expect(hits(o, "kick")).toHaveLength(1)
    expect(
      hits(
        parseSource(play("piano: chords C|G|F|C", "snare: 4*- x 7*- x 3*-")).outputs[0],
        "snare",
      ),
    ).toHaveLength(2)
  })

  it("repeats a pattern on a line of its own until the play ends", () => {
    const o = parseSource("pattern beat = { kick: x--- }\n" + play("piano: chords C|G", "beat"))
      .outputs[0]
    expect(o.durSec).toBe(4)
    expect(hits(o, "kick")).toHaveLength(8)
    expect(labels(AB + play("pattern { kick: x 15*- } on bar 4", "(aa bb)"))).toEqual([
      "C",
      "G",
      "C",
      "G",
    ])
  })

  it("lets a crash play once over a pattern that repeats", () => {
    const o = parseSource("pattern beat = { kick: x--- }\n" + play("crash: x 15*-", "4 bars beat"))
      .outputs[0]
    expect(hits(o, "crash")).toHaveLength(1)
    expect(hits(o, "kick")).toHaveLength(16)
  })
})

describe("events", () => {
  it("count their ticks from the start of their block, as the block's own events do", () => {
    const p = parseSource(
      "pattern aa = {\n  kick: x---\n}\npattern bb = {\n  snare: x---\n}\nplay (aa bb)",
    )
    expect(p.drumEvents.map((e) => [e.lane, e.tick])).toEqual([
      ["kick", 0],
      ["snare", 96],
    ])
    expect(p.blocks[0].drumEvents.map((e) => [e.lane, e.tick])).toEqual([
      ["kick", 0],
      ["snare", 96],
    ])
  })
})
