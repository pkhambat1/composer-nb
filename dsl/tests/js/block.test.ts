import { describe, expect, it } from "vitest"
import { highlightMusic } from "../../js/highlight.ts"
import { parseCell } from "../../js/language.ts"

describe("explicit blocks", () => {
  it("does not register untyped declarations", () => {
    const parsed = parseCell("beat = { kick: x- }")
    expect(parsed.errors.length).toBeGreaterThan(0)
    expect(parsed.state.sections.beat).toBeUndefined()
    expect(parsed.state.words.beat).toBeUndefined()
  })
  it("plays block lines once while pattern lines repeat, regardless of sibling order", () => {
    for (const lines of ["one,\nlooped", "looped,\none"]) {
      const parsed = parseCell(
        `block one = { kick: x- }
pattern looped = { snare: ---x }
play block {
${lines}
} for 2 bars`,
      )
      expect(parsed.errors).toEqual([])
      expect(parsed.drumEvents.filter((event) => event.lane === "kick")).toHaveLength(1)
      expect(parsed.drumEvents.filter((event) => event.lane === "snare")).toHaveLength(8)
    }
  })
  it("keeps a block nonrepeating inside a pattern", () => {
    const parsed = parseCell(
      "block accent = { crash: x- }\npattern groove = {\n accent,\n kick: x---\n}\nplay groove for 2 bars",
    )
    expect(parsed.errors).toEqual([])
    expect(parsed.state.sections.accent.type).toBe("block")
    expect(parsed.drumEvents.filter((event) => event.lane === "crash")).toHaveLength(1)
  })
  it("pads a longer play with silence rather than repeating a block", () => {
    const parsed = parseCell("block once = { kick: x- }\nplay once for 4 bars")
    expect(parsed.errors).toEqual([])
    expect(parsed.drumEvents.filter((event) => event.lane === "kick")).toHaveLength(1)
  })
})

