/* then in a row of things to play, as the highlighter paints it: a block or a group is
   joined to what's beside it by then, on the line of the } or ) before it, and a junction
   without it is painted as a mistake. */
import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { highlightMusic } = await import("../../js/highlight.js")

const parts = (src) => highlightMusic(src).flat()
// What is painted as a mistake, in the order it's written
const marked = (src) =>
  parts(src)
    .filter((p) => p.c === "tk-error")
    .map((p) => p.s)
// How each then is painted
const thens = (src) =>
  parts(src)
    .filter((p) => p.s === "then")
    .map((p) => p.c)

describe("then in a row", () => {
  const rows = {
    "between names": "intro then verse",
    "after play": "play intro then verse",
    "after pattern x =": "pattern song = verse then verse",
    "inside braces": "play {\n  intro then verse\n}",
    "inside a one-line block": "play { intro then { kick: x- } then outro }",
    "after bar": "play {\n  bar 2 { snare: 1 } then { hat: 1 }\n}",
    "after every": "play {\n  every 2 steps { kick: x- } then beat\n}",
    "after a } at the start of a line": "play {\n  kick: x---\n} then {\n  snare: x---\n}",
    "after a one-line block": "play { kick: x--- } then { snare: x--- }",
    "after a group": "play (verse chorus) then intro",
    "before a length": "play intro then 4 bars (verse chorus) then intro",
  }
  for (const [where, src] of Object.entries(rows)) {
    it(`is a keyword ${where}`, () => {
      expect(thens(src).length).toBeGreaterThan(0)
      expect(thens(src).every((c) => c === "tk-directive-key")).toBe(true)
      expect(marked(src)).toEqual([])
    })
  }

  it("is a keyword, never a name", () => {
    expect(parts("play intro then verse").find((p) => p.s === "then").c).toBe("tk-directive-key")
    expect(marked("pattern then = { kick: x }")).toEqual(["then"])
  })
})

describe("lines that have no mistake", () => {
  const clean = [
    "  } then {",
    "play 3 bars {",
    "  {",
    "  }",
    "play { kick: x--- } then { snare: x--- }",
    "play intro then { snare: xxxx } then outro",
    "play intro then 4 bars (verse chorus) then intro",
    "pattern song = verse then verse",
    "play a 2 bars b a",
    "play 4 bars (a b)",
    "play (1+2)*2 bars groove",
    "  bar 2 { snare: 1 } then { hat: 1 }",
    "  every 2 steps { kick: x- } then beat",
    // a length between then and a block
    "} then 4 bars {",
    // names in a row need no then
    "intro verse verse",
    "play intro then verse",
    // arithmetic in brackets is a length, not a group
    "play a (1+2) bars b",
    "play a (1 + 2)*2 bars b",
    "play a then (1+2) bars (b c)",
  ]
  for (const src of clean) {
    it(`${JSON.stringify(src)}`, () => expect(marked(src)).toEqual([]))
  }
})

describe("a junction without then", () => {
  const mistakes = {
    "{ kick: x--- } { snare: x--- }": ["{"],
    "play { kick: x--- } { snare: x--- }": ["{"],
    "} outro": ["outro"],
    "  } outro": ["outro"],
    "}) outro": ["outro"],
    "intro { snare: xxxx }": ["{"],
    "play intro { snare: xxxx }": ["{"],
    "intro (verse chorus)": ["("],
    "(a b) outro": ["outro"],
    "(a b) (c d)": ["("],
    "(a b) { kick: x- }": ["{"],
    "} (a b)": ["("],
    // a length doesn't join anything
    "} 4 bars {": ["{"],
    "intro 4 bars (verse chorus)": ["("],
    "play { kick: x--- } { snare: x--- } then outro": ["{"],
    "play (a b) then c d (e f)": ["("],
    "play { intro { kick: x- } }": ["{"],
  }
  for (const [src, errors] of Object.entries(mistakes)) {
    it(`paints ${errors.join(" ")} in ${JSON.stringify(src)}`, () => {
      expect(marked(src)).toEqual(errors)
    })
  }

  it("still paints what the block holds as it would be painted", () => {
    const line = highlightMusic("intro { snare: xxxx }")[0]
    expect(line.find((p) => p.s === "snare").c).toBe("tk-inst")
    expect(line.filter((p) => p.s === "x").every((p) => p.c === "tk-step")).toBe(true)
    expect(line.find((p) => p.s === "}").c).toBe("tk-punct")
  })
})

