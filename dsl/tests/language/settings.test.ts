import { describe, it, expect, vi } from "vitest"
import { play, firstError, notes, hits, durations, played, sound } from "./helpers.ts"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../src/music-engine.ts")

describe("settings", () => {
  it("apply from where they're written", () => {
    expect(durations("play piano: chords C\nset tempo 60\nplay piano: chords C")).toEqual([2, 4])
  })

  it("carry on into the cells below, and say so", () => {
    const above = parseSource("set tempo 90\nset key A\nset mode minor").state
    const p = parseSource("play piano: chords i vM", above)
    expect(p.chords.map((e) => e.label)).toEqual(["Am", "E"])
    expect(p.fromAbove).toEqual(["tempo 90", "key A", "mode minor"])
  })

  it("say every setting and sound they carry on, swing too", () => {
    const above = parseSource("set swing on\nset tempo 90\nset guitar.electric muted").state
    expect(parseSource("play kick: x-", above).fromAbove).toEqual([
      "tempo 90",
      "swing on",
      "guitar.electric muted",
    ])
    // what this cell sets again isn't from above
    const again = parseSource("set guitar.electric clean\nset swing off\nplay kick: x-", above)
    expect(again.fromAbove).toEqual(["tempo 90"])
  })

  it("go on a with inside a block, so a block's lines can each have their own", () => {
    const by = (src: string) =>
      Object.fromEntries(parseSource(src).notes.map((e) => [e.instrument, e.note.name]))
    expect(
      by(
        "play block {\n  with octave 4 { piano: notes i--- },\n  with octave 2 { bass: notes i--- }\n}",
      ),
    ).toEqual({
      piano: "C4",
      bass: "C2",
    })
    expect(
      by("pattern aa = {\n  piano: notes i---,\n  with key E { bass: notes i--- }\n}\nplay aa"),
    ).toEqual({
      piano: "C3",
      bass: "E3",
    })
    // a pattern plays with the settings where it's played
    expect(
      by(
        "pattern up = { piano: notes i--- }\nplay block {\n  up,\n  with key E { bass: notes i--- }\n}",
      ),
    ).toEqual({
      piano: "C3",
      bass: "E3",
    })
    // the header shows the key the block starts in
    const b = parseSource(
      "play block {\n  with key G { piano: notes i--- },\n  with key E { bass: notes i--- }\n}",
    ).outputs[0].blocks[0]
    expect(b.key).toBe("G")
  })

  it("are set only at the top: inside a block, they go on a with", () => {
    expect(firstError("play block {\n  kick: x---,\n  set tempo 60\n}")).toBe(
      "Inside a block, settings go on a with: with tempo 60 { ... }",
    )
    expect(firstError("pattern pp = {\n  set octave 2,\n  bass: notes i---\n}\nplay pp")).toBe(
      "Inside a block, settings go on a with: with octave 2 { ... }",
    )
    expect(firstError("with key E {\n  set mode minor,\n  play piano: notes i---\n}")).toBe(
      "Inside a block, settings go on a with: with mode minor { ... }",
    )
    expect(durations("set tempo 60\nplay kick: x 15*-")).toEqual([4])
  })
})

describe("every", () => {
  it("uses beat lengths for eighths, triplets and dotted eighths", () => {
    expect(durations("play every 1/2 beats hat: x-xx-xxx")).toEqual([2])
    expect(durations("play every 1/3 beats hat: x-x")).toEqual([2])
    expect(durations("play every 3/4 beats hat: x-")).toEqual([2])
    expect(durations("play every 4 beats kick: x-")).toEqual([4])
  })
  it("scopes steps and allows a nested change back to sixteenths", () => {
    expect(sound("play every 1/2 beats { every 1/4 beats hat: x- }")).toBe(sound("play hat: x-"))
    expect(sound("play block { hat: x-xx, every 1/2 beats { kick: x- } }")).toBe(
      sound("play block { hat: x-xx, kick: x--- }"),
    )
    expect(
      durations(
        "pattern feet = every 3/4 beats { kick: ^-^^-^--, hat.pedal: -x--x-xx }\nplay feet",
      ),
    ).toEqual([3])
  })
  it("rejects old units, redundant pace, and invalid lengths", () => {
    for (const source of [
      "play every 2 steps hat: x-",
      "play every 1 bars hat: x-",
      "play every 1/2 beats { every 1/2 beats hat: x- }",
      "play every 0 beats hat: x-",
      "play every 0.001 beats hat: x-",
    ]) {
      expect(parseSource(source).errors.length, source).toBeGreaterThan(0)
    }
    expect(firstError("pattern every = { kick: x }")).toMatch(/every already means something/)
  })
})

describe("swing", () => {
  it("moves the off-beat late in the sound, and nowhere in the writing", () => {
    const p = parseSource("set swing on\nplay hat: x-x-x-x-")
    expect(p.errors).toEqual([])
    const hits = p.outputs[0].drumEvents
    const sounds = (events: { secStart: number; secSwing?: number }[]) =>
      events.map((e) => e.secStart + (e.secSwing || 0))
    const near = (got: number[], want: number[]) => {
      expect(got).toHaveLength(want.length)
      got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 4))
    }
    // at 120 a beat is half a second: the & sounds two thirds of the way through it, as a
    // triplet's third note, and is written halfway
    near(sounds(hits), [0, 1 / 3, 0.5, 0.5 + 1 / 3])
    near(
      hits.map((e) => e.secStart),
      [0, 0.25, 0.5, 0.75],
    )
    expect(p.outputs[0].blocks[0].drumEvents.map((e) => e.tick)).toEqual([0, 48, 96, 144])
    // sixteenths move with the eighth they belong to
    near(sounds(parseSource("set swing on\nplay hat: xxxx").outputs[0].drumEvents), [
      0,
      1 / 6,
      1 / 3,
      5 / 12,
    ])
  })

  it("is on or off, and off unless it's set", () => {
    const rule =
      "swing is on or off: set swing on plays the off-beat eighths late, as a triplet feel"
    expect(firstError("set swing 67")).toBe(rule)
    expect(firstError("set swing On")).toBe(rule)
    expect(firstError("with swing true { play hat: x- }")).toBe(
      "swing is on or off: with swing on plays the off-beat eighths late, as a triplet feel",
    )
    for (const src of ["play hat: x-x-", "set swing on\nset swing off\nplay hat: x-x-"]) {
      expect(parseSource(src).outputs[0].drumEvents.every((e) => e.secSwing === undefined)).toBe(
        true,
      )
    }
  })
})
