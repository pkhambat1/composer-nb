import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.ts")
const { sheetAbc } = await import("../../js/sheet.ts")

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
      "play {\n  hat: 1 bars x-\n  snare: 1 bars ---- x---\n  kick: x--- ---- x-x- ----\n}",
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
    expect(tablature).toEqual([{ instrument: "" }])
  })

  it("leaves out a voice with nothing in it", () => {
    const { abc } = sheet("play kick: x--- ---- x-x- ----")
    expect(abc).toContain("%%score F\n")
    expect(abc).not.toContain("V:H")
    expect(abc).toContain("V:F clef=perc stem=down\n[V:F] F4 z4 F2F2 z4 |")
    expect(sheet("pattern pp = { kick: x }\nplay 1 bars pp").abc).not.toBe("")
  })

  it("writes the time and tempo, and beams an added-up meter by its groups", () => {
    expect(head("set time 7 over 8\nset tempo 90\nplay kick: x--x---")).toEqual([
      "X:1",
      "L:1/16",
      "M:7/8",
      "Q:1/4=90",
      "K:C",
    ])
    // by the beat, and the odd eighth on its own
    expect(voices("set time 7 over 8\nplay kick: x--x---")).toEqual(["[V:F] F3F z4 z4 z2 |"])
    expect(head("set time 2+2+3 over 8\nplay kick: x--x---")[2]).toBe("M:7/8")
    // an empty group is one rest, dotted if need be
    expect(voices("set time 2+2+3 over 8\nplay kick: x--x---")).toEqual(["[V:F] F3F z4 z6 |"])
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
    expect(voices("play {\n  hat: 8 steps x-\n  snare.ghost: d--- ----\n}")).toEqual([
      `[V:H] !/![c${X}]z${X}2 ${X}2${X}2 z4 z4 |`,
    ])
  })

  it("writes triplets three at a time", () => {
    expect(voices("play every 1/3 beats hat: 12 steps x")).toEqual([
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
    expect(voices("play {\n  snare: 4 steps x\n  sticking: RLRR\n}")).toEqual([
      '[V:H] "^R"c"^L"c"^R"c"^R"c z4 z4 z4 |',
    ])
    expect(voices("play {\n  hat: 4 steps x-\n  kick: x---\n  sticking: R-L-\n}")).toEqual([
      `[V:H] "^R"${X}2"^L"${X}2 z4 z4 z4 |`,
      "[V:F] F4 z4 z4 z4 |",
    ])
  })

  it("takes the louder of two hits on one line of the staff", () => {
    expect(voices("play {\n  snare: x---\n  snare.ghost: x---\n}")).toEqual(["[V:H] c4 z4 z4 z4 |"])
  })

  it("writes every bar of the block", () => {
    expect(voices("pattern gg = { kick: x--- }\nplay 2 bars gg")).toEqual([
      "[V:F] F4 F4 F4 F4 | F4 F4 F4 F4 |",
    ])
  })

  it("counts the hands' notes under the staff when asked", () => {
    expect(voices("play {\n  hat: 1 bars x-\n  kick: x---\n}", { counts: true })).toEqual([
      `[V:H] ${X}2${X}2 ${X}2${X}2 ${X}2${X}2 ${X}2${X}2 |`,
      "w: 1 & 2 & 3 & 4 & |",
      "[V:F] F4 z4 z4 z4 |",
    ])
    expect(voices("play snare: x-x- ---x --xx x---", { counts: true })[1]).toBe("w: 1 & a & a 4 |")
    expect(voices("play snare: x--- ---- ---- ----")).toHaveLength(1)
  })
})

