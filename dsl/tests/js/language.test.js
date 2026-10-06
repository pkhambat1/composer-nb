import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.js")
const { LANES } = await import("../../js/language.js")
const { highlightMusic } = await import("../../js/highlight.js")
const { gridRows } = await import("../../js/grid.js")
const { prepareKit } = await import("../../js/drums.js")

const WHAT_HAPPENS_NOW = `// what happens now: crash once, the groove repeating under it
time 7 over 8

pattern groove = 3 bars {
  kick: x--x---
  snare: ----x--
  ride.bell: x--
}

play 6 bars {
  crash: 1
  groove
}`

// play { ... } around some lines; one line needs no braces.
const play = (...lines) =>
  lines.length === 1 ? `play ${lines[0]}` : `play {\n${lines.join("\n")}\n}`
const firstError = (src) => parseSource(src).errors[0]?.msg
const allErrors = (src) => parseSource(src).errors.map((e) => e.msg)
const anyError = (src) => allErrors(src).join("\n")
const labels = (src) => parseSource(src).chords.map((e) => e.label)
const notes = (src) => parseSource(src).notes.map((e) => e.note.name)
const hits = (o, lane) => o.drumEvents.filter((e) => e.lane === lane && !e.hidden)
const durations = (src) => parseSource(src).outputs.map((o) => o.durSec)
// The drum hits that play, in an order that doesn't depend on which line they came from.
const played = (src) => {
  const p = parseSource(src)
  expect(p.errors).toEqual([])
  return p.outputs.map((o) => [
    o.durSec,
    o.drumEvents.map((e) => [e.lane, e.secStart.toFixed(6), e.accent, !!e.hidden].join()).sort(),
  ])
}
// Everything that plays, for checking two ways of writing something sound the same.
const sound = (src) => {
  const p = parseSource(src)
  expect(p.errors).toEqual([])
  return JSON.stringify(
    p.outputs.map((o) => [
      o.durSec,
      o.drumEvents.map((e) => [e.lane, e.secStart, e.accent]),
      o.chords.map((e) => [e.label, e.secStart]),
      o.notes.map((e) => [e.instrument, e.note.name, e.secStart, e.secDur, e.vel]),
    ]),
  )
}

