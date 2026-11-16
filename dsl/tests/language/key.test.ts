import { describe, it, expect, vi } from "vitest"
import { play, labels, notes } from "./helpers.ts"

vi.mock("tone", () => ({}))

const { MODES, initialState, parseCell } = await import("../../src/language.ts")

describe("key", () => {
  const labels = (src: string) => {
    const p = parseCell(src, initialState())
    expect(p.errors).toEqual([])
    return p.outputs[0].chords.map((e) => e.chord.label).join(" ")
  }
  it("reads numerals in each key and mode", () => {
    expect(labels("set key Bb\nplay piano: chords i iv v vi")).toBe("Bb Eb F Gm")
    expect(labels("set key F#\nset mode minor\nplay piano: chords i iv vdom7 vi")).toBe(
      "F#m Bm C#7 D",
    )
    expect(labels("set key D\nset mode dorian\nplay piano: chords i ii|iii iv|v vidim|vii")).toBe(
      "Dm Em F G Am Bdim C",
    )
    expect(labels("set key G\nset mode mixolydian\nplay piano: chords i vii|iv v")).toBe("G F C Dm")
    expect(labels("set key E\nset mode phrygian\nplay piano: chords i ii|iii")).toBe("Em F G")
    expect(labels("set key F\nset mode lydian\nplay piano: chords i ii|ivdim")).toBe("F G Bdim")
    expect(labels("set key B\nset mode locrian\nplay piano: chords idim ii")).toBe("Bdim C")
    expect(labels("set key A\nset mode minor\nplay piano: chords i vii")).toBe("Am G")
  })
  it("has the chords of harmonic minor, melodic minor and whole tone", () => {
    const run = (mode: string, suffix = "") =>
      labels(
        `set key D\nset mode ${mode}\nplay piano: chords ` +
          ["i", "ii", "iii", "iv", "v", "vi", "vii"].map((n) => n + suffix).join("|"),
      )
    expect(run("harmonicMinor")).toBe("Dm Edim Faug Gm A Bb C#dim")
    expect(run("harmonicMinor", "7")).toBe("DmMaj7 Em7b5 Fmaj7#5 Gm7 A7 Bbmaj7 C#dim7")
    expect(run("melodicMinor")).toBe("Dm Em Faug G A Bdim C#dim")
    expect(run("melodicMinor", "7")).toBe("DmMaj7 Em7 Fmaj7#5 G7 A7 Bm7b5 C#m7b5")
    // whole tone has six notes, spelt D E F# G# A# C
    expect(labels("set key D\nset mode wholeTone\nplay piano: chords i ii|iii iv|v vi")).toBe(
      "Daug Eaug F#aug G#aug A#aug Caug",
    )
    expect(labels("set key D\nset mode wholeTone\nplay piano: chords i7 vi7")).toBe("D7#5 C7#5")
  })
  it("has no 7th degree in whole tone, and says so", () => {
    const errs = (src: string) => parseCell(src, initialState()).errors.map((e) => e.msg)
    const msg =
      "wholeTone has 6 degrees per octave, so vii isn't in its first octave. Use 7 for the next tonic"
    expect(errs("set mode wholeTone\nplay piano: chords i|vii")).toEqual([`"vii": ${msg}`])
    expect(errs("set mode wholeTone\nplay piano: chords i|vii7")).toEqual([`"vii7": ${msg}`])
    expect(errs("set mode wholeTone\nplay piano: notes vi---vii---")).toEqual([
      `"vi---vii---": ${msg}`,
    ])
    expect(
      errs("set mode wholeTone\nplay every 1/4 beats piano: notes i-iii-v-vi-octave(i)-"),
    ).toEqual([])
  })
  it("counts numerals on the key's own scale, so the mode changes them", () => {
    const chart = "play piano: chords i iii|iv v|vi vii"
    expect(labels("set key A\nset mode minor\n" + chart)).toBe("Am C Dm Em F G")
    expect(labels("set key A\nset mode major\n" + chart)).toBe("A C#m D E F#m G#dim")
    // b and # move a numeral's root off the scale: minor's V7 is on its own 5, and bII is Bb
    expect(labels("set key A\nset mode minor\nplay piano: chords vdom7 bii")).toBe("E7 Bb")
  })
  it("names a numeral's root by its letter in the scale", () => {
    expect(labels("set key G\nset mode minor\nplay piano: chords i vi|vii")).toBe("Gm Eb F")
    expect(labels("set key A\nplay piano: chords ii iii")).toBe("Bm C#m")
    expect(labels("set key Bb\nset mode dorian\nplay piano: chords i iv")).toBe("Bbm Eb")
    // the 7th of G minor is F#, not Gb, and the 3rd of F# is A#: one letter a degree
    expect(labels("set key G\nset mode minor\nplay piano: chords #viidim7 vdom7")).toBe("F#dim7 D7")
    expect(labels("set key F#\nplay piano: chords iii viidim|iv")).toBe("A#m E#dim B")
    expect(labels("set key C#\nset mode minor\nplay piano: chords #vii")).toBe("B#")
    expect(labels("set key Gb\nplay piano: chords iv")).toBe("Cb")
    expect(labels("set key Cb\nplay piano: chords i iv|v vi")).toBe("Cb Fb Gb Abm")
    expect(labels("set key A\nplay piano: chords bvii bvi")).toBe("G F")
  })
  it("is a note, and its mode a setting of its own", () => {
    expect(MODES).toContain("wholeTone")
    const errs = (src: string) => parseCell(src, initialState()).errors.map((e) => e.msg)
    expect(errs("set key Em")).toEqual(["A key is a note: set key E, then set mode minor"])
    expect(errs("set key Ebm")).toEqual(["A key is a note: set key Eb, then set mode minor"])
    expect(errs("set key A minor")).toEqual(["A key is a note: set key A, then set mode minor"])
    expect(errs("set key C major")).toEqual(["A key is a note: set key C, then set mode major"])
    expect(errs("set key D dorian")).toEqual(["A key is a note: set key D, then set mode dorian"])
    expect(errs("set key D Dorian")).toEqual(["A key is a note: set key D, then set mode dorian"])
    expect(errs("set key D blues")[0]).toBe(
      `A key is a note: set key D. Its mode is a setting of its own, one of ${MODES.join(", ")}`,
    )
    expect(errs("set key H")).toEqual([
      "A key is a note, A to G with # or b after it: set key E, set key Bb",
    ])
    expect(errs("set key e")).toEqual([
      "A key is a note, A to G with # or b after it: set key E, set key Bb",
    ])
    expect(errs("with key Em { play piano: notes i--- }")).toEqual([
      "A key is a note: with key E, mode minor { ... }",
    ])
  })
  it("has a mode of major, minor or one of the five others, each with one name", () => {
    const errs = (src: string) => parseCell(src, initialState()).errors.map((e) => e.msg)
    const list = `mode is one of: ${MODES.join(", ")}`
    expect(errs("set mode ionian")).toEqual([list])
    expect(errs("set mode aeolian")).toEqual([list])
    expect(errs("set mode m")).toEqual([list])
    expect(errs("set mode Minor")).toEqual(["Modes are camelCase: set mode minor"])
    // for now the all-lowercase spelling is read too, and is the camelCase mode
    expect(errs("set mode harmonicminor")).toEqual([])
    expect(parseCell("set mode wholetone", initialState()).state.mode).toBe("wholeTone")
    expect(errs("set mode HarmonicMinor")).toEqual(["Modes are camelCase: set mode harmonicMinor"])
    expect(errs("set mode")).toEqual(["set mode needs a value after it, e.g. set mode minor"])
    for (const mode of MODES) expect(errs(`set mode ${mode}`), mode).toEqual([])
  })
  it("and its mode are independent, and both carry into later cells", () => {
    const p = parseCell("set mode minor\nset key G", initialState())
    expect([p.state.key, p.state.mode]).toEqual(["G", "minor"])
    const q = parseCell("set key D\nset mode dorian\nset key E", initialState())
    expect([q.state.key, q.state.mode]).toEqual(["E", "dorian"])
    const r = parseCell("set mode major", q.state)
    expect([r.state.key, r.state.mode]).toEqual(["E", "major"])
    expect(parseCell("play kick: x---", p.state).fromAbove).toEqual(["key G", "mode minor"])
  })
  it("goes with each block, for the sheet's key signature", () => {
    const p = parseCell("set key D\nset mode dorian\nplay kick: x---", initialState())
    expect([p.outputs[0].blocks[0].key, p.outputs[0].blocks[0].mode]).toEqual(["D", "dorian"])
    expect(p.fromAbove).toEqual([])
    const after = parseCell("play kick: x---", p.state)
    expect(after.fromAbove).toEqual(["key D", "mode dorian"])
  })
})