describe("pitched lines on the sheet", () => {
  it("writes a guitar an octave up on a treble staff, with a tab staff", () => {
    const { abc, tablature } = sheet("play guitar: C---E---G---C---")
    expect(abc).toContain('%%score P1\nV:P1 clef=treble name="guitar"\n[V:P1] C4 E4 G4 C4 |')
    expect(tablature).toEqual([{ instrument: "guitar" }])
  })

  it("puts each instrument on its own staff, and the drums at the bottom", () => {
    const { abc, tablature } = sheet("play {\n  kick: x---\n  bass: C---\n  piano: C---\n}")
    expect(abc).toContain("%%score P1 P2 F\n")
    expect(abc).toContain('V:P1 clef=bass name="bass"')
    expect(abc).toContain('V:P2 clef=bass name="piano"')
    expect(voices("play {\n  kick: x---\n  bass: C---\n  piano: C---\n}")).toEqual([
      "[V:F] F4 z4 z4 z4 |",
      "[V:P1] C4 z4 z4 z4 |", // C3 sounding, written an octave up
      "[V:P2] C,4 z4 z4 z4 |", // C3 as it sounds
    ])
    expect(tablature).toEqual([{ instrument: "" }, { instrument: "" }, { instrument: "" }])
  })

  it("writes a note as long as it sounds, in one note where it can be, with its accidental once a bar", () => {
    // 8 steps of F#, then 6 more from the ninth: a half note, then a dotted quarter, the sharp once
    expect(voices("play guitar: F#------ -F#-----")).toEqual(["[V:P1] ^F8 F6 z2 |"])
    // A whole note on the one, a dotted half on the one, a half from beat 3
    expect(voices("play piano: C4---------------")).toEqual(["[V:P1] C16 |"])
    expect(voices("play piano: C4----------- E4---")).toEqual(["[V:P1] C12 E4 |"])
    expect(voices("play piano: C4------- E4-------")).toEqual(["[V:P1] C8 E8 |"])
    // A note from beat 2 to the end shows the middle of the bar: a quarter tied to a half
    expect(voices("play piano: C4--- E4-----------")).toEqual(["[V:P1] C4 E4- E8 |"])
    // A quarter from the & of 1 is one note; from the & of 2, an eighth tied over the middle
    expect(voices("play piano: _-C4--- E4---------")).toEqual(["[V:P1] z2C4 E2- E8 |"])
    // In 3 over 4 there is no middle to show: a half from beat 2
    expect(voices("set time 3 over 4\nplay piano: C4--- E4-------")).toEqual(["[V:P1] C4 E8 |"])
    // A note that starts off the beat is tied, as before
    expect(voices("play piano: _C4-- E4-----------")).toEqual(["[V:P1] zC-C2 E4- E8 |"])
    expect(voices("play guitar: C-F#-C---")).toEqual(["[V:P1] C2^F2 C4 z4 z4 |"])
    expect(voices("play guitar: F#-F-")).toEqual(["[V:P1] ^F2=F2 z4 z4 z4 |"])
  })

  it("writes a chord chart as chords with the symbol above the first", () => {
    const line = voices("play piano: chords C G")[0]
    expect(line).toMatch(/^\[V:P1\] "C"\[[^\]]+\]8 "G"\[[^\]]+\]8 \|$/)
  })

  it("marks accents and ghost notes on a riff", () => {
    expect(voices("play guitar: ^C-~E-")).toEqual(["[V:P1] !>!C2\"<(\"\">)\"E2 z4 z4 z4 |"])
  })
})

describe("the key signature", () => {
  const keyLine = (src) => sheet(src).abc.split("\n")[4]
  const voice = (src) => voices(src).find((l) => l.startsWith("[V:P1]"))
  it("comes from the key: a major key, a minor key, a mode", () => {
    expect(keyLine("play piano: C4---")).toBe("K:C")
    expect(keyLine("set key D\nplay piano: C4---")).toBe("K:D")
    expect(keyLine("set key F#\nset mode minor\nplay piano: C4---")).toBe("K:F#m")
    expect(keyLine("set key D\nset mode dorian\nplay piano: C4---")).toBe("K:D dor")
    expect(keyLine("set key G\nset mode mixolydian\nplay piano: C4---")).toBe("K:G mix")
    expect(keyLine("set key A\nset mode minor\nplay piano: C4---")).toBe("K:Am")
  })
  it("leaves out the accidentals the signature has, and writes the naturals it needs", () => {
    expect(voice("set key D\nplay piano: F#4--- C#4---")).toBe("[V:P1] F4 C4 z4 z4 |")
    expect(voice("set key D\nplay piano: F4--- F#4---")).toBe("[V:P1] =F4 ^F4 z4 z4 |")
    expect(voice("set key F\nplay piano: Bb3--- B3---")).toBe("[V:P1] B,4 =B,4 z4 z4 |")
    // Once in a bar, an accidental holds for the bar
    expect(voice("play piano: F#4--- F#4--- _-------|F#4---------------")).toBe("[V:P1] ^F4 F4 z4 z4 | ^F16 |")
  })
  it("spells a note as written, and a degree by its place in the scale", () => {
    expect(voice("play piano: Db4--- C#4---")).toBe("[V:P1] _D4 ^C4 z4 z4 |")
    // b3, b6 and b7 in C are Eb, Ab and Bb, not D#, G# and A#
    expect(voice("set key C\nset octave 4\nplay piano: b3---b6---b7---")).toBe("[V:P1] _E4 _A4 _B4 z4 |")
    // F# major's seventh is E#, and Gb major's fourth is Cb: both in the signature already
    expect(voice("set key F#\nset octave 4\nplay piano: 7---1'---")).toBe("[V:P1] e4 f4 z4 z4 |")
    expect(voice("set key Gb\nset octave 4\nplay piano: 4---7---")).toBe("[V:P1] c4 f4 z4 z4 |")
    // a chord's notes as the chord spells them: B# major is B# D## F##, not C E G
    expect(voice("set key C#\nset mode minor\nplay piano: chords VII")).toBe('[V:P1] "B#"[^B,^^D^^F]16 |')
    expect(voice("set key Gb\nplay piano: chords IV")).toBe('[V:P1] "Cb"[CEG]16 |')
    // a 6/9 keeps its 9: abcjs drops what follows a / unless it's a bass note
    expect(voice("play piano: chords C6/9")).toMatch(/^\[V:P1\] "C6\u20449"/)
    expect(voice("play piano: chords Cm6/9/E")).toMatch(/^\[V:P1\] "Cm6\u20449\/E"/)
  })
  it("stays off the percussion staff", () => {
    const lines = voices("set key D\nplay {\n  hat: 1 bars x-\n  kick: x--- ---- x-x- ----\n  piano: F#4--- C#4---\n}")
    expect(lines[0]).toMatch(/^\[V:H\] \[K:none\] /)
    expect(lines[1]).toBe("[V:F] [K:none] F4 z4 F2F2 z4 |")
    expect(lines[2]).toBe("[V:P1] F4 C4 z4 z4 |")
    expect(voices("play kick: x---")[0]).toBe("[V:F] F4 z4 z4 z4 |")
  })
  it("spells a flat key's black keys with flats, but a minor key's leading tone sharp", () => {
    expect(voice("set key Bb\nplay piano: Eb4--- Db4---")).toBe("[V:P1] E4 _D4 z4 z4 |")
    expect(voice("set key G\nset mode minor\nplay piano: F#4--- Eb4---")).toBe("[V:P1] ^F4 E4 z4 z4 |")
  })
})