describe("lines", () => {
  it("ignores // comments, blank lines and indentation", () => {
    const tidy = parseSource("// a note\nplay kick: x-x- // and another")
    const messy = parseSource("\n\n   play {\n kick: x-x-\n\n      }\n")
    expect(tidy.errors).toEqual([])
    expect(messy.errors).toEqual([])
    expect(hits(tidy.outputs[0], "kick")).toHaveLength(2)
    expect(hits(messy.outputs[0], "kick")).toHaveLength(2)
  })

  it("keeps -- inside steps", () => {
    expect(parseSource("play snare: ----x--").errors).toEqual([])
  })

  it("suggests a close name", () => {
    expect(firstError("tempp 120")).toMatch(/isn't a setting. Did you mean tempo/)
    expect(firstError("play kik: x-x-")).toMatch(/isn't an instrument. Did you mean kick/)
  })

  it("puts chords on an instrument's line, with chords in front", () => {
    expect(labels("play piano: chords Am F|C G")).toEqual(["Am", "F", "C", "G"])
    expect(firstError("play Am F|C G")).toMatch(
      /Chords go on an instrument's line, e\.g\. piano: chords Am F\|C G/,
    )
    expect(firstError("play guitar: Am F")).toMatch(
      /"Am" is a chord, and these are notes. For chords, write guitar: chords Am F/,
    )
    expect(firstError("play guitar: C G|F G")).toMatch(
      /For chords, put chords in front: guitar: chords C G\|F G/,
    )
  })

  it("has no continuation lines", () => {
    expect(anyError(play("piano: chords Am|F", "|C G"))).toMatch(/end of the line above/)
  })

  it("gives each instrument one line in a block", () => {
    expect(firstError(play("kick: x", "kick: x-"))).toMatch(
      /kick already has a line in this play. To layer it, put its lines in a block: kick: \{ \.\.\. \}/,
    )
    expect(firstError(play("piano: chords Am", "piano: F---"))).toMatch(
      /piano already has a line in this play. To layer it, put its lines in a block: piano: \{ \.\.\. \}/,
    )
  })
})

describe("what each symbol is for", () => {
  it("writes a setting as a reserved word and its value, with no =", () => {
    expect(durations("tempo 60\nplay kick: 1")).toEqual([4])
    expect(firstError("tempo = 120")).toMatch(
      /tempo is a setting, not a name, so it takes no =: tempo 120/,
    )
    expect(firstError("tempo: 120")).toMatch(
      /tempo is a setting, not an instrument, so it takes no colon: tempo 120/,
    )
    expect(firstError("tempo")).toMatch(/tempo needs a value after it, e\.g\. tempo 90/)
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
      /guitar is an instrument, so it takes a colon: guitar: F---G---/,
    )
    expect(firstError("play: groove")).toMatch(
      /play is a keyword, not an instrument, so it takes no colon/,
    )
    expect(firstError("play kick x--x")).toMatch(/Put a colon after kick: kick: x--x/)
  })

  it("names a pattern the same way: its type, its name, =", () => {
    expect(sound("pattern hit = { crash: 1 }\nplay hit")).toEqual(sound("play crash: 1"))
    expect(sound("pattern groove = {\n  kick: x\n  snare: x\n}\nplay groove")).toEqual(
      sound("play {\n  kick: x\n  snare: x\n}"),
    )
    expect(sound("pattern fill = snare: x-x-\nplay fill")).toEqual(sound("play snare: x-x-"))
    expect(sound("pattern g = 3 bars {\n  kick: x-\n}\nplay g")).toEqual(
      sound("pattern g = { kick: x- }\nplay 3 bars g"),
    )
    expect(sound("pattern g = 3 bars kick: x-\nplay g")).toEqual(
      sound("pattern g = { kick: x- }\nplay 3 bars g"),
    )
    expect(sound("pattern a = { kick: x }\npattern song = a a\nplay song")).toEqual(
      sound("pattern a = { kick: x }\nplay a a"),
    )
    expect(allErrors("play = {\n  kick: x\n}")).toEqual([
      "play is a keyword, not a name, so it takes no =: play { ... }",
    ])
    expect(allErrors("groove {\n  kick: x\n}")).toEqual([
      "groove needs a type and = to name its braces: pattern groove = {",
    ])
  })

  it("asks for the = when a pattern has none", () => {
    // The pattern still gets its name, so the one mistake gives one message.
    expect(allErrors("pattern groove {\n  kick: x\n}\nplay groove")).toEqual([
      "A pattern gets its name with =: pattern groove = { ... }",
    ])
    expect(allErrors("pattern g 3 bars {\n  kick: x-\n}")).toEqual([
      "A pattern gets its name with =: pattern g = 3 bars { ... }",
    ])
  })
})

describe("types", () => {
  it("go in front of a name: steps, notes, chords or pattern", () => {
    const p = parseSource(
      "steps pair = ^-x-\nnotes riff = F---G---\nchords verse = Am F|C G\npattern beat = {\n  piano: chords verse\n  guitar: riff\n  hat: pair\n}\nplay beat",
    )
    expect(p.errors).toEqual([])
    expect(p.chords.map((e) => e.label)).toEqual(["Am", "F", "C", "G"])
    expect(p.notes.map((e) => e.label)).toEqual(["F", "G", "F", "G", "F", "G", "F", "G"])
    expect(hits(p.outputs[0], "hat")).toHaveLength(16)
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
    // The name still gets defined, so there's one message, not one for each use.
    expect(allErrors("groove = {\n  kick: x\n}\nplay groove")).toEqual([
      "Say what groove is. Put its type in front: pattern groove = { ... }",
    ])
    expect(allErrors("fill = snare: xxxx")).toEqual([
      "Say what fill is. Put its type in front: pattern fill = snare: xxxx",
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
      /F---G--- is notes, not a pattern. Write notes riff = F---G---, or give them an instrument: pattern riff = guitar: F---G---/,
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
    expect(firstError("steps g = { kick: x }")).toMatch(
      /That's a pattern, not steps. Write pattern g = \.\.\./,
    )
    expect(firstError("chords g = 2 bars { piano: chords C }")).toMatch(
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
      /riff is notes, so it goes on an instrument's line: piano: riff/,
    )
    expect(firstError("steps pair = x-x-\nplay pair")).toMatch(
      /pair is steps, so it goes on a drum's line: hat: pair/,
    )
    expect(firstError("pattern fill = { snare: x-x- }\nplay piano: chords fill")).toMatch(
      /fill is a pattern, so it goes on a line of its own/,
    )
    expect(firstError("pattern fill = { snare: x-x- }\nplay piano: fill")).toMatch(
      /fill is a pattern, so it goes on a line of its own/,
    )
    expect(firstError("pattern fill = { snare: x-x- }\nplay hat: fill")).toMatch(
      /fill is a pattern, so it goes on a line of its own/,
    )
    expect(firstError("chords verse = Am|F\nplay hat: verse")).toMatch(
      /verse is chords, so it goes on a line like piano: chords verse, not on a drum's/,
    )
    expect(firstError("notes riff = F---\nplay hat: riff")).toMatch(
      /riff is notes, so it goes on a line like piano: riff, not on a drum's/,
    )
    expect(firstError("steps pair = x-x-\nplay piano: chords pair")).toMatch(
      /pair is steps, so it goes on a drum's line, not among chords/,
    )
    expect(firstError("steps pair = x-x-\nplay piano: pair")).toMatch(
      /pair is steps, so it goes on a drum's line, not on piano's/,
    )
    // chords in front is what makes a line a chart, whatever the chart holds
    expect(firstError("chords verse = Am F\nplay piano: verse")).toMatch(
      /verse is chords, so chords goes in front of it: piano: chords verse/,
    )
    expect(firstError("notes riff = F---\nplay piano: chords riff")).toMatch(
      /riff is notes, and the rest of this line is chords. A line plays one or the other/,
    )
    expect(firstError("chords verse = Am F\nplay piano: F--- verse")).toMatch(
      /verse is chords, and the rest of this line is notes. A line plays one or the other/,
    )
    expect(firstError("chords verse = Am F\nplay kick: 1 verse")).toMatch(
      /verse is chords, which don't go in a list of beats/,
    )
  })

  it("build on names of the same type", () => {
    expect(labels("chords aa = Am F\nchords bb = aa C G\nplay piano: chords bb")).toEqual([
      "Am",
      "F",
      "C",
      "G",
    ])
    const o = parseSource("steps pair = ^-x-\nsteps four = pair pair\nplay hat: four").outputs[0]
    expect(hits(o, "hat").map((e) => e.vel)).toEqual([1, 0.7, 1, 0.7])
    expect(notes("notes up = C-E-\nnotes line = up G-E-\nplay piano: line")).toEqual([
      "C3",
      "E3",
      "G3",
      "E3",
    ])
    expect(firstError("notes up = C-E-\nsteps pair = up x")).toMatch(
      /up is notes, so it can't go in steps/,
    )
    expect(firstError("steps pair = x-x-\nnotes line = pair G-E-")).toMatch(
      /pair is steps, so it can't go in notes/,
    )
    expect(firstError("steps pair = x-x-\nchords verse = pair Am")).toMatch(
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
    expect(firstError("play {\n  pattern fill snare: xxxx\n}")).toMatch(
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
      /Notes go on an instrument's line: guitar: F---G---/,
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
    const src = "pattern a = {\n  steps pair = x-x-\n  hat: pair\n}\nplay a\nplay hat: pair"
    expect(allErrors(src)).toEqual([
      '"pair" isn\'t defined above. Name it first: steps pair = x-x-',
    ])
  })
})

describe("nothing floats", () => {
  it("only plays what's inside a play", () => {
    const p = parseSource("kick: x-x-")
    expect(p.outputs).toEqual([])
    expect(p.errors[0].msg).toMatch(
      /An instrument's line goes inside braces: in a pattern, or play \{ kick: x-x- \}/,
    )
    expect(firstError("pattern g = { kick: x }\ng g")).toMatch(
      /Nothing plays this line. Write play g g/,
    )
  })

  it("needs something after play", () => {
    expect(firstError("play")).toMatch(/play needs something after it/)
    expect(firstError("play { }")).toMatch(/nothing in its braces/)
    expect(firstError("play {\n  tempo 90\n}")).toMatch(/Nothing to play in this play/)
  })
})

describe("numbers", () => {
  it("does real arithmetic wherever a number goes", () => {
    expect(durations("tempo 60*2\nplay kick: 1")).toEqual([2])
    expect(durations("tempo 240/4\nplay kick: 1")).toEqual([4])
    expect(durations("tempo 30+30*3\nplay kick: 1")).toEqual([2]) // the usual order of operations
    expect(parseSource("capo 1+1\nplay guitar: chords C").chords[0].capo).toBe(2)
  })

  it("explains numbers that don't work", () => {
    expect(firstError("tempo fast")).toMatch(/tempo is quarter notes per minute/)
    expect(firstError("capo 2.5")).toMatch(/capo is a fret number/)
  })
})

describe("time", () => {
  it("is two numbers: how many, over which note", () => {
    // A bar of seven eighth notes at 120 is 1.75 seconds.
    expect(durations("time 7 over 8\nplay kick: 1")).toEqual([1.75])
    expect(durations("time 14 over 16\nplay kick: 1")).toEqual([1.75])
    expect(durations("time 4 over 4\nplay kick: 1")).toEqual([2])
    expect(durations("time 3 over 4\nplay kick: 1")).toEqual([1.5])
    expect(durations("time 6 over 8\nplay kick: 1")).toEqual([1.5])
  })

  it("keeps 6 over 8 and 3 over 4 apart, though they'd divide to the same number", () => {
    const time = (src) => parseSource(src).outputs[0].blocks[0].time
    expect(time("time 6 over 8\nplay kick: 1")).toBe("6 over 8")
    expect(time("time 3 over 4\nplay kick: 1")).toBe("3 over 4")
  })

  it("takes arithmetic for either number, and remembers a sum as the grouping", () => {
    const p = parseSource("time 3+4 over 4\nplay kick: 1")
    expect(p.errors).toEqual([])
    expect(p.outputs[0].durSec).toBe(3.5)
    expect(p.outputs[0].blocks[0].time).toBe("3+4 over 4")
    expect(p.outputs[0].blocks[0].groups).toEqual([3, 4])
    expect(durations("time (3 + 4) over 2*2\nplay kick: 1")).toEqual([3.5])
  })

  it("isn't a division", () => {
    expect(firstError("time 7/8")).toMatch(
      /\/ is division, so 7\/8 is the number 0.875, not a time. Write time 7 over 8/,
    )
    expect(firstError("time (3+4)/4")).toMatch(/Write time 3\+4 over 4/)
    expect(firstError("time 0.875")).toMatch(/time is how many notes over which note/)
    expect(firstError("time 7 8")).toMatch(/time is how many notes over which note/)
  })

  it("only counts whole notes of a real note value", () => {
    expect(firstError("time 3.5 over 4")).toMatch(/first number of time is how many/)
    expect(firstError("time 7 over 3")).toMatch(/second number of time is the note being counted/)
    expect(firstError("pattern over = { kick: x }")).toMatch(/over already means something/)
  })

  it("counts a beat as a quarter note in any time", () => {
    const p = parseSource("time 7 over 8\nplay kick: 1 2& 4e")
    expect(p.errors).toEqual([])
    expect(hits(p.outputs[0], "kick").map((e) => e.secStart * 2)).toEqual([0, 1.5, 3.25])
    expect(firstError("time 7 over 8\nplay kick: 4&")).toMatch(/ends on 4e/)
  })
})

describe("play", () => {
  it("gives one output each", () => {
    const p = parseSource("play kick: x-x-\nplay snare: --x-")
    expect(p.errors).toEqual([])
    expect(p.outputs.map((o) => o.drumEvents.map((e) => e.lane))).toEqual([
      ["kick", "kick"],
      ["snare"],
    ])
  })

  it("plays everything in its braces together, so a hit can play once over a pattern", () => {
    const p = parseSource(WHAT_HAPPENS_NOW)
    expect(p.errors).toEqual([])
    expect(p.outputs).toHaveLength(1)
    const o = p.outputs[0]
    expect(o.durSec).toBe(10.5)
    expect(hits(o, "crash").map((e) => e.secStart)).toEqual([0])
    expect(hits(o, "ride.bell")).toHaveLength(28)
    expect(hits(o, "kick")).toHaveLength(24)
    expect(hits(o, "snare")).toHaveLength(12)
    expect(o.blocks.map((b) => [b.time, b.bars])).toEqual([["7 over 8", 6]])
  })

  it("takes one line or a block, and they mean the same", () => {
    const groove =
      "time 7 over 8\npattern groove = 3 bars {\n  ride.bell: x--\n  kick: x--x---\n}\n"
    const want = sound(groove + "play 6 bars groove")
    expect(sound(groove + "play { 6 bars groove }")).toBe(want)
    expect(sound(groove + "play {\n  6 bars groove\n}")).toBe(want)
    expect(sound(groove + "play 6 bars {\n  groove\n}")).toBe(want)
    expect(sound("play kick: x-x-")).toBe(sound("play {\n  kick: x-x-\n}"))
  })

  it("lasts as long as the longest thing in it", () => {
    const one = "pattern one = { piano: chords C }\n"
    expect(durations(one + play("piano: chords F|G|A", "one"))).toEqual([6])
    expect(durations(one + play("crash: 1", "one one one one"))).toEqual([8])
  })

  it("explains mistakes in play lines", () => {
    expect(firstError("play nope")).toMatch(
      /"nope" isn't defined. Name it first: pattern nope = \{ \.\.\. \}/,
    )
    expect(firstError("pattern a = { piano: chords C }\nplay nope")).toMatch(
      /"nope" isn't defined. Patterns so far: a/,
    )
    expect(firstError("pattern a = { piano: chords C }\nplay (a")).toMatch(/missing its \)/)
  })

  it("refuses an output over 10 minutes long", () => {
    const p = parseSource("tempo 20\npattern a = { piano: chords C }\nplay 64 bars a")
    expect(p.errors[0].msg).toMatch(/over 10 minutes/)
    expect(p.outputs).toEqual([])
  })
})

describe("playing in order", () => {
  const AB = "pattern a = { piano: chords C }\npattern b = { piano: chords G }\n"

  it("plays names one after another, and ( ) groups them", () => {
    expect(labels(AB + "play a b b")).toEqual(["C", "G", "G"])
    expect(labels(AB + "play 4 bars (a b)")).toEqual(["C", "G", "C", "G"])
    expect(labels(AB + "play a 2 bars b a")).toEqual(["C", "G", "G", "C"])
  })

  it("keeps * for arithmetic, since a length in front is how to repeat", () => {
    expect(firstError(AB + "play a * 2")).toMatch(
      /\* only multiplies numbers. To repeat, put a length in front: 4 bars a/,
    )
    expect(firstError(AB + "play (a b) * 2")).toMatch(/4 bars \( \.\.\. \)/)
    expect(firstError(AB + "play { piano: chords F } * 2")).toMatch(/4 bars \{ \.\.\. \}/)
    expect(labels(AB + "play 2*2 bars (a b)")).toEqual(["C", "G", "C", "G"])
  })
})

describe("patterns", () => {
  const GROOVE = "time 7 over 8\npattern groove = 3 bars {\n  ride.bell: x--\n  kick: x--x---\n}\n"

  it("can be written on one line", () => {
    const want = sound("pattern fill = {\n  snare: x-x-\n}\nplay fill")
    expect(sound("pattern fill = { snare: x-x- }\nplay fill")).toBe(want)
  })

  it("can play other patterns, alongside their own lines", () => {
    const want = sound(GROOVE + "play 6 bars {\n  crash: 1\n  groove\n}")
    // In a pattern a crash line would repeat every bar, so one crash goes in bar 1.
    expect(
      sound(GROOVE + "pattern breakdown = 6 bars {\n  bar 1 crash: 1\n  groove\n}\nplay breakdown"),
    ).toBe(want)
    expect(sound(GROOVE + "pattern twice = 6 bars groove\n" + play("crash: 1", "twice"))).toBe(want)
  })

  it("last exactly as long as what's in them, down to a beat", () => {
    const p = parseSource(
      "pattern fill = { snare: x-x- }\npattern beat = { kick: x---x---x---x--- }\nplay beat fill beat",
    )
    expect(p.errors).toEqual([])
    expect(p.outputs[0].durSec).toBe(4.5)
    expect(hits(p.outputs[0], "kick").map((e) => e.secStart)).toEqual([
      0, 0.5, 1, 1.5, 2.5, 3, 3.5, 4,
    ])
    expect(p.outputs[0].blocks[0].bars).toBe(3) // the part bar still gets a row on the grid
  })

  it("layer two lines of names, where one pattern on its own repeats to fill", () => {
    const p = parseSource("pattern a = { kick: 1 }\npattern b = { snare: 1 }\n" + play("a a", "b"))
    expect(p.outputs[0].durSec).toBe(4)
    expect(p.outputs[0].drumEvents.map((e) => [e.lane, e.secStart])).toEqual([
      ["kick", 0],
      ["snare", 0],
      ["kick", 2],
      ["snare", 2],
    ])
  })

  it("keep what's set inside braces inside", () => {
    expect(
      durations("pattern a = { piano: chords C }\n" + play("tempo 60", "a") + "\nplay a"),
    ).toEqual([4, 2])
  })

  it("use the settings in effect where they're played", () => {
    expect(durations("pattern a = { piano: chords C }\nplay a\ntempo 60\nplay a")).toEqual([2, 4])
    expect(
      durations(
        "pattern slow = {\n  tempo 60\n  piano: chords C\n}\nplay piano: chords G\nplay slow",
      ),
    ).toEqual([2, 4])
  })

  it("don't play until they're played", () => {
    const p = parseSource("pattern g = {\n  kick: x\n}")
    expect(p.errors).toEqual([])
    expect(p.outputs).toEqual([])
  })

  it("draw a new grid where the time changes", () => {
    const p = parseSource(
      "pattern a = { kick: 1 }\npattern b = {\n  time 7 over 8\n  kick: 1\n}\nplay a b",
    )
    expect(p.outputs[0].blocks.map((b) => [b.time, b.bars])).toEqual([
      ["4 over 4", 1],
      ["7 over 8", 1],
    ])
  })

  it("mark chords played again so diagrams aren't shown twice", () => {
    for (const again of ["play v v v", "play 6 bars v"]) {
      const p = parseSource("pattern v = { piano: chords Am|F }\n" + again)
      expect(p.errors).toEqual([])
      expect(p.chords.filter((e) => !e.repeat).map((e) => e.label)).toEqual(["Am", "F"])
      expect(p.chords).toHaveLength(6)
    }
  })

  it("explain their mistakes", () => {
    expect(firstError("pattern a = {\n  kick: x")).toMatch(/^a needs a } to close it/)
    expect(firstError("}")).toMatch(/doesn't close anything/)
    expect(firstError("pattern")).toMatch(
      /A pattern gets its name with =: pattern groove = \{ \.\.\. \}/,
    )
    expect(firstError("pattern a = {\n  piano: chords Am\n  piano: chords F\n}")).toMatch(
      /piano already has a line in a/,
    )
    expect(firstError("pattern a = {\n  kick: x\n  play\n}")).toMatch(/play goes at the top/)
    expect(allErrors("pattern a = {\n  pattern b = {\n    kick: x\n  }\n  snare: x\n}")).toEqual([])
    expect(firstError("pattern a = {\n  pattern b = { kick: x }\n  snare: x\n}\nplay b")).toMatch(
      /"b" isn't defined/,
    )
    expect(firstError("pattern a = {\n  kick: 1\n  a\n}")).toMatch(/a plays itself/)
    expect(firstError("pattern a = {\n  tempo 90\n}")).toMatch(/a has nothing to play/)
    expect(firstError("pattern a = { kick: 1 }\npattern b = { a nope }")).toMatch(
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

  it("hold one thing at a time", () => {
    expect(
      labels("pattern a = { piano: chords C }\npattern a = { piano: chords G }\nplay a"),
    ).toEqual(["G"])
    // Given again with another type, the name means the new thing.
    expect(labels("steps riff = x-x-\nchords riff = Am F\nplay piano: chords riff")).toEqual([
      "Am",
      "F",
    ])
  })

  it("let a pattern be named like a chord", () => {
    expect(
      labels("pattern A = { piano: chords C }\npattern B = { piano: chords G }\nplay A B A"),
    ).toEqual(["C", "G", "C"])
    expect(
      labels(
        "pattern A = { piano: chords C }\npattern form = { A A }\n" +
          play("piano: chords A", "form"),
      ),
    ).toEqual(["A", "C", "C"])
  })

  it("keep names for steps, notes and chords clear of chords, notes and steps", () => {
    expect(firstError("chords Verse = Am F")).toMatch(
      /Names for steps, notes and chords are lowercase: chords verse = Am F/,
    )
    expect(firstError("notes Riff = F---")).toMatch(
      /Names for steps, notes and chords are lowercase: notes riff = F---/,
    )
    expect(firstError("chords q = Am F")).toMatch(/at least two letters/)
    expect(firstError("chords vi = Am F")).toMatch(/vi is a chord/)
  })
})

describe("lengths", () => {
  const AB = "pattern a = { piano: chords C }\npattern b = { piano: chords G }\n"

  it("go in front of what they measure", () => {
    const want = sound("pattern g = { kick: x--- }\nplay 2 bars g")
    expect(
      hits(parseSource("pattern g = { kick: x--- }\nplay 2 bars g").outputs[0], "kick"),
    ).toHaveLength(8)
    expect(sound("pattern g = 2 bars { kick: x--- }\nplay g")).toBe(want)
    expect(sound("pattern g = 2 bars {\n  kick: x---\n}\nplay g")).toBe(want)
    expect(sound("pattern g = { kick: x--- }\nplay { 2 bars g }")).toBe(want)
    expect(sound("play 2 bars {\n  { kick: x--- }\n}")).toBe(want)
    expect(sound("play {\n  2 bars { kick: x--- }\n}")).toBe(want)
  })

  it("take any arithmetic", () => {
    expect(durations("pattern g = { kick: x--- }\nplay (1+2) bars g")).toEqual([6])
    expect(durations("pattern g = { kick: x--- }\nplay 1/2 bars g")).toEqual([1])
    expect(durations("pattern g = { kick: x--- }\nplay 1 bars g")).toEqual([2])
  })

  it("cut a play's lines that are longer, and leave room after ones that are shorter", () => {
    expect(labels("play 1 bars { piano: chords C|G }")).toEqual(["C"])
    expect(durations("play 3 bars { piano: chords C|G }")).toEqual([6])
    expect(labels("play 3 bars { piano: chords C|G }")).toEqual(["C", "G"])
  })

  it("repeat a pattern for that long", () => {
    const o = parseSource("pattern beat = { kick: x--- }\nplay 2 bars beat").outputs[0]
    expect(o.durSec).toBe(4)
    expect(hits(o, "kick")).toHaveLength(8)
    expect(labels(AB + "play 4 bars (a b)")).toEqual(["C", "G", "C", "G"])
    // what repeats is the pattern at its own length
    const g = "pattern g = 1 bars { kick: x--- }\n"
    expect(hits(parseSource(g + "play 2 bars g").outputs[0], "kick")).toHaveLength(8)
  })

  it("aren't needed: a pattern lasts until its lines line up again", () => {
    expect(durations("pattern g = { kick: x--- }\nplay g")).toEqual([0.5])
    // 4, 3 and 5 steps line up after 60
    const poly = "pattern poly = {\n  kick: x---\n  tom.floor: x--\n  snare: x----\n}\nplay poly"
    expect(durations(poly)).toEqual([7.5])
    expect(durations("play kick: x--")).toEqual([0.375])
    const odd =
      "pattern odd = {\n  kick: x------\n  snare: x--------\n  hat: x----------\n  tom.high: x------------\n}\nplay odd"
    expect(firstError(odd)).toMatch(
      /What's in odd only lines up again after more than 64 bars. Say how long it is: pattern odd = 4 bars \{/,
    )
  })

  it("go in front of what they measure, not after its braces", () => {
    expect(firstError("pattern g = {\n  kick: x\n} 3 bars")).toMatch(/pattern g = 3 bars \{/)
    expect(firstError("play {\n  kick: x\n} 2 bars")).toMatch(/play 2 bars \{ \.\.\. \}/)
  })

  it("explain lengths that don't work", () => {
    expect(firstError("bars: 3")).toMatch(/pattern groove = 3 bars \{, or play 3 bars \{ \.\.\. \}/)
    expect(firstError("play 0 bars { kick: x- }")).toMatch(/A length is a number of bars/)
    expect(firstError("play 3 bars")).toMatch(/play 3 bars of what\?/)
    expect(firstError("pattern g = { kick: x }\nplay 3 g")).toMatch(/needs bars after it/)
    expect(firstError("pattern g = { kick: x } 3 bars")).toMatch(/pattern g = 3 bars \{/)
    expect(firstError("pattern g = { kick: x } nope")).toMatch(/"nope" isn't defined/)
  })

  it("colour what follows a length as it would be coloured without one", () => {
    const marked = (src) =>
      highlightMusic(src)
        .flat()
        .filter((p) => p.c === "tk-error")
        .map((p) => p.s)
    expect(marked("play 2 bars piano: chords Am F")).toEqual([])
    expect(marked("play 2 bars kick: x---")).toEqual([])
    expect(marked("play 2 bars every 3 steps kick: x-x-")).toEqual([])
    expect(marked("pattern fill = 1 bars snare: xxxx")).toEqual([])
    expect(marked("play 2 barsx groove")).toEqual(["barsx"])
  })
})

describe("what repeats has to fit", () => {
  const GROOVE = "time 7 over 8\npattern groove = 3 bars {\n  ride.bell: x--\n  kick: x--x---\n}\n"
  const POLY = "  kick: x---\n  tom.floor: x--\n  snare: x----"

  it("a line fits its pattern a whole number of times, or it's a mistake", () => {
    expect(parseSource("pattern g = 3 bars { kick: x-- }\nplay g").errors).toEqual([])
    expect(allErrors("pattern g = 4 bars { kick: x-- }\nplay g")).toEqual([
      "The kick line is 3 steps long, which doesn't fit 4 bars a whole number of times. It lines up every 3 bars",
    ])
    expect(
      allErrors("pattern g = 2 bars {\n  piano: chords Am F|C G\n  hat: x-x-x-\n}\nplay g"),
    ).toEqual([
      "The hat line is 6 steps long, which doesn't fit 2 bars a whole number of times. The things repeating here line up every 6 bars",
    ])
    expect(allErrors("pattern hats = { hat: x--- }\n" + play("kick: x-x-x-x-x-", "hats"))).toEqual([
      "hats is 4 steps long, which doesn't fit 10 steps a whole number of times. It lines up every bar",
    ])
  })

  it("says where several things line up together", () => {
    expect(allErrors(`pattern poly = 4 bars {\n${POLY}\n}\nplay poly`)).toEqual([
      "The tom.floor line is 3 steps long, which doesn't fit 4 bars a whole number of times. The things repeating here line up every 15 bars",
      "The snare line is 5 steps long, which doesn't fit 4 bars a whole number of times. The things repeating here line up every 15 bars",
    ])
    expect(parseSource(`pattern poly = 15 bars {\n${POLY}\n}\nplay poly`).errors).toEqual([])
  })

  it("measures in the time that's set", () => {
    // 7-step and 3-step lines in bars of 14 steps meet every 3 bars
    const lines = "  kick: x--x---\n  ride.bell: x--\n"
    expect(parseSource(`time 7 over 8\npattern g = 3 bars {\n${lines}}\nplay g`).errors).toEqual([])
    expect(allErrors(`time 7 over 8\npattern g = 2 bars {\n${lines}}\nplay g`)).toEqual([
      "The ride.bell line is 3 steps long, which doesn't fit 2 bars a whole number of times. The things repeating here line up every 3 bars",
    ])
  })

  it("holds for a pattern, block or group repeated for a length", () => {
    expect(allErrors(GROOVE + "play {\n  4 bars groove\n}")).toEqual([
      "groove is 3 bars long, which doesn't fit 4 bars a whole number of times. It lines up every 3 bars",
    ])
    expect(firstError("play {\n  2 bars { kick: x-x-x- }\n}")).toMatch(
      /This pattern is 6 steps long, which doesn't fit 2 bars/,
    )
    expect(
      firstError(
        "pattern a = { piano: chords C }\npattern b = { piano: chords G }\nplay {\n  3 bars (a b)\n}",
      ),
    ).toMatch(/This group is 2 bars long, which doesn't fit 3 bars/)
    expect(
      firstError("pattern c = 6 bars {\n  kick: 1\n  piano: chords C|G|F|C|G\n}\nplay c"),
    ).toMatch(/The piano line is 5 bars long, which doesn't fit 6 bars a whole number of times/)
    expect(firstError("pattern c = 2 bars { guitar: F-- }\nplay c")).toMatch(
      /The guitar line is 3 steps long, which doesn't fit 2 bars a whole number of times/,
    )
    // A pattern at its own tempo is measured against the tempo of what it's in.
    const own = (tempo) =>
      `pattern own = {\n  tempo ${tempo}\n  kick: x---\n}\nplay {\n  1 bars own\n}`
    expect(hits(parseSource(own(240)).outputs[0], "kick")).toHaveLength(8)
    expect(firstError(own(100))).toMatch(
      /own sets its own tempo, and doesn't fit 1 bar a whole number of times/,
    )
  })

  it("doesn't hold for a play's own length, which cuts what's playing there", () => {
    const o = parseSource(GROOVE + "play 4 bars groove").outputs[0]
    expect(o.durSec).toBe(4 * 1.75)
    expect(sound(GROOVE + "play 4 bars groove")).toBe(sound(GROOVE + "play 4 bars {\n  groove\n}"))
    // Cut partway through its second time: nothing starts after the end
    expect(
      hits(o, "kick")
        .map((e) => e.secStart)
        .at(-1),
    ).toBeLessThan(o.durSec)
    expect(hits(o, "kick")).toHaveLength(16)
    // A note still sounding at the end stops there
    const riff = parseSource(`pattern r = { guitar: C${"-".repeat(31)} }\nplay 1 bars r`).outputs[0]
    expect(riff.notes.map((e) => e.secDur)).toEqual([2])
    // Bars it names still have to be there
    expect(firstError("play 2 bars {\n  bar 3 crash: 1\n}")).toMatch(
      /This play is 2 bars long, so it has no bar 3/,
    )
  })
})

describe("blocks without a name", () => {
  const BODY = "  kick: x---\n  tom.floor: x--\n  snare: x----"
  const SIZED = `pattern beat = 15 bars {\n${BODY}\n}\nplay beat`

  it("play inside another block, with a length in front", () => {
    expect(sound(`play {\n15 bars {\n${BODY}\n}\n}`)).toEqual(sound(SIZED))
    expect(sound(`play  {\n  15 bars {\n${BODY}\n  }\n}`)).toEqual(sound(SIZED))
  })

  it("repeat to fill what they're in, like a pattern with a name", () => {
    expect(sound(`play 15 bars {\n  {\n${BODY}\n  }\n}`)).toEqual(sound(SIZED))
  })

  it("play in a row with names", () => {
    const named = "pattern a = { kick: x--- }\npattern b = { snare: x--- }"
    expect(sound(`${named}\nplay a { snare: x--- } a`)).toEqual(sound(`${named}\nplay a b a`))
    expect(sound(`${named}\nplay { 1 bars { snare: x--- } }`)).toEqual(
      sound(`${named}\nplay 1 bars b`),
    )
    expect(sound(`${named}\nplay {\n  snare: x---\n} a`)).toEqual(sound(`${named}\nplay b a`))
    expect(sound(`${named}\nplay 2 bars { kick: x- } a`)).toEqual(
      sound(`${named}\npattern c = 2 bars { kick: x- }\nplay c a`),
    )
  })

  it("play together with the other lines in their braces", () => {
    expect(sound("play {\n  { kick: x--- }\n  snare: --x-\n}")).toEqual(
      sound("play {\n  kick: x---\n  snare: --x-\n}"),
    )
  })

  it("go inside patterns and nest", () => {
    expect(
      sound("pattern g = {\n  2 bars {\n    { kick: x- }\n    snare: ----x---\n  }\n}\nplay g"),
    ).toEqual(sound("pattern h = 2 bars {\n  kick: x-\n  snare: ----x---\n}\nplay h"))
  })

  it("keep what's set inside them to themselves", () => {
    const p = parseSource("play {\n  {\n    tempo 60\n    kick: x\n  }\n}\nplay kick: x")
    expect(p.errors).toEqual([])
    expect(p.outputs.map((o) => o.durSec)).toEqual([0.25, 0.125])
  })

  it("explain their mistakes", () => {
    expect(firstError(`{\n${BODY}\n}`)).toMatch(
      /Nothing plays this pattern. Put play in front: play \{/,
    )
    expect(firstError(`15 bars {\n${BODY}\n}`)).toMatch(/play 15 bars \{ \.\.\. \}/)
    expect(firstError("play {\n  {\n  }\n  kick: x\n}")).toMatch(
      /These braces have nothing in them/,
    )
    expect(firstError("play {\n  { tempo 90 }\n}")).toMatch(/Nothing to play in this pattern/)
    expect(anyError("play {\n  piano: chords { Am }\n}")).toMatch(
      /Chords play one at a time, so they can't be layered in a block/,
    )
    expect(firstError("play {\n  groove {\n    kick: x\n  }\n}")).toMatch(/"groove" isn't defined/)
    expect(anyError("play {\n  pattern b = {\n    kick: x\n  }\n}")).toMatch(
      /Nothing to play in this play/,
    )
    expect(anyError("play {\n  pattern b {\n    kick: x\n  }\n}")).toMatch(
      /pattern b = \{ \.\.\. \}/,
    )
    expect(firstError("pattern a = {\n  { a }\n}")).toMatch(/a plays itself/)
    expect(firstError("play {\n  { kick: x\n}")).toMatch(/needs a \} to close it/)
    expect(firstError("play groove { kick: x } }")).toMatch(/doesn't close anything/)
  })
})

describe("patterns repeat, and a play's own lines play once", () => {
  const AB = "pattern a = { piano: chords C }\npattern b = { piano: chords G }\n"

  it("repeats every line in a pattern until it ends", () => {
    const o = parseSource(
      "pattern beat = 2 bars {\n  kick: x---\n  snare: 2 4\n  piano: chords C\n}\nplay beat",
    ).outputs[0]
    expect(hits(o, "kick")).toHaveLength(8)
    expect(hits(o, "snare")).toHaveLength(4)
    expect(o.chords.map((e) => e.label)).toEqual(["C", "C"])
  })

  it("plays a play's own lines once", () => {
    const o = parseSource("play 2 bars kick: x---").outputs[0]
    expect(o.durSec).toBe(4)
    expect(hits(o, "kick")).toHaveLength(1)
    expect(
      hits(parseSource(play("piano: chords C|G|F|C", "snare: 2 4")).outputs[0], "snare"),
    ).toHaveLength(2)
  })

  it("repeats a pattern on a line of its own until the play ends", () => {
    const o = parseSource("pattern beat = { kick: x--- }\n" + play("piano: chords C|G", "beat"))
      .outputs[0]
    expect(o.durSec).toBe(4)
    expect(hits(o, "kick")).toHaveLength(8)
    expect(labels(AB + play("bar 4 kick: 1", "(a b)"))).toEqual(["C", "G", "C", "G"])
  })

  it("plays names in a row once each", () => {
    expect(labels(AB + play("bar 4 kick: 1", "a b"))).toEqual(["C", "G"])
  })

  it("lets a crash play once over a pattern that repeats", () => {
    const o = parseSource("pattern beat = { kick: x--- }\n" + play("crash: 1", "4 bars beat"))
      .outputs[0]
    expect(hits(o, "crash")).toHaveLength(1)
    expect(hits(o, "kick")).toHaveLength(16)
  })
})

describe("settings", () => {
  it("apply from where they're written", () => {
    expect(durations("play piano: chords C\ntempo 60\nplay piano: chords C")).toEqual([2, 4])
  })

  it("carry on into the cells below, and say so", () => {
    const above = parseSource("tempo 90\nkey Am").state
    const p = parseSource("play piano: chords i V", above)
    expect(p.chords.map((e) => e.label)).toEqual(["Am", "E"])
    expect(p.fromAbove).toEqual(["tempo 90", "key Am"])
  })
})

describe("every", () => {
  it("says how long a step lasts, in front of what plays at that pace", () => {
    expect(durations("play every 2 steps hat: xxxxxxxx")).toEqual([2])
    expect(durations("play every 1/3 beats hat: xxx")).toEqual([0.5])
    expect(durations("play every 3 steps hat: xx")).toEqual([0.75])
    expect(durations("play every 1 bars kick: xx")).toEqual([4])
  })

  it("takes braces, one line or a name, and leaves what's around it alone", () => {
    const want = sound("play {\n  hat: xxxx\n  kick: x---\n}")
    expect(sound("play {\n  hat: xxxx\n  every 2 steps { kick: x- }\n}")).toBe(want)
    expect(sound("play {\n  hat: xxxx\n  every 2 steps kick: x-\n}")).toBe(want)
    expect(sound("pattern beat = { kick: x- }\nplay {\n  hat: xxxx\n  every 2 steps beat\n}")).toBe(
      want,
    )
  })

  it("goes after a pattern's =, so the pattern is written at that pace", () => {
    const feet = "pattern feet = every 3 steps {\n  kick: ^-^^-^--\n  hat.pedal: -x--x-xx\n}\n"
    expect(played(feet + "play feet")).toEqual(
      played(
        "play {\n  kick: ^-- --- ^-- ^-- --- ^-- --- ---\n  hat.pedal: --- x-- --- --- x-- --- x-- x--\n}",
      ),
    )
  })

  it("counts steps as the steps of what it's in", () => {
    // every 2 steps inside every 2 steps is every 4
    expect(durations("play every 2 steps {\n  every 2 steps hat: xx\n}")).toEqual([1])
    // a rest of 2 steps inside is 2 of its own steps
    const o = parseSource("play every 3 steps {\n  kick: 2 steps rest, x\n}").outputs[0]
    expect(o.durSec).toBe(1.125)
    expect(hits(o, "kick").map((e) => e.secStart)).toEqual([0.75])
    expect(durations("play every 2 steps {\n  bar 2 kick: 1\n}")).toEqual([4])
  })

  it("explains its mistakes", () => {
    expect(firstError("every 3 steps { kick: x }")).toMatch(
      /Nothing plays this. Put play in front, or give it a name: pattern slow = every 3 steps \{ \.\.\. \}/,
    )
    expect(firstError("play every { kick: x }")).toMatch(
      /every takes a length, then what plays at that pace: every 3 steps \{ \.\.\. \}/,
    )
    expect(firstError("play every 3 steps")).toMatch(/every 3 steps needs what plays at that pace/)
    expect(firstError("play every 3 step kick: x")).toMatch(/Lengths are always plural.*3 steps/)
    expect(firstError("play every 0.1 steps kick: x")).toMatch(
      /A step can't last 0.1 steps. Try every 3 steps, or every 1\/3 beats/,
    )
    expect(firstError("play kick: every 3 steps x-xx")).toMatch(
      /every goes in front of the line, not inside it: every 3 steps kick: x-xx/,
    )
    expect(firstError("pattern every = { kick: x }")).toMatch(/every already means something/)
  })
})

describe("lengths on a drum's line", () => {
  it("measure rest, in steps, beats or bars", () => {
    expect(sound("play snare: 8 steps rest, dd, 6 steps rest")).toBe(
      sound("play snare: --------dd------"),
    )
    expect(sound("play snare: 2 beats rest, dd, 1.5 beats rest")).toBe(
      sound("play snare: --------dd------"),
    )
    expect(sound("play snare: 1 bars rest, x---")).toBe(sound("play snare: ---------------- x---"))
    expect(sound("play snare: (1+1) beats rest, x---")).toBe(sound("play snare: -------- x---"))
  })

  it("repeat steps for that long, up to the next comma", () => {
    expect(sound("play hat: 2 beats x-, dd--")).toBe(sound("play hat: x-x-x-x- dd--"))
    expect(sound("play hat: 1 beats x- x-, dd--")).toBe(sound("play hat: x-x- dd--"))
    expect(sound("steps pair = x-\nplay hat: 1 bars pair")).toBe(
      sound("play hat: x-x-x-x-x-x-x-x-"),
    )
    expect(firstError("play hat: 1 beats x--, dd")).toMatch(
      /x-- is 3 steps long, which doesn't fit 1 beats a whole number of times/,
    )
  })

  it("work in a block of layers and in named steps", () => {
    expect(sound("play snare: {\n  x---\n  2 beats rest, ^---, 1 beats rest\n}")).toBe(
      sound("play snare: x---x---^---x---"),
    )
    expect(sound("steps lift = 2 beats rest, dd, 1.5 beats rest\nplay snare: lift")).toBe(
      sound("play snare: --------dd------"),
    )
    expect(firstError("lift = 2 beats rest, dd")).toMatch(
      /Put its type in front: steps lift = 2 beats rest, dd/,
    )
  })

  it("need commas between the parts of a line, and nowhere else", () => {
    expect(firstError("play snare: 2 beats rest dd")).toMatch(
      /A comma ends a length, so put one here: 2 beats rest, dd/,
    )
    expect(firstError("play snare: 2 beats x- 1 beats rest")).toMatch(
      /A comma ends a length, so put one here: 2 beats x-, 1 beats rest/,
    )
    expect(firstError("play snare: dd 1 beats rest")).toMatch(
      /A length starts its own part, so put a comma before it: dd, 1 beats rest/,
    )
    expect(firstError("play snare: dd, xx")).toMatch(
      /A comma ends a length. Between steps a space is enough: dd xx/,
    )
    expect(firstError("play snare: 2, 4")).toMatch(/A list of beats takes spaces, not commas: 2 4/)
    expect(firstError("play snare: 2 beats rest,")).toMatch(/something goes on each side/)
  })

  it("explain what doesn't work", () => {
    expect(firstError("play snare: 2 beats -, dd")).toMatch(
      /Silence for a length is rest: 2 beats rest/,
    )
    expect(firstError("play snare: rest, dd")).toMatch(
      /rest takes a length in front: 2 beats rest. One step of rest is -/,
    )
    expect(firstError("play snare: 2 beats, dd")).toMatch(
      /2 beats of what\? Write 2 beats rest, or the steps to repeat: 2 beats x-/,
    )
    expect(firstError("play snare: 0.3 beats rest, x")).toMatch(
      /0.3 beats isn't a whole number of steps/,
    )
    expect(firstError("play snare: 2 4, 2 beats rest")).toMatch(
      /Beats don't go on a line with lengths or commas/,
    )
    expect(firstError("pattern rest = { kick: x }")).toMatch(/rest already means something/)
  })
})

describe("lengths are always plural", () => {
  it("so bars says how long, and bar says which", () => {
    expect(durations("pattern g = { kick: x--- }\nplay 1 bars g")).toEqual([2])
    expect(firstError("pattern g = { kick: x--- }\nplay 1 bar g")).toMatch(
      /Lengths are always plural, whatever the number: 1 bars/,
    )
    expect(firstError("pattern g = 3 bar { kick: x--- }")).toMatch(/3 bars/)
    expect(firstError("play {\n  2 bar { kick: x- }\n}")).toMatch(/2 bars/)
    expect(firstError("play snare: 1 beat rest, x---")).toMatch(/1 beats/)
    expect(firstError("play snare: {\n  1 step rest, x\n}")).toMatch(/1 steps/)
    expect(firstError("play (1+1) bar { kick: x- }")).toMatch(/\(1\+1\) bars/)
  })
})

describe("what plays in a bar", () => {
  const TWO = "kick: x---x---x---x--- | x---x---x---x---"

  it("plays in that bar of what it's in, and nowhere else", () => {
    const o = parseSource(
      "pattern g = 2 bars {\n  kick: x---\n  bar 2 { snare: 2 4 }\n}\nplay 4 bars g",
    ).outputs[0]
    expect(hits(o, "kick")).toHaveLength(16)
    expect(hits(o, "snare").map((e) => e.secStart)).toEqual([2.5, 3.5, 6.5, 7.5])
  })

  it("takes braces, one line, a name, or a run of bars: bar 2 to 3", () => {
    const want = played(play(TWO, "bar 2 { snare: xx }"))
    expect(want[0][1].filter((e) => e.startsWith("snare"))).toHaveLength(16)
    expect(played(play(TWO, "bar 2 snare: xx"))).toEqual(want)
    expect(played("pattern fill = { snare: xx }\n" + play(TWO, "bar 2 fill"))).toEqual(want)
    expect(played(play(TWO, "bar 1+1 snare: xx"))).toEqual(want)
    const o = parseSource(play("kick: 1", "bar 2 to 3 { snare: 2 4 }")).outputs[0]
    expect(o.durSec).toBe(6)
    expect(hits(o, "snare").map((e) => e.secStart)).toEqual([2.5, 3.5, 4.5, 5.5])
  })

  it("makes a pattern long enough to have the bars it names", () => {
    expect(durations("pattern g = {\n  kick: x---\n  bar 3 crash: 1\n}\nplay g")).toEqual([6])
    expect(
      durations(
        "time 7 over 8\npattern g = {\n  kick: x--x---\n  hat: ^-x-\n  bar 2 hat.pedal: 4\n}\nplay g",
      ),
    ).toEqual([3.5])
    expect(firstError("pattern g = 2 bars {\n  kick: x---\n  bar 3 crash: 1\n}\nplay g")).toMatch(
      /g is 2 bars long, so it has no bar 3/,
    )
    expect(firstError("play 1 bars {\n  bar 2 crash: 1\n}")).toMatch(
      /This play is 1 bar long, so it has no bar 2/,
    )
  })

  it("wins over the lines above it, where both hit the same drum at once", () => {
    const o = parseSource("pattern g = {\n  snare: x---\n  bar 2 snare: ^---\n}\nplay g").outputs[0]
    expect(hits(o, "snare").map((e) => e.accent)).toEqual([
      ...Array(4).fill(false),
      ...Array(4).fill(true),
    ])
  })

  it("writes a groove with a lift in its second bar, the same as all its steps", () => {
    const groove = (lines) =>
      `time 7 over 8\ntempo 90\npattern groove = {\n${lines}\n}\nplay 6 bars {\n  crash: 1\n  groove\n}`
    const long = groove(`  kick: x--x---
  snare: -----x------x------x------x-
  snare.ghost: {
    --x----
    ----------------------dd----
  }
  hat: ^-x-
  hat.open: ------------------------^---
  hat.pedal: --------------------------x-`)
    const short = groove(`  kick: x--x---
  snare: 2e 4
  snare.ghost: --x----
  hat: ^-x-
  bar 2 {
    snare.ghost: ---- ---- dd-- --
    hat.open:    ---- ---- --^- --
    hat.pedal:   4
  }`)
    expect(played(short)).toEqual(played(long))
    const sugar = groove(`  kick: x--x---
  snare: 2e 4
  snare.ghost: --x----
  hat: ^-x-
  bar 2 {
    snare.ghost: 2 beats rest, dd, 1 beats rest
    hat.open:    2 beats rest, --^-, 2 steps rest
    hat.pedal:   4
  }`)
    expect(played(sugar)).toEqual(played(long))
  })

  it("explains its mistakes", () => {
    expect(firstError("bar 2 { kick: x }")).toMatch(
      /bar 2 \{ \.\.\. \} goes inside a pattern or a play, to say where in it/,
    )
    expect(firstError(play("kick: x", "bar 2"))).toMatch(
      /bar 2 needs what plays there: bar 2 \{ \.\.\. \}/,
    )
    expect(firstError(play("kick: x", "bar two kick: x"))).toMatch(
      /bar takes the number of a bar, then what plays there: bar 2 \{ \.\.\. \}, or bar 3 to 4 \{ \.\.\. \}/,
    )
    expect(firstError(play("kick: x", "bar 0 kick: x"))).toMatch(/Bars are counted from 1/)
    expect(firstError(play("kick: x", "bar 3 to 2 kick: x"))).toMatch(/bar 3 to 2 runs backwards/)
    expect(firstError(play("kick: x", "bars 2 to 3 kick: x"))).toMatch(
      /bars is a length, and goes after a number: 6 bars groove. To say which bars, write bar: bar 3 to 4 \{ \.\.\. \}/,
    )
    expect(firstError(play("kick: x", "bar 2 hat.open: ---- ---- --^-"))).toMatch(
      /The hat.open line is 12 steps long, which doesn't fit 1 bar/,
    )
    expect(firstError("pattern g = {\n  bar 2 nope\n}")).toMatch(/"nope" isn't defined/)
    expect(firstError("pattern bar = { kick: x }")).toMatch(/bar already means something/)
  })
})

describe("drums", () => {
  it("read steps: x hit, ^ accent, ~ ghost, d double, - nothing", () => {
    const o = parseSource("play tom.high: ^x~d-").outputs[0]
    expect(o.drumEvents.filter((e) => !e.hidden).map((e) => e.vel)).toEqual([1, 0.7, 0.3, 0.7])
    expect(o.drumEvents.filter((e) => e.hidden)).toHaveLength(1)
  })

  it("read beats: plain hits on those beats of every bar", () => {
    const o = parseSource(play("crash: 1", "tom.high: 2 4a")).outputs[0]
    expect(hits(o, "crash").map((e) => e.secStart)).toEqual([0])
    expect(hits(o, "tom.high").map((e) => [e.secStart, e.vel])).toEqual([
      [0.5, 0.7],
      [1.875, 0.7],
    ])
    const seven = "time 7 over 8\n"
    expect(sound(seven + "pattern g = { snare: 2e 4 }\nplay 2 bars g")).toBe(
      sound(seven + "play snare: -----x------x------x------x-"),
    )
  })

  it("read a step in front of a beat as how that beat is hit", () => {
    const o = parseSource("play tom.high: 1 ^2 ~3 d4").outputs[0]
    expect(o.drumEvents.filter((e) => !e.hidden).map((e) => e.vel)).toEqual([0.7, 1, 0.3, 0.7])
    expect(sound("play tom.high: 1 ^2 ~3 d4")).toBe(sound("play tom.high: x---^---~---d---"))
    expect(sound("steps backbeat = 2 ^4\nplay snare: backbeat")).toBe(
      sound("play snare: ----x-------^---"),
    )
    const seven = "time 7 over 8\n"
    expect(sound(seven + play("snare.ghost: d3 d3e", "hat.open: ^3&"))).toBe(
      sound(
        seven +
          play(
            "snare.ghost: 2 beats rest, dd, 1 beats rest",
            "hat.open: 2 beats rest, --^-, 2 steps rest",
          ),
      ),
    )
    // A beat on its own is the one way to write a plain hit.
    expect(firstError("play tom.high: x4")).toMatch(
      /x4: a beat on its own is already a plain hit, so write 4/,
    )
    expect(firstError("play tom.high: ^2 2")).toMatch(/2 is on this line twice/)
    expect(firstError("steps d3 = x-")).toMatch(/d3 is a double on a beat, so pick another name/)
  })

  it("keep a list of beats to one bar's hits", () => {
    const only = /Beats are one bar's hits, with nothing else on the line/
    expect(firstError("time 7 over 8\nplay hat.open: -|3& x")).toMatch(only)
    expect(firstError("play crash: 1|-|-")).toMatch(only)
    expect(firstError("play kick: 1 3|1 2& 3")).toMatch(only)
    expect(firstError("play tom.high: 2 accent")).toMatch(/"accent" isn't a beat/)
  })

  it("are steps too, so they can be a layer or a name", () => {
    expect(sound("play snare: {\n  2 4\n  ------x-\n}")).toBe(sound("play snare: ----x-x-----x-x-"))
    expect(sound("steps backbeat = 2 4\nplay snare: backbeat")).toBe(
      sound("play snare: ----x-------x---"),
    )
    expect(firstError("backbeat = 2 4")).toMatch(/Put its type in front: steps backbeat = 2 4/)
    expect(firstError("play every 2 steps {\n  steps odd = 2e\n  snare: odd\n}")).toMatch(
      /2e isn't on a step, so these beats can't be steps/,
    )
  })

  it("take | in steps where a bar ends, for the eye", () => {
    expect(sound("play kick: x---x---x---x--- | x---x---x-x-----")).toBe(
      sound("play kick: x---x---x---x---x---x---x-x-----"),
    )
    expect(sound("steps two = x--- ---- ---- ---- | x--- ---- x--- ----\nplay kick: two")).toBe(
      sound("play kick: x---------------x-------x-------"),
    )
    expect(firstError("play kick: x---x---x---|x---")).toMatch(
      /This \| isn't at the end of a bar: it's after 12 steps, and a 4 over 4 bar is 16 steps/,
    )
    expect(firstError("play kick: {\n  x---|x---\n}")).toMatch(/This \| isn't at the end of a bar/)
  })

  it("play a variation on its own lane, with the drum's sound", () => {
    const o = parseSource(play("hat: x-x-x-x-", "hat.open: 4&", "ride.bell: x")).outputs[0]
    expect(hits(o, "hat.open").map((e) => [e.inst, e.art])).toEqual([["hat", "open"]])
    expect(hits(o, "ride.bell").map((e) => [e.inst, e.art])).toEqual([["ride", "bell"]])
  })

  it("let an open hi-hat replace a closed hit at the same moment, until the next hit", () => {
    const o = parseSource(play("hat: ^-x-^-x-", "hat.open: ----^---")).outputs[0]
    expect(hits(o, "hat").map((e) => e.secStart / 0.125)).toEqual([0, 2, 6])
    expect(hits(o, "hat.open").map((e) => e.secStart / 0.125)).toEqual([4])
    // the same when the open hit comes from another pattern played alongside
    const two = "pattern hats = { hat: ^-x- }\npattern lift = { hat.open: ----^--- }\n"
    const p = parseSource(two + play("hats", "lift")).outputs[0]
    expect(hits(p, "hat").map((e) => e.secStart / 0.125)).toEqual([0, 2, 6])
  })

  it("play the snare's ghost notes and rimshots on lines of their own", () => {
    const o = parseSource(play("snare: ----x---", "snare.ghost: --x---dd", "snare.rim: x-------"))
      .outputs[0]
    expect(hits(o, "snare").map((e) => [e.inst, e.art, e.vel])).toEqual([["snare", "hit", 0.7]])
    expect(hits(o, "snare.rim").map((e) => [e.inst, e.art, e.vel])).toEqual([["snare", "rim", 0.7]])
    // Every hit on snare.ghost is a ghost note: dd is four of them, a 32nd apart.
    const ghosts = o.drumEvents.filter((e) => e.lane === "snare.ghost")
    expect(ghosts.map((e) => [e.art, e.vel, e.ghost])).toEqual(Array(5).fill(["ghost", 0.3, true]))
    expect(ghosts.map((e) => e.secStart / 0.125)).toEqual([2, 6, 6.5, 7, 7.5])
    expect(hits(parseSource("play snare.rim: ^").outputs[0], "snare.rim")[0].vel).toBe(1)
  })

  it("keep the snare's ghost notes on snare.ghost", () => {
    expect(firstError("play snare: --~-")).toMatch(
      /the snare's ghost notes go on a line of their own: snare\.ghost: --x-/,
    )
    expect(firstError("play snare: ~2 4")).toMatch(/snare\.ghost: --x-/)
    expect(firstError("play snare.ghost: ^-")).toMatch(
      /snare\.ghost hits are ghost notes, so they can't be accented/,
    )
    expect(firstError("play snare.ghost: ^2")).toMatch(/can't be accented/)
    expect(firstError("play snare.ghost: ~-")).toMatch(
      /every hit on snare\.ghost is a ghost note already, so write x/,
    )
  })

  it("play three toms, each a line of its own", () => {
    const o = parseSource(play("tom.high: 1", "tom.low: 2", "tom.floor: 3")).outputs[0]
    expect(o.drumEvents.map((e) => [e.lane, e.inst, e.art, e.secStart])).toEqual([
      ["tom.high", "tom", "high", 0],
      ["tom.low", "tom", "low", 0.5],
      ["tom.floor", "tom", "floor", 1],
    ])
    // Hit together, all three sound: none of them takes another's place
    const fill = parseSource(play("tom.high: 1", "tom.low: 1", "tom.floor: 1")).outputs[0]
    expect(fill.drumEvents.map((e) => e.lane).sort()).toEqual(["tom.floor", "tom.high", "tom.low"])
    expect(firstError(play("tom.high: 1", "tom.high: 3"))).toMatch(/tom.high already has a line/)
  })

  it("play each tom from its own sample", async () => {
    // With nothing fetched, every sample the hits need comes back as missing, by name.
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 404 }))
    const o = parseSource(play("tom.high: 1", "tom.low: 2", "tom.floor: 3")).outputs[0]
    expect((await prepareKit(o.drumEvents)).missing).toEqual([
      "Tom1-Med",
      "Tom2-Med",
      "TomFloor-Med",
    ])
    vi.unstubAllGlobals()
  })

  it("colour each tom's name as an instrument, and plain tom as a mistake", () => {
    const name = (line) => highlightMusic(`play {\n  ${line}\n}`)[1].find((p) => p.s.trim())
    expect(name("tom.high: x--")).toEqual({ c: "tk-inst", s: "tom.high" })
    expect(name("tom.low: x--")).toEqual({ c: "tk-inst", s: "tom.low" })
    expect(name("tom.floor: x--")).toEqual({ c: "tk-inst", s: "tom.floor" })
    expect(name("tom: x--")).toEqual({ c: "tk-error", s: "tom" })
    expect(name("floor: x--")).toEqual({ c: "tk-error", s: "floor" })
  })

  it("draw the toms high to low, between the hi-hat and the snare", () => {
    const lanes = LANES.filter((l) => l.startsWith("tom") || l === "hat.pedal" || l === "snare")
    expect(lanes).toEqual(["hat.pedal", "tom.high", "tom.low", "tom.floor", "snare"])
  })

  it("say which toms there are", () => {
    expect(firstError("play tom: x--")).toBe(
      '"tom" isn\'t a drum. The toms are tom.high, tom.low and tom.floor',
    )
    expect(firstError("play snare.flam: 1")).toBe(
      '"snare.flam" isn\'t a drum. Drums with a second sound: ride.bell, hat.open, hat.pedal, snare.ghost, snare.rim, snare.cross',
    )
    expect(firstError("play tom.mid: x--")).toMatch(
      /"tom.mid" isn't a drum. The toms are tom.high, tom.low and tom.floor/,
    )
    expect(firstError("play tom.hi: x--")).toMatch(/Did you mean tom.high\?/)
    expect(firstError("pattern tom = { kick: x }")).toMatch(/tom already means something/)
  })
})

describe("one instrument per line", () => {
  it("puts two drums on one step with two lines", () => {
    const o = parseSource("time 7 over 8\n" + play("kick: x--x---", "snare: ---xx--")).outputs[0]
    expect(o.drumEvents.map((e) => [e.lane, e.secStart * 8])).toEqual([
      ["kick", 0],
      ["kick", 3],
      ["snare", 3],
      ["snare", 4],
    ])
  })

  it("repeats lines of different lengths against each other in a pattern", () => {
    const o = parseSource(
      "time 7 over 8\npattern g = 3 bars {\n  kick: x--x---\n  ride.bell: x--\n}\nplay g",
    ).outputs[0]
    expect(hits(o, "kick")).toHaveLength(12)
    expect(hits(o, "ride.bell")).toHaveLength(14)
  })

  it("layers a drum in a block of steps, each layer repeating until they line up", () => {
    const o = parseSource(
      "pattern g = {\n  snare.ghost: {\n    --x-\n    ------------dd--\n  }\n}\nplay g",
    ).outputs[0]
    expect(o.durSec).toBe(2)
    expect(hits(o, "snare.ghost").map((e) => e.secStart / 0.125)).toEqual([2, 6, 10, 12, 13, 14])
  })

  it("lets a lower layer win where two hit the same step, and never a rest", () => {
    expect(sound("play snare: {\n  x-x-\n  --^-\n}")).toBe(sound("play snare: x-^-"))
    expect(sound("play snare: {\n  ^-x-\n  x---\n}")).toBe(sound("play snare: x-x-"))
    // A double's second stroke goes with its first.
    expect(sound("play snare: {\n  d---\n  x---\n}")).toBe(sound("play snare: x---"))
    expect(sound("play snare: {\n  x---\n  d---\n}")).toBe(sound("play snare: d---"))
  })

  it("makes a block of steps steps, to name, put in a row or nest", () => {
    const want = sound("play snare.ghost: --x---x---x-ddx-")
    expect(sound("play snare.ghost: {\n  --x-\n  ------------dd--\n}")).toBe(want)
    expect(sound("steps ghosts = {\n  --x-\n  ------------dd--\n}\nplay snare.ghost: ghosts")).toBe(
      want,
    )
    expect(sound("play hat: x--- {\n  x-\n  -x\n}")).toBe(sound("play hat: x---xx"))
    expect(sound("steps pair = x-\nplay hat: {\n  {\n    pair\n    -x\n  }\n  ----\n}")).toBe(
      sound("play hat: xxxx"),
    )
  })

  it("lets a lower line win where two lines hit the same drum at once", () => {
    const below = parseSource(play("{ snare: ^--- }", "snare: x-x-")).outputs[0]
    expect(hits(below, "snare").map((e) => [e.secStart / 0.125, e.accent])).toEqual([
      [0, false],
      [2, false],
    ])
    const above = parseSource(play("snare: x-x-", "{ snare: ^--- }")).outputs[0]
    expect(hits(above, "snare").map((e) => [e.secStart / 0.125, e.accent])).toEqual([
      [0, true],
      [2, false],
    ])
  })

  it("explains what a block of steps can't hold", () => {
    expect(firstError("play snare: {\n  kick: x---\n}")).toMatch(
      /A block of steps holds steps, one layer a line, like --x-. kick: x--- is an instrument's line/,
    )
    // said on the layer's own line
    expect(parseSource("play snare.ghost: {\n  --x-\n  --~-\n}").errors).toEqual([
      { line: 3, msg: '"~": every hit on snare.ghost is a ghost note already, so write x' },
    ])
    expect(firstError("play piano: chords {\n  Am F\n}")).toMatch(
      /Chords play one at a time, so they can't be layered in a block/,
    )
    expect(firstError("chords verse = {\n  Am F\n}")).toMatch(/Chords play one at a time/)
    expect(firstError("ghosts = {\n  --x-\n}")).toMatch(
      /Put its type in front: steps ghosts = \{ \.\.\. \}/,
    )
    expect(firstError("pattern g = {\n  --x-\n}")).toMatch(/\{ \.\.\. \} is steps, not a pattern/)
    expect(
      firstError("play kick: {\n  x------\n  x--------\n  x----------\n  x------------\n}"),
    ).toMatch(/This block's layers only line up again after more than 64 bars/)
  })
})

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
    expect(labels("key C\nplay piano: chords I vi|IV V7|bVII IV|ii7 vii°")).toEqual([
      "C",
      "Am",
      "F",
      "G7",
      "Bb",
      "F",
      "Dm7",
      "Bdim",
    ])
    expect(labels("key Am\nplay piano: chords V v")).toEqual(["E", "Em"])
  })

  it("keep / in a chord's name, since its two sides aren't numbers", () => {
    expect(labels("play piano: chords C/E F")).toEqual(["C/E", "F"])
  })

  it("take chords by name", () => {
    expect(labels("chords verse = Am E7|G D\nplay piano: chords verse verse")).toEqual([
      "Am",
      "E7",
      "G",
      "D",
      "Am",
      "E7",
      "G",
      "D",
    ])
    expect(labels("chords intro = Bb F\nplay piano: chords intro")).toEqual(["Bb", "F"])
  })

  it("give steps by name to drums", () => {
    const o = parseSource("steps pair = ^-x-\nplay hat: pair pair").outputs[0]
    expect(hits(o, "hat").map((e) => e.vel)).toEqual([1, 0.7, 1, 0.7])
  })
})

describe("notes", () => {
  // Each note that plays: its name, the step it starts on and how many steps it lasts. A
  // step is a 16th note, 0.125 seconds at 120.
  const heard = (src) => {
    const p = parseSource(src)
    expect(p.errors).toEqual([])
    return p.notes.map((e) => [e.note.name, e.secStart / 0.125, e.secDur / 0.125])
  }

  it("are drawn on the steps, a note where a drum has its x", () => {
    expect(heard("play guitar: F---G F-F--")).toEqual([
      ["F3", 0, 4],
      ["G3", 4, 1],
      ["F3", 5, 2],
      ["F3", 7, 3],
    ])
    expect(durations("play guitar: F---G F-F--")).toEqual([1.25])
  })

  it("take one step each, however many characters a note is", () => {
    expect(heard("play bass: E1-F#1 Bb1-")).toEqual([
      ["E1", 0, 2],
      ["F#1", 2, 1],
      ["A#1", 3, 2],
    ])
  })

  it("use the octave setting when a note has no number", () => {
    expect(notes("play piano: C E4 G")).toEqual(["C3", "E4", "G3"])
    expect(notes("octave 2\nplay bass: E-G-")).toEqual(["E2", "G2"])
  })

  it("ring until the next note, and _ stops one", () => {
    expect(heard("play piano: C---__E-")).toEqual([
      ["C3", 0, 4],
      ["E3", 6, 2],
    ])
    // Before the first note, - is silence: nothing is ringing yet.
    expect(heard("play piano: --C-")).toEqual([["C3", 2, 2]])
  })

  it("don't touch: a space goes between two notes, and takes no step", () => {
    expect(firstError("play guitar: E---F#E-E--")).toBe(
      '"E---F#E-E--": notes don\'t touch, so put a space between them: E---F# E-E--',
    )
    expect(firstError("play piano: CEG")).toMatch(/put a space between them: C E G$/)
    expect(firstError("play piano: ^F^G")).toMatch(/put a space between them: \^F \^G$/)
    expect(firstError("notes riff = E2G2")).toMatch(/put a space between them: E2 G2$/)
    expect(sound("play guitar: E---F# E-E--")).toBe(sound("play guitar: E--- F# E- E--"))
    // -, _ and a bar line keep notes apart already
    expect(parseSource("play piano: C-E-G-_F#_E").errors).toEqual([])
    expect(parseSource("play piano: C--------------- | E---------------").errors).toEqual([])
    // Where a message shows notes as the line to write, they're spaced apart.
    expect(firstError("play kick: F#E-")).toMatch(/guitar: F# E-$/)
    expect(firstError("riff = F#E-")).toMatch(/Put its type in front: notes riff = F# E-$/)
  })

  it("take ^ and ~ in front, for an accent and a soft note", () => {
    const o = parseSource("play piano: ^C-~E-G-").outputs[0]
    expect(o.notes.map((e) => [e.label, e.vel, e.accent, e.ghost])).toEqual([
      ["C", 1, true, false],
      ["E", 0.3, false, true],
      ["G", 0.7, false, false],
    ])
  })

  it("repeat at their own length in a pattern, against the drums", () => {
    const groove =
      "time 7 over 8\npattern groove = {\n  kick: x--x---\n  guitar.electric: F---G F-F--\n}\n"
    // Lines of 7 and 10 steps meet after 70: five bars of 14.
    const o = parseSource(groove + "play groove").outputs[0]
    expect(o.durSec).toBe(8.75)
    expect(o.notes).toHaveLength(28)
    expect(o.notes.every((e) => e.instrument === "guitar.electric")).toBe(true)
    expect(hits(o, "kick")).toHaveLength(20)
    expect(o.blocks.map((b) => [b.time, b.bars])).toEqual([["7 over 8", 5]])
  })

  it("play once on a play's own line, like a drum's", () => {
    expect(heard("play 2 bars piano: C---")).toEqual([["C3", 0, 4]])
    expect(heard("pattern p = 1 bars { piano: C--- }\nplay p")).toHaveLength(4)
  })

  it("take | where a bar ends, and spaces, for the eye", () => {
    expect(sound("play piano: C--- E--- G--- E--- | C---")).toBe(
      sound("play piano: C---E---G---E---C---"),
    )
    expect(firstError("play piano: C---E---|G---")).toMatch(
      /This \| isn't at the end of a bar: it's after 8 steps, and a 4 over 4 bar is 16 steps/,
    )
  })

  it("go by name, in a row with more notes", () => {
    expect(sound("notes riff = F---G F-F--\nplay guitar: riff riff")).toBe(
      sound("play guitar: F---G F-F-- F---G F-F--"),
    )
    expect(sound("notes riff = F---\nplay guitar: riff G---")).toBe(sound("play guitar: F---G---"))
  })

  it("play at the pace every sets", () => {
    expect(heard("play every 2 steps piano: C-E-")).toEqual([
      ["C3", 0, 4],
      ["E3", 4, 4],
    ])
    expect(durations("play every 1/3 beats piano: C E G")).toEqual([0.5])
  })

  it("play together from a block of lines, each ringing on its own", () => {
    // G4 rings for all four steps while the line above it moves.
    expect(heard("play piano: {\n  C4-E4-\n  G4---\n}")).toEqual([
      ["C4", 0, 2],
      ["G4", 0, 4],
      ["E4", 2, 2],
    ])
    // A chart is a layer too: chords under a tune, on one instrument.
    const o = parseSource("play piano: {\n  chords C|F\n  E4---G4---\n}").outputs[0]
    expect(o.durSec).toBe(4)
    expect(o.chords.map((e) => e.label)).toEqual(["C", "F"])
    expect(o.notes.map((e) => e.label)).toEqual(["E4", "G4", "E4", "G4", "E4", "G4", "E4", "G4"])
  })

  it("lose to a lower line's note at the same moment, as a drum's hit does", () => {
    const o = parseSource("pattern g = {\n  piano: C---\n  bar 2 piano: E---\n}\nplay g").outputs[0]
    expect(o.notes.map((e) => e.label)).toEqual(["C", "C", "C", "C", "E", "E", "E", "E"])
  })

  it("explain what a line of notes can't hold", () => {
    expect(firstError("play guitar: x---")).toMatch(
      /"x---" is a drum's steps. On guitar a step is a note: guitar: F---G---/,
    )
    expect(firstError("play guitar: f---")).toMatch(
      /"f---": notes are capital letters, A to G: guitar: F---G---/,
    )
    expect(firstError("play guitar: ^---")).toMatch(/\^ and ~ go in front of a note: \^F, ~G/)
    expect(firstError("play guitar: C9--")).toMatch(/"C9--": octaves run from 0 to 8/)
    expect(firstError("play guitar: H---")).toMatch(
      /"H---" isn't a note. Notes are A to G, with # or b after them and an octave when it's needed: F, F#, Bb, E2/,
    )
    expect(firstError("play guitar: Am---")).toMatch(
      /chord names don't go on the steps. Chords are written in a chart, where _ leaves a slot silent: guitar: chords _ Am _ Am/,
    )
    expect(firstError("play guitar: 2 beats rest, F---")).toMatch(
      /Notes are drawn step by step, without lengths: - lets a note ring on, and _ is a step of silence/,
    )
    expect(firstError("play piano: notes F---")).toMatch(
      /A line's notes need no word in front: piano: F---/,
    )
    expect(firstError("play piano: chords")).toMatch(
      /chords needs the chords after it: piano: chords Am F\|C G/,
    )
    expect(firstError("play piano: chords F---G---")).toMatch(
      /"F---G---" is notes, and this line says chords. A line of notes has no word in front: piano: F---G---/,
    )
    expect(firstError("F---G---")).toMatch(
      /Notes go on an instrument's line, e\.g\. guitar: F---G---/,
    )
  })

  it("stay off a drum's line, and so do chords", () => {
    expect(firstError("play kick: F---")).toMatch(
      /"F---" is notes, and kick is a drum. Notes go on a pitched instrument's line: guitar: F---/,
    )
    expect(firstError("play kick: Am")).toMatch(
      /"Am" is a chord, and kick is a drum. Chords go on a pitched instrument's line: piano: chords Am/,
    )
  })

  it("explain what a block of layers can't hold", () => {
    expect(firstError("play piano: {\n  kick: x---\n}")).toMatch(
      /A block after piano: holds what piano plays, one layer a line. kick: x--- is an instrument's line, which goes in a pattern/,
    )
    expect(firstError("play piano: C--- {\n  E---\n}")).toMatch(
      /A block is everything piano plays, so nothing goes beside it: piano: \{ \.\.\. \}/,
    )
    expect(firstError("notes riff = {\n  F---\n}")).toMatch(
      /A name holds one line of notes. Notes that play together go in a block on the instrument's line: piano: \{ \.\.\. \}/,
    )
    expect(firstError("notes riff = 2 beats rest, F---")).toMatch(/without lengths/)
  })
})

describe("pitched instruments", () => {
  it("name a second sound after a dot, the way a drum does", () => {
    expect(parseSource("play guitar.electric: E2---").notes[0].instrument).toBe("guitar.electric")
    expect(parseSource("play piano.electric: chords C").chords[0].instrument).toBe("piano.electric")
    expect(firstError("play guitar.acoustic: C---")).toMatch(
      /"guitar.acoustic" isn't an instrument. guitar's other sound is guitar.electric/,
    )
    expect(firstError("play organ.loud: C---")).toMatch(
      /"organ.loud" isn't an instrument. organ has one sound: organ: F---G---/,
    )
    expect(firstError("play banjo: C---")).toMatch(/"banjo" isn't an instrument. Instruments: /)
  })

  it("are coloured as notes, with chords marking a chart", () => {
    const line = (text) =>
      highlightMusic(`play {\n  ${text}\n}`)[1]
        .filter((p) => p.s.trim())
        .map((p) => [p.c, p.s])
    expect(line("guitar.electric: F#-^E2_")).toEqual([
      ["tk-inst", "guitar.electric"],
      ["tk-punct", ":"],
      ["tk-note", "F#"],
      ["tk-rest", "-"],
      ["tk-note tk-step-acc", "^E2"],
      ["tk-rest", "_"],
    ])
    expect(line("piano: chords Am|verse").map(([c]) => c)).toEqual([
      "tk-inst",
      "tk-punct",
      "tk-directive-key",
      "tk-root tk-root-abs",
      "tk-quality",
      "tk-bar",
      "tk-word",
    ])
    // A note straight after another is marked where the space goes.
    expect(line("guitar: F#E-").slice(2)).toEqual([
      ["tk-note", "F#"],
      ["tk-error", "E"],
      ["tk-rest", "-"],
    ])
    // A name that isn't an instrument is marked where it's written.
    expect(line("epiano: chords C")[0]).toEqual(["tk-error", "epiano"])
  })

  it("keep every character of the source when colouring it", () => {
    const src =
      "notes riff = F---G F-F--\nplay {\n  guitar.electric: riff | ^E2 ~Bb_\n  piano: {\n    chords Am F|C G\n    C4-E4-\n  }\n}"
    expect(
      highlightMusic(src)
        .map((parts) => parts.map((p) => p.s).join(""))
        .join("\n"),
    ).toBe(src)
  })
})

describe("the grid", () => {
  const grid = (src) => {
    const p = parseSource(src)
    expect(p.errors).toEqual([])
    return gridRows(p.outputs[0].blocks[0])
  }
  const cells = (row) => [...row.cells].sort((a, b) => a[0] - b[0])

  it("gives a pitched instrument a row above the drums, a note's name in its cell", () => {
    const { per, rows } = grid(play("kick: x---", "guitar: F-_^G"))
    expect(per).toBe(16)
    expect(rows.map((r) => r.label)).toEqual(["guitar", "kick"])
    expect(cells(rows[0])).toEqual([
      [0, { hit: true, note: true, accent: false, ghost: false, text: "F" }],
      [1, { held: true, note: true }],
      [3, { hit: true, note: true, accent: true, ghost: false, text: "G" }],
    ])
    expect([...rows[1].cells.keys()]).toEqual([0])
  })

  it("gives each line of an instrument's block a row, named once", () => {
    const { rows } = grid("play piano: {\n  C4 E4--\n  G4---\n}")
    expect(rows.map((r) => r.label)).toEqual(["piano", ""])
    expect(cells(rows[1]).map(([at, cell]) => [at, cell.text || "held"])).toEqual([
      [0, "G4"],
      [1, "held"],
      [2, "held"],
      [3, "held"],
    ])
  })

  it("is as fine as it takes to show every note start and stop", () => {
    // Notes two steps apart fit a grid of 8th notes, until one is cut short on a 16th.
    expect(grid("play piano: C-E-G-E-").per).toBe(8)
    expect(grid("play piano: C_E-G-E-").per).toBe(16)
  })

  it("leaves chords to the chart above it", () => {
    const { rows } = grid(play("piano: chords Am F", "kick: 1 3"))
    expect(rows.map((r) => r.label)).toEqual(["kick"])
  })
})
