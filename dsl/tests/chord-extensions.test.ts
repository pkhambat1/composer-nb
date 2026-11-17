import { describe, expect, it } from "vitest"
import { ChordType, Note } from "tonal"
import {
  buildChord,
  extendChord,
  isChordExtension,
  parseKey,
  readChordSymbol,
} from "../src/chords.ts"

describe("chord extensions", () => {
  it("accepts one suffix, including compound qualities, but not chords or lists", () => {
    for (const suffix of [
      "maj7",
      "m7",
      "dom7",
      "7",
      "m7b5",
      "mmaj7",
      "maj7add9",
      "add9",
      "#11",
      "b5",
      "sus",
      "sus2add11#5",
      "6/9",
      "m6/9",
      "M6/9",
    ])
      expect(isChordExtension(suffix), suffix).toBe(true)
    for (const suffix of [
      "",
      "Cmaj7",
      "maj7 add9",
      "maj7,add9",
      "[maj7]",
      "maj7/E",
      "maj7/3",
      "add14",
      "add1",
      "add9oops",
      "69",
      "6add9",
      "maj6/9",
    ])
      expect(isChordExtension(suffix), suffix).toBe(false)
  })

  it("replaces the quality while retaining the root's octave and explicit bass", () => {
    const original = buildChord("9m7/4", parseKey("D"), 3)!
    const extended = extendChord(original, "maj7")!
    expect(extended.notesMidi).toEqual([64, 68, 71, 75])
    expect(extended.noteNames).toEqual(["E4", "G#4", "B4", "D#5"])
    expect(extended.label).toBe("Emaj7/G")
    expect(extended.bassMidi).toBe(original.bassMidi)
    expect(extended.bassName).toBe(original.bassName)
    expect(extended.overBass).toBe(true)
  })

  it("adds tones without replacing minor, diminished, seventh or altered tones", () => {
    for (const input of ["Cm7", "Bdim", "F7b5", "GmMaj7", "D7#5"])
      expect(extendChord(buildChord(input)!, "add9")!.noteNames).toEqual(
        buildChord(input + "add9")!.noteNames,
      )
    const extended = extendChord(buildChord("Cm7")!, "sus2add11#5")!
    expect(extended.noteNames).toEqual(["C3", "D3", "G#3", "Bb3", "F4"])
  })

  it("applies nested extensions in order and makes repeated additions idempotent", () => {
    const original = buildChord("Cm")!
    const qualityLast = extendChord(extendChord(original, "add9")!, "maj7")!
    const additionLast = extendChord(extendChord(original, "maj7")!, "add9")!
    expect(qualityLast.noteNames).toEqual(["C3", "E3", "G3", "B3"])
    expect(additionLast.noteNames).toEqual(["C3", "E3", "G3", "B3", "D4"])
    expect(extendChord(additionLast, "add9")!.noteNames).toEqual(additionLast.noteNames)
  })

  it("preserves uncommon transformed harmonies instead of guessing a base quality", () => {
    const unusual = {
      ...buildChord("C")!,
      label: "[C Eb Gb A#]",
      notesMidi: [48, 51, 54, 58],
      noteNames: ["C3", "Eb3", "Gb3", "A#3"],
    }
    const extended = extendChord(unusual, "add9")!
    expect(extended.noteNames).toEqual(["C3", "Eb3", "Gb3", "A#3", "D4"])
    expect(extended.label).toBe("[C Eb Gb A# D]")
    expect(extendChord(unusual, "maj7")!.label).toBe("Cmaj7")
  })

  it("names reordered additions without reducing a thirteenth to a sixth", () => {
    for (const modifier of ["add13add9", "add9add13"]) {
      const extended = extendChord(buildChord("C")!, modifier)!
      expect(extended.noteNames).toEqual(["C3", "E3", "G3", "D4", "A4"])
      expect(extended.label).toBe("Cadd9add13")
      expect(readChordSymbol(extended.label)!.intervals).toEqual(["1P", "3M", "5P", "9M", "13M"])
    }
  })

  it("keeps the root first in every supported catalog quality", () => {
    let supported = 0
    for (const type of ChordType.all()) {
      expect(type.intervals[0], type.name || type.aliases.join(", ")).toBe("1P")
      for (const alias of type.aliases) {
        const chord = buildChord("C" + alias)
        if (!chord) continue
        supported++
        expect(chord.notesMidi[0], chord.input).toBe(48 + chord.rootPc)
        expect(Note.midi(chord.noteNames[0]), chord.input).toBe(48 + chord.rootPc)
      }
    }
    expect(supported).toBeGreaterThan(100)
  })

  it("keeps spelling across octave boundaries and the language's 6/9 spelling", () => {
    expect(extendChord(buildChord("B#")!, "maj7")!.noteNames).toEqual(
      buildChord("B#maj7")!.noteNames,
    )
    expect(extendChord(buildChord("C")!, "m6/9")!.label).toBe("Cm6/9")
    expect(extendChord(buildChord("C")!, "dom7")!.label).toBe("C7")
  })

  it("does not mutate its input and rejects pitches beyond MIDI range", () => {
    const original = buildChord("Cm7/G")!
    const snapshot = structuredClone(original)
    extendChord(original, "maj7")
    extendChord(original, "add9")
    expect(original).toEqual(snapshot)
    expect(extendChord(buildChord("B", null, 8)!, "maj7")).toBeNull()
    expect(extendChord(original, "notAQuality")).toBeNull()
  })
})