describe("the tab staff", () => {
  it("tunes down to reach a part's lowest note: drop D for D2, drop C below it", () => {
    expect(sheet("set octave 2\nplay guitar.electric: D---E D-D--").tablature).toEqual([
      { instrument: "guitar", tuning: ["D,", "A,", "D", "G", "B", "e"], label: "drop D" },
    ])
    expect(sheet("play guitar: C2---").tablature[0].label).toBe("drop C")
    expect(sheet("play guitar: E2---").tablature).toEqual([{ instrument: "guitar" }])
  })
  it("goes with the guitar's staff, counted by staff: the drums are one, at the bottom", () => {
    const { abc, tablature } = sheet("play {\n  kick: x---\n  hat: 4 steps x-\n  guitar.electric: E2---\n}")
    expect(abc).toContain("%%score P1 (H F)\n")
    expect(tablature).toEqual([{ instrument: "guitar" }, { instrument: "" }])
    expect(sheet("play {\n  bass: E2---\n  guitar: E2---\n}").tablature).toEqual([
      { instrument: "" },
      { instrument: "guitar" },
    ])
  })
})

describe("systems", () => {
  it("break every four bars, each voice's bars on a line, the drums' key turned off once", () => {
    const lines = voices("set key D\nplay 6 bars {\n  kick: x---\n  piano: F#4---\n}")
    expect(lines).toEqual([
      "[V:F] [K:none] F4 z4 z4 z4 | z4 z4 z4 z4 | z4 z4 z4 z4 | z4 z4 z4 z4 |",
      "[V:P1] F4 z4 z4 z4 | z4 z4 z4 z4 | z4 z4 z4 z4 | z4 z4 z4 z4 |",
      "[V:F] z4 z4 z4 z4 | z4 z4 z4 z4 |",
      "[V:P1] z4 z4 z4 z4 | z4 z4 z4 z4 |",
    ])
  })
})

describe("compound meters", () => {
  it("beams 6 over 8 in two groups of three eighths, and counts the eighths", () => {
    const lines = voices("set time 6 over 8\nplay {\n  hat: 1 bars x-\n  kick: 1 bars x-----\n}", { counts: true })
    expect(lines[0]).toBe(`[V:H] ${X}2${X}2${X}2 ${X}2${X}2${X}2 |`)
    expect(lines[1]).toBe("w: 1 2 3 4 5 6 |")
    expect(lines[2]).toBe("[V:F] F6 F6 |")
  })
  it("writes a dotted half note across a 6 over 8 bar", () => {
    expect(voices("set time 6 over 8\nplay piano: C4-----------")).toEqual(["[V:P1] C12 |"])
  })
})
