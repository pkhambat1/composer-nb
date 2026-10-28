/* Groups, continued lines and notes lines, as the highlighter paints them: ( ) holds what
   plays in order, so a line outside brackets plays one thing and a second thing on it is
   painted as a mistake; a line that starts with | is painted as the line it continues; and
   a notes line takes degrees and lengths. */
import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { highlightMusic } = await import("../../js/highlight.ts")

const parts = (src) => highlightMusic(src).flat()
// What is painted as a mistake, in the order it's written
const marked = (src) =>
  parts(src)
    .filter((p) => p.c === "tk-error")
    .map((p) => p.s)
const painted = (src, word) =>
  parts(src)
    .filter((p) => p.s === word)
    .map((p) => p.c)

describe("lines that have no mistake", () => {
  const clean = [
    "play groove",
    "play 4 bars groove",
    "play (intro verse)",
    "play (intro 4 bars (verse chorus) intro)",
    "pattern song = (verse chorus)",
    "play ({ kick: x--- } { snare: x--- })",
    "play (intro { snare: x-x- } outro)",
    "play 4 bars (a b)",
    "play (1+2)*2 bars groove",
    "play ((1+2) bars a b)",
    "play {\n  (intro verse)\n  { hat: x- }\n}",
    "play {\n  bar 2 (a b)\n}",
    "play {\n  every 2 steps (a b)\n}",
    // a group over several lines, with blocks and lines of their own in it
    "play (\n  { piano: C4--- }\n  piano: D4---\n  verse\n)",
    "play (chorus with key A, mode minor {\n  bridge\n} chorus)",
    // then is a name like any other
    "pattern then = { kick: x- }",
  ]
  for (const src of clean) {
    it(`${JSON.stringify(src)}`, () => expect(marked(src)).toEqual([]))
  }
})

describe("a second thing outside brackets", () => {
  const mistakes = {
    "play intro verse": ["verse"],
    "intro verse verse": ["verse", "verse"],
    "pattern song = verse chorus": ["chorus"],
    "play { kick: x--- } { snare: x--- }": ["{"],
    "{ kick: x--- } outro": ["outro"],
    "play intro { snare: xxxx }": ["{"],
    "play intro (verse chorus)": ["("],
    "play (a b) outro": ["outro"],
    "play (a b) (c d)": ["("],
    "play 4 bars a 2 bars b": ["b"],
    "play {\n  kick: x---\n} outro": ["outro"],
  }
  for (const [src, errors] of Object.entries(mistakes)) {
    it(`paints ${errors.join(" ")} in ${JSON.stringify(src)}`, () => {
      expect(marked(src)).toEqual(errors)
    })
  }

  it("still paints what a block holds as it would be painted", () => {
    const line = highlightMusic("play intro { snare: xxxx }")[0]
    expect(line.find((p) => p.s === "snare").c).toBe("tk-inst")
    expect(line.filter((p) => p.s === "x").every((p) => p.c === "tk-step")).toBe(true)
    expect(line.find((p) => p.s === "}").c).toBe("tk-punct")
  })
})

describe("a line that starts with |", () => {
  it("is painted as the value of the line above it", () => {
    const src = "piano: chords Am F\n  |C G\nnotes flats = A3-Ab3-\n  |Db3-C3-, 1 beats rest"
    expect(marked(src)).toEqual([])
    expect(painted(src, "C")[0]).toMatch(/tk-root/)
    expect(painted(src, "Db3")).toEqual(["tk-note"])
    expect(painted(src, "beats")).toEqual(["tk-directive-key"])
  })

  it("carries on over a comment line, and stops at a blank one", () => {
    expect(painted("kick: x---\n// the fill\n  |x-x-", "x-x-").length).toBe(0)
    expect(marked("kick: x---\n// the fill\n  |x-x-")).toEqual([])
    expect(marked("kick: x---\n\n  |x-x-").length).toBeGreaterThan(0)
  })
})

describe("a notes line", () => {
  it("paints degrees as notes, with their marks", () => {
    for (const d of ["1", "b3", "#4", "1'", "'5", "''b7", "^5", "~b6"]) {
      expect(marked(`play piano: ${d}---`)).toEqual([])
      expect(painted(`play piano: ${d}---`, d)[0]).toMatch(/tk-note/)
    }
  })

  it("paints two degrees that touch as a mistake", () => {
    expect(marked("play piano: 13--")).toEqual(["3"])
  })

  it("paints lengths, rest and ... as a kit piece's line has them", () => {
    const src = "play bass: 3 beats C2, 2 beats rest, b3---, ...G1"
    expect(marked(src)).toEqual([])
    expect(painted(src, "3")).toEqual(["tk-directive-val"])
    expect(painted(src, "beats")).toEqual(["tk-directive-key", "tk-directive-key"])
    expect(painted(src, "rest")).toEqual(["tk-rest"])
    expect(painted(src, "...")).toEqual(["tk-directive-key"])
    expect(painted(src, "G1")).toEqual(["tk-note"])
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
      "play  (intro   verse\t{ snare: xxxx }  outro)  ",
      "play (intro 4 bars (verse chorus) intro)",
      "{ kick: x--- } { snare: x--- }",
      "play (\n  { piano: C4--- }\n\tpiano: D4---\n)",
      "notes flats = A3-Ab3-\n  |Db3-C3-",
      "play {\n  hat: x--- { x- }\n}",
      "play ((1 + 2)*2 bars b)",
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

describe("settings, and with", () => {
  const colours = (src) => parts(src).filter((p) => p.s.trim()).map((p) => [p.s, p.c])
  it("paints with, its settings and its block", () => {
    expect(colours("with key E, mode minor {")).toEqual([
      ["with", "tk-directive-key"],
      ["key", "tk-directive-key"],
      ["E", "tk-directive-val"],
      [",", "tk-punct"],
      ["mode", "tk-directive-key"],
      ["minor", "tk-directive-val"],
      ["{", "tk-punct"],
    ])
    const clean = [
      "with key E, mode minor {\n  play {\n    piano: chords verse\n    with octave 2 { bass: 1---5--- }\n  }\n}",
      "play (\n  with key E { piano: chords prog }\n  with key G { piano: chords prog }\n)",
      "play (with key E { piano: chords prog } with key G { piano: chords prog })",
      "play {\n  bar 2 with octave 5 { piano: 1--- }\n}",
      "with tempo 60*2, time 7 over 8, guitar.electric muted {\n  play kick: x\n}",
    ]
    for (const src of clean) expect(marked(src), src).toEqual([])
  })

  it("paints a key that isn't a note, and a mode that isn't one, as mistakes", () => {
    expect(marked("set key E\nset mode minor\nset mode lydian")).toEqual([])
    expect(marked("set key Em")).toEqual(["Em"])
    expect(marked("set key D dorian")).toEqual(["D dorian"])
    expect(marked("set mode aeolian")).toEqual(["aeolian"])
    expect(marked("with mode ionian { play kick: x }")).toEqual(["ionian"])
  })

  it("paints set inside braces, where settings go on a with", () => {
    expect(painted("set octave 2", "set")).toEqual(["tk-directive-key"])
    expect(painted("play {\n  set octave 2\n  bass: 1---\n}", "set")).toEqual(["tk-error"])
    expect(painted("with key E {\n  set mode minor\n}", "set")).toEqual(["tk-error"])
    expect(painted("play { set octave 2 }", "set")).toEqual(["tk-error"])
  })
})
