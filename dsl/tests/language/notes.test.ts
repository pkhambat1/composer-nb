import { describe, it, expect, vi } from "vitest"
import { play, firstError, labels, notes, midis, hits, durations, sound } from "./helpers.ts"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../src/music-engine.ts")

describe("chords", () => {
  it("play on the instrument whose line they're on", () => {
    const o = parseSource(play("piano: chords C", "organ: chords F", "guitar.electric: chords G"))
    expect(o.errors).toEqual([])
    expect(o.chords.map((e) => [e.instrument, e.label])).toEqual([
      ["piano", "C"],
      ["organ", "F"],
      ["guitar.electric", "G"],
    ])
  })

  it("read Roman numerals in the key", () => {
    expect(labels("set key C\nplay piano: chords i vi|iv v7|bvii iv|ii7 viidim")).toEqual([
      "C",
      "Am",
      "F",
      "G7",
      "Bb",
      "F",
      "Dm7",
      "Bdim",
    ])
    expect(labels("set key A\nset mode minor\nplay piano: chords vM v")).toEqual(["E", "Em"])
  })

  it("keep / in a chord's name, since its two sides aren't numbers", () => {
    expect(labels("play piano: chords C/E F")).toEqual(["C/E", "F"])
  })

  it("take chords by name", () => {
    expect(
      labels("chords verse = Am E7|G D\nchords chorus = F C|G E7\nplay piano: chords verse chorus"),
    ).toEqual(["Am", "E7", "G", "D", "F", "C", "G", "E7"])
    expect(labels("chords intro = Bb F\nplay piano: chords intro")).toEqual(["Bb", "F"])
  })

  it("give steps by name to drums", () => {
    const o = parseSource("steps pair = ^-x-\nplay hat: pair ^---").outputs[0]
    expect(hits(o, "hat").map((e) => e.vel)).toEqual([1, 0.7, 1])
  })
})

