import { describe, it, expect, vi } from "vitest"
import {
  play,
  firstError,
  allErrors,
  anyError,
  labels,
  notes,
  hits,
  durations,
  sound,
} from "./helpers.ts"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../src/music-engine.ts")

describe("lines", () => {
  it("ignores // comments, blank lines and indentation", () => {
    const tidy = parseSource("// a note\nplay kick: x--x // and another")
    const messy = parseSource("\n\n   play block {\n kick: x--x\n\n      }\n")
    expect(tidy.errors).toEqual([])
    expect(messy.errors).toEqual([])
    expect(hits(tidy.outputs[0], "kick")).toHaveLength(2)
    expect(hits(messy.outputs[0], "kick")).toHaveLength(2)
  })

  it("keeps -- inside steps", () => {
    expect(parseSource("play snare: ----x--").errors).toEqual([])
  })

  it("suggests a close name", () => {
    expect(firstError("tempp 120")).toMatch(/isn't a setting. Did you mean set tempo/)
    expect(firstError("play kik: x-x-")).toMatch(/isn't an instrument. Did you mean kick/)
  })

  it("puts chords on an instrument's line, with chords in front", () => {
    expect(labels("play piano: chords Am F|C G")).toEqual(["Am", "F", "C", "G"])
    expect(firstError("play Am F|C G")).toMatch(
      /Chords go on an instrument's line, e\.g\. piano: chords Am F\|C G/,
    )
    expect(firstError("play guitar: notes Am F")).toMatch(
      /"Am" is a chord, and these are notes. For chords, write guitar: chords Am F/,
    )
    expect(notes("play guitar: notes C G|F G")).toEqual(["C3", "G3", "F3", "G3"])
  })

  it("continues a line at a bar when the next one starts with |", () => {
    expect(labels(play("piano: chords Am|F", "  |C G"))).toEqual(["Am", "F", "C", "G"])
    expect(
      sound(play("kick: x--- ---- x-x- ----", "  |x--- x-x- ---- x-x-", "  |x--- ---- ---- ----")),
    ).toBe(sound("play kick: x--- ---- x-x- ---- | x--- x-x- ---- x-x- | x--- ---- ---- ----"))
    // over a comment line, but not over a blank one
    expect(labels(play("piano: chords Am", "// then F", "|F"))).toEqual(["Am", "F"])
    expect(labels(play("piano: chords Am", "", "|F"))).toEqual(["Am", "F"])
    expect(anyError("|C G")).toMatch(/no line above to continue/)
    // the | is checked as a bar line where it falls
    expect(anyError(play("kick: x---", "  |x-x-"))).toMatch(/This \| isn't at the end of a bar/)
  })

  it("gives each instrument one line in a block", () => {
    expect(firstError(play("kick: x", "kick: x-"))).toMatch(
      /kick already has a line in this play. To layer it, put its lines in a block: kick: \{ \.\.\. \}/,
    )
    expect(firstError(play("piano: chords Am", "piano: notes F---"))).toMatch(
      /piano already has a line in this play. To layer it, put its lines in a block: piano: \{ \.\.\. \}/,
    )
  })
})

describe("what each symbol is for", () => {
  it("writes a setting as set, the setting and its value, with no = or colon", () => {
    expect(durations("set tempo 60\nplay kick: x 15*-")).toEqual([4])
    expect(firstError("tempo 60\nplay kick: 1")).toBe(
      "tempo is a setting, so it starts with set: set tempo 60",
    )
    expect(firstError("tempo")).toBe("tempo is a setting, so it starts with set: set tempo 90")
    expect(firstError("guitar.electric muted")).toBe(
      "guitar.electric muted is a setting, so it starts with set: set guitar.electric muted",
    )
    expect(firstError("tempo = 120")).toMatch(
      /tempo is a setting, not a name, so it takes no =: set tempo 120/,
    )
    expect(firstError("tempo: 120")).toMatch(
      /tempo is a setting, not an instrument, so it takes no colon: set tempo 120/,
    )
    expect(firstError("set tempo")).toMatch(/set tempo needs a value after it, e\.g\. set tempo 90/)
    expect(firstError("set")).toBe("set takes a setting and its value: set tempo 90")
    expect(firstError("set tmepo 90")).toBe('"tmepo" isn\'t a setting. Did you mean set tempo?')
    expect(firstError("set guitar.electric")).toBe(
      "set guitar.electric needs a sound after it: clean or muted",
    )
    expect(firstError("set piano bright")).toMatch(/piano has one sound/)
    // set is a keyword, so it can't be a name
    expect(firstError("pattern set = { kick: x--- }")).toBeTruthy()
  })

  it("keeps = for names, with the type in front", () => {
    expect(labels("chords verse = Am F|C G\nplay piano: chords verse")).toEqual([
      "Am",
      "F",
      "C",
      "G",
    ])
    expect(firstError("speed = 120")).toMatch(/"speed" isn't a setting. Settings: time, tempo/)
  })

  it("keeps the colon for an instrument and what it plays", () => {
    expect(firstError("kick = x--x")).toMatch(
      /kick is an instrument, so it takes a colon: kick: x--x/,
    )
    expect(firstError("guitar = Am F")).toMatch(
      /guitar is an instrument, so it takes a colon: guitar: chords Am F/,
    )
    expect(firstError("guitar = F---G---")).toMatch(
      /guitar is an instrument, so it takes a colon: guitar: notes F---G---/,
    )
    expect(firstError("play: groove")).toMatch(
      /play is a keyword, not an instrument, so it takes no colon/,
    )
    expect(firstError("play kick x--x")).toMatch(/Put a colon after kick: kick: x--x/)
  })

  it("names a pattern the same way: its type, its name, =", () => {
    expect(sound("pattern hit = { crash: x 15*- }\nplay hit")).toEqual(sound("play crash: x 15*-"))
    expect(sound("pattern groove = {\n  kick: x,\n  snare: x\n}\nplay groove")).toEqual(
      sound("play block {\n  kick: x,\n  snare: x\n}"),
    )
    expect(sound("pattern fill = snare: x-xx\nplay fill")).toEqual(sound("play snare: x-xx"))
    expect(sound("pattern gg = 3 bars {\n  kick: x-\n}\nplay gg")).toEqual(
      sound("pattern gg = { kick: x- }\nplay gg for 3 bars"),
    )
    expect(sound("pattern gg = 3 bars kick: x-\nplay gg")).toEqual(
      sound("pattern gg = { kick: x- }\nplay gg for 3 bars"),
    )
    expect(sound("pattern aa = { kick: x }\npattern song = (aa aa)\nplay song")).toEqual(
      sound("pattern aa = { kick: x }\nplay (aa aa)"),
    )
    expect(allErrors("play = {\n  kick: x\n}")).toEqual([
      "play is a keyword, not a name, so it takes no =: play groove",
    ])
    expect(allErrors("groove {\n  kick: x\n}")).toEqual([
      "groove needs a type and = to name its braces: pattern groove = {",
    ])
  })

  it("asks for the = when a pattern has none", () => {
    // Missing = rejects the declaration rather than recovering a binding.
    expect(allErrors("pattern groove {\n  kick: x\n}\nplay groove")).toEqual([
      "A pattern gets its name with =: pattern groove = { ... }",
      '"groove" isn\'t defined. Name it first: pattern groove = { ... }',
    ])
    expect(allErrors("pattern gg 3 bars {\n  kick: x-\n}")).toEqual([
      "A pattern gets its name with =: pattern gg = 3 bars { ... }",
    ])
  })
})
