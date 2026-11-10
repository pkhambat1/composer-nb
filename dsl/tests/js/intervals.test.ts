import { describe, expect, it } from "vitest"
import { parseCell } from "../../js/cell.ts"
import { buildChord, parseKey } from "../../js/chords.ts"
import { highlightMusic } from "../../js/highlight.ts"
import { INTERVALS, MODE_TABLE } from "../../js/vocab.ts"
import { sheetAbc } from "../../js/sheet.ts"
import { load, lookupPosition } from "../../js/chord-lookup.ts"

const clean = (source: string) => {
  const parsed = parseCell(source)
  expect(parsed.errors, source).toEqual([])
  return parsed
}
const notes = (value: string, settings = "") =>
  clean(`${settings}\nplay piano: notes ${value}`).notes
const chords = (value: string, settings = "") =>
  clean(`${settings}\nplay piano: chords ${value}`).chords
const errors = (source: string) =>
  parseCell(source)
    .errors.map((e) => e.msg)
    .join("\n")

describe("numeric degrees", () => {
  it("counts negative degrees downward through every mode, with no degree zero", () => {
    for (const [mode, { scale }] of Object.entries(MODE_TABLE)) {
      const settings = `set key D\nset mode ${mode}`
      for (const n of [-1, -2, -6, -7, -8, -13, -14, -15]) {
        const midi =
          50 +
          scale[((n % scale.length) + scale.length) % scale.length] +
          12 * Math.floor(n / scale.length)
        expect(notes(String(n), settings)[0].note.midi, `${mode}: ${n}`).toBe(midi)
        expect(chords(String(n), settings)[0].chord.notesMidi[0], `${mode}: ${n}`).toBe(midi)
        expect(chords(`1/${n}`, settings)[0].chord.bassMidi, `${mode}: /${n}`).toBe(midi - 12)
      }
      expect(notes(String(-scale.length), settings)[0].note.midi).toBe(38)
    }
    expect(notes("-1 -2 -7 -14").map((e) => e.note.midi)).toEqual([47, 45, 36, 24])
    expect(chords("-1sus2")[0].chord.noteNames).toEqual(["B2", "C#3", "F#3"])
    expect(chords("-7sus2add11#5/-4")[0].chord.noteNames).toEqual(["C2", "D2", "G#2", "F3"])
    expect(chords("-7sus2add11#5/-4")[0].chord.bassName).toBe("F1")
    expect(notes("-b1 -#2").map((e) => e.note.midi)).toEqual([46, 46])
    expect(notes("fifth(-1) -1").map((e) => e.note.midi)).toEqual([53, 47])
    expect(chords("-1")[0].chord.notesMidi[0]).toBe(47)
    for (const type of ["notes", "chords"])
      for (const value of ["0", "-0", "-129", "-999999999999999999"])
        expect(errors(`play piano: ${type} ${value}`)).not.toBe("")
  })

  it("distinguishes negative note starts from sustain dashes and chord holds", () => {
    const events = notes("-1--- -2--- ^-3--- ~-4---")
    expect(events.map((e) => [e.note.midi, e.tick, e.ticks])).toEqual([
      [47, 0, 96],
      [45, 96, 96],
      [43, 192, 96],
      [41, 288, 96],
    ])
    expect(notes("1---2---").map((e) => [e.note.midi, e.tick])).toEqual([
      [48, 0],
      [50, 96],
    ])
    expect(notes("--1---")[0].tick).toBe(48)
    expect(chords("-1 - -2 _").map((e) => [e.chord.notesMidi[0], e.ticks])).toEqual([
      [47, 192],
      [45, 96],
    ])
  })
  it("continues through every mode's octaves, for notes, chords and bass degrees", () => {
    for (const [mode, { scale }] of Object.entries(MODE_TABLE)) {
      const settings = `set key D\nset mode ${mode}`
      for (const n of [7, 8, 9, 13, 15, 17, 22]) {
        const midi = 50 + scale[(n - 1) % scale.length] + 12 * Math.floor((n - 1) / scale.length)
        expect(notes(String(n), settings)[0].note.midi, `${mode}: ${n}`).toBe(midi)
        expect(chords(String(n), settings)[0].chord.notesMidi[0], `${mode}: ${n}`).toBe(midi)
        expect(chords(`1/${n}`, settings)[0].chord.bassMidi, `${mode}: /${n}`).toBe(midi - 12)
        expect(notes(`fifth(${n})`, settings)[0].note.midi).toBe(
          notes(String(n + 4), settings)[0].note.midi,
        )
      }
    }
    expect(notes("1 8 15").map((e) => e.note.midi)).toEqual([48, 60, 72])
    expect(notes("1 7 13", "set mode wholeTone").map((e) => e.note.midi)).toEqual([48, 60, 72])
    expect(chords("15sus2add11#5/4")[0].chord.noteNames).toEqual(["C5", "D5", "G#5", "F6"])
  })

  it("replaces apostrophes with explicit octave functions", () => {
    for (const type of ["notes", "chords"]) {
      for (const value of ["1'", "''5", "v'", "fifth('1)"]) {
        const p = parseCell(`play piano: ${type} ${value}`)
        expect(p.errors[0].msg).toMatch(/apostrophes.*octave/)
        expect(p.outputs).toEqual([])
      }
    }
    expect(chords("octave(1) octave(1, -1)").map((e) => e.chord.notesMidi[0])).toEqual([60, 36])
  })
  it("uses the mode's triads and explicit seventh qualities", () => {
    expect(chords("1 2 3 4|5 6 7 octave(1)").map((e) => e.label)).toEqual([
      "C",
      "Dm",
      "Em",
      "F",
      "G",
      "Am",
      "Bdim",
      "C",
    ])
    expect(chords("1maj7 2m7 5dom7 7m7b5").map((e) => e.label)).toEqual([
      "Cmaj7",
      "Dm7",
      "G7",
      "Bm7b5",
    ])
    expect(chords("1 2 3 7", "set key D\nset mode minor").map((e) => e.label)).toEqual([
      "Dm",
      "Edim",
      "F",
      "C",
    ])
    expect(chords("b7 #4 5m 5dom7").map((e) => e.label)).toEqual(["Bb", "F#", "Gm", "G7"])
    expect(notes("1---b3---5---octave(1)---").map((e) => e.note.midi)).toEqual([48, 51, 55, 60])
    expect(notes("13--")[0].label).toBe("13")
    for (const type of ["notes", "chords"]) {
      for (const value of ["0", "129", "999999999999999999"])
        expect(errors(`play piano: ${type} ${value}`)).not.toBe("")
    }
  })

  it("composes suspensions, additions, alterations and scale-degree basses", () => {
    const chord = chords("1sus2add11#5/4")[0].chord
    expect(chord.label).toBe("Csus2add11#5/F")
    expect(chord.noteNames).toEqual(["C3", "D3", "G#3", "F4"])
    expect(chord.bassName).toBe("F2")
    expect(chords("1sus2add11#5/4", "set key D")[0].chord.noteNames).toEqual([
      "D3",
      "E3",
      "A#3",
      "G4",
    ])
    expect(chords("2add11 5dom7add13#11").map((e) => e.chord.noteNames)).toEqual([
      ["D3", "F3", "A3", "G4"],
      ["G3", "B3", "D4", "F4", "C#5", "E5"],
    ])
    expect(chords("1M6/9/3 6m6/9/1").map((e) => e.label)).toEqual(["C6/9/E", "Am6/9/C"])
    expect(chords("1/#4 1/b7").map((e) => e.chord.bassName)).toEqual(["F#2", "Bb2"])
    for (const token of ["1sus3", "1add", "1add99", "1sus2add11#5/0", "1/4/5"]) {
      expect(buildChord(token, parseKey("C")), token).toBeNull()
    }
  })

  it("keeps composed chord tones when no matching guitar shape exists", async () => {
    await load()
    const p = clean("play guitar: chords 1sus2add11#5/4")
    const chord = p.chords[0].chord
    expect(lookupPosition(chord.label)).toBeNull()
    expect(chord.notesMidi).toEqual([48, 50, 56, 65])
    expect(chord.bassMidi).toBe(41)
    expect(sheetAbc(p.outputs[0].blocks[0]).abc).toContain("Csus2add11#5/F")
  })

  it("retains existing numerals alongside numeric degrees", () => {
    const chart = (value: string) => chords(value).map((e) => [e.label, e.chord.notesMidi])
    expect(chart("1 6|4 5dom7")).toEqual(chart("i vi|iv v7"))
    expect(notes("fifth(C3, 2)---")[0].note.midi).toBe(62)
  })
})