describe("numerals' qualities", () => {
  const labels = (src: string) => {
    const p = parseCell(src, initialState())
    expect(p.errors).toEqual([])
    return p.outputs[0].chords.map((e) => e.chord.label).join(" ")
  }
  it("follow the numeral as a chord's follow its root", () => {
    expect(labels("play piano: chords viidim viidim7|viim7b5 ivmaj7")).toBe(
      "Bdim Bdim7 Bm7b5 Fmaj7",
    )
    expect(labels("play piano: chords ii7 iimmaj7|vsus4 v7")).toBe("Dm7 DmMaj7 Gsus4 G7")
  })
  it("are typed, not drawn: ° and ø say what to write", () => {
    const errs = (src: string) => parseCell(src, initialState()).errors.map((e) => e.msg)
    expect(errs("play piano: chords vii°")[0]).toContain("viidim (viidim, viidim7, or viim7b5")
    expect(errs("play piano: chords vii°7")[0]).toContain("viidim7")
    expect(errs("play piano: chords viiø")[0]).toContain("viim7b5")
    expect(errs("chords turn = ii vii°")[0]).toContain("viidim")
  })
})

describe("a numeral's octave", () => {
  const roots = (src: string) => {
    const p = parseCell(src, initialState())
    expect(p.errors).toEqual([])
    return p.outputs[0].chords.map((e) => e.chord.notesMidi[0])
  }
  const shape = (src: string) => roots(src).map((m, i, all) => m - all[0])
  it("counts up from the key's root, as a degree does, so a progression keeps its shape", () => {
    const iviIVV = "play piano: chords i|vi|iv|v"
    // in C: C3 A3 F3 G3, and every key the same steps up from its root
    expect(roots("set key C\n" + iviIVV)).toEqual([48, 57, 53, 55])
    for (const key of ["D", "E", "Gb", "A", "B", "D\nset mode dorian"]) {
      expect(shape(`set key ${key}\n` + iviIVV), key).toEqual([0, 9, 5, 7])
    }
    // in minor the 6th is a semitone lower, as its scale has it
    expect(shape("set key C#\nset mode minor\n" + iviIVV)).toEqual([0, 8, 5, 7])
    expect(roots("set key E\n" + iviIVV)).toEqual([52, 61, 57, 59])
    // set octave moves it, from the key's root in that octave
    expect(roots("set key E\nset octave 2\n" + iviIVV)).toEqual([40, 49, 45, 47])
  })
  it("keeps the bass an octave below the root, or a bass note under the key's root", () => {
    const bass = (src: string) =>
      parseCell(src, initialState()).outputs[0].chords.map((e) => e.chord.bassMidi)
    expect(bass("set key E\nplay piano: chords i vi|i/G# iv/E")).toEqual([40, 49, 44, 40])
    // in C as before: F/C has C2 under F3
    expect(bass("play piano: chords iv/C F/C")).toEqual([36, 36])
  })
  it("leaves a chord symbol in the octave from C", () => {
    expect(roots("set key E\nplay piano: chords E|C#m|A|B")).toEqual([52, 49, 57, 59])
  })
  it("counts intervals from where the chord sounds", () => {
    expect(roots("set key A\nplay piano: chords 5|fifth(5)")).toEqual([64, 71])
    expect(roots("play piano: chords fifth(1, 3)|fifth(1, 2)|fifth(1)|1")).toEqual([69, 62, 55, 48])
  })
})
