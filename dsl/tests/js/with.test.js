/* A key is a note and its mode a setting of its own; with gives a block settings of its own,
   restored at its }, where set gives the rest of the cell and later cells theirs. */
import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.ts")
const { sheetAbc } = await import("../../js/sheet.ts")
const { initialState } = await import("../../js/language.ts")

const clean = (src, inherited) => {
  const p = parseSource(src, inherited)
  expect(p.errors).toEqual([])
  return p
}
const midis = (src) => clean(src).notes.map((e) => e.note.midi)
const errors = (src) => parseSource(src).errors.map((e) => e.msg)
const firstError = (src) => errors(src)[0]
const notes = (o) => o.notes.map((e) => `${e.instrument} ${e.note.name}`)
const chords = (o) => o.chords.map((e) => e.chord.label)

describe("a key and its mode", () => {
  const scale = "play piano: notes 1-2-3-4-5-6-7-1'-"
  it("give E minor's key signature and spelling, and its scale to the degrees", () => {
    const minor = clean(`set key E\nset mode minor\nset octave 4\n${scale}`)
    expect(minor.notes.map((e) => e.note.midi)).toEqual([64, 66, 67, 69, 71, 72, 74, 76])
    const block = minor.outputs[0].blocks[0]
    expect([block.key, block.mode]).toEqual(["E", "minor"])
    const { abc } = sheetAbc(block)
    expect(abc).toContain("K:Em")
    // E natural minor is all in the signature: no accidental on any of its notes
    expect(abc.split("\n").find((l) => l.startsWith("[V:P1]"))).toBe("[V:P1] E2F2 G2A2 B2c2 d2e2 |")
  })

  it("raise minor's 7th with a sharp in a flat key, and name the key in the header", () => {
    const p = clean("set key G\nset mode minor\nset octave 4\nplay piano: notes #7---1'---")
    const voice = sheetAbc(p.outputs[0].blocks[0]).abc.split("\n").find((l) => l.startsWith("[V:P1]"))
    expect(voice).toBe("[V:P1] ^f4 g4 z4 z4 |")
    expect(sheetAbc(p.outputs[0].blocks[0]).abc).toContain("K:Gm")
  })

  it("change the pitch: the same degrees and numerals sound in each mode's own scale", () => {
    const cell = "play piano: {\n  chords i III|VII IV\n  notes 3-------6-------|7-------1'-------\n}"
    const sounds = (mode) => clean(`set key D\nset mode ${mode}\n${cell}`).events.map((e) => e.note?.name ?? e.chord.label)
    expect(sounds("minor")).toEqual(["Dm", "F3", "F", "Bb3", "C", "C4", "G", "D4"])
    expect(sounds("dorian")).toEqual(["Dm", "F3", "F", "B3", "C", "C4", "G", "D4"])
    expect(sounds("major")).toEqual(["Dm", "F#3", "F#", "B3", "C#", "C#4", "G", "D4"])
  })

  it("are set apart: the key keeps the mode, and the mode keeps the key", () => {
    const p = clean("set mode minor\nset key G")
    expect([p.state.key, p.state.mode]).toEqual(["G", "minor"])
    const q = clean("set key A", p.state)
    expect([q.state.key, q.state.mode]).toEqual(["A", "minor"])
    const r = clean("set mode dorian", q.state)
    expect([r.state.key, r.state.mode]).toEqual(["A", "dorian"])
  })
})