describe("notes", () => {
  // Each note that plays: its name, the step it starts on and how many steps it lasts. A
  // step is a 16th note, 0.125 seconds at 120.
  const heard = (src: string) => {
    const p = parseSource(src)
    expect(p.errors).toEqual([])
    return p.notes.map((e) => [e.note.name, e.secStart / 0.125, e.secDur! / 0.125])
  }

  it("use fixed steps when every supplies a pace", () => {
    expect(heard("play every 1/4 beats guitar: notes F---G F-F--")).toEqual([
      ["F3", 0, 4],
      ["G3", 4, 1],
      ["F3", 5, 2],
      ["F3", 7, 3],
    ])
    expect(durations("play every 1/4 beats guitar: notes F---G F-F--")).toEqual([2])
  })

  it("take one step each, however many characters a note is", () => {
    expect(heard("play every 1/4 beats bass: notes E1-F#1 Bb1-")).toEqual([
      ["E1", 0, 2],
      ["F#1", 2, 1],
      ["A#1", 3, 2],
    ])
  })

  it("use the octave setting when a note has no number", () => {
    expect(notes("play piano: notes C E4 G _")).toEqual(["C3", "E4", "G3"])
    expect(notes("set octave 2\nplay bass: notes E-G-")).toEqual(["E2", "G2"])
  })

  it("ring until the next note, and _ stops one", () => {
    expect(heard("play piano: notes C---__E-")).toEqual([
      ["C3", 0, 8],
      ["E3", 12, 4],
    ])
    // Before the first note, - is silence: nothing is ringing yet.
    expect(heard("play piano: notes --C-")).toEqual([["C3", 8, 8]])
  })

  it("don't touch: a space goes between two notes, and takes no step", () => {
    expect(firstError("play guitar: notes E---F#E-E--")).toBe(
      '"E---F#E-E--": notes don\'t touch, so put a space between them: E---F# E-E--',
    )
    expect(firstError("play piano: notes CEG")).toMatch(/put a space between them: C E G$/)
    expect(firstError("play piano: notes ^F^G")).toMatch(/put a space between them: \^F \^G$/)
    expect(firstError("notes riff = E2G2")).toMatch(/put a space between them: E2 G2$/)
    expect(sound("play every 1/4 beats guitar: notes E---F# E-E--")).toBe(
      sound("play every 1/4 beats guitar: notes E--- F# E- E--"),
    )
    // -, _ and a bar line keep notes apart already
    expect(parseSource("play every 1/4 beats piano: notes C-E-G-_F#_E").errors).toEqual([])
    expect(parseSource("play piano: notes C--------------- | E---------------").errors).toEqual([])
    // Where a message shows notes as the line to write, they're spaced apart.
    expect(firstError("play kick: F#E-")).toMatch(/guitar: notes F# E-$/)
    expect(firstError("riff = F#E-")).toMatch(/Put its type in front: notes riff = F# E-$/)
  })

  it("take ^ and ~ in front, for an accent and a soft note", () => {
    const o = parseSource("play piano: notes ^C-~E-G-__").outputs[0]
    expect(o.notes.map((e) => [e.label, e.vel, e.accent, e.ghost])).toEqual([
      ["C", 1, true, false],
      ["E", 0.3, false, true],
      ["G", 0.7, false, false],
    ])
  })

  it("repeat at their own length in a pattern, against the drums", () => {
    const groove =
      "set time 7 over 8\npattern groove = {\n  kick: x--x---,\n  every 1/4 beats guitar.electric: notes F---G F-F--\n}\n"
    // Lines of 7 and 10 steps meet after 70: five bars of 14.
    const o = parseSource(groove + "play groove").outputs[0]
    expect(o.durSec).toBe(8.75)
    expect(o.notes).toHaveLength(28)
    expect(o.notes.every((e) => e.instrument === "guitar.electric")).toBe(true)
    expect(hits(o, "kick")).toHaveLength(20)
    expect(o.blocks.map((b) => [b.time, b.bars])).toEqual([["7 over 8", 5]])
  })

  it("play once on a play's own line, like a drum's", () => {
    expect(heard("play piano: notes C--- for 2 bars")).toEqual([["C3", 0, 16]])
    expect(heard("pattern pp = 1 bars { piano: notes C--- }\nplay pp")).toHaveLength(1)
  })

  it("use | to divide bars independently, with spaces for the eye", () => {
    expect(sound("play piano: notes C--- E--- G--- E--- | C---")).toBe(
      sound("play piano: notes C E G E | C"),
    )
    expect(heard("play piano: notes C---E---|G---")).toEqual([
      ["C3", 0, 8],
      ["E3", 8, 8],
      ["G3", 16, 16],
    ])
  })

  it("go by name, in a row with more notes", () => {
    expect(sound("notes riff = F---G---\nplay guitar: notes riff G 7*-")).toBe(
      sound("play guitar: notes F---G--- G 7*-"),
    )
    expect(sound("notes riff = F---\nplay guitar: notes riff G---")).toBe(
      sound("play guitar: notes F---G---"),
    )
  })

  it("play at the pace every sets", () => {
    expect(heard("play every 1/2 beats piano: notes C-E-")).toEqual([
      ["C3", 0, 4],
      ["E3", 4, 4],
    ])
    expect(durations("play every 1/3 beats piano: notes C E G")).toEqual([2])
  })

  it("play together from a block of lines, each ringing on its own", () => {
    // G4 rings for the whole bar while the line above it moves.
    expect(heard("play piano: {\n  notes C4-E4-,\n  notes G4---\n}")).toEqual([
      ["C4", 0, 8],
      ["G4", 0, 16],
      ["E4", 8, 8],
    ])
    // A chart is a layer too: chords under a tune, on one instrument.
    const o = parseSource("play piano: {\n  chords C|F,\n  notes E4---G4---\n}").outputs[0]
    expect(o.durSec).toBe(4)
    expect(o.chords.map((e) => e.label)).toEqual(["C", "F"])
    expect(o.notes.map((e) => e.label)).toEqual(["E4", "G4", "E4", "G4"])
  })

  it("lose to a lower line's note at the same moment, as a drum's hit does", () => {
    const o = parseSource(
      "pattern gg = {\n  piano: notes C---,\n  pattern { piano: notes E--- } on bar 2\n}\nplay gg",
    ).outputs[0]
    expect(o.notes.map((e) => e.label)).toEqual(["C", "E"])
  })

  it("explain what a line of notes can't hold", () => {
    expect(firstError("play guitar: notes x---")).toMatch(
      /"x---" is a drum's steps. On guitar a step is a note: guitar: notes F---G---/,
    )
    expect(firstError("play guitar: notes f---")).toMatch(
      /"f---": notes are capital letters, A to G: guitar: notes F---G---/,
    )
    expect(firstError("play guitar: notes ^---")).toMatch(/\^ and ~ go in front of a note: \^F, ~G/)
    expect(firstError("play guitar: notes C9--")).toMatch(/"C9--": octaves run from 0 to 8/)
    expect(firstError("play guitar: notes H---")).toMatch(
      /"H---" isn't a note. Notes are A to G, with # or b after them and an octave when it's needed \(F, F#, Bb, E2\), or signed scale degrees/,
    )
    expect(firstError("play guitar: notes Am---")).toMatch(
      /chord names don't go on the steps. Chords are written in a chart, where _ leaves a slot silent: guitar: chords _ Am _ Am/,
    )
    expect(firstError("play guitar: notes 2 beats C2-E2-")).toMatch(/step words and \* repeats/)
    expect(firstError("play guitar: notes 0---")).toMatch(/degrees are nonzero integers/)
    expect(firstError("play piano: F---")).toBe(
      "piano takes notes or chords, and says which: piano: notes F---",
    )
    expect(firstError("play piano: Am F")).toBe(
      "piano takes notes or chords, and says which: piano: chords Am F",
    )
    expect(firstError("play piano: chords")).toMatch(
      /chords needs the chords after it: piano: chords Am F\|C G/,
    )
    expect(firstError("play piano: chords F---G---")).toMatch(
      /"F---G---" is notes, and this line says chords. A line of notes says notes in front: piano: notes F---G---/,
    )
    expect(firstError("F---G---")).toMatch(
      /Notes go on an instrument's line, e\.g\. guitar: notes F---G---/,
    )
  })

  it("stay off a drum's line, and so do chords", () => {
    expect(firstError("play kick: F---")).toMatch(
      /"F---" is notes, and kick is a drum. Notes go on a pitched instrument's line: guitar: notes F---/,
    )
    expect(firstError("play kick: Am")).toMatch(
      /"Am" is a chord, and kick is a drum. Chords go on a pitched instrument's line: piano: chords Am/,
    )
  })

  it("explain what a block of layers can't hold", () => {
    expect(firstError("play piano: {\n  kick: x---\n}")).toMatch(
      /A block after piano: holds what piano plays, one layer a line. kick: x--- is an instrument's line, which goes in a pattern/,
    )
    expect(firstError("play piano: notes C--- {\n  E---\n}")).toMatch(
      /A block is everything piano plays, so nothing goes beside it: piano: \{ \.\.\. \}/,
    )
    expect(firstError("notes riff = {\n  F---\n}")).toMatch(
      /A name holds one line of notes. Notes that play together go in a block on the instrument's line: piano: \{ \.\.\. \}/,
    )
  })

  it("uses repeated holds and rests instead of note duration clauses", () => {
    expect(heard("play bass: notes C2 11*- G1 3*-")).toEqual([
      ["C2", 0, 12],
      ["G1", 12, 4],
    ])
    expect(sound("play piano: notes 8*_ E4---F4---")).toBe(
      sound("play piano: notes _-------E4---F4---"),
    )
    expect(sound("notes gap = 16*_\nplay piano: notes gap | C4---")).toBe(
      sound("play piano: notes _--------------- | C4---"),
    )
    expect(sound("play piano: notes ^E4 11*- ~D4 3*-")).toBe(
      sound("play piano: notes ^E4----------- ~D4---"),
    )
    expect(sound("play bass: notes F2 15*- | G2 15*-")).toBe(sound("play bass: notes F2 | G2"))
    expect(sound("play bass: notes F2 11*- | G2 15*-")).toBe(sound("play bass: notes F2 | G2"))
    expect(heard("play bass: notes C2 ...G1 for 2 bars")).toEqual([
      ["C2", 0, 16],
      ["G1", 16, 16],
    ])
    expect(firstError("play piano: notes E4--- ..._")).toMatch(/automatically fill with silence/)
    expect(firstError("notes tail = E4--- ..._")).toMatch(/automatically fill with silence/)
    expect(firstError("play piano: notes 3 beats riff")).toMatch(/step words and \* repeats/)
  })

  it("take degrees of the key, counted on its mode's scale", () => {
    const major = "notes major = i---ii---iii---iv---|v---vi---vii---octave(i)---\n"
    expect(notes("set key C\nset octave 4\n" + major + "play piano: notes major")).toEqual([
      "C4",
      "D4",
      "E4",
      "F4",
      "G4",
      "A4",
      "B4",
      "C5",
    ])
    // a name of degrees is read under the key that plays it
    expect(notes("set key F#\nset octave 4\n" + major + "play piano: notes major")).toEqual([
      "F#4",
      "G#4",
      "A#4",
      "B4",
      "C#5",
      "D#5",
      "F5",
      "F#5",
    ])
    // b and # move a degree a semitone off the key's scale
    expect(
      notes("set key A\nset octave 4\nplay piano: notes i-ii-biii-iv-v-bvi-vii-octave(i)-"),
    ).toEqual(["A4", "B4", "C5", "D5", "E5", "F5", "G#5", "A5"])
    // the scale is the mode's: in A minor, 3 is C and #7 the raised seventh, G#
    expect(
      notes(
        "set key A\nset mode minor\nset octave 4\nplay piano: notes i-ii-iii-iv-v-vi-vii-#vii-",
      ),
    ).toEqual(["A4", "B4", "C5", "D5", "E5", "F5", "G5", "G#5"])
    expect(notes("set key D\nset mode dorian\nset octave 4\nplay piano: notes iii-vi-")).toEqual([
      "F4",
      "B4",
    ])
    // ' after a degree is an octave up, before it an octave down
    expect(
      notes(
        "set key C\nset octave 3\nplay bass: notes i-octave(v, -1)-octave(i, -2)-octave(i, 2)-",
      ),
    ).toEqual(["C3", "G2", "C1", "C5"])
    // letters and degrees can share a line
    expect(notes("set key D\nset octave 4\nplay piano: notes i-F#4-v-__")).toEqual([
      "D4",
      "F#4",
      "A4",
    ])
    // Cb4 sits just below C4, so key Cb's root in octave 4 is the B below middle C
    expect(midis("set key Cb\nset octave 4\nplay piano: notes i-iv-")).toEqual([59, 64])
    expect(firstError("play piano: notes iiv--")).toMatch(
      /notes don't touch, so put a space between them: ii v--/,
    )
  })

  it("writes degrees as numbers or lowercase Roman numerals", () => {
    expect(
      parseSource(
        "set key C\nset octave 4\nplay piano: notes i-ii-iii-iv-v-vi-vii-octave(i)-",
      ).notes.map((e) => e.note.name),
    ).toEqual(["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"])
    expect(parseSource("play piano: notes 1---3---").notes.map((e) => e.note.name)).toEqual([
      "C3",
      "E3",
    ])
    expect(parseSource("play piano: notes 13---").notes.map((e) => e.note.name)).toEqual(["A4"])
  })

  it("allows repeated slots and repeated figures under every", () => {
    for (const source of [
      "play every 1/4 beats { piano: notes C4-C4- }",
      "notes riff = C4---D4---\nplay every 1/4 beats { piano: notes riff riff }",
      "play piano: notes C2-C2--___",
      "notes riff = 2*(C4---D4---)\nplay piano: notes riff | riff",
    ])
      expect(parseSource(source).errors).toEqual([])
  })
})

describe("pitched instruments", () => {
  it("name a second sound after a dot, the way a drum does", () => {
    expect(parseSource("play guitar.electric: notes E2---").notes[0].instrument).toBe(
      "guitar.electric",
    )
    expect(parseSource("play piano.electric: chords C").chords[0].instrument).toBe("piano.electric")
    expect(firstError("play guitar.acoustic: C---")).toMatch(
      /"guitar.acoustic" isn't an instrument. guitar's other sound is guitar.electric/,
    )
    expect(firstError("play organ.loud: C---")).toMatch(
      /"organ.loud" isn't an instrument. organ has one sound: organ: notes F---G---/,
    )
    expect(firstError("play banjo: C---")).toMatch(/"banjo" isn't an instrument. Instruments: /)
  })
})
