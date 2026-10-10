import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.js")
const { sheetAbc } = await import("../../js/sheet.js")

// The voice lines of the first block's ABC.
const voices = (src) => {
  const p = parseSource(src)
  expect(p.errors).toEqual([])
  return sheetAbc(p.outputs[0].blocks[0])
    .split("\n")
    .filter((l) => l.startsWith("[V:"))
}
const head = (src) => sheetAbc(parseSource(src).outputs[0].blocks[0]).split("\n").slice(0, 5)

const X = "!style=x!g"

describe("drum sheet music", () => {
  it("puts the hands in a voice with stems up and the feet in one with stems down", () => {
    const abc = sheetAbc(
      parseSource("play {\n  hat: x-x- x-x- x-x- x-x-\n  snare: ---- x--- ---- x---\n  kick: x--- ---- x-x- ----\n}")
        .outputs[0].blocks[0],
    )
    expect(abc).toBe(
      [
        "X:1",
        "L:1/16",
        "M:4/4",
        "Q:1/4=120",
        "K:perc",
        "%%score (H F)",
        "V:H stem=up",
        "V:F stem=down",
        `[V:H] ${X}2${X}2 [c${X}]2${X}2 ${X}2${X}2 [c${X}]2${X}2 |`,
        "[V:F] F4 z4 F2F2 z4 |",
      ].join("\n"),
    )
  })

  it("leaves out a voice with nothing in it", () => {
    const abc = sheetAbc(parseSource("play kick: x--- ---- x-x- ----").outputs[0].blocks[0])
    expect(abc).not.toContain("%%score")
    expect(abc).not.toContain("V:H")
    expect(abc).toContain("V:F stem=down\n[V:F] F4 z4 F2F2 z4 |")
    expect(sheetAbc(parseSource("play piano: C---").outputs[0].blocks[0])).toBe("")
  })

  it("writes the time and tempo, and beams an added-up meter by its groups", () => {
    expect(head("time 7 over 8\ntempo 90\nplay kick: x--x---")).toEqual([
      "X:1",
      "L:1/16",
      "M:7/8",
      "Q:1/4=90",
      "K:perc",
    ])
    // by the beat, and the odd eighth on its own
    expect(voices("time 7 over 8\nplay kick: x--x---")).toEqual(["[V:F] F3F z4 z4 z2 |"])
    expect(head("time 2+2+3 over 8\nplay kick: x--x---")[2]).toBe("M:7/8")
    // an empty group is one rest, dotted if need be
    expect(voices("time 2+2+3 over 8\nplay kick: x--x---")).toEqual(["[V:F] F3F z4 z6 |"])
  })

  it("fills the gaps with the longest notes and rests that fit", () => {
    // a note on the beat can be dotted; a rest is plain, and starts on its own multiple
    expect(voices("play snare: x--- ---- ---- ---x")).toEqual(["[V:H] c4 z4 z4 z2zc |"])
    expect(voices("play snare: x--x ---- ---- ----")).toEqual(["[V:H] c3c z4 z4 z4 |"])
    expect(voices("play snare: -x-- ---- x-x- --x-")).toEqual(["[V:H] zcz2 z4 c2c2 z2c2 |"])
  })

  it("writes a double stroke as its step's note with a slash through the stem", () => {
    expect(voices("play snare: d--- ---- ---- ----")).toEqual(["[V:H] !/!czz2 z4 z4 z4 |"])
    expect(voices("play snare: d3 d3e")).toEqual(["[V:H] z4 z4 !/!c!/!cz2 z4 |"])
    // at a longer step, a longer note
    expect(voices("play every 2 steps snare: d- --")).toEqual(["[V:H] !/!c2z2 z4 z4 z4 |"])
    // with a hat on the same step, the chord gets the slash (and no parentheses: the hat
    // isn't a ghost note)
    expect(voices("play {\n  hat: x-x- x-x-\n  snare.ghost: d--- ----\n}")).toEqual([
      `[V:H] !/![c${X}]z${X}2 ${X}2${X}2 z4 z4 |`,
    ])
  })

  it("writes triplets three at a time", () => {
    expect(voices("play every 1/3 beats hat: x x x x x x x x x x x x")).toEqual([
      `[V:H] (3:2:3${X}2${X}2${X}2 (3:2:3${X}2${X}2${X}2 (3:2:3${X}2${X}2${X}2 (3:2:3${X}2${X}2${X}2 |`,
    ])
    expect(voices("play every 1/3 beats snare: x x - x - x - - - - - -")).toEqual([
      "[V:H] (3:2:3c2c2z2 (3:2:3c2z2c2 z4 z4 |",
    ])
    // sixteenth triplets, and a plain rest where all three are silent
    expect(voices("play every 1/6 beats snare: xx- --- --- --- --- --- --- ---")).toEqual([
      "[V:H] (3:2:3cczz2 z4 z4 z4 |",
    ])
  })

  it("marks accents, open hi-hats and ghost notes, and the kit pieces' noteheads", () => {
    expect(voices("play {\n  snare: ^---\n  hat.open: x---\n  snare.ghost: -x--\n}")).toEqual([
      `[V:H] !>!!open![c${X}]"<("">)"cz2 z4 z4 z4 |`,
    ])
    expect(voices("play {\n  crash: x---\n  ride: -x--\n  ride.bell: --x-\n  tom.high: ---x\n}")).toEqual([
      "[V:H] !style=x!a!style=x!f!style=harmonic!fe z4 z4 z4 |",
    ])
    expect(voices("play {\n  tom.low: x---\n  tom.floor: -x--\n  snare.rim: --x-\n  snare.cross: ---x\n}")).toEqual([
      "[V:H] dA!style=triangle!c!style=x!c z4 z4 z4 |",
    ])
    expect(voices("play {\n  kick: x---\n  hat.pedal: --x-\n}")).toEqual(["[V:F] F2!style=x!D2 z4 z4 z4 |"])
  })

  it("takes the louder of two hits on one line of the staff", () => {
    expect(voices("play {\n  snare: x---\n  snare.ghost: x---\n}")).toEqual(["[V:H] c4 z4 z4 z4 |"])
  })

  it("writes every bar of the block", () => {
    expect(voices("pattern g = { kick: x--- }\nplay 2 bars g")).toEqual([
      "[V:F] F4 F4 F4 F4 | F4 F4 F4 F4 |",
    ])
  })
})