describe("typed braces", () => {
  const lane = (parsed: ReturnType<typeof parseCell>, name: string) =>
    parsed.drumEvents.filter((event) => event.lane === name)
  const clean = (source: string) => {
    const parsed = parseCell(source)
    expect(parsed.errors).toEqual([])
    return parsed
  }
  const firstError = (source: string) => parseCell(source).errors[0]?.msg
  const UNTYPED = "These braces need a type: pattern { ... } repeats, block { ... } plays once"
  const CELL = "  snare.cross: ----x---,\n  piano: notes i---v---iii---octave(i)---"

  it("plays a play's own lines once", () => {
    const parsed = clean(`play block {\n${CELL}\n} for 2 bars`)
    expect(lane(parsed, "snare.cross")).toHaveLength(1)
    expect(parsed.events).toHaveLength(4)
  })
  it("repeats every line of play pattern, as a named pattern does", () => {
    const parsed = clean(`play pattern {\n${CELL}\n}`)
    const named = clean(`pattern groove = {\n${CELL}\n}\nplay groove`)
    expect(lane(parsed, "snare.cross")).toHaveLength(2)
    expect(parsed.drumEvents.map((e) => e.secStart)).toEqual(
      named.drumEvents.map((e) => e.secStart),
    )
    expect(parsed.totalSec).toBe(named.totalSec)
  })
  it("stops play pattern at its length, whether or not its lines fit", () => {
    const parsed = clean(`play pattern {\n${CELL}\n} for 4 bars`)
    expect(lane(parsed, "snare.cross")).toHaveLength(8)
    expect(parsed.events).toHaveLength(16)
    expect(parsed.totalSec).toBe(8)
    const cut = clean("play pattern {\n  kick: x--\n} for 1 bars")
    expect(lane(cut, "kick")).toHaveLength(6)
    expect(cut.totalSec).toBe(2)
    const held = clean("play pattern {\n  piano: notes C4--D4--E4--\n} for 1 bars")
    expect(held.events.map((e) => e.secStart + (e.secDur ?? 0)).pop()).toBe(2)
  })
  it("says how long a play pattern is when its lines don't meet", () => {
    const lines = [17, 19, 23, 29].map((n, i) => {
      return `  ${["kick", "snare", "hat", "ride"][i]}: x${"-".repeat(n - 1)}`
    })
    expect(firstError(`play pattern {\n${lines.join(",\n")}\n}`)).toMatch(
      /Say how long it is: play pattern \{ \.\.\. \} for 4 bars/,
    )
    clean(`play pattern {\n${lines.join(",\n")}\n} for 4 bars`)
  })
  it("asks for a type on the braces after play, as on any others", () => {
    const rule =
      "These braces need a type: play pattern { ... } repeats, play block { ... } plays once"
    expect(firstError("play { kick: x--- }")).toBe(rule)
    expect(firstError("play {\n  kick: x---\n} for 2 bars")).toBe(rule)
    expect(firstError("pattern gg = { kick: x--- }\nplay { gg }")).toBe(rule)
  })
  it("reads a length after block braces as theirs, and a name keeps its own", () => {
    const groove = "pattern gg = { kick: x--- }\n"
    const fills = clean(`${groove}play block {\n  crash: x 15*-,\n  gg\n} for 4 bars`)
    expect(lane(fills, "kick")).toHaveLength(16)
    expect(lane(fills, "crash")).toHaveLength(1)
    const once = clean(`${groove}block bb = {\n  crash: x 15*-,\n  gg\n}\nplay bb for 4 bars`)
    expect(lane(once, "kick")).toHaveLength(4)
    expect(once.totalSec).toBe(8)
  })
  it("plays play block as it plays a named block", () => {
    const named = clean("block bb = {\n  kick: x---\n}\nplay bb")
    const typed = clean("play block {\n  kick: x---\n}")
    expect(typed.drumEvents.map((e) => e.secStart)).toEqual(named.drumEvents.map((e) => e.secStart))
    expect(typed.totalSec).toBe(named.totalSec)
  })
  it("keeps a play's duration behind its music", () => {
    expect(firstError("play 2 bars pattern { kick: x--- }")).toMatch(/follows its music/)
    expect(firstError("play pattern { kick: x--- } 2 bars")).toBe(
      "Write the length like this: play pattern { ... } for 2 bars",
    )
  })
  it("asks for a type on braces that are a value", () => {
    for (const source of [
      "play block {\n  { kick: x--- }\n}",
      "play block {\n  2 bars { kick: x--- }\n}",
      "play ({ kick: x--- } { snare: x--- })",
      "pattern gg = {\n  { kick: x--- }\n}\nplay gg",
      "pattern gg = ({ kick: x--- } { snare: x--- })\nplay gg",
      "play block {\n  2 bars { kick: x--- } on bar 2\n} for 2 bars",
    ]) {
      expect(parseCell(source).errors.map((e) => e.msg)).toContain(UNTYPED)
    }
  })
  it("plays a pattern on a line of its own repeating, and a block once", () => {
    const repeats = clean("play block {\n  pattern { kick: x--- }\n} for 2 bars")
    expect(lane(repeats, "kick")).toHaveLength(8)
    const once = clean("play block {\n  block { kick: x--- }\n} for 2 bars")
    expect(lane(once, "kick")).toHaveLength(1)
  })
  it("keeps a block's lines once inside a pattern and a group that repeat", () => {
    const inPattern = clean(
      "pattern gg = {\n  block { crash: x--- },\n  kick: x---\n}\nplay gg for 2 bars",
    )
    expect(lane(inPattern, "crash")).toHaveLength(1)
    expect(lane(inPattern, "kick")).toHaveLength(8)
    const inGroup = clean(
      "play block {\n  (block { crash: x--- } pattern { kick: x--- })\n} for 2 bars",
    )
    expect(lane(inGroup, "crash")).toHaveLength(1)
    expect(lane(inGroup, "kick")).toHaveLength(4)
  })
  it("reads a length in front of typed braces as their own", () => {
    const repeats = clean("play block {\n  2 bars pattern { kick: x--- }\n}")
    expect(lane(repeats, "kick")).toHaveLength(8)
    expect(repeats.totalSec).toBe(4)
    const once = clean("play (2 bars block { crash: x 15*- } pattern { kick: x--- })")
    expect(lane(once, "crash")).toHaveLength(1)
    expect(once.totalSec).toBe(4.5)
    expect(firstError("play block {\n  pattern 2 bars { kick: x--- }\n}")).toBe(
      "A length goes in front of what it measures: 2 bars pattern { ... }",
    )
  })
  it("places typed values, and keeps every and with as wrappers", () => {
    clean("play block {\n  kick: x---,\n  pattern { crash: x 15*- } on bar 2\n} for 2 bars")
    expect(lane(clean("play every 1 beats { kick: x }"), "kick")).toHaveLength(1)
    expect(lane(clean("play block {\n  every 1 beats 2 bars { kick: x }\n}"), "kick")).toHaveLength(
      8,
    )
    expect(
      lane(clean("pattern ss = every 1 beats { kick: x }\nplay ss for 1 bars"), "kick"),
    ).toHaveLength(4)
    expect(
      clean("play block {\n  with octave 2 { bass: notes i---v--- },\n  kick: x---\n} for 2 bars")
        .events,
    ).toHaveLength(8)
    expect(
      lane(
        clean("play block {\n  kick: x---,\n  block { crash: x } on bar 2\n} for 2 bars"),
        "crash",
      ),
    ).toHaveLength(1)
    expect(firstError("play every 3/4 beats pattern { kick: x }")).toBe(
      "What plays at a pace is a pattern, so its braces take no type: every 3/4 beats { ... }",
    )
  })
  it("doesn't take a type after a declaration's =, which already says it", () => {
    expect(firstError("pattern gg = pattern { kick: x--- }")).toBe(
      "gg is a pattern, so its braces take no type: pattern gg = { ... }",
    )
    expect(firstError("block gg = 2 bars pattern { kick: x--- }")).toBe(
      "gg is a block, so its braces take no type: block gg = { ... }",
    )
    expect(firstError("steps gg = pattern { kick: x--- }")).toMatch(/That's a pattern, not steps/)
  })
  it("says nothing plays typed braces at the top of a cell", () => {
    expect(firstError("pattern { kick: x--- }")).toBe(
      "Nothing plays this. Write play pattern { ... }",
    )
    expect(firstError("block { kick: x--- }")).toBe("Nothing plays this. Write play block { ... }")
    expect(firstError("{ kick: x--- }")).toBe("Nothing plays this. Write play block { ... }")
    expect(firstError("3 bars pattern { kick: x--- }")).toBe(
      "Nothing plays this. Write play pattern { ... } for 3 bars",
    )
  })
  it("reports empty typed braces once", () => {
    expect(parseCell("play pattern { }").errors.map((e) => e.msg)).toEqual([
      "This play has nothing in its braces",
    ])
    expect(parseCell("play block {\n  pattern { }\n}").errors.map((e) => e.msg)).toEqual([
      "These braces have nothing in them",
    ])
  })
  it("paints typed braces as keywords, and what's untyped as a mistake", () => {
    const painted = (source: string) =>
      highlightMusic(source)
        .flat()
        .filter((p) => p.c)
        .map((p) => `${p.c}:${p.s}`)
    const words = (source: string) => painted(source).filter((p) => /:(pattern|block|\{)$/.test(p))
    const red = (source: string) => painted(source).filter((p) => p.startsWith("tk-error"))
    expect(words("play pattern { kick: x--- }")).toEqual(["tk-directive-key:pattern", "tk-punct:{"])
    expect(words("play (pattern { kick: x--- } block { snare: x--- })")).toEqual([
      "tk-directive-key:pattern",
      "tk-punct:{",
      "tk-directive-key:block",
      "tk-punct:{",
    ])
    expect(
      red("play block {\n  4 bars pattern { kick: x--- },\n  block {\n    crash: x 15*-\n  }\n}"),
    ).toEqual([])
    expect(
      red("play block {\n  every 3/4 beats 4 bars { kick: x }\n}\npattern gg = 2 bars { kick: x }"),
    ).toEqual([])
    expect(red("play ({ kick: x--- })")).toEqual(["tk-error:{"])
    expect(red("play block {\n  { kick: x--- }\n}")).toEqual(["tk-error:{"])
    expect(red("play block {\n  4 bars { kick: x--- }\n}")).toEqual(["tk-error:{"])
    expect(red("play { kick: x--- }")).toEqual(["tk-error:{"])
    expect(words("play block { kick: x--- }")).toEqual(["tk-directive-key:block", "tk-punct:{"])
    expect(red("play (\n  { kick: x--- }\n)")).toEqual(["tk-error:{"])
  })
})
