import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.js")
const { sheetAbc } = await import("../../js/sheet.js")

const sheet = (src, opts) => {
  const p = parseSource(src)
  expect(p.errors).toEqual([])
  return sheetAbc(p.outputs[0].blocks[0], opts)
}
// The voice lines of the first block's ABC.
const voices = (src, opts) =>
  sheet(src, opts)
    .abc.split("\n")
    .filter((l) => l.startsWith("[V:") || l.startsWith("w:"))
const head = (src) => sheet(src).abc.split("\n").slice(0, 5)

const X = "!style=x!g"

describe("drum sheet music", () => {
  it("puts the hands in a voice with stems up and the feet in one with stems down", () => {
    const { abc, tablature } = sheet(
      "play {\n  hat: x-x- x-x- x-x- x-x-\n  snare: ---- x--- ---- x---\n  kick: x--- ---- x-x- ----\n}",
    )
    expect(abc).toBe(
      [
        "X:1",
        "L:1/16",
        "M:4/4",
        "Q:1/4=120",
        "K:C",
        "%%score (H F)",
        'V:H clef=perc stem=up name="drums"',
        "V:F clef=perc stem=down",
        `[V:H] ${X}2${X}2 [c${X}]2${X}2 ${X}2${X}2 [c${X}]2${X}2 |`,
        "[V:F] F4 z4 F2F2 z4 |",
      ].join("\n"),
    )
    expect(tablature).toEqual([{ instrument: "" }, { instrument: "" }])
  })

  it("leaves out a voice with nothing in it", () => {
    const { abc } = sheet("play kick: x--- ---- x-x- ----")
    expect(abc).toContain("%%score F\n")
    expect(abc).not.toContain("V:H")
    expect(abc).toContain("V:F clef=perc stem=down\n[V:F] F4 z4 F2F2 z4 |")
    expect(sheet("pattern p = { kick: x }\nplay 1 bars p").abc).not.toBe("")
  })

  it("writes the time and tempo, and beams an added-up meter by its groups", () => {
    expect(head("time 7 over 8\ntempo 90\nplay kick: x--x---")).toEqual([
      "X:1",
      "L:1/16",
      "M:7/8",
      "Q:1/4=90",
      "K:C",
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

  it("writes the sticking above the hands' notes", () => {
    expect(voices("play {\n  snare: xxxx\n  sticking: RLRR\n}")).toEqual([
      '[V:H] "^R"c"^L"c"^R"c"^R"c z4 z4 z4 |',
    ])
    expect(voices("play {\n  hat: x-x-\n  kick: x---\n  sticking: R-L-\n}")).toEqual([
      `[V:H] "^R"${X}2"^L"${X}2 z4 z4 z4 |`,
      "[V:F] F4 z4 z4 z4 |",
    ])
  })

  it("takes the louder of two hits on one line of the staff", () => {
    expect(voices("play {\n  snare: x---\n  snare.ghost: x---\n}")).toEqual(["[V:H] c4 z4 z4 z4 |"])
  })

  it("writes every bar of the block", () => {
    expect(voices("pattern g = { kick: x--- }\nplay 2 bars g")).toEqual([
      "[V:F] F4 F4 F4 F4 | F4 F4 F4 F4 |",
    ])
  })

  it("counts the hands' notes under the staff when asked", () => {
    expect(voices("play {\n  hat: x-x- x-x- x-x- x-x-\n  kick: x---\n}", { counts: true })).toEqual([
      `[V:H] ${X}2${X}2 ${X}2${X}2 ${X}2${X}2 ${X}2${X}2 |`,
      "w: 1 & 2 & 3 & 4 & |",
      "[V:F] F4 z4 z4 z4 |",
    ])
    expect(voices("play snare: x-x- ---x --xx x---", { counts: true })[1]).toBe("w: 1 & a & a 4 |")
    expect(voices("play snare: x--- ---- ---- ----")).toHaveLength(1)
  })
})

describe("pitched lines on the sheet", () => {
  it("writes a guitar an octave up on a treble-8 staff, with a tab staff", () => {
    const { abc, tablature } = sheet("play guitar: C---E---G---C---")
    expect(abc).toContain('%%score P1\nV:P1 clef=treble-8 name="guitar"\n[V:P1] C4 E4 G4 C4 |')
    expect(tablature).toEqual([{ instrument: "guitar", label: "guitar" }])
  })

  it("puts a drum staff first and each instrument on its own staff", () => {
    const { abc, tablature } = sheet("play {\n  kick: x---\n  bass: C---\n  piano: C---\n}")
    expect(abc).toContain("%%score F P1 P2\n")
    expect(abc).toContain('V:P1 clef=bass name="bass"')
    expect(abc).toContain('V:P2 clef=bass name="piano"')
    expect(voices("play {\n  kick: x---\n  bass: C---\n  piano: C---\n}")).toEqual([
      "[V:F] F4 z4 z4 z4 |",
      "[V:P1] C4 z4 z4 z4 |", // C3 sounding, written an octave up
      "[V:P2] C,4 z4 z4 z4 |", // C3 as it sounds
    ])
    expect(tablature).toEqual([{ instrument: "" }, { instrument: "" }, { instrument: "" }])
  })

  it("writes a note as long as it sounds, tied past the beat, with its accidental once a bar", () => {
    // 8 steps of F#, then 6 more from the ninth: tied across the beats, the sharp once
    expect(voices("play guitar: F#------ -F#-----")).toEqual(["[V:P1] ^F4- F4 F4- F2z2 |"])
    expect(voices("play guitar: C-F#-C---")).toEqual(["[V:P1] C2^F2 C4 z4 z4 |"])
    expect(voices("play guitar: F#-F-")).toEqual(["[V:P1] ^F2=F2 z4 z4 z4 |"])
  })

  it("writes a chord chart as chords with the symbol above the first", () => {
    const line = voices("play piano: chords C G")[0]
    expect(line).toMatch(/^\[V:P1\] "C"\[[^\]]+\]4- \[[^\]]+\]4 "G"\[[^\]]+\]4- \[[^\]]+\]4 \|$/)
  })

  it("marks accents and ghost notes on a riff", () => {
    expect(voices("play guitar: ^C-~E-")).toEqual(["[V:P1] !>!C2\"<(\"\">)\"E2 z4 z4 z4 |"])
  })
})
