import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.ts")
const { LANES, MODES, initialState, parseCell } = await import("../../js/language.ts")
const { highlightMusic } = await import("../../js/highlight.ts")
const { gridRows } = await import("../../js/grid.ts")
const { prepareKit } = await import("../../js/drums.ts")

const WHAT_HAPPENS_NOW = `// what happens now: crash once, the groove repeating under it
set time 7 over 8

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
const midis = (src) => parseSource(src).notes.map((e) => e.note.midi)
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
    const tidy = parseSource("// a note\nplay kick: x--x // and another")
    const messy = parseSource("\n\n   play {\n kick: x--x\n\n      }\n")
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
    expect(firstError("play guitar: notes C G|F G")).toMatch(
      /For chords, put chords in front: guitar: chords C G\|F G/,
    )
  })

  it("continues a line at a bar when the next one starts with |", () => {
    expect(labels(play("piano: chords Am|F", "  |C G"))).toEqual(["Am", "F", "C", "G"])
    expect(
      sound(play("kick: x--- ---- x-x- ----", "  |x--- x-x- ---- x-x-", "  |x--- ---- ---- ----")),
    ).toBe(sound("play kick: x--- ---- x-x- ---- | x--- x-x- ---- x-x- | x--- ---- ---- ----"))
    // over a comment line, but not over a blank one
    expect(labels(play("piano: chords Am", "// then F", "|F"))).toEqual(["Am", "F"])
    expect(anyError(play("piano: chords Am", "", "|F"))).toMatch(/no line above to continue/)
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
    expect(durations("set tempo 60\nplay kick: 1")).toEqual([4])
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
    expect(sound("pattern hit = { crash: 1 }\nplay hit")).toEqual(sound("play crash: 1"))
    expect(sound("pattern groove = {\n  kick: x\n  snare: x\n}\nplay groove")).toEqual(
      sound("play {\n  kick: x\n  snare: x\n}"),
    )
    expect(sound("pattern fill = snare: x-xx\nplay fill")).toEqual(sound("play snare: x-xx"))
    expect(sound("pattern gg = 3 bars {\n  kick: x-\n}\nplay gg")).toEqual(
      sound("pattern gg = { kick: x- }\nplay 3 bars gg"),
    )
    expect(sound("pattern gg = 3 bars kick: x-\nplay gg")).toEqual(
      sound("pattern gg = { kick: x- }\nplay 3 bars gg"),
    )
    expect(sound("pattern aa = { kick: x }\npattern song = (aa aa)\nplay song")).toEqual(
      sound("pattern aa = { kick: x }\nplay (aa aa)"),
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
    expect(allErrors("pattern gg 3 bars {\n  kick: x-\n}")).toEqual([
      "A pattern gets its name with =: pattern gg = 3 bars { ... }",
    ])
  })
})

describe("types", () => {
  it("go in front of a name: steps, notes, chords or pattern", () => {
    const p = parseSource(
      "steps pair = ^-x-\nnotes riff = F---G---\nchords verse = Am F|C G\npattern beat = {\n  piano: chords verse\n  guitar: notes riff\n  hat: pair\n}\nplay beat",
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
    const src = "pattern aa = {\n  steps pair = ^-x-\n  hat: pair\n}\nplay aa\nplay hat: pair"
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
      /An instrument's line goes inside braces: in a pattern, or play \{ kick: x-x- \}/,
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
    expect(firstError("play { }")).toMatch(/nothing in its braces/)
    expect(firstError("play {\n  steps pair = x-\n}")).toMatch(/Nothing to play in this play/)
  })
})

describe("numbers", () => {
  it("does real arithmetic wherever a number goes", () => {
    expect(durations("set tempo 60*2\nplay kick: 1")).toEqual([2])
    expect(durations("set tempo 240/4\nplay kick: 1")).toEqual([4])
    expect(durations("set tempo 30+30*3\nplay kick: 1")).toEqual([2]) // the usual order of operations
    expect(parseSource("set transpose 1+1\nplay guitar: chords C").chords[0].transpose).toBe(2)
  })

  it("explains numbers that don't work", () => {
    expect(firstError("set tempo fast")).toMatch(/tempo is quarter notes per minute/)
    expect(firstError("set transpose 2.5")).toMatch(/transpose is a number of semitones/)
  })
})

describe("time", () => {
  it("is two numbers: how many, over which note", () => {
    // A bar of seven eighth notes at 120 is 1.75 seconds.
    expect(durations("set time 7 over 8\nplay kick: 1")).toEqual([1.75])
    expect(durations("set time 14 over 16\nplay kick: 1")).toEqual([1.75])
    expect(durations("set time 4 over 4\nplay kick: 1")).toEqual([2])
    expect(durations("set time 3 over 4\nplay kick: 1")).toEqual([1.5])
    expect(durations("set time 6 over 8\nplay kick: 1")).toEqual([1.5])
  })

  it("keeps 6 over 8 and 3 over 4 apart, though they'd divide to the same number", () => {
    const time = (src) => parseSource(src).outputs[0].blocks[0].time
    expect(time("set time 6 over 8\nplay kick: 1")).toBe("6 over 8")
    expect(time("set time 3 over 4\nplay kick: 1")).toBe("3 over 4")
  })

  it("takes arithmetic for either number, and remembers a sum as the grouping", () => {
    const p = parseSource("set time 3+4 over 4\nplay kick: 1")
    expect(p.errors).toEqual([])
    expect(p.outputs[0].durSec).toBe(3.5)
    expect(p.outputs[0].blocks[0].time).toBe("3+4 over 4")
    expect(p.outputs[0].blocks[0].groups).toEqual([3, 4])
    expect(durations("set time (3 + 4) over 2*2\nplay kick: 1")).toEqual([3.5])
  })

  it("isn't a division", () => {
    expect(firstError("set time 7/8")).toMatch(
      /\/ is division, so 7\/8 is the number 0.875, not a time. Write set time 7 over 8/,
    )
    expect(firstError("set time (3+4)/4")).toMatch(/Write set time 3\+4 over 4/)
    expect(firstError("set time 0.875")).toMatch(/time is how many notes over which note/)
    expect(firstError("set time 7 8")).toMatch(/time is how many notes over which note/)
  })

  it("only counts whole notes of a real note value", () => {
    expect(firstError("set time 3.5 over 4")).toMatch(/first number of time is how many/)
    expect(firstError("set time 7 over 3")).toMatch(
      /second number of time is the note being counted/,
    )
    expect(firstError("pattern over = { kick: x }")).toMatch(/over already means something/)
  })

  it("counts a beat as a quarter note in any time", () => {
    const p = parseSource("set time 7 over 8\nplay kick: 1 2& 4e")
    expect(p.errors).toEqual([])
    expect(hits(p.outputs[0], "kick").map((e) => e.secStart * 2)).toEqual([0, 1.5, 3.25])
    expect(firstError("set time 7 over 8\nplay kick: 4&")).toMatch(/ends on 4e/)
  })
})

describe("play", () => {
  it("gives one output each", () => {
    const p = parseSource("play kick: x--x\nplay snare: --x-")
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
      "set time 7 over 8\npattern groove = 3 bars {\n  ride.bell: x--\n  kick: x--x---\n}\n"
    const want = sound(groove + "play 6 bars groove")
    expect(sound(groove + "play { 6 bars groove }")).toBe(want)
    expect(sound(groove + "play {\n  6 bars groove\n}")).toBe(want)
    expect(sound(groove + "play 6 bars {\n  groove\n}")).toBe(want)
    expect(sound("play kick: x--x")).toBe(sound("play {\n  kick: x--x\n}"))
  })

  it("lasts as long as the longest thing in it", () => {
    const one = "pattern one = { piano: chords C }\n"
    expect(durations(one + play("piano: chords F|G|A", "one"))).toEqual([6])
    expect(durations(one + play("crash: 1", "(one one one one)"))).toEqual([8])
  })

  it("explains mistakes in play lines", () => {
    expect(firstError("play nope")).toMatch(
      /"nope" isn't defined. Name it first: pattern nope = \{ \.\.\. \}/,
    )
    expect(firstError("pattern aa = { piano: chords C }\nplay nope")).toMatch(
      /"nope" isn't defined. Patterns so far: a/,
    )
    expect(firstError("pattern aa = { piano: chords C }\nplay (aa")).toMatch(/missing its \)/)
  })

  it("refuses an output over 10 minutes long", () => {
    const p = parseSource("set tempo 20\npattern aa = { piano: chords C }\nplay 64 bars aa")
    expect(p.errors[0].msg).toMatch(/over 10 minutes/)
    expect(p.outputs).toEqual([])
  })
})

describe("playing in order", () => {
  const AB = "pattern aa = { piano: chords C }\npattern bb = { piano: chords G }\n"

  it("plays what's in ( ) one after another, and a line plays one thing", () => {
    expect(labels(AB + "play (aa bb bb)")).toEqual(["C", "G", "G"])
    expect(labels(AB + "play 4 bars (aa bb)")).toEqual(["C", "G", "C", "G"])
    expect(labels(AB + "play (aa 2 bars bb aa)")).toEqual(["C", "G", "G", "C"])
    expect(labels(AB + "play ((aa bb) bb)")).toEqual(["C", "G", "G"])
    // a newline in a group is a space
    expect(labels(AB + "play (\n  aa\n  bb\n)")).toEqual(["C", "G"])
    expect(firstError(AB + "play aa bb")).toBe("What plays in order goes in brackets: (aa bb)")
    expect(firstError(AB + "play aa 2 bars bb")).toBe(
      "What plays in order goes in brackets: (aa 2 bars bb)",
    )
    expect(firstError(AB + "play aa nope")).toMatch(/"nope" isn't defined/)
    expect(firstError(AB + "play ()")).toMatch(/These brackets have nothing in them/)
    expect(firstError(AB + "play aa)")).toMatch(/This \) doesn't close anything/)
  })

  it("keeps * for arithmetic, since a length in front is how to repeat", () => {
    expect(firstError(AB + "play aa * 2")).toMatch(
      /\* only multiplies numbers. To repeat, put a length in front: 4 bars a/,
    )
    expect(firstError(AB + "play (aa bb) * 2")).toMatch(/4 bars \( \.\.\. \)/)
    expect(firstError(AB + "play ({ piano: chords F } * 2)")).toMatch(/4 bars \{ \.\.\. \}/)
    expect(labels(AB + "play 2*2 bars (aa bb)")).toEqual(["C", "G", "C", "G"])
  })
})

describe("patterns", () => {
  const GROOVE =
    "set time 7 over 8\npattern groove = 3 bars {\n  ride.bell: x--\n  kick: x--x---\n}\n"

  it("can be written on one line", () => {
    const want = sound("pattern fill = {\n  snare: x-xx\n}\nplay fill")
    expect(sound("pattern fill = { snare: x-xx }\nplay fill")).toBe(want)
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
      "pattern fill = { snare: x-xx }\npattern beat = 1 bars { kick: x--- }\nplay (beat fill beat)",
    )
    expect(p.errors).toEqual([])
    expect(p.outputs[0].durSec).toBe(4.5)
    expect(hits(p.outputs[0], "kick").map((e) => e.secStart)).toEqual([
      0, 0.5, 1, 1.5, 2.5, 3, 3.5, 4,
    ])
    expect(p.outputs[0].blocks[0].bars).toBe(3) // the part bar still gets a row on the grid
  })

  it("layer two lines of names, where one pattern on its own repeats to fill", () => {
    const p = parseSource(
      "pattern aa = { kick: 1 }\npattern bb = { snare: 1 }\n" + play("(aa aa)", "bb"),
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
      "pattern aa = { kick: 1 }\npattern bb = { kick: 1 }\nplay (aa with time 7 over 8 { bb })",
    )
    expect(p.outputs[0].blocks.map((b) => [b.time, b.bars])).toEqual([
      ["4 over 4", 1],
      ["7 over 8", 1],
    ])
  })

  it("mark chords played again so diagrams aren't shown twice", () => {
    for (const again of ["play (vv vv vv)", "play 6 bars vv"]) {
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
    expect(firstError("pattern aa = {\n  piano: chords Am\n  piano: chords F\n}")).toMatch(
      /piano already has a line in a/,
    )
    expect(firstError("pattern aa = {\n  kick: x\n  play\n}")).toMatch(/play goes at the top/)
    expect(allErrors("pattern aa = {\n  pattern bb = {\n    kick: x\n  }\n  snare: x\n}")).toEqual(
      [],
    )
    expect(
      firstError("pattern aa = {\n  pattern bb = { kick: x }\n  snare: x\n}\nplay bb"),
    ).toMatch(/"bb" isn't defined/)
    expect(firstError("pattern aa = {\n  kick: 1\n  aa\n}")).toMatch(/a plays itself/)
    expect(firstError("pattern aa = {\n  steps pair = x-\n}")).toMatch(/a has nothing to play/)
    expect(firstError("pattern aa = { kick: 1 }\npattern bb = { aa nope }")).toMatch(
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
    expect(firstError("steps fig = x---\nplay {\n  steps fig = --x-\n  snare: fig\n}")).toBe(
      `fig is already defined on line 1. ${again}`,
    )
    // two blocks can each have their own, since what's named in braces stays inside
    expect(
      allErrors(
        "play {\n  steps fig = x---\n  snare: fig\n}\nplay {\n  steps fig = --x-\n  snare: fig\n}",
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
      "pattern at100 = {\n  hat: countIn\n  piano: notes riffB\n  guitar: chords verseA\n}\nplay at100"
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

  it("are coloured as names when they follow the rule, and as mistakes when they don't", () => {
    const named = (src, word) =>
      highlightMusic(src)
        .flat()
        .filter((p) => p.s === word)
        .map((p) => p.c)
    expect(named("notes riffB = C4---\nplay piano: notes riffB", "riffB")).toEqual([
      "tk-word",
      "tk-word",
    ])
    expect(named("pattern Bridge = { kick: x }", "Bridge")).toEqual(["tk-error"])
    expect(named("pattern vi = { kick: x }", "vi")).toEqual(["tk-error"])
  })
})

describe("lengths", () => {
  const AB = "pattern aa = { piano: chords C }\npattern bb = { piano: chords G }\n"

  it("go in front of what they measure", () => {
    const want = sound("pattern gg = { kick: x--- }\nplay 2 bars gg")
    expect(
      hits(parseSource("pattern gg = { kick: x--- }\nplay 2 bars gg").outputs[0], "kick"),
    ).toHaveLength(8)
    expect(sound("pattern gg = 2 bars { kick: x--- }\nplay gg")).toBe(want)
    expect(sound("pattern gg = 2 bars {\n  kick: x---\n}\nplay gg")).toBe(want)
    expect(sound("pattern gg = { kick: x--- }\nplay { 2 bars gg }")).toBe(want)
    expect(sound("play 2 bars {\n  { kick: x--- }\n}")).toBe(want)
    expect(sound("play {\n  2 bars { kick: x--- }\n}")).toBe(want)
  })

  it("take any arithmetic", () => {
    expect(durations("pattern gg = { kick: x--- }\nplay (1+2) bars gg")).toEqual([6])
    expect(durations("pattern gg = { kick: x--- }\nplay 1/2 bars gg")).toEqual([1])
    expect(durations("pattern gg = { kick: x--- }\nplay 1 bars gg")).toEqual([2])
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
    expect(labels(AB + "play 4 bars (aa bb)")).toEqual(["C", "G", "C", "G"])
    // what repeats is the pattern at its own length
    const g = "pattern gg = 1 bars { kick: x--- }\n"
    expect(hits(parseSource(g + "play 2 bars gg").outputs[0], "kick")).toHaveLength(8)
  })

  it("aren't needed: a pattern lasts until its lines line up again", () => {
    expect(durations("pattern gg = { kick: x--- }\nplay gg")).toEqual([0.5])
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
    expect(firstError("pattern gg = {\n  kick: x\n} 3 bars")).toMatch(/pattern gg = 3 bars \{/)
    expect(firstError("play {\n  kick: x\n} 2 bars")).toMatch(/play 2 bars \{ \.\.\. \}/)
  })

  it("explain lengths that don't work", () => {
    expect(firstError("bars: 3")).toMatch(/pattern groove = 3 bars \{, or play 3 bars \{ \.\.\. \}/)
    // A length that rounds to no ticks at all used to hang the parser when repeated
    expect(firstError("pattern pp = 0.001 bars { kick: x--- }\nplay 4 bars pp")).toBe(
      "0.001 bars is shorter than the shortest note, so nothing fits in it",
    )
    expect(firstError("play 0.001 bars { kick: x--- }")).toMatch(/shorter than the shortest note/)
    expect(firstError("play 0 bars { kick: x- }")).toMatch(/A length is a number of bars/)
    expect(firstError("play 3 bars")).toMatch(/play 3 bars of what\?/)
    expect(firstError("pattern gg = { kick: x }\nplay 3 gg")).toMatch(/needs bars after it/)
    expect(firstError("pattern gg = { kick: x } 3 bars")).toMatch(/pattern gg = 3 bars \{/)
    expect(firstError("pattern gg = { kick: x } nope")).toMatch(/"nope" isn't defined/)
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
  const GROOVE =
    "set time 7 over 8\npattern groove = 3 bars {\n  ride.bell: x--\n  kick: x--x---\n}\n"
  const POLY = "  kick: x---\n  tom.floor: x--\n  snare: x----"

  it("a line fits its pattern a whole number of times, or it's a mistake", () => {
    expect(parseSource("pattern gg = 3 bars { kick: x-- }\nplay gg").errors).toEqual([])
    expect(allErrors("pattern gg = 4 bars { kick: x-- }\nplay gg")).toEqual([
      "The kick line is 3 steps long, which doesn't fit 4 bars a whole number of times. It lines up every 3 bars",
    ])
    expect(
      allErrors("pattern gg = 2 bars {\n  piano: chords Am F|C G\n  hat: x-x-xx\n}\nplay gg"),
    ).toEqual([
      "The hat line is 6 steps long, which doesn't fit 2 bars a whole number of times. The things repeating here line up every 6 bars",
    ])
    expect(allErrors("pattern hats = { hat: x--- }\n" + play("kick: x-x-x-x-xx", "hats"))).toEqual([
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
    expect(
      parseSource(`set time 7 over 8\npattern gg = 3 bars {\n${lines}}\nplay gg`).errors,
    ).toEqual([])
    expect(allErrors(`set time 7 over 8\npattern gg = 2 bars {\n${lines}}\nplay gg`)).toEqual([
      "The ride.bell line is 3 steps long, which doesn't fit 2 bars a whole number of times. The things repeating here line up every 3 bars",
    ])
  })

  it("holds for a pattern, block or group repeated for a length", () => {
    expect(allErrors(GROOVE + "play {\n  4 bars groove\n}")).toEqual([
      "groove is 3 bars long, which doesn't fit 4 bars a whole number of times. It lines up every 3 bars",
    ])
    // a length in front of braces is the block's own length, so its lines have to fit it
    expect(firstError("play {\n  2 bars { kick: x-x-xx }\n}")).toMatch(
      /The kick line is 6 steps long, which doesn't fit 2 bars/,
    )
    expect(
      firstError(
        "pattern aa = { piano: chords C }\npattern bb = { piano: chords G }\nplay {\n  3 bars (aa bb)\n}",
      ),
    ).toMatch(/This group is 2 bars long, which doesn't fit 3 bars/)
    expect(
      firstError("pattern cc = 6 bars {\n  kick: 1\n  piano: chords C|G|F|C|G\n}\nplay cc"),
    ).toMatch(/The piano line is 5 bars long, which doesn't fit 6 bars a whole number of times/)
    expect(firstError("pattern cc = 2 bars { guitar: notes F-- }\nplay cc")).toMatch(
      /The guitar line is 3 steps long, which doesn't fit 2 bars a whole number of times/,
    )
    // A pattern at its own tempo is measured against the tempo of what it's in.
    const own = (tempo) =>
      `pattern own = (with tempo ${tempo} { kick: x--- })\nplay {\n  1 bars own\n}`
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
    const riff = parseSource(`pattern rr = { guitar: notes C${"-".repeat(31)} }\nplay 1 bars rr`)
      .outputs[0]
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

  it("play in a group with names", () => {
    const named = "pattern aa = { kick: x--- }\npattern bb = { snare: x--- }"
    expect(sound(`${named}\nplay (aa { snare: x--- } aa)`)).toEqual(
      sound(`${named}\nplay (aa bb aa)`),
    )
    expect(sound(`${named}\nplay { 1 bars { snare: x--- } }`)).toEqual(
      sound(`${named}\nplay 1 bars bb`),
    )
    expect(sound(`${named}\nplay ({\n  snare: x---\n} aa)`)).toEqual(
      sound(`${named}\nplay (bb aa)`),
    )
    // After play, a length is the play's own, in front of a group as in front of a name
    expect(sound(`${named}\nplay 2 bars ({ kick: x- } aa)`)).toEqual(
      sound(`${named}\npattern cc = { kick: x- }\nplay 2 bars (cc aa)`),
    )
    expect(sound(`${named}\nplay (2 bars { kick: x- } aa)`)).toEqual(
      sound(`${named}\npattern cc = 2 bars { kick: x- }\nplay (cc aa)`),
    )
  })

  it("play together with the other lines in their braces", () => {
    expect(sound("play {\n  { kick: x--- }\n  snare: --x-\n}")).toEqual(
      sound("play {\n  kick: x---\n  snare: --x-\n}"),
    )
  })

  it("go inside patterns and nest", () => {
    expect(
      sound("pattern gg = {\n  2 bars {\n    { kick: x- }\n    snare: ----x---\n  }\n}\nplay gg"),
    ).toEqual(sound("pattern hh = 2 bars {\n  kick: x-\n  snare: ----x---\n}\nplay hh"))
  })

  it("keep a with's settings to themselves", () => {
    const p = parseSource("play (\n  with tempo 60 {\n    kick: x\n  }\n)\nplay kick: x")
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
    expect(firstError("play {\n  { steps pair = x- }\n}")).toMatch(
      /Nothing to play in this pattern/,
    )
    expect(anyError("play {\n  piano: chords { Am }\n}")).toMatch(
      /Chords play one at a time, so they can't be layered in a block/,
    )
    expect(firstError("play {\n  groove {\n    kick: x\n  }\n}")).toMatch(/"groove" isn't defined/)
    expect(anyError("play {\n  pattern bb = {\n    kick: x\n  }\n}")).toMatch(
      /Nothing to play in this play/,
    )
    expect(anyError("play {\n  pattern bb {\n    kick: x\n  }\n}")).toMatch(
      /pattern bb = \{ \.\.\. \}/,
    )
    expect(firstError("pattern aa = {\n  { aa }\n}")).toMatch(/a plays itself/)
    expect(firstError("play {\n  { kick: x\n}")).toMatch(/needs a \} to close it/)
    expect(firstError("play groove { kick: x } }")).toMatch(/doesn't close anything/)
  })
})

describe("groups: what plays in order", () => {
  const G = "pattern gg = { kick: x--- }\n"
  const S = "pattern ss = { snare: x--- }\n"
  const TWO = "  {\n    snare: x---\n  }"

  it("hold names, blocks, groups and lines, one after another", () => {
    expect(sound(G + `play ({\n    snare: x---\n  } {\n    gg\n  })`)).toBe(
      sound(G + S + "play (ss gg)"),
    )
    expect(sound("play ({ kick: x--- } { snare: x--- })")).toBe(sound(G + S + "play (gg ss)"))
    expect(sound(G + "play (gg { snare: x--- })")).toBe(sound(G + S + "play (gg ss)"))
    expect(sound(G + "play ({\n  snare: x---\n} gg)")).toBe(sound(G + S + "play (ss gg)"))
    expect(sound(G + "play (gg (gg gg) gg)")).toBe(sound(G + "play (gg gg gg gg)"))
    expect(sound(G + "pattern pp = ({\n  gg\n} gg)\nplay pp")).toBe(sound(G + "play (gg gg)"))
    expect(sound(G + "play (\n  kick: x---\n  snare: x---\n)")).toBe(sound(G + S + "play (gg ss)"))
  })

  it("read a newline in them as a space, and take a length on what's in them", () => {
    expect(sound(G + "play (gg\n  gg)")).toBe(sound(G + "play (gg gg)"))
    expect(durations(G + "play (gg 2 bars (gg gg) gg)")).toEqual([5])
  })

  it("leave blocks on lines of their own playing together", () => {
    const together = sound(G + `play {\n${TWO}\n  {\n    gg\n  }\n}`)
    expect(together).toBe(sound(G + "play {\n  snare: x---\n  gg\n}"))
    expect(together).not.toBe(sound(G + `play ({\n    snare: x---\n  } {\n    gg\n  })`))
  })

  it("are asked for where a line would play two things", () => {
    expect(firstError(G + `play {\n${TWO} {\n    gg\n  }\n}`)).toBe(
      "What plays in order goes in brackets: ({ ... } { ... })",
    )
    expect(firstError("play { kick: x--- } { snare: x--- }")).toBe(
      "What plays in order goes in brackets: play ({ ... } { ... })",
    )
    expect(firstError(G + "play {\n  kick: x---\n} gg")).toBe(
      "What plays in order goes in brackets: play ({ ... } gg)",
    )
    expect(firstError(G + "play {\n  gg {\n    snare: x---\n  }\n}")).toBe(
      "What plays in order goes in brackets: (gg { ... })",
    )
    expect(firstError(G + "play gg 2 bars (gg gg)")).toBe(
      "What plays in order goes in brackets: (gg 2 bars (gg gg))",
    )
    expect(firstError(G + "play (gg gg) (gg)")).toBe(
      "What plays in order goes in brackets: ((gg gg) (gg))",
    )
    expect(firstError(G + "pattern pp = {\n  gg\n} gg\nplay pp")).toMatch(/\(\{ \.\.\. \} gg\)/)
    // A name that isn't defined is said first
    expect(firstError("play {\n  groove {\n    kick: x\n  }\n}")).toMatch(/"groove" isn't defined/)
  })

  it("make then a name like any other", () => {
    expect(sound("pattern then = { kick: x--- }\nplay then")).toBe(sound(G + "play gg"))
    expect(firstError(G + "play gg then gg")).toMatch(/"then" isn't defined/)
  })

  it("play straight after play, like a group anywhere else", () => {
    expect(sound("play ({\n  kick: x---\n} {\n  snare: x---\n})")).toBe(
      sound(G + S + "play (gg ss)"),
    )
    expect(durations(G + "play 2 bars ({ kick: x- } gg)")).toEqual([4])
  })
})

describe("patterns repeat, and a play's own lines play once", () => {
  const AB = "pattern aa = { piano: chords C }\npattern bb = { piano: chords G }\n"

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
    expect(labels(AB + play("bar 4 kick: 1", "(aa bb)"))).toEqual(["C", "G", "C", "G"])
  })

  it("lets a crash play once over a pattern that repeats", () => {
    const o = parseSource("pattern beat = { kick: x--- }\n" + play("crash: 1", "4 bars beat"))
      .outputs[0]
    expect(hits(o, "crash")).toHaveLength(1)
    expect(hits(o, "kick")).toHaveLength(16)
  })
})

describe("events", () => {
  it("count their ticks from the start of their block, as the block's own events do", () => {
    const p = parseSource(
      "pattern aa = {\n  kick: x---\n}\npattern bb = {\n  snare: x---\n}\nplay (aa bb)",
    )
    expect(p.drumEvents.map((e) => [e.lane, e.tick])).toEqual([
      ["kick", 0],
      ["snare", 96],
    ])
    expect(p.blocks[0].drumEvents.map((e) => [e.lane, e.tick])).toEqual([
      ["kick", 0],
      ["snare", 96],
    ])
  })
})

describe("settings", () => {
  it("apply from where they're written", () => {
    expect(durations("play piano: chords C\nset tempo 60\nplay piano: chords C")).toEqual([2, 4])
  })

  it("carry on into the cells below, and say so", () => {
    const above = parseSource("set tempo 90\nset key A\nset mode minor").state
    const p = parseSource("play piano: chords i vM", above)
    expect(p.chords.map((e) => e.label)).toEqual(["Am", "E"])
    expect(p.fromAbove).toEqual(["tempo 90", "key A", "mode minor"])
  })

  it("say every setting and sound they carry on, swing too", () => {
    const above = parseSource("set swing on\nset tempo 90\nset guitar.electric muted").state
    expect(parseSource("play kick: x-", above).fromAbove).toEqual([
      "tempo 90",
      "swing on",
      "guitar.electric muted",
    ])
    // what this cell sets again isn't from above
    const again = parseSource("set guitar.electric clean\nset swing off\nplay kick: x-", above)
    expect(again.fromAbove).toEqual(["tempo 90"])
  })

  it("go on a with inside a block, so a block's lines can each have their own", () => {
    const by = (src) =>
      Object.fromEntries(parseSource(src).notes.map((e) => [e.instrument, e.note.name]))
    expect(
      by("play {\n  with octave 4 { piano: notes i--- }\n  with octave 2 { bass: notes i--- }\n}"),
    ).toEqual({
      piano: "C4",
      bass: "C2",
    })
    expect(
      by("pattern aa = {\n  piano: notes i---\n  with key E { bass: notes i--- }\n}\nplay aa"),
    ).toEqual({
      piano: "C3",
      bass: "E3",
    })
    // a pattern plays with the settings where it's played
    expect(
      by("pattern up = { piano: notes i--- }\nplay {\n  up\n  with key E { bass: notes i--- }\n}"),
    ).toEqual({
      piano: "C3",
      bass: "E3",
    })
    // the header shows the key the block starts in
    const b = parseSource(
      "play {\n  with key G { piano: notes i--- }\n  with key E { bass: notes i--- }\n}",
    ).outputs[0].blocks[0]
    expect(b.key).toBe("G")
  })

  it("are set only at the top: inside a block, they go on a with", () => {
    expect(firstError("play {\n  kick: x---\n  set tempo 60\n}")).toBe(
      "Inside a block, settings go on a with: with tempo 60 { ... }",
    )
    expect(firstError("pattern pp = {\n  set octave 2\n  bass: notes i---\n}\nplay pp")).toBe(
      "Inside a block, settings go on a with: with octave 2 { ... }",
    )
    expect(firstError("with key E {\n  set mode minor\n  play piano: notes i---\n}")).toBe(
      "Inside a block, settings go on a with: with mode minor { ... }",
    )
    expect(durations("set tempo 60\nplay kick: 1")).toEqual([4])
  })
})

describe("every", () => {
  it("says how long a step lasts, in front of what plays at that pace", () => {
    expect(durations("play every 2 steps hat: x-xx-xxx")).toEqual([2])
    expect(durations("play every 1/3 beats hat: x-x")).toEqual([0.5])
    expect(durations("play every 3 steps hat: x-")).toEqual([0.75])
    expect(durations("play every 1 bars kick: x-")).toEqual([4])
  })

  it("takes braces, one line or a name, and leaves what's around it alone", () => {
    const want = sound("play {\n  hat: x-xx\n  kick: x---\n}")
    expect(sound("play {\n  hat: x-xx\n  every 2 steps { kick: x- }\n}")).toBe(want)
    expect(sound("play {\n  hat: x-xx\n  every 2 steps kick: x-\n}")).toBe(want)
    expect(sound("pattern beat = { kick: x- }\nplay {\n  hat: x-xx\n  every 2 steps beat\n}")).toBe(
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
    expect(durations("play every 2 steps {\n  every 2 steps hat: x-\n}")).toEqual([1])
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
    expect(sound("steps pair = x-\nplay hat: 1 bars pair")).toBe(sound("play hat: 1 bars x-"))
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
      /rest takes a length in front: 2 beats rest, or \.\.\.rest for the rest of the block/,
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

describe("... to the end of the block", () => {
  // Circle of Manias: the hats are 4 steps, the figure 18, so the pattern is 36 steps.
  const MANIAS = `set time 9 over 8
