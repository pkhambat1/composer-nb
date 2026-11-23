import { describe, it, expect, vi } from "vitest"
import { play, firstError, allErrors, labels, notes, hits, durations } from "./helpers.ts"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../src/music-engine.ts")

describe("types", () => {
  it("go in front of a name: steps, notes, chords or pattern", () => {
    const p = parseSource(
      "steps pair = ^-x-\nnotes riff = F---G---\nchords verse = Am F|C G\npattern beat = {\n  piano: chords verse,\n  guitar: notes riff,\n  hat: pair\n}\nplay beat",
    )
    expect(p.errors).toEqual([])
    expect(p.chords.map((e) => e.label)).toEqual(["Am", "F", "C", "G"])
    expect(p.notes.map((e) => e.label)).toEqual(["F", "G", "F", "G"])
    expect(hits(p.outputs[0], "hat")).toHaveLength(4)
  })

  it("are asked for when a name has none, with the line to write", () => {
    expect(allErrors("verse = Am F|C G")).toEqual([
      "Say what verse is. Put its type in front: chords verse = Am F|C G",
    ])
    expect(allErrors("pair = ^-x-")).toEqual([
      "Say what pair is. Put its type in front: steps pair = ^-x-",
    ])
    expect(allErrors("riff = F---G F-F--")).toEqual([
      "Say what riff is. Put its type in front: notes riff = F---G F-F--",
    ])
    // An untyped declaration never binds a name.
    expect(allErrors("groove = {\n  kick: x\n}\nplay groove")).toEqual([
      "Say what groove is. Put its type in front: pattern groove = { ... }",
      '"groove" isn\'t defined. Name it first: pattern groove = { ... }',
    ])
    expect(allErrors("fill = snare: x-xx")).toEqual([
      "Say what fill is. Put its type in front: pattern fill = snare: x-xx",
    ])
  })

  it("read G and D as chords, since no step is a capital letter", () => {
    expect(labels("chords verse = G D\nplay piano: chords verse")).toEqual(["G", "D"])
    expect(firstError("steps hard = D")).toMatch(/"D" is a chord, and hard is steps/)
    expect(allErrors("verse = G D")).toEqual([
      "Say what verse is. Put its type in front: chords verse = G D",
    ])
  })

  it("only hold what they say", () => {
    expect(firstError("steps riff = Am F")).toMatch(
      /"Am" is a chord, and riff is steps. For chords, write chords riff = Am F/,
    )
    expect(firstError("chords pair = x-x-")).toMatch(
      /"x-x-" is steps, and pair is chords. For steps, write steps pair = x-x-/,
    )
    expect(firstError("pattern fill = xxxx")).toMatch(
      /xxxx is steps, not a pattern. Write steps fill = xxxx, or give them an instrument: pattern fill = kick: xxxx/,
    )
    expect(firstError("pattern verse = Am F")).toMatch(
      /Am F is chords, not a pattern. Write chords verse = Am F, or give them an instrument: pattern verse = piano: chords Am F/,
    )
    expect(firstError("pattern riff = F---G---")).toMatch(
      /F---G--- is notes, not a pattern. Write notes riff = F---G---, or give them an instrument: pattern riff = guitar: notes F---G---/,
    )
    expect(firstError("notes riff = Am F")).toMatch(
      /"Am" is a chord, and these are notes. For chords, write chords riff = Am F/,
    )
    expect(firstError("notes riff = x-x-")).toMatch(
      /"x-x-" is steps, and riff is notes. For steps, write steps riff = x-x-/,
    )
    expect(firstError("steps riff = F---")).toMatch(
      /"F---" is notes, and riff is steps. For notes, write notes riff = F---/,
    )
    expect(firstError("chords riff = F---G---")).toMatch(
      /"F---G---" is notes, and riff is chords. For notes, write notes riff = F---G---/,
    )
    expect(firstError("steps gg = { kick: x }")).toMatch(
      /That's a pattern, not steps. Write pattern gg = \.\.\./,
    )
    expect(firstError("chords gg = 2 bars { piano: chords C }")).toMatch(
      /That's a pattern, not chords/,
    )
    expect(firstError("chords verse = Am Zz")).toMatch(/"Zz" isn't a chord I know/)
    expect(firstError("steps pair = x-q-")).toMatch(/"x-q-" isn't a step. Use x \(hit\)/)
  })

  it("only go where their type goes", () => {
    expect(firstError("chords verse = Am|F\nplay verse")).toMatch(
      /verse is chords, so it goes on an instrument's line: piano: chords verse/,
    )
    expect(firstError("notes riff = F---\nplay riff")).toMatch(
      /riff is notes, so it goes on an instrument's line: piano: notes riff/,
    )
    expect(firstError("steps pair = ^-x-\nplay pair")).toMatch(
      /pair is steps, so it goes on a drum's line: hat: pair/,
    )
    expect(firstError("pattern fill = { snare: x-xx }\nplay piano: chords fill")).toMatch(
      /fill is a pattern, so it goes on a line of its own/,
    )
    expect(firstError("pattern fill = { snare: x-xx }\nplay piano: notes fill")).toMatch(
      /fill is a pattern, so it goes on a line of its own/,
    )
    expect(firstError("pattern fill = { snare: x-xx }\nplay hat: fill")).toMatch(
      /fill is a pattern, so it goes on a line of its own/,
    )
    expect(firstError("chords verse = Am|F\nplay hat: verse")).toMatch(
      /verse is chords, so it goes on a line like piano: chords verse, not on a drum's/,
    )
    expect(firstError("notes riff = F---\nplay hat: riff")).toMatch(
      /riff is notes, so it goes on a line like piano: notes riff, not on a drum's/,
    )
    expect(firstError("steps pair = ^-x-\nplay piano: chords pair")).toMatch(
      /pair is steps, so it goes on a drum's line, not among chords/,
    )
    expect(firstError("steps pair = ^-x-\nplay piano: notes pair")).toMatch(
      /pair is steps, so it goes on a drum's line, not on piano's/,
    )
    // chords in front is what makes a line a chart, whatever the chart holds
    expect(firstError("chords verse = Am F\nplay piano: notes verse")).toMatch(
      /verse is chords, so chords goes in front of it: piano: chords verse/,
    )
    expect(firstError("notes riff = F---\nplay piano: chords riff")).toMatch(
      /riff is notes, and the rest of this line is chords. A line plays one or the other/,
    )
    expect(firstError("chords verse = Am F\nplay piano: notes F--- verse")).toMatch(
      /verse is chords, and the rest of this line is notes. A line plays one or the other/,
    )
    expect(firstError("chords verse = Am F\nplay kick: 1 verse")).toMatch(/not beat lists/)
  })

  it("build on names of the same type", () => {
    expect(labels("chords aa = Am F\nchords bb = aa C G\nplay piano: chords bb")).toEqual([
      "Am",
      "F",
      "C",
      "G",
    ])
    const o = parseSource("steps pair = ^-x-\nsteps four = pair ^---\nplay hat: four").outputs[0]
    expect(hits(o, "hat").map((e) => e.vel)).toEqual([1, 0.7, 1])
    expect(notes("notes up = C-E-\nnotes line = up G-E-\nplay piano: notes line")).toEqual([
      "C3",
      "E3",
      "G3",
      "E3",
    ])
    expect(firstError("notes up = C-E-\nsteps pair = up x")).toMatch(
      /up is notes, so it can't go in steps/,
    )
    expect(firstError("steps pair = ^-x-\nnotes line = pair G-E-")).toMatch(
      /pair is steps, so it can't go in notes/,
    )
    expect(firstError("steps pair = ^-x-\nchords verse = pair Am")).toMatch(
      /pair is steps, so it can't go in chords/,
    )
    expect(firstError("pattern fill = { snare: x }\nsteps pair = fill x")).toMatch(
      /fill is a pattern, so it can't go in steps/,
    )
    expect(firstError("steps four = pair pair")).toMatch(
      /"pair" isn't defined above. Name it first: steps pair = \.\.\./,
    )
  })

  it("need = between the name and what it holds", () => {
    expect(firstError("steps pair x-x-")).toMatch(
      /steps pair needs = before what it holds: steps pair = x-x-/,
    )
    expect(firstError("chords verse Am F")).toMatch(
      /chords verse needs = before what it holds: chords verse = Am F/,
    )
    expect(firstError("play block {\n  pattern fill snare: xxxx\n}")).toMatch(
      /pattern fill needs = before what it holds: pattern fill = snare: xxxx/,
    )
    expect(firstError("notes riff F---")).toMatch(
      /notes riff needs = before what it holds: notes riff = F---/,
    )
    // chords and no name is a chart with no instrument to play it
    expect(firstError("play chords Am F")).toMatch(
      /Chords go on an instrument's line: piano: chords Am F/,
    )
    expect(firstError("play notes F---G---")).toMatch(
      /Notes go on an instrument's line: guitar: notes F---G---/,
    )
  })

  it("can't be used as names", () => {
    expect(firstError("steps = x-x-")).toMatch(/steps needs a name after it: steps riff = /)
    expect(firstError("notes = F---")).toMatch(/notes needs a name after it: notes riff = /)
    expect(firstError("pattern notes = { kick: x }")).toMatch(/notes already means something/)
    expect(firstError("pattern steps = { kick: x }")).toMatch(/steps already means something/)
    expect(firstError("steps pattern = x-x-")).toMatch(/pattern already means something/)
  })

  it("stay inside the braces they're written in", () => {
    const src = "pattern aa = {\n  steps pair = ^-x-,\n  hat: pair\n}\nplay aa\nplay hat: pair"
    expect(allErrors(src)).toEqual([
      '"pair" isn\'t defined above. Name it first: steps pair = ^-x-',
    ])
  })
})

describe("nothing floats", () => {
  it("only plays what's inside a play", () => {
    const p = parseSource("kick: x-x-")
    expect(p.outputs).toEqual([])
    expect(p.errors[0].msg).toMatch(
      /An instrument's line goes inside braces: in a pattern, or play block \{ kick: x-x- \}/,
    )
    expect(firstError("pattern gg = { kick: x }\ngg")).toMatch(
      /Nothing plays this line. Write play gg/,
    )
    expect(firstError("pattern gg = { kick: x }\n(gg gg)")).toMatch(
      /Nothing plays this line. Write play \(gg gg\)/,
    )
  })

  it("needs something after play", () => {
    expect(firstError("play")).toMatch(/play needs something after it/)
    expect(firstError("play block { }")).toMatch(/nothing in its braces/)
    expect(firstError("play block {\n  steps pair = x-\n}")).toMatch(/Nothing to play in this play/)
  })
})

describe("numbers", () => {
  it("does real arithmetic wherever a number goes", () => {
    expect(durations("set tempo 60*2\nplay kick: x 15*-")).toEqual([2])
    expect(durations("set tempo 240/4\nplay kick: x 15*-")).toEqual([4])
    expect(durations("set tempo 30+30*3\nplay kick: x 15*-")).toEqual([2]) // the usual order of operations
    expect(parseSource("set transpose 1+1\nplay guitar: chords C").chords[0].transpose).toBe(2)
  })

  it("explains numbers that don't work", () => {
    expect(firstError("set tempo fast")).toMatch(/tempo is quarter notes per minute/)
    expect(firstError("set transpose 2.5")).toMatch(/transpose is a number of semitones/)
  })
})