describe("with", () => {
  it("gives its block its settings, and puts back what was set at its }", () => {
    const p = clean("set octave 4\nwith key E, mode minor, octave 2 {\n  play piano: notes 1---\n}\nplay piano: notes 1---")
    expect(p.outputs.map(notes)).toEqual([["piano E2"], ["piano C4"]])
    expect([p.outputs[0].blocks[0].key, p.outputs[0].blocks[0].mode]).toEqual(["E", "minor"])
    expect([p.state.key, p.state.mode, p.state.octave]).toEqual(["C", "major", 4])
  })

  it("never carries into the next cell", () => {
    const above = clean("with tempo 60, key G {\n  play kick: x\n}")
    expect([above.state.tempo, above.state.key]).toEqual([120, "C"])
    const below = clean("play piano: chords I", above.state)
    expect(chords(below.outputs[0])).toEqual(["C"])
    expect(below.fromAbove).toEqual([])
  })

  it("keeps the names declared in it inside it", () => {
    const p = parseSource("with key E {\n  chords inside = I IV\n  play piano: chords inside\n}\nplay piano: chords inside")
    expect(p.errors.map((e) => e.msg)).toEqual([`"inside" isn't defined above. Name it first: chords inside = Am F|C G`])
    expect(chords(p.outputs[0])).toEqual(["E", "A"])
    expect(Object.keys(p.state.words)).toEqual([])
    // and inside a play, as names in any block do
    const q = parseSource("play {\n  with key E {\n    notes riff = 1---5---\n    bass: notes riff\n  }\n  piano: notes riff\n}")
    expect(q.errors.map((e) => e.msg)).toContain(`"riff" isn't defined above. Name it first: notes riff = F---G---`)
  })

  it("holds statements at the top: names, plays and other withs", () => {
    const p = clean(
      "with key D {\n  chords vamp = I IV\n  play piano: chords vamp\n  with mode dorian {\n    play piano: chords vamp\n  }\n}",
    )
    expect(p.outputs.map(chords)).toEqual([["D", "G"], ["D", "G"]])
    expect(p.outputs.map((o) => o.blocks[0].mode)).toEqual(["major", "dorian"])
  })

  it("is a block in a play: on its own line it sounds with the others, and repeats as a block does", () => {
    const o = clean(
      "set tempo 96\nchords verse = i III|VII iv\n\nwith key E, mode minor {\n  play {\n    piano: chords verse\n    with octave 2 { bass: notes 1---5--- }\n  }\n}",
    ).outputs[0]
    expect(chords(o)).toEqual(["Em", "G", "D", "Am"])
    // the bass's two notes, under the whole chart, an octave below
    expect(notes(o)).toEqual(Array(4).fill(["bass E2", "bass B2"]).flat())
    expect(o.notes.map((e) => e.secStart).slice(0, 2)).toEqual([0, 0.625])
    expect(o.durSec).toBe(5)
  })

  it("is one part in order in a group", () => {
    const o = clean(
      "chords prog = I vi|IV V\nplay (\n  with key E { piano: chords prog }\n  with key G { piano: chords prog }\n)",
    ).outputs[0]
    expect(chords(o)).toEqual(["E", "C#m", "A", "B", "G", "Em", "C", "D"])
    expect(o.chords.map((e) => e.secStart)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(o.blocks.map((b) => [b.key, b.bars])).toEqual([
      ["E", 2],
      ["G", 2],
    ])
    // on one line too, and with a length in front, which is the block's own
    expect(chords(clean("chords prog = I vi\nplay (with key E { piano: chords prog } with key G { piano: chords prog })").outputs[0])).toEqual(
      ["E", "C#m", "G", "Em"],
    )
    expect(clean("play (2 bars with key E { kick: x--- } kick: x)").outputs[0].durSec).toBe(4.125)
  })

  it("plays a pattern where it's played, so a pattern under two keys plays in each", () => {
    const o = clean(
      "pattern song = {\n  piano: chords I V\n  bass: notes 1-------5-------\n}\nplay (\n  with key A { song }\n  with key Bb { song }\n)",
    ).outputs[0]
    expect(chords(o)).toEqual(["A", "E", "Bb", "F"])
    expect(notes(o).filter((n) => n.startsWith("bass"))).toEqual(["bass A3", "bass E4", "bass Bb3", "bass F4"])
  })

  it("can be in a pattern, a bar or an every, and the play's one line", () => {
    const o = clean("pattern pp = {\n  piano: notes 1---\n  with octave 2 { bass: notes 1--- }\n}\nplay pp").outputs[0]
    expect(notes(o)).toEqual(["piano C3", "bass C2"])
    // what's in a bar repeats to fill it
    const bar = clean("play 2 bars {\n  bar 2 with octave 5 { piano: notes 1--- }\n  kick: x---\n}").outputs[0]
    expect(bar.notes.map((e) => [e.note.name, e.secStart])).toEqual([
      ["C5", 2],
      ["C5", 2.5],
      ["C5", 3],
      ["C5", 3.5],
    ])
    expect(notes(clean("play every 2 steps with octave 5 { piano: notes 1- }").outputs[0])).toEqual(["piano C5"])
    expect(notes(clean("play with key E { piano: notes 1--- }").outputs[0])).toEqual(["piano E3"])
  })

  it("sets time, tempo and swing around a whole play, or on a part in order", () => {
    expect(clean("with tempo 60 {\n  play kick: x---\n}").outputs[0].durSec).toBe(1)
    // or around everything a play or a pattern plays, with nothing beside it
    expect(clean("play with tempo 60 { kick: x--- }").outputs[0].durSec).toBe(1)
    const tag = clean("pattern tag = with time 6 over 4 {\n  piano: chords I\n  hat: x---\n}\nplay (tag piano: chords V)")
    expect(tag.outputs[0].blocks.map((b) => [b.time, b.bars])).toEqual([
      ["6 over 4", 1],
      ["4 over 4", 1],
    ])
    const p = clean("play (\n  with tempo 60 { kick: x--- }\n  kick: x---\n)")
    expect(p.outputs[0].durSec).toBe(1.5)
    expect(p.outputs[0].blocks.map((b) => b.tempo)).toEqual([60, 120])
    expect(clean("play (with time 3 over 4 { kick: 1 } kick: 1)").outputs[0].blocks.map((b) => b.time)).toEqual([
      "3 over 4",
      "4 over 4",
    ])
  })

  it("can't set the tempo of lines that sound together, which share one", () => {
    const rule =
      "The lines of a play or a pattern play together, so they share one tempo. Put the with around the whole play, " +
      "with tempo 60 { play ... }, or on a part that plays in order: ( with tempo 60 { ... } )"
    expect(firstError("play {\n  kick: x---\n  with tempo 60 { snare: ---- x--- }\n}")).toBe(rule)
    expect(firstError("pattern pp = {\n  kick: x---\n  with tempo 60 { snare: ---- x--- }\n}\nplay pp")).toBe(rule)
    expect(firstError("play {\n  with swing on { ride: x- }\n  kick: 1 3\n}")).toMatch(/so they share one swing/)
    // nor can a group that changes it, played with other lines
    expect(firstError("pattern slow = (with tempo 60 { kick: x--- })\nplay {\n  slow\n  snare: ---- x---\n}")).toBe(
      "slow changes the tempo, so it can't sound together with other lines. Play it on its own, or put the with around the whole play: with tempo 60 { play ... }",
    )
  })

  it("takes settings with commas between them, each once, and a block", () => {
    expect(firstError("with key E mode minor {\n  play piano: notes 1---\n}")).toBe(
      "Settings in a with are separated by commas: with key E, mode minor { ... }",
    )
    expect(firstError("with key E, key G {\n  play piano: notes 1---\n}")).toBe("key is in this with twice. A with sets each setting once")
    expect(firstError("with {\n  play piano: notes 1---\n}")).toBe(
      "with takes the settings its block plays with, then the block: with octave 2 { ... }",
    )
    expect(firstError("with key E")).toBe("with takes the settings its block plays with, then the block: with octave 2 { ... }")
    expect(firstError("play {\n  with key E bass: notes 1---\n}")).toBe(
      "with takes the settings its block plays with, then the block: with octave 2 { ... }",
    )
    expect(firstError("with key E, {\n  play piano: notes 1---\n}")).toBe("A comma goes between two settings: with key E, mode minor { ... }")
    expect(firstError("with set key E {\n  play piano: notes 1---\n}")).toBe("A with's settings have no set in front: with key E { ... }")
    expect(firstError("with tempo {\n  play kick: x\n}")).toBe("with tempo needs a value after it, e.g. with tempo 90 { ... }")
    expect(firstError("with tempi 90 {\n  play kick: x\n}")).toBe(`"tempi" isn't a setting. Did you mean with tempo?`)
    expect(firstError("with octave 9 {\n  play kick: x\n}")).toBe("octave is a number from 1 to 6")
    expect(firstError("with key E {\n  play piano: notes 1---\n")).toBe("This with needs a } to close it")
    expect(firstError("with key E {\n  play piano: notes 1---\n} play piano: notes 1---")).toBe("Nothing can follow a }")
    expect(firstError("with guitar.electric muted {\n  play guitar.electric: notes E2---\n}")).toBeUndefined()
  })

  it("can't hold an instrument's line at the top, where nothing plays it", () => {
    expect(firstError("with key E {\n  piano: chords I\n}")).toBe(
      "An instrument's line goes inside braces: in a pattern, or play { piano: chords I }",
    )
    expect(errors("play {\n  with key E {\n    play piano: notes 1---\n  }\n}")).toContain("play goes at the top, not inside braces")
  })

  it("goes around an instrument's line, not among its layers or in a value", () => {
    expect(firstError("play piano: {\n  chords I\n  with octave 5 { 1--- }\n}")).toBe(
      "A with goes around piano's line, not among its layers: with octave 5 { piano: { ... } }",
    )
    expect(firstError("play snare.ghost: {\n  --x-\n  with kit synth { x--- }\n}")).toBe(
      "A with goes around snare.ghost's line, not among its layers: with kit synth { snare.ghost: { ... } }",
    )
    expect(firstError("chords xx = with key E { I }")).toBe(
      "A with's block plays, so it goes around a line or a play, not after chords xx =",
    )
    expect(firstError("with key E { }")).toBe("These braces have nothing in them")
    // a pattern's value can be one line, and that line a with
    expect(notes(clean("pattern pp = with key E { piano: notes 1--- }\nplay pp").outputs[0])).toEqual(["piano E3"])
  })

  it("starts each cell from the settings set above it, not a with's", () => {
    const above = clean("set key A\nset mode minor\nwith key C, mode major {\n  play piano: chords i\n}")
    expect(clean("play piano: chords i", above.state).outputs[0].chords[0].chord.label).toBe("Am")
    expect(parseSource("play kick: x", initialState()).fromAbove).toEqual([])
  })
})