describe("then in the wrong place", () => {
  const mistakes = {
    // a statement never starts with then
    "then intro": ["then"],
    "  then { snare: x--- }": ["then"],
    "play then x": ["then"],
    "play {\n  { snare: x--- }\n  then intro\n}": ["then"],
    "play {\n  kick: x---\n}\nthen intro": ["then"],
    // or ends with it
    "play intro then": ["then"],
    "play intro then   ": ["then"],
    "} then": ["then"],
    "play { kick: x--- } then": ["then"],
    "play {\n  { snare: x--- } then\n  intro\n}": ["then"],
    "pattern song = verse then": ["then"],
    // then then: the second one
    "play a then then b": ["then"],
    "play { kick: x--- } then then { snare: x--- }": ["then"],
    // it goes between two things, so not first or last in a group
    "play (then a)": ["then"],
    "play (a then)": ["then"],
    "play a then (b then) then c": ["then"],
    // nor after a length: the length is for what comes after it
    "play 3 bars then x": ["then"],
  }
  for (const [src, errors] of Object.entries(mistakes)) {
    it(`paints ${errors.join(" ")} in ${JSON.stringify(src)}`, () => {
      expect(marked(src)).toEqual(errors)
    })
  }

  it("paints only the second of two", () => {
    expect(thens("play a then then b")).toEqual(["tk-directive-key", "tk-error"])
    expect(thens("play { kick: x--- } then then { snare: x--- }")).toEqual([
      "tk-directive-key",
      "tk-error",
    ])
  })

  it("leaves a then in the middle of a row alone, and a word that starts with it", () => {
    expect(marked("play thence then thence")).toEqual([])
    expect(thens("play thence then thence")).toEqual(["tk-directive-key"])
  })
})

describe("a block beside the steps of a kit piece or a layer", () => {
  const mistakes = {
    "play {\n  hat: x--- { x- }\n}": ["{"],
    "play {\n  hat: { x- } x---\n}": ["x---"],
    "play {\n  hat: {\n    x- {\n  } x-\n}": ["{", "x-"],
    "play {\n  hat: x--, { dd }\n}": ["{"],
    "steps fig = x- { -x }": ["{"],
    "play hat: x--- {": ["{"],
  }
  for (const [src, errors] of Object.entries(mistakes)) {
    it(`paints ${errors.join(" ")} in ${JSON.stringify(src)}`, () => {
      expect(marked(src)).toEqual(errors)
    })
  }

  it("takes a block that is the whole value", () => {
    expect(marked("play {\n  hat: { x- }\n}")).toEqual([])
    expect(marked("play {\n  hat: {\n    x---\n    --x-\n  }\n}")).toEqual([])
    expect(marked("play {\n  hat: {\n    x--- }\n}")).toEqual([])
    expect(marked("steps fig = {\n  x---\n}")).toEqual([])
    expect(marked("play hat: {\n  x---\n}")).toEqual([])
  })
})

describe("whitespace", () => {
  it("is kept exactly", () => {
    const sources = [
      "  } then {",
      "play  intro   then\t{ snare: xxxx }  then   outro  ",
      "play intro then 4 bars (verse chorus) then intro",
      "{ kick: x--- } { snare: x--- }",
      "intro (verse chorus)",
      "play (a then)  ",
      "play {\n  hat: x--- { x- }\n} then",
      "play a (1 + 2)*2 bars b",
    ]
    for (const src of sources) {
      expect(
        highlightMusic(src)
          .map((line) => line.map((p) => p.s).join(""))
          .join("\n"),
      ).toBe(src)
    }
  })
})
