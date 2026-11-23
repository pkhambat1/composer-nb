import { describe, it, expect, vi } from "vitest"
import {
  play,
  firstError,
  allErrors,
  labels,
  notes,
  hits,
  durations,
  played,
  sound,
} from "./helpers.ts"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../src/music-engine.ts")

describe("patterns", () => {
  const GROOVE =
    "set time 7 over 8\npattern groove = 3 bars {\n  ride.bell: x--,\n  kick: x--x---\n}\n"

  it("can be written on one line", () => {
    const want = sound("pattern fill = {\n  snare: x-xx\n}\nplay fill")
    expect(sound("pattern fill = { snare: x-xx }\nplay fill")).toBe(want)
  })

  it("can play other patterns, alongside their own lines", () => {
    const want = sound(GROOVE + "play block {\n  crash: x 15*-,\n  groove\n} for 6 bars")
    // In a pattern a crash line would repeat every bar, so one crash goes in bar 1.
    expect(
      sound(
        GROOVE +
          "pattern breakdown = 6 bars {\n  pattern { crash: x 13*- } on bar 1,\n  groove\n}\nplay breakdown",
      ),
    ).toBe(want)
    expect(sound(GROOVE + "pattern twice = 6 bars groove\n" + play("crash: x 15*-", "twice"))).toBe(
      want,
    )
  })

  it("last exactly as long as what's in them, down to a beat", () => {
    const p = parseSource(
      "pattern fill = { snare: x-xx }\npattern beat = 1 bars { kick: x--- }\nplay (beat fill beat)",
    )
    expect(p.errors).toEqual([])
    expect(p.outputs[0].durSec).toBe(6)
    expect(hits(p.outputs[0], "kick").map((e) => e.secStart)).toEqual([0, 4])
    expect(p.outputs[0].blocks[0].bars).toBe(3) // the part bar still gets a row on the grid
  })

  it("layer two lines of names, where one pattern on its own repeats to fill", () => {
    const p = parseSource(
      "pattern aa = { kick: x 15*- }\npattern bb = { snare: x 15*- }\n" + play("(aa aa)", "bb"),
    )
    expect(p.outputs[0].durSec).toBe(4)
    expect(p.outputs[0].drumEvents.map((e) => [e.lane, e.secStart])).toEqual([
      ["kick", 0],
      ["snare", 0],
      ["kick", 2],
      ["snare", 2],
    ])
  })

  it("keep what a with sets to its block", () => {
    expect(
      durations("pattern aa = { piano: chords C }\nwith tempo 60 { play aa }\nplay aa"),
    ).toEqual([4, 2])
  })

  it("use the settings in effect where they're played", () => {
    expect(durations("pattern aa = { piano: chords C }\nplay aa\nset tempo 60\nplay aa")).toEqual([
      2, 4,
    ])
    // a part that plays in order can have its own tempo, and a pattern can hold one
    expect(
      durations(
        "pattern slow = (with tempo 60 { piano: chords C })\nplay piano: chords G\nplay slow",
      ),
    ).toEqual([2, 4])
  })

  it("don't play until they're played", () => {
    const p = parseSource("pattern gg = {\n  kick: x\n}")
    expect(p.errors).toEqual([])
    expect(p.outputs).toEqual([])
  })

  it("draw a new grid where the time changes", () => {
    const p = parseSource(
      "pattern aa = { kick: x 13*- }\npattern bb = { kick: x 13*- }\nplay (aa with time 7 over 8 { bb })",
    )
    expect(p.outputs[0].blocks.map((b) => [b.time, b.bars])).toEqual([
      ["4 over 4", 1],
      ["7 over 8", 1],
    ])
  })

  it("mark chords played again so diagrams aren't shown twice", () => {
    for (const again of ["play (vv vv vv)", "play vv for 6 bars"]) {
      const p = parseSource("pattern vv = { piano: chords Am|F }\n" + again)
      expect(p.errors).toEqual([])
      expect(p.chords.filter((e) => !e.repeat).map((e) => e.label)).toEqual(["Am", "F"])
      expect(p.chords).toHaveLength(6)
    }
  })

  it("explain their mistakes", () => {
    expect(firstError("pattern aa = {\n  kick: x")).toMatch(/^aa needs a } to close it/)
    expect(firstError("}")).toMatch(/doesn't close anything/)
    expect(firstError("pattern")).toMatch(
      /A pattern gets its name with =: pattern groove = \{ \.\.\. \}/,
    )
    expect(firstError("pattern aa = {\n  piano: chords Am,\n  piano: chords F\n}")).toMatch(
      /piano already has a line in a/,
    )
    expect(firstError("pattern aa = {\n  kick: x,\n  play\n}")).toMatch(/play goes at the top/)
    expect(allErrors("pattern aa = {\n  pattern bb = {\n    kick: x\n  },\n  snare: x\n}")).toEqual(
      [],
    )
    expect(
      firstError("pattern aa = {\n  pattern bb = { kick: x },\n  snare: x\n}\nplay bb"),
    ).toMatch(/"bb" isn't defined/)
    expect(firstError("pattern aa = {\n  kick: x 15*-,\n  aa\n}")).toMatch(/a plays itself/)
    expect(firstError("pattern aa = {\n  steps pair = x-\n}")).toMatch(/a has nothing to play/)
    expect(firstError("pattern aa = { kick: x 15*- }\npattern bb = { aa nope }")).toMatch(
      /"nope" isn't defined/,
    )
  })
})

describe("names", () => {
  it("can't reuse a word the language uses", () => {
    expect(firstError("pattern x2 = { kick: x }")).toMatch(/x2 already means something/)
    expect(firstError("pattern kick = { kick: x }")).toMatch(/kick is an instrument/)
    expect(firstError("pattern tempo = { kick: x }")).toMatch(/tempo already means something/)
    expect(firstError("tempo = { kick: x }")).toMatch(/tempo already means something/)
  })

  it("are defined once in a cell, inside a block too", () => {
    const again = "A name is defined once, so pick another name"
    expect(
      firstError("pattern aa = { piano: chords C }\npattern aa = { piano: chords G }\nplay aa"),
    ).toBe(`aa is already defined on line 1. ${again}`)
    // not with another type either
    expect(firstError("steps riff = x---\nchords riff = Am F")).toBe(
      `riff is already defined on line 1. ${again}`,
    )
    // nor inside a block, when it's defined outside it
    expect(firstError("steps fig = x---\nplay block {\n  steps fig = --x-,\n  snare: fig\n}")).toBe(
      `fig is already defined on line 1. ${again}`,
    )
    // two blocks can each have their own, since what's named in braces stays inside
    expect(
      allErrors(
        "play block {\n  steps fig = x---,\n  snare: fig\n}\nplay block {\n  steps fig = --x-,\n  snare: fig\n}",
      ),
    ).toEqual([])
  })

  it("in a pattern mean the ones above it, even after a later cell defines them again", () => {
    const above = parseSource("steps fig = x---\npattern groove = {\n  snare: fig\n}").state
    const below = parseSource("steps fig = --x-\nplay groove", above)
    expect(below.errors).toEqual([])
    // groove keeps the fig it was written with: the snare on the first step, not the third
    expect(below.drumEvents.map((e) => e.tick)).toEqual([0])
  })

  it("from a cell above can be defined again in a cell below", () => {
    const above = parseSource("steps fig = x---").state
    expect(parseSource("steps fig = --x-\nplay snare: fig", above).errors).toEqual([])
    // and then not again in that cell
    expect(
      parseSource("steps fig = --x-\nsteps fig = x-x-", above).errors.map((e) => e.msg),
    ).toEqual(["fig is already defined on line 1. A name is defined once, so pick another name"])
  })

  it("start with a lowercase letter, with a capital for each new word, whatever their type", () => {
    expect(
      labels(
        "pattern partA = { piano: chords C }\npattern partB = { piano: chords G }\nplay (partA partB partA)",
      ),
    ).toEqual(["C", "G", "C"])
    const src =
      "steps countIn = x---\nnotes riffB = C4---\nchords verseA = Am F\n" +
      "pattern at100 = {\n  hat: countIn,\n  piano: notes riffB,\n  guitar: chords verseA\n}\nplay at100"
    expect(parseSource(src).errors).toEqual([])
  })

  it("say what's wrong with a name, the same for every type", () => {
    const values = {
      steps: "x-",
      notes: "C4---",
      chords: "Am F",
      pattern: "{ kick: x }",
    }
    for (const [type, value] of Object.entries(values)) {
      expect(firstError(`${type} Verse = ${value}`)).toBe(
        `Names start with a lowercase letter: ${type} verse`,
      )
      expect(firstError(`${type} PartA = ${value}`)).toBe(
        `Names start with a lowercase letter: ${type} partA`,
      )
      expect(firstError(`${type} q = ${value}`)).toBe(
        "Names need at least two characters, because single letters are steps",
      )
      expect(firstError(`${type} vi = ${value}`)).toBe("vi is a chord, so pick another name")
      expect(firstError(`${type} partA = ${value}\n${type} parta = ${value}`)).toBe(
        "parta differs from partA only in its capitals, so pick another name or write partA",
      )
    }
    // across types too: one name, one spelling
    expect(firstError("notes riffB = C4---\nchords riffb = Am")).toBe(
      "riffb differs from riffB only in its capitals, so pick another name or write riffB",
    )
    // the same name, written the same way, is defined twice
    expect(firstError("notes riffB = C4---\nnotes riffB = D4---")).toBe(
      "riffB is already defined on line 1. A name is defined once, so pick another name",
    )
    // a play that names one with a capital gets the rule, not a name it can't write
    expect(allErrors("pattern Bridge = { kick: x--- }\nplay Bridge")).toEqual([
      "Names start with a lowercase letter: pattern bridge",
      '"Bridge" can\'t be a name, since names start with a lowercase letter: bridge',
    ])
  })
})