describe("scale interval functions", () => {
  it("counts every note through the active scale, including the diminished fifth", () => {
    expect(notes("fifth(1 2 3 4 5 6 7)").map((e) => e.label)).toEqual([
      "G3",
      "A3",
      "B3",
      "C4",
      "D4",
      "E4",
      "F4",
    ])
    expect(notes("third(1 2 3 4 5 6 7)", "set mode minor").map((e) => e.label)).toEqual([
      "Eb3",
      "F3",
      "G3",
      "Ab3",
      "Bb3",
      "C4",
      "D4",
    ])
    expect(notes("fifth(B3) fifth(Bb3)").map((e) => e.label)).toEqual(["F4", "Fb4"])
    expect(notes("second(E3)").map((e) => e.note.midi)).toEqual([53])
    expect(notes("second(E3)", "set mode lydian").map((e) => e.note.midi)).toEqual([54])
  })

  it("moves all chord tones and the bass, and names the resulting quality", () => {
    expect(chords("fifth(1 2 3 7)").map((e) => e.label)).toEqual(["G", "Am", "Bdim", "F"])
    expect(chords("third(2)")[0].label).toBe("F")
    const moved = chords("fifth(1sus2add11#5/4)")[0].chord
    expect(moved.noteNames).toEqual(["G3", "A3", "D#4", "C5"])
    expect(moved.bassName).toBe("C3")
    expect(chords("fifth(3)", "set mode minor")[0].chord.noteNames).toEqual(["Bb3", "D4", "F4"])
  })

  it("supports single values, phrases, nested calls and signed repeated moves", () => {
    expect(notes("octave (1)", "set octave (1+2)")[0].note.midi).toBe(60)
    expect(notes("fifth(fifth(1))")[0].note.midi).toBe(62)
    expect(notes("fifth(1, 2)")[0].note.midi).toBe(62)
    expect(notes("fifth(1, -1)")[0].label).toBe("F2")
    expect(notes("fifth(1, 0)")[0].label).toBe("C3")
    expect(notes("fifth (1)---")[0].ticks).toBe(96)
    expect(notes("fifth(-1 7*- -2 7*-, 2)").map((e) => [e.note.midi, e.ticks])).toEqual([
      [60, 192],
      [59, 192],
    ])
    for (const [fn, ordinal] of Object.entries(INTERVALS)) {
      const semis = [0, 2, 4, 5, 7, 9, 11][(ordinal - 1) % 7] + 12 * Math.floor((ordinal - 1) / 7)
      expect(notes(`${fn}(C3)`)[0].note.midi, fn).toBe(48 + semis)
    }
  })

  it("keeps rhythms, articulations, rests, lengths, bar lines and chart holds", () => {
    const silence = clean("play piano: notes fifth(----)")
    expect(silence.notes).toEqual([])
    expect(silence.totalSec).toBe(0.5)
    const source = "^1--- ~2--- _--- 3---|4--- 5--- 6--- 7---"
    const timing = (events: ReturnType<typeof notes>) =>
      events.map((e) => [e.tick, e.ticks, e.vel, e.accent, e.ghost])
    expect(timing(notes(`fifth(${source})`))).toEqual(timing(notes(source)))
    const p = clean(
      "notes riff = 1 7*- 3 7*-\nnotes raised = fifth(riff)\nplay piano: notes raised",
    )
    expect(p.notes.map((e) => [e.tick, e.ticks, e.note.midi])).toEqual([
      [0, 192, 55],
      [192, 192, 59],
    ])
    expect(
      clean("play piano: notes fifth(1) 7*- 8*_ ...fifth(2) for 2 bars").notes.map(
        (e) => e.note.midi,
      ),
    ).toEqual([55, 57])
    const chart = chords("fifth(1 - _ 3|4 5)")
    expect(chart.map((e) => [e.tick, e.ticks])).toEqual([
      [0, 192],
      [288, 96],
      [384, 192],
      [576, 192],
    ])
  })

  it("resolves named phrases under the key and mode where they play", () => {
    const src =
      "notes riff = 1---3---\nnotes lifted = fifth(riff)\nchords harmony = 1 3\nchords raised = fifth(harmony)"
    const earlier = clean(src)
    for (const [mode, info] of Object.entries(MODE_TABLE)) {
      const played = parseCell(
        `set key D\nset mode ${mode}\nplay piano: notes lifted\nplay piano: chords raised`,
        earlier.state,
      )
      expect(played.errors, mode).toEqual([])
      expect(played.notes[0].note.midi, mode).toBe(50 + info.scale[4])
      expect(played.chords[0].chord.notesMidi[0], mode).toBe(played.notes[0].note.midi)
    }
    expect(
      notes("octave(1) ninth(1) fifteenth(1)", "set mode wholeTone").map((e) => e.note.midi),
    ).toEqual([60, 62, 72])
  })

  it("keeps transformed labels and spelling when playback is transposed", () => {
    const p = clean("set transpose 2\nplay piano: notes fifth(B3)\nplay piano: chords fifth(3)")
    expect([p.notes[0].note.midi, p.notes[0].label]).toEqual([67, "F4"])
    expect([p.chords[0].chord.label, p.chords[0].chord.notesMidi]).toEqual(["Bdim", [61, 64, 67]])
    const sheet = clean("play piano: notes fifth(Bb3)---")
    expect(sheetAbc(sheet.outputs[0].blocks[0]).abc).toContain("_F")
  })

  it("rejects malformed calls and wrong argument types with no playable output", () => {
    for (const value of [
      "fifth()",
      "fifth(1",
      "fifth(1,)",
      "fifth(1, 1.5)",
      "fifth(1, 65)",
      "fifth(1, 2, 3)",
      "banana(1)",
      "fifth(1)x",
    ]) {
      const p = parseCell(`play piano: notes ${value}`)
      expect(p.errors.length, value).toBeGreaterThan(0)
      expect(p.outputs, value).toEqual([])
    }
    expect(errors("steps beat = x-\nplay piano: notes fifth(beat)")).toMatch(/steps/)
    expect(errors("notes riff = 1---\nplay piano: chords fifth(riff)")).toMatch(/notes/)
    expect(errors("chords chart = 1 5\nplay piano: notes fifth(chart)")).toMatch(/chords/)
    expect(errors("notes fifth = 1---")).toMatch(/already means something/)
    expect(errors("play piano: notes fifth(missing)")).toMatch(/isn't defined/)
    expect(errors(`play piano: notes ${"fifth(".repeat(34)}1${")".repeat(34)}`)).toMatch(
      /32 levels/,
    )
  })
})

describe("pitch syntax highlighting", () => {
  it("preserves source and colors numeric chords, functions, counts and wrapped arguments", () => {
    for (const source of [
      "play piano: chords 1sus2add11#5/4 1M6/9/3",
      "play piano: chords -1sus2 -7sus2add11#5/-4 -b1/-#2",
      "play piano: notes -1--- -2--- ^-3--- ~-4--- 1---2---",
      "play piano: notes fifth(-1 7*- -2 7*-, 2)",
      "notes riff = fifth(1--- 2---|3--- 4---, -2)",
      "play piano: notes fifth(\n  1--- // root\n  third(2)---\n)",
      "play piano: chords fifth(1 3|4 5)",
    ]) {
      const paint = highlightMusic(source)
      expect(paint.map((line) => line.map((p) => p.s).join("")).join("\n")).toBe(source)
      expect(
        paint.flat().filter((p) => p.c === "tk-error"),
        source,
      ).toEqual([])
    }
    expect(
      highlightMusic("play piano: notes -1--- -2---")
        .flat()
        .filter((p) => p.c === "tk-note")
        .map((p) => p.s),
    ).toEqual(["-1", "-2"])
  })
})