pattern manias = {
  hat.open: x---
  hat: --x-
  kick: x--x-x---x--x-xx--
  snare: -------x-
  snare.ghost: -xx, ...rest
}`

  it("plays the hits once each time through, and leaves the length to the other lines", () => {
    expect(sound(`${MANIAS}\nplay 4 bars manias`)).toBe(
      sound(MANIAS.replace("-xx, ...rest", "-xx, 33 steps rest") + "\nplay 4 bars manias"),
    )
    // in a play, lines play once anyway, so the rest only says the line has no length
    expect(sound(play("kick: x---x---x-x-x---", "snare.ghost: -xx, ...rest"))).toBe(
      sound(play("kick: x---x---x-x-x---", "snare.ghost: -xx")),
    )
    expect(sound(play("2 bars { kick: x--- }", "snare.ghost: -xx, ...rest"))).toBe(
      sound(play("2 bars { kick: x--- }", "snare.ghost: -xx")),
    )
  })

  it("fills a bar, and a layer of a block", () => {
    expect(
      sound(
        "play {\n  kick: x--- x--- x-x- x--- | x--- x--- x--- x-x-\n  bar 2 { snare.ghost: -xx, ...rest }\n}",
      ),
    ).toBe(
      sound(
        "play {\n  kick: x--- x--- x-x- x--- | x--- x--- x--- x-x-\n  bar 2 { snare.ghost: -xx, 13 steps rest }\n}",
      ),
    )
    expect(sound("play snare: {\n  x---^---\n  -xx, ...rest\n}")).toBe(
      sound("play snare: xxx-^---"),
    )
  })

  it("has to fit", () => {
    expect(
      firstError("pattern gg = {\n  kick: x---\n  snare.ghost: -xxxx, ...rest\n}\nplay gg"),
    ).toMatch(/gg is 4 steps long, and the snare.ghost line's hits run 5 steps before its \.\.\./)
    expect(firstError("play snare: {\n  x---\n  -xxxx, ...rest\n}")).toMatch(
      /This layer's hits run 5 steps before its \.\.\., and the block is only 4 steps long/,
    )
    // a play with a length of its own cuts things off instead
    expect(durations("play 1 bars snare.ghost: -xx, 2 bars rest, ...rest")).toEqual([2])
  })

  it("needs something else to say how long the block is", () => {
    expect(firstError("pattern gg = {\n  snare.ghost: -xx, ...rest\n}\nplay gg")).toMatch(
      /Every line in gg ends in \.\.\., so nothing says how long it is. Say so: pattern gg = 4 bars \{/,
    )
    expect(firstError("play snare.ghost: -xx, ...rest")).toMatch(
      /Every line in this play ends in \.\.\., so nothing says how long it is. Say so: play 4 bars \{ ... \}/,
    )
    expect(firstError("play snare: {\n  -xx, ...rest\n}")).toMatch(
      /Every layer here ends in \.\.\., so nothing says how long the block is/,
    )
    // at its own pace, the length comes from the lines at that pace, or from a length in front
    expect(firstError("play every 3 steps snare: -xx, ...rest")).toMatch(
      /Every line at this pace ends in \.\.\., so nothing says how long it is. Say so: every 3 steps 4 bars \{ ... \}/,
    )
    expect(parseSource("play every 3 steps 1 bars { snare: -xx, ...rest }").errors).toEqual([])
    expect(durations("play 2 bars snare.ghost: -xx, ...rest")).toEqual([4])
  })

  it("goes last, on the drum's line", () => {
    expect(firstError("play snare: -xx ...rest")).toMatch(
      /\.\.\. starts its own part, so a comma goes before it: -xx, \.\.\.rest/,
    )
    expect(firstError("play snare: ...rest")).toMatch(
      /\.\.\.rest on its own plays nothing. Put the hits in front of it: -xx, \.\.\.rest/,
    )
    expect(firstError("play snare: ...rest, dd")).toMatch(
      /\.\.\. is the rest of the block, so nothing goes after it/,
    )
    expect(firstError("steps pickup = -xx, ...rest")).toMatch(
      /A name's steps have a length of their own. \.\.\. is the rest of a block, so it goes on the drum's line: snare: pickup, \.\.\.rest/,
    )
    expect(
      sound("steps pickup = -xx\nplay {\n  kick: x---x-x-\n  snare.ghost: pickup, ...rest\n}"),
    ).toBe(sound(play("kick: x---x-x-", "snare.ghost: -xx")))
  })
})

describe("the closed hi-hat", () => {
  it("is hat on its own, which the error says when someone reaches for hat.close", () => {
    expect(firstError("play hat.close: x-x-")).toMatch(
      /The closed hi-hat is hat on its own; hat.open is the open one, and hat.pedal the foot/,
    )
    expect(firstError("play hat.closed: x-x-")).toMatch(/The closed hi-hat is hat on its own/)
  })
})

describe("swing", () => {
  it("moves the off-beat late in the sound, and nowhere in the writing", () => {
    const p = parseSource("set swing on\nplay hat: 8 steps x-")
    expect(p.errors).toEqual([])
    const hits = p.outputs[0].drumEvents
    const sounds = (events) => events.map((e) => e.secStart + (e.secSwing || 0))
    const near = (got, want) => {
      expect(got).toHaveLength(want.length)
      got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 4))
    }
    // at 120 a beat is half a second: the & sounds two thirds of the way through it, as a
    // triplet's third note, and is written halfway
    near(sounds(hits), [0, 1 / 3, 0.5, 0.5 + 1 / 3])
    near(
      hits.map((e) => e.secStart),
      [0, 0.25, 0.5, 0.75],
    )
    expect(p.outputs[0].blocks[0].drumEvents.map((e) => e.tick)).toEqual([0, 48, 96, 144])
    // sixteenths move with the eighth they belong to
    near(sounds(parseSource("set swing on\nplay hat: 4 steps x").outputs[0].drumEvents), [
      0,
      1 / 6,
      1 / 3,
      5 / 12,
    ])
  })

  it("is on or off, and off unless it's set", () => {
    const rule =
      "swing is on or off: set swing on plays the off-beat eighths late, as a triplet feel"
    expect(firstError("set swing 67")).toBe(rule)
    expect(firstError("set swing On")).toBe(rule)
    expect(firstError("with swing true { play hat: x- }")).toBe(
      "swing is on or off: with swing on plays the off-beat eighths late, as a triplet feel",
    )
    for (const src of [
      "play hat: 4 steps x-",
      "set swing on\nset swing off\nplay hat: 4 steps x-",
    ]) {
      expect(parseSource(src).outputs[0].drumEvents.every((e) => e.secSwing === undefined)).toBe(
        true,
      )
    }
  })
})

describe("hits spread over steps: 3 in 8", () => {
  it("spreads the hits as evenly as whole steps allow", () => {
    expect(sound("play kick: 3 in 8")).toBe(sound("play kick: x--x--x-"))
    expect(sound("play kick: 5 in 8")).toBe(sound("play kick: x-xx-xx-"))
    expect(sound("play kick: 2 in 5, 3 in 8")).toBe(sound("play kick: x-x-- x--x--x-"))
    expect(sound("steps tresillo = 3 in 8\nplay kick: tresillo")).toBe(sound("play kick: x--x--x-"))
    expect(sound("play kick: 4 in 4")).toBe(sound("play kick: 4 steps x"))
  })

  it("needs at least as many steps as hits, up to 64, and commas around it", () => {
    expect(firstError("play kick: 9 in 8")).toMatch(
      /9 in 8 puts 9 hits in 8 steps, so it needs at least as many steps as hits/,
    )
    expect(firstError("play kick: 3 in 65")).toMatch(/more than 64 steps/)
    expect(firstError("play kick: x-- 3 in 8")).toMatch(
      /3 in 8 is a part of its own, so put a comma before it: x--, 3 in 8/,
    )
    expect(firstError("play kick: 3 in 8 x--")).toMatch(/put a comma after it: 3 in 8, x--/)
    expect(firstError("play kick: x in 8")).toMatch(/in goes between two numbers/)
    expect(firstError("tresillo = 3 in 8")).toMatch(
      /Put its type in front: steps tresillo = 3 in 8/,
    )
  })
})

describe("lengths are always plural", () => {
  it("so bars says how long, and bar says which", () => {
    expect(durations("pattern gg = { kick: x--- }\nplay 1 bars gg")).toEqual([2])
    expect(firstError("pattern gg = { kick: x--- }\nplay 1 bar gg")).toMatch(
      /Lengths are always plural, whatever the number: 1 bars/,
    )
    expect(firstError("pattern gg = 3 bar { kick: x--- }")).toMatch(/3 bars/)
    expect(firstError("play {\n  2 bar { kick: x- }\n}")).toMatch(/2 bars/)
    expect(firstError("play snare: 1 beat rest, x---")).toMatch(/1 beats/)
    expect(firstError("play snare: {\n  1 step rest, x\n}")).toMatch(/1 steps/)
    expect(firstError("play (1+1) bar { kick: x- }")).toMatch(/\(1\+1\) bars/)
  })
})

describe("what plays in a bar", () => {
  const TWO = "kick: x---x---x-x-x--- | x---x---x---x-x-"

  it("plays in that bar of what it's in, and nowhere else", () => {
    const o = parseSource(
      "pattern gg = 2 bars {\n  kick: x---\n  bar 2 { snare: 2 4 }\n}\nplay 4 bars gg",
    ).outputs[0]
    expect(hits(o, "kick")).toHaveLength(16)
    expect(hits(o, "snare").map((e) => e.secStart)).toEqual([2.5, 3.5, 6.5, 7.5])
  })

  it("takes braces, one line, a name, or a run of bars: bar 2 to 3", () => {
    const want = played(play(TWO, "bar 2 { snare: x }"))
    expect((want[0][1] as string[]).filter((e) => e.startsWith("snare"))).toHaveLength(16)
    expect(played(play(TWO, "bar 2 snare: x"))).toEqual(want)
    expect(played("pattern fill = { snare: x }\n" + play(TWO, "bar 2 fill"))).toEqual(want)
    expect(played(play(TWO, "bar 1+1 snare: x"))).toEqual(want)
    const o = parseSource(play("kick: 1", "bar 2 to 3 { snare: 2 4 }")).outputs[0]
    expect(o.durSec).toBe(6)
    expect(hits(o, "snare").map((e) => e.secStart)).toEqual([2.5, 3.5, 4.5, 5.5])
  })

  it("makes a pattern long enough to have the bars it names", () => {
    expect(durations("pattern gg = {\n  kick: x---\n  bar 3 crash: 1\n}\nplay gg")).toEqual([6])
    expect(
      durations(
        "set time 7 over 8\npattern gg = {\n  kick: x--x---\n  hat: ^-x-\n  bar 2 hat.pedal: 4\n}\nplay gg",
      ),
    ).toEqual([3.5])
    expect(firstError("pattern gg = 2 bars {\n  kick: x---\n  bar 3 crash: 1\n}\nplay gg")).toMatch(
      /gg is 2 bars long, so it has no bar 3/,
    )
    expect(firstError("play 1 bars {\n  bar 2 crash: 1\n}")).toMatch(
      /This play is 1 bar long, so it has no bar 2/,
    )
  })

  it("wins over the lines above it, where both hit the same drum at once", () => {
    const o = parseSource("pattern gg = {\n  snare: x---\n  bar 2 snare: ^---\n}\nplay gg")
      .outputs[0]
    expect(hits(o, "snare").map((e) => e.accent)).toEqual([
      ...Array(4).fill(false),
      ...Array(4).fill(true),
    ])
  })

  it("writes a groove with a lift in its second bar, the same as all its steps", () => {
    const groove = (lines) =>
      `set time 7 over 8\nset tempo 90\npattern groove = {\n${lines}\n}\nplay 6 bars {\n  crash: 1\n  groove\n}`
    const long = groove(`  kick: x--x---
  snare: -----x-
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
    expect(firstError("pattern gg = {\n  bar 2 nope\n}")).toMatch(/"nope" isn't defined/)
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
    const seven = "set time 7 over 8\n"
    expect(sound(seven + "pattern gg = { snare: 2e 4 }\nplay 2 bars gg")).toBe(
      sound(seven + "pattern hh = { snare: -----x- }\nplay 2 bars hh"),
    )
  })

  it("read a step in front of a beat as how that beat is hit", () => {
    const o = parseSource("play tom.high: 1 ^2 ~3 d4").outputs[0]
    expect(o.drumEvents.filter((e) => !e.hidden).map((e) => e.vel)).toEqual([0.7, 1, 0.3, 0.7])
    expect(sound("play tom.high: 1 ^2 ~3 d4")).toBe(sound("play tom.high: x---^---~---d---"))
    expect(sound("steps backbeat = 2 ^4\nplay snare: backbeat")).toBe(
      sound("play snare: ----x-------^---"),
    )
    const seven = "set time 7 over 8\n"
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
    expect(firstError("set time 7 over 8\nplay hat.open: -|3& x")).toMatch(only)
    expect(firstError("play crash: 1|-|-")).toMatch(only)
    expect(firstError("play kick: 1 3|1 2& 3")).toMatch(only)
    expect(firstError("play tom.high: 2 accent")).toMatch(/"accent" isn't a beat/)
  })

  it("are steps too, so they can be a layer or a name", () => {
    expect(sound("play snare: {\n  2 4\n  ------x-\n}")).toBe(sound("play snare: 1 bars ----x-x-"))
    expect(sound("steps backbeat = 2 4\nplay snare: backbeat")).toBe(
      sound("play snare: 1 bars ----x---"),
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
    expect(firstError("play kick: x---x---x-x-|x---")).toMatch(
      /This \| isn't at the end of a bar: it's after 12 steps, and a 4 over 4 bar is 16 steps/,
    )
    expect(firstError("play kick: {\n  x---|x-x-\n}")).toMatch(/This \| isn't at the end of a bar/)
  })

  it("play a variation on its own lane, with the drum's sound", () => {
    const o = parseSource(play("hat: x-x-x-xx", "hat.open: 4&", "ride.bell: x")).outputs[0]
    expect(hits(o, "hat.open").map((e) => [e.inst, e.art])).toEqual([["hat", "open"]])
    expect(hits(o, "ride.bell").map((e) => [e.inst, e.art])).toEqual([["ride", "bell"]])
  })

  it("let an open hi-hat replace a closed hit at the same moment, until the next hit", () => {
    const o = parseSource(play("hat: ^-x-^-xx", "hat.open: ----^---")).outputs[0]
    expect(hits(o, "hat").map((e) => e.secStart / 0.125)).toEqual([0, 2, 6, 7])
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
    const o = parseSource("set time 7 over 8\n" + play("kick: x--x---", "snare: ---xx--"))
      .outputs[0]
    expect(o.drumEvents.map((e) => [e.lane, e.secStart * 8])).toEqual([
      ["kick", 0],
      ["kick", 3],
      ["snare", 3],
      ["snare", 4],
    ])
  })

  it("repeats lines of different lengths against each other in a pattern", () => {
    const o = parseSource(
      "set time 7 over 8\npattern gg = 3 bars {\n  kick: x--x---\n  ride.bell: x--\n}\nplay gg",
    ).outputs[0]
    expect(hits(o, "kick")).toHaveLength(12)
    expect(hits(o, "ride.bell")).toHaveLength(14)
  })

  it("layers a drum in a block of steps, each layer repeating until they line up", () => {
    const o = parseSource(
      "pattern gg = {\n  snare.ghost: {\n    --x-\n    ------------dd--\n  }\n}\nplay gg",
    ).outputs[0]
    expect(o.durSec).toBe(2)
    expect(hits(o, "snare.ghost").map((e) => e.secStart / 0.125)).toEqual([2, 6, 10, 12, 13, 14])
  })

  it("lets a lower layer win where two hit the same step, and never a rest", () => {
    expect(sound("play snare: {\n  x-xx\n  --^-\n}")).toBe(sound("play snare: x-^x"))
    expect(sound("play snare: {\n  ^-x-\n  x---\n}")).toBe(sound("play snare: 4 steps x-"))
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
    expect(sound("steps fig = {\n  x-\n  -x\n}\nplay hat: x--- fig")).toBe(
      sound("play hat: x---xx"),
    )
    expect(sound("steps pair = x-\nplay hat: {\n  {\n    pair\n    -x\n  }\n  ----\n}")).toBe(
      sound("play hat: 4 steps x"),
    )
  })

  it("gives a block the whole line, so steps go in a row with one by name", () => {
    // Otherwise a newline between two blocks would be all that told together from in order
    expect(firstError("play hat: x--- {\n  x-\n  -x\n}")).toBe(
      "A block is everything hat plays, so nothing goes beside it. " +
        "To put steps in a row with a block, name it: steps fig = { ... } and hat: x--- fig",
    )
    expect(firstError("play hat: {\n  { x--- } { --x- }\n}")).toMatch(/everything in its layer/)
    expect(firstError("steps roll = x--- { x- }")).toMatch(
      /everything roll holds.*steps fig = \{ \.\.\. \} and steps roll = x--- fig/,
    )
  })

  it("lets a lower line win where two lines hit the same drum at once", () => {
    const below = parseSource(play("{ snare: ^--- }", "snare: x-xx")).outputs[0]
    expect(hits(below, "snare").map((e) => [e.secStart / 0.125, e.accent])).toEqual([
      [0, false],
      [2, false],
      [3, false],
    ])
    const above = parseSource(play("snare: x-xx", "{ snare: ^--- }")).outputs[0]
    expect(hits(above, "snare").map((e) => [e.secStart / 0.125, e.accent])).toEqual([
      [0, true],
      [2, false],
      [3, false],
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
    expect(firstError("pattern gg = {\n  --x-\n}")).toMatch(/\{ \.\.\. \} is steps, not a pattern/)
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
  const heard = (src) => {
    const p = parseSource(src)
    expect(p.errors).toEqual([])
    return p.notes.map((e) => [e.note.name, e.secStart / 0.125, e.secDur! / 0.125])
  }

  it("are drawn on the steps, a note where a drum has its x", () => {
    expect(heard("play guitar: notes F---G F-F--")).toEqual([
      ["F3", 0, 4],
      ["G3", 4, 1],
      ["F3", 5, 2],
      ["F3", 7, 3],
    ])
    expect(durations("play guitar: notes F---G F-F--")).toEqual([1.25])
  })

  it("take one step each, however many characters a note is", () => {
    expect(heard("play bass: notes E1-F#1 Bb1-")).toEqual([
      ["E1", 0, 2],
      ["F#1", 2, 1],
      ["A#1", 3, 2],
    ])
  })

  it("use the octave setting when a note has no number", () => {
    expect(notes("play piano: notes C E4 G")).toEqual(["C3", "E4", "G3"])
    expect(notes("set octave 2\nplay bass: notes E-G-")).toEqual(["E2", "G2"])
  })

  it("ring until the next note, and _ stops one", () => {
    expect(heard("play piano: notes C---__E-")).toEqual([
      ["C3", 0, 4],
      ["E3", 6, 2],
    ])
    // Before the first note, - is silence: nothing is ringing yet.
    expect(heard("play piano: notes --C-")).toEqual([["C3", 2, 2]])
  })

  it("don't touch: a space goes between two notes, and takes no step", () => {
    expect(firstError("play guitar: notes E---F#E-E--")).toBe(
      '"E---F#E-E--": notes don\'t touch, so put a space between them: E---F# E-E--',
    )
    expect(firstError("play piano: notes CEG")).toMatch(/put a space between them: C E G$/)
    expect(firstError("play piano: notes ^F^G")).toMatch(/put a space between them: \^F \^G$/)
    expect(firstError("notes riff = E2G2")).toMatch(/put a space between them: E2 G2$/)
    expect(sound("play guitar: notes E---F# E-E--")).toBe(
      sound("play guitar: notes E--- F# E- E--"),
    )
    // -, _ and a bar line keep notes apart already
    expect(parseSource("play piano: notes C-E-G-_F#_E").errors).toEqual([])
    expect(parseSource("play piano: notes C--------------- | E---------------").errors).toEqual([])
    // Where a message shows notes as the line to write, they're spaced apart.
    expect(firstError("play kick: F#E-")).toMatch(/guitar: notes F# E-$/)
    expect(firstError("riff = F#E-")).toMatch(/Put its type in front: notes riff = F# E-$/)
  })

  it("take ^ and ~ in front, for an accent and a soft note", () => {
    const o = parseSource("play piano: notes ^C-~E-G-").outputs[0]
    expect(o.notes.map((e) => [e.label, e.vel, e.accent, e.ghost])).toEqual([
      ["C", 1, true, false],
      ["E", 0.3, false, true],
      ["G", 0.7, false, false],
    ])
  })

  it("repeat at their own length in a pattern, against the drums", () => {
    const groove =
      "set time 7 over 8\npattern groove = {\n  kick: x--x---\n  guitar.electric: notes F---G F-F--\n}\n"
    // Lines of 7 and 10 steps meet after 70: five bars of 14.
    const o = parseSource(groove + "play groove").outputs[0]
    expect(o.durSec).toBe(8.75)
    expect(o.notes).toHaveLength(28)
    expect(o.notes.every((e) => e.instrument === "guitar.electric")).toBe(true)
    expect(hits(o, "kick")).toHaveLength(20)
    expect(o.blocks.map((b) => [b.time, b.bars])).toEqual([["7 over 8", 5]])
  })

  it("play once on a play's own line, like a drum's", () => {
    expect(heard("play 2 bars piano: notes C---")).toEqual([["C3", 0, 4]])
    expect(heard("pattern pp = 1 bars { piano: notes C--- }\nplay pp")).toHaveLength(4)
  })

  it("take | where a bar ends, and spaces, for the eye", () => {
    expect(sound("play piano: notes C--- E--- G--- E--- | C---")).toBe(
      sound("play piano: notes C---E---G---E---C---"),
    )
    expect(firstError("play piano: notes C---E---|G---")).toMatch(
      /This \| isn't at the end of a bar: it's after 8 steps, and a 4 over 4 bar is 16 steps/,
    )
  })

  it("go by name, in a row with more notes", () => {
    expect(sound("notes riff = F---G F-F--\nplay guitar: notes riff G---")).toBe(
      sound("play guitar: notes F---G F-F-- G---"),
    )
    expect(sound("notes riff = F---\nplay guitar: notes riff G---")).toBe(
      sound("play guitar: notes F---G---"),
    )
  })

  it("play at the pace every sets", () => {
    expect(heard("play every 2 steps piano: notes C-E-")).toEqual([
      ["C3", 0, 4],
      ["E3", 4, 4],
    ])
    expect(durations("play every 1/3 beats piano: notes C E G")).toEqual([0.5])
  })

  it("play together from a block of lines, each ringing on its own", () => {
    // G4 rings for all four steps while the line above it moves.
    expect(heard("play piano: {\n  notes C4-E4-\n  notes G4---\n}")).toEqual([
      ["C4", 0, 2],
      ["G4", 0, 4],
      ["E4", 2, 2],
    ])
    // A chart is a layer too: chords under a tune, on one instrument.
    const o = parseSource("play piano: {\n  chords C|F\n  notes E4---G4---\n}").outputs[0]
    expect(o.durSec).toBe(4)
    expect(o.chords.map((e) => e.label)).toEqual(["C", "F"])
    expect(o.notes.map((e) => e.label)).toEqual(["E4", "G4", "E4", "G4", "E4", "G4", "E4", "G4"])
  })

  it("lose to a lower line's note at the same moment, as a drum's hit does", () => {
    const o = parseSource(
      "pattern gg = {\n  piano: notes C---\n  bar 2 piano: notes E---\n}\nplay gg",
    ).outputs[0]
    expect(o.notes.map((e) => e.label)).toEqual(["C", "C", "C", "C", "E", "E", "E", "E"])
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
      /"H---" isn't a note. Notes are A to G, with # or b after them and an octave when it's needed \(F, F#, Bb, E2\), or degrees of the key as Roman numerals, i to vii/,
    )
    expect(firstError("play guitar: notes Am---")).toMatch(
      /chord names don't go on the steps. Chords are written in a chart, where _ leaves a slot silent: guitar: chords _ Am _ Am/,
    )
    expect(firstError("play guitar: notes 2 beats C2-E2-")).toMatch(
      /2 beats holds one note. To draw a figure, leave the length off: C2-E2-/,
    )
    expect(firstError("play guitar: notes 8---")).toMatch(/degrees are the Roman numerals i to vii/)
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

  it("take a length in front of one note, which holds it that long", () => {
    expect(heard("play bass: notes 3 beats C2, 1 beats G1")).toEqual([
      ["C2", 0, 12],
      ["G1", 12, 4],
    ])
    expect(sound("play piano: notes 2 beats rest, E4---F4---")).toBe(
      sound("play piano: notes _-------E4---F4---"),
    )
    expect(sound("notes gap = 1 bars rest\nplay piano: notes gap C4---")).toBe(
      sound("play piano: notes _--------------- C4---"),
    )
    expect(sound("play piano: notes 3 beats ^E4, 1 beats ~D4")).toBe(
      sound("play piano: notes ^E4----------- ~D4---"),
    )
    // a bar line may end a length's part, and is checked there
    expect(sound("play bass: notes 1 bars F2 | 1 bars G2")).toBe(
      sound("play bass: notes 1 bars F2, 1 bars G2"),
    )
    expect(firstError("play bass: notes 3 beats F2 | 1 bars G2")).toMatch(
      /This \| isn't at the end of a bar/,
    )
    // ... holds a note, or silence, to the end of the block
    expect(heard("play 2 bars bass: notes 3 beats C2, ...G1")).toEqual([
      ["C2", 0, 12],
      ["G1", 12, 20],
    ])
    expect(firstError("play piano: notes E4---, ...rest")).toMatch(
      /Every line in this play ends in \.\.\./,
    )
    expect(firstError("notes tail = E4---, ...rest")).toMatch(
      /A name's notes have a length of their own/,
    )
    expect(firstError("play piano: notes 3 beats riff")).toMatch(
      /3 beats needs one note or rest after it/,
    )
  })

  it("take degrees of the key, counted on its mode's scale", () => {
    const major = "notes major = i---ii---iii---iv---|v---vi---vii---i'---\n"
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
    expect(notes("set key A\nset octave 4\nplay piano: notes i-ii-biii-iv-v-bvi-vii-i'-")).toEqual([
      "A4",
      "B4",
      "C5",
      "D5",
      "E5",
      "F5",
      "G#5",
      "A5",
    ])
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
    expect(notes("set key C\nset octave 3\nplay bass: notes i-'v-''i-i''-")).toEqual([
      "C3",
      "G2",
      "C1",
      "C5",
    ])
    // letters and degrees can share a line
    expect(notes("set key D\nset octave 4\nplay piano: notes i-F#4-v-")).toEqual([
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

  it("write a degree as a Roman numeral, as a chord's is, and not as a digit", () => {
    expect(
      parseSource("set key C\nset octave 4\nplay piano: notes i-ii-iii-iv-v-vi-vii-i'-").notes.map(
        (e) => e.note.name,
      ),
    ).toEqual(["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"])
    // a digit is no degree, and the message gives the numerals, spaced where they would touch
    expect(firstError("play piano: notes 1---3---")).toBe(
      '"1---3---": degrees are Roman numerals, as a chord\'s are: i---iii---',
    )
    expect(firstError("play piano: notes 13--")).toBe(
      '"13--": degrees are Roman numerals, as a chord\'s are: i iii--',
    )
  })

  it("aren't written as the same figure twice, since a pattern repeats them", () => {
    expect(firstError("play piano: notes C4-C4-")).toBe(
      "piano: notes C4-C4- repeats C4-. Write piano: notes C4-: a pattern repeats it",
    )
    expect(firstError("notes riff = C4---D4---\nplay piano: notes riff riff")).toMatch(
      /repeats C4---D4---/,
    )
    expect(parseSource("play piano: notes C2-C2--").errors).toEqual([])
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

  it("are coloured as notes, with chords marking a chart", () => {
    const line = (text) =>
      highlightMusic(`play {\n  ${text}\n}`)[1]
        .filter((p) => p.s.trim())
        .map((p) => [p.c, p.s])
    expect(line("guitar.electric: notes F#-^E2_")).toEqual([
      ["tk-inst", "guitar.electric"],
      ["tk-punct", ":"],
      ["tk-directive-key", "notes"],
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
    expect(line("guitar: notes F#E-").slice(3)).toEqual([
      ["tk-note", "F#"],
      ["tk-error", "E"],
      ["tk-rest", "-"],
    ])
    // A name that isn't an instrument is marked where it's written.
    expect(line("epiano: chords C")[0]).toEqual(["tk-error", "epiano"])
  })

  it("keep every character of the source when colouring it", () => {
    const src =
      "notes riff = F---G F-F--\nplay {\n  guitar.electric: notes riff | ^E2 ~Bb_\n  piano: {\n    chords Am F|C G\n    notes C4-E4-\n  }\n}"
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
    const { per, rows } = grid(play("kick: x---", "guitar: notes F-_^G"))
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
    const { rows } = grid("play piano: {\n  notes C4 E4--\n  notes G4---\n}")
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
    expect(grid("play piano: notes C-E-G-E-").per).toBe(8)
    expect(grid("play piano: notes C_E-G-E-").per).toBe(16)
  })

  it("leaves chords to the chart above it", () => {
    const { rows } = grid(play("piano: chords Am F", "kick: 1 3"))
    expect(rows.map((r) => r.label)).toEqual(["kick"])
  })
})

describe("key", () => {
  const labels = (src) => {
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
    const run = (mode, suffix = "") =>
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
    const errs = (src) => parseCell(src, initialState()).errors.map((e) => e.msg)
    const msg = "wholeTone has 6 degrees, i to vi: there is no vii in it"
    expect(errs("set mode wholeTone\nplay piano: chords i|vii")).toEqual([`"vii": ${msg}`])
    expect(errs("set mode wholeTone\nplay piano: chords i|vii7")).toEqual([`"vii7": ${msg}`])
    expect(errs("set mode wholeTone\nplay piano: notes vi---vii---")).toEqual([
      `"vi---vii---": ${msg}`,
    ])
    expect(errs("set mode wholeTone\nplay piano: notes i-iii-v-vi-i'-")).toEqual([])
    // a degree of another note counts on major, so it has a 7th
    expect(errs("set mode wholeTone\nplay piano: notes vii of C3---")).toEqual([])
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
    const errs = (src) => parseCell(src, initialState()).errors.map((e) => e.msg)
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
    const errs = (src) => parseCell(src, initialState()).errors.map((e) => e.msg)
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
  const labels = (src) => {
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
    const errs = (src) => parseCell(src, initialState()).errors.map((e) => e.msg)
    expect(errs("play piano: chords vii°")[0]).toContain("viidim (viidim, viidim7, or viim7b5")
    expect(errs("play piano: chords vii°7")[0]).toContain("viidim7")
    expect(errs("play piano: chords viiø")[0]).toContain("viim7b5")
    expect(errs("chords turn = ii vii°")[0]).toContain("viidim")
    expect(highlightMusic("play piano: chords vii°")[0].some((p) => p.c === "tk-error")).toBe(true)
  })
})

describe("a numeral's octave", () => {
  const roots = (src) => {
    const p = parseCell(src, initialState())
    expect(p.errors).toEqual([])
    return p.outputs[0].chords.map((e) => e.chord.notesMidi[0])
  }
  const shape = (src) => roots(src).map((m, i, all) => m - all[0])
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
    const bass = (src) =>
      parseCell(src, initialState()).outputs[0].chords.map((e) => e.chord.bassMidi)
    expect(bass("set key E\nplay piano: chords i vi|i/G# iv/E")).toEqual([40, 49, 44, 40])
    // in C as before: F/C has C2 under F3
    expect(bass("play piano: chords iv/C F/C")).toEqual([36, 36])
  })
  it("leaves a chord symbol in the octave from C", () => {
    expect(roots("set key E\nplay piano: chords E|C#m|A|B")).toEqual([52, 49, 57, 59])
  })
  it("counts of from where its root sounds", () => {
    // V7 of V in A is a 5th above V's E4; a chain steps down by 5ths as it resolves
    expect(roots("set key A\nplay piano: chords v|v7 of v")).toEqual([64, 71])
    expect(roots("play piano: chords v7 of (v of v)|v7 of v|v7|i")).toEqual([69, 62, 55, 48])
  })
})

describe("the grooves library", () => {
  it("holds cells that parse, in two sections", async () => {
    const { GROOVES, SECTIONS, searchGrooves } = await import("../../js/grooves.ts")
    expect(SECTIONS).toEqual(["Transcriptions", "Harmony"])
    for (const g of GROOVES) {
      const p = parseCell(g.source, initialState())
      expect(p.errors, g.title).toEqual([])
      expect(p.outputs.length, g.title).toBeGreaterThan(0)
    }
    expect(searchGrooves("phrygian").map((g) => g.title)[0]).toBe("Phrygian walk")
    for (const mode of ["Lydian", "Mixolydian", "Dorian", "Minor", "Phrygian", "Locrian"]) {
      expect(searchGrooves(mode.toLowerCase()).map((g) => g.title)).toContain(`${mode} walk`)
    }
  })
})
