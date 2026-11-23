import { describe, it, expect, vi } from "vitest"
import { play, firstError, anyError, durations, sound } from "./helpers.ts"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../src/music-engine.ts")

describe("blocks without a name", () => {
  const BODY = "  kick: x---,\n  tom.floor: x--,\n  snare: x----"
  const SIZED = `pattern beat = 15 bars {\n${BODY}\n}\nplay beat`

  it("play inside another block, with a length in front", () => {
    expect(sound(`play block {\n15 bars pattern {\n${BODY}\n}\n}`)).toEqual(sound(SIZED))
    expect(sound(`play  block {\n  15 bars pattern {\n${BODY}\n  }\n}`)).toEqual(sound(SIZED))
  })

  it("repeat to fill what they're in, like a pattern with a name", () => {
    expect(
      sound(`play block {
  pattern {
${BODY}
  }
} for 15 bars`),
    ).toEqual(sound(SIZED))
  })

  it("play in a group with names", () => {
    const named = "pattern aa = { kick: x--- }\npattern bb = { snare: x--- }"
    expect(sound(`${named}\nplay (aa pattern { snare: x--- } aa)`)).toEqual(
      sound(`${named}\nplay (aa bb aa)`),
    )
    expect(sound(`${named}\nplay block { 1 bars pattern { snare: x--- } }`)).toEqual(
      sound(`${named}
play bb for 1 bars`),
    )
    expect(sound(`${named}\nplay (pattern {\n  snare: x---\n} aa)`)).toEqual(
      sound(`${named}\nplay (bb aa)`),
    )
    // After play, a length is the play's own, in front of a group as in front of a name
    expect(
      sound(`${named}
play (pattern { kick: x- } aa) for 2 bars`),
    ).toEqual(
      sound(`${named}
pattern cc = { kick: x- }
play (cc aa) for 2 bars`),
    )
    expect(sound(`${named}\nplay (2 bars pattern { kick: x- } aa)`)).toEqual(
      sound(`${named}\npattern cc = 2 bars { kick: x- }\nplay (cc aa)`),
    )
  })

  it("play together with the other lines in their braces", () => {
    expect(sound("play block {\n  pattern { kick: x--- },\n  snare: --x-\n}")).toEqual(
      sound("play block {\n  kick: 4*x---,\n  snare: --x-\n}"),
    )
  })

  it("go inside patterns and nest", () => {
    expect(
      sound(
        "pattern gg = {\n  2 bars pattern {\n    pattern { kick: x- },\n    snare: ----x---\n  }\n}\nplay gg",
      ),
    ).toEqual(sound("pattern hh = 2 bars {\n  kick: x-,\n  snare: ----x---\n}\nplay hh"))
  })

  it("keep a with's settings to themselves", () => {
    const p = parseSource("play (\n  with tempo 60 {\n    kick: x\n  }\n)\nplay kick: x")
    expect(p.errors).toEqual([])
    expect(p.outputs.map((o) => o.durSec)).toEqual([4, 2])
  })

  it("explain their mistakes", () => {
    expect(firstError(`{\n${BODY}\n}`)).toMatch(/Nothing plays this. Write play block \{/)
    expect(firstError(`15 bars {\n${BODY}\n}`)).toMatch(/play block \{ \.\.\. \} for 15 bars/)
    expect(firstError("play block {\n  {\n  },\n  kick: x\n}")).toMatch(
      /These braces have nothing in them/,
    )
    expect(firstError("play block {\n  pattern { steps pair = x- }\n}")).toMatch(
      /Nothing to play in this pattern/,
    )
    expect(anyError("play block {\n  piano: chords { Am }\n}")).toMatch(
      /Chords play one at a time, so they can't be layered in a block/,
    )
    expect(firstError("play block {\n  groove {\n    kick: x\n  }\n}")).toMatch(
      /"groove" isn't defined/,
    )
    expect(anyError("play block {\n  pattern bb = {\n    kick: x\n  }\n}")).toMatch(
      /Nothing to play in this play/,
    )
    expect(anyError("play block {\n  pattern bb {\n    kick: x\n  }\n}")).toMatch(
      /pattern bb = \{ \.\.\. \}/,
    )
    expect(firstError("pattern aa = {\n  pattern { aa }\n}")).toMatch(/a plays itself/)
    expect(firstError("play block {\n  { kick: x\n}")).toMatch(/needs a \} to close it/)
    expect(firstError("play groove { kick: x } }")).toMatch(/doesn't close anything/)
  })
})

describe("groups: what plays in order", () => {
  const G = "pattern gg = { kick: x--- }\n"
  const S = "pattern ss = { snare: x--- }\n"
  const TWO = "  pattern {\n    snare: x---\n  }"

  it("hold names, blocks, groups and lines, one after another", () => {
    expect(sound(G + `play (pattern {\n    snare: x---\n  } pattern {\n    gg\n  })`)).toBe(
      sound(G + S + "play (ss gg)"),
    )
    expect(sound("play (pattern { kick: x--- } pattern { snare: x--- })")).toBe(
      sound(G + S + "play (gg ss)"),
    )
    expect(sound(G + "play (gg pattern { snare: x--- })")).toBe(sound(G + S + "play (gg ss)"))
    expect(sound(G + "play (pattern {\n  snare: x---\n} gg)")).toBe(sound(G + S + "play (ss gg)"))
    expect(sound(G + "play (gg (gg gg) gg)")).toBe(sound(G + "play (gg gg gg gg)"))
    expect(sound(G + "pattern pp = (pattern {\n  gg\n} gg)\nplay pp")).toBe(
      sound(G + "play (gg gg)"),
    )
    expect(sound(G + "play (\n  kick: x---\n  snare: x---\n)")).toBe(
      sound("play ({ kick: x--- } { snare: x--- })"),
    )
  })

  it("read a newline in them as a space, and take a length on what's in them", () => {
    expect(sound(G + "play (gg\n  gg)")).toBe(sound(G + "play (gg gg)"))
    expect(durations(G + "play (gg 2 bars (gg gg) gg)")).toEqual([5])
  })

  it("leave blocks on lines of their own playing together", () => {
    const together = sound(G + `play block {\n${TWO},\n  pattern {\n    gg\n  }\n}`)
    expect(together).toBe(sound(G + "play block {\n  snare: 4*x---,\n  gg\n}"))
    expect(together).not.toBe(
      sound(G + `play (pattern {\n    snare: x---\n  } pattern {\n    gg\n  })`),
    )
  })

  it("are asked for where a line would play two things", () => {
    expect(firstError(G + `play block {\n${TWO} pattern {\n    gg\n  }\n}`)).toBe(
      "What plays in order goes in brackets: (pattern { ... } pattern { ... })",
    )
    expect(firstError("play block { kick: x--- } { snare: x--- }")).toBe(
      "What plays in order goes in brackets: play (block { ... } block { ... })",
    )
    expect(firstError("play pattern { kick: x--- } { snare: x--- }")).toBe(
      "What plays in order goes in brackets: play (pattern { ... } pattern { ... })",
    )
    expect(firstError(G + "play block {\n  kick: x---\n} gg")).toBe(
      "What plays in order goes in brackets: play (block { ... } gg)",
    )
    expect(firstError(G + "play block {\n  gg pattern {\n    snare: x---\n  }\n}")).toBe(
      "What plays in order goes in brackets: (gg pattern { ... })",
    )
    expect(firstError(G + "play gg 2 bars (gg gg)")).toBe(
      "What plays in order goes in brackets: (gg 2 bars (gg gg))",
    )
    expect(firstError(G + "play (gg gg) (gg)")).toBe(
      "What plays in order goes in brackets: ((gg gg) (gg))",
    )
    expect(firstError(G + "pattern pp = {\n  gg\n} gg\nplay pp")).toMatch(
      /What plays in order goes in brackets/,
    )
    // A name that isn't defined is said first
    expect(firstError("play block {\n  groove {\n    kick: x\n  }\n}")).toMatch(
      /"groove" isn't defined/,
    )
  })

  it("make then a name like any other", () => {
    expect(sound("pattern then = { kick: x--- }\nplay then")).toBe(sound(G + "play gg"))
    expect(firstError(G + "play gg then gg")).toMatch(/"then" isn't defined/)
  })

  it("play straight after play, like a group anywhere else", () => {
    expect(sound("play (pattern {\n  kick: x---\n} pattern {\n  snare: x---\n})")).toBe(
      sound(G + S + "play (gg ss)"),
    )
    expect(durations(G + "play (pattern { kick: x- } gg) for 2 bars")).toEqual([4])
  })
})
