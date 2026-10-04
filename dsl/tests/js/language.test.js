import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.js")

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

  it("points -- comments at //", () => {
    expect(firstError("-- what happens now\nplay kick: x")).toMatch(/Comments start with \/\//)
    expect(firstError("play kick: x -- four on the floor")).toMatch(/Comments start with \/\//)
  })

  it("keeps -- inside steps", () => {
    expect(parseSource("play snare: ----x--").errors).toEqual([])
  })

  it("points the old @ syntax at the new one", () => {
    expect(firstError("@key Am")).toMatch(/old syntax.*e\.g\. key Am/)
  })

  it("suggests a close name", () => {
    expect(firstError("tempp 120")).toMatch(/isn't a setting. Did you mean tempo/)
    expect(firstError("play kik: x-x-")).toMatch(/isn't an instrument. Did you mean kick/)
  })

  it("explains the renamed kit pieces", () => {
    expect(firstError("play ride bell: x--")).toMatch(/is now ride\.bell/)
    expect(firstError("play open hat: x")).toMatch(/is now hat\.open/)
  })

  it("puts chords on a chords: line", () => {
    expect(firstError("play Am F|C G")).toMatch(/chords: Am F\|C G/)
    expect(firstError("play guitar: Am F")).toMatch(/sound guitar picks/)
  })

  it("has no continuation lines", () => {
    expect(anyError(play("chords: Am|F", "|C G"))).toMatch(/end of the line above/)
  })

  it("gives each instrument one line in a block", () => {
    expect(firstError(play("kick: x", "kick: x-"))).toMatch(
      /kick already has a line in this play. To layer it, put its lines in a block: kick: \{ \.\.\. \}/,
    )
    expect(firstError(play("chords: Am", "chords: F"))).toMatch(
      /chords already has a line in this play. Chords play one at a time, so put them all on one line/,
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
    expect(labels("chords verse = Am F|C G\nplay chords: verse")).toEqual(["Am", "F", "C", "G"])
    expect(firstError("bpm = 120")).toMatch(/Use tempo 120/)
    expect(firstError("speed = 120")).toMatch(/"speed" isn't a setting. Settings: time, tempo/)
  })

  it("keeps the colon for an instrument and what it plays", () => {
    expect(firstError("kick = x--x")).toMatch(
      /kick is an instrument, so it takes a colon: kick: x--x/,
    )
    expect(firstError("guitar = Am F")).toMatch(/guitar is a sound. Use sound guitar/)
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

  it("points older ways of naming a pattern at pattern name =", () => {
    // The pattern still gets its name, so the one mistake gives one message.
    expect(allErrors("pattern groove {\n  kick: x\n}\nplay groove")).toEqual([
      "A pattern gets its name with =: pattern groove = { ... }",
    ])
    expect(allErrors("pattern g 3 bars {\n  kick: x-\n}")).toEqual([
      "A pattern gets its name with =: pattern g = 3 bars { ... }",
    ])
    expect(allErrors("section groove {\n  kick: x\n}")).toEqual([
      "A pattern gets its name with =: pattern groove = { ... }",
    ])
    expect(firstError("def groove {\n  kick: x\n}")).toMatch(/pattern groove = \{ \.\.\. \}/)
  })
})

describe("types", () => {
  it("go in front of a name: steps, chords or pattern", () => {
    const p = parseSource(
      "steps pair = X-x-\nchords verse = Am F|C G\npattern beat = {\n  chords: verse\n  hat: pair\n}\nplay beat",
    )
    expect(p.errors).toEqual([])
    expect(p.chords.map((e) => e.label)).toEqual(["Am", "F", "C", "G"])
    expect(hits(p.outputs[0], "hat")).toHaveLength(16)
  })

  it("are asked for when a name has none, with the line to write", () => {
    expect(allErrors("verse = Am F|C G")).toEqual([
      "Say what verse is. Put its type in front: chords verse = Am F|C G",
    ])
    expect(allErrors("pair = X-x-")).toEqual([
      "Say what pair is. Put its type in front: steps pair = X-x-",
    ])
    // The name still gets defined, so there's one message, not one for each use.
    expect(allErrors("groove = {\n  kick: x\n}\nplay groove")).toEqual([
      "Say what groove is. Put its type in front: pattern groove = { ... }",
    ])
    expect(allErrors("fill = snare: xxxx")).toEqual([
      "Say what fill is. Put its type in front: pattern fill = snare: xxxx",
    ])
  })

  it("decide what G and D are, which could be steps or chords", () => {
    expect(labels("chords verse = G D\nplay chords: verse")).toEqual(["G", "D"])
    expect(hits(parseSource("steps hard = D\nplay snare: hard").outputs[0], "snare")).toHaveLength(
      1,
    )
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
      /Am F is chords, not a pattern. Write chords verse = Am F, or give them an instrument: pattern verse = chords: Am F/,
    )
    expect(firstError("steps g = { kick: x }")).toMatch(
      /That's a pattern, not steps. Write pattern g = \.\.\./,
    )
    expect(firstError("chords g = 2 bars { chords: C }")).toMatch(/That's a pattern, not chords/)
    expect(firstError("chords verse = Am Zz")).toMatch(/"Zz" isn't a chord I know/)
    expect(firstError("steps pair = x-q-")).toMatch(/"x-q-" isn't a step. Use x \(hit\)/)
  })

  it("only go where their type goes", () => {
    expect(firstError("chords verse = Am|F\nplay verse")).toMatch(
      /verse is chords, so it goes on the chords line: chords: verse/,
    )
    expect(firstError("steps pair = x-x-\nplay pair")).toMatch(
      /pair is steps, so it goes on a drum's line: hat: pair/,
    )
    expect(firstError("pattern fill = { snare: x-x- }\nplay chords: fill")).toMatch(
      /fill is a pattern, so it goes on a line of its own/,
    )
    expect(firstError("pattern fill = { snare: x-x- }\nplay hat: fill")).toMatch(
      /fill is a pattern, so it goes on a line of its own/,
    )
    expect(firstError("chords verse = Am|F\nplay hat: verse")).toMatch(
      /verse is chords, so it goes on the chords: line, not on a drum's/,
    )
    expect(firstError("steps pair = x-x-\nplay chords: pair")).toMatch(
      /pair is steps, so it goes on a drum's line, not on chords:/,
    )
    expect(firstError("chords verse = Am F\nplay kick: 1 verse")).toMatch(
      /verse is chords, which don't go in a list of beats/,
    )
  })

  it("build on names of the same type", () => {
    expect(labels("chords aa = Am F\nchords bb = aa C G\nplay chords: bb")).toEqual([
      "Am",
      "F",
      "C",
      "G",
    ])
    const o = parseSource("steps pair = X-x-\nsteps four = pair pair\nplay hat: four").outputs[0]
    expect(hits(o, "hat").map((e) => e.vel)).toEqual([1, 0.7, 1, 0.7])
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

  it("don't include loop, which the language doesn't have", () => {
    expect(firstError("steps seven = loop x--x---")).toMatch(
      /loop isn't part of steps, and isn't needed: everything in a pattern repeats until it ends/,
    )
    expect(firstError("chords verse = loop Am F")).toMatch(/loop isn't part of chords/)
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
    // chords with no colon is still a chords line missing its colon
    expect(firstError("play chords Am F")).toMatch(/Put a colon after chords: chords: Am F/)
  })

  it("can't be used as names", () => {
    expect(firstError("steps = x-x-")).toMatch(/steps needs a name after it: steps riff = /)
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
    expect(parseSource("sound guitar\ncapo 1+1\nplay chords: C").chords[0].capo).toBe(2)
  })

  it("measures steps as fractions of a whole note", () => {
    expect(durations("step 1/8\nplay hat: xxxxxxxx")).toEqual([2])
    expect(durations("step 1/12\nplay hat: xxx")).toEqual([0.5])
    expect(durations("step 3/16\nplay hat: xx")).toEqual([0.75])
    expect(durations("step 0.125\nplay hat: xxxxxxxx")).toEqual([2])
  })

  it("explains numbers that don't work", () => {
    expect(firstError("tempo fast")).toMatch(/tempo is quarter notes per minute/)
    expect(firstError("step 1/7")).toMatch(/step is how long one step lasts/)
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
    const one = "pattern one = { chords: C }\n"
    expect(durations(one + play("chords: F|G|A", "one"))).toEqual([6])
    expect(durations(one + play("crash: 1", "one one one one"))).toEqual([8])
  })

  it("explains mistakes in play lines", () => {
    expect(firstError("play nope")).toMatch(
      /"nope" isn't defined. Name it first: pattern nope = \{ \.\.\. \}/,
    )
    expect(firstError("pattern a = { chords: C }\nplay nope")).toMatch(
      /"nope" isn't defined. Patterns so far: a/,
    )
    expect(firstError("pattern a = { chords: C }\nplay (a")).toMatch(/missing its \)/)
  })

  it("refuses an output over 10 minutes long", () => {
    const p = parseSource("tempo 20\npattern a = { chords: C }\nplay 64 bars a")
    expect(p.errors[0].msg).toMatch(/over 10 minutes/)
    expect(p.outputs).toEqual([])
  })
})

describe("playing in order", () => {
  const AB = "pattern a = { chords: C }\npattern b = { chords: G }\n"

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
    expect(firstError(AB + "play { chords: F } * 2")).toMatch(/4 bars \{ \.\.\. \}/)
    expect(firstError(AB + "play a x2")).toMatch(/To repeat, put a length in front: 4 bars groove/)
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
    expect(durations("pattern a = { chords: C }\n" + play("tempo 60", "a") + "\nplay a")).toEqual([
      4, 2,
    ])
  })

  it("use the settings in effect where they're played", () => {
    expect(durations("pattern a = { chords: C }\nplay a\ntempo 60\nplay a")).toEqual([2, 4])
    expect(
      durations("pattern slow = {\n  tempo 60\n  chords: C\n}\nplay chords: G\nplay slow"),
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
      const p = parseSource("pattern v = { chords: Am|F }\n" + again)
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
    expect(firstError("pattern a = {\n  chords: Am\n  chords: F\n}")).toMatch(
      /chords already has a line in a/,
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
    expect(firstError("pattern loop = { kick: x }")).toMatch(/loop already means something/)
    expect(firstError("pattern x2 = { kick: x }")).toMatch(/x2 already means something/)
    expect(firstError("pattern kick = { kick: x }")).toMatch(/kick is an instrument/)
    expect(firstError("pattern tempo = { kick: x }")).toMatch(/tempo already means something/)
    expect(firstError("tempo = { kick: x }")).toMatch(/tempo already means something/)
  })

  it("hold one thing at a time", () => {
    expect(labels("pattern a = { chords: C }\npattern a = { chords: G }\nplay a")).toEqual(["G"])
    // Given again with another type, the name means the new thing.
    expect(labels("steps riff = x-x-\nchords riff = Am F\nplay chords: riff")).toEqual(["Am", "F"])
  })

  it("let a pattern be named like a chord", () => {
    expect(labels("pattern A = { chords: C }\npattern B = { chords: G }\nplay A B A")).toEqual([
      "C",
      "G",
      "C",
    ])
    expect(
      labels("pattern A = { chords: C }\npattern form = { A A }\n" + play("chords: A", "form")),
    ).toEqual(["A", "C", "C"])
  })

  it("keep names for steps and chords clear of chords and steps", () => {
    expect(firstError("chords Verse = Am F")).toMatch(
      /Names for steps and chords are lowercase: chords verse = Am F/,
    )
    expect(firstError("chords q = Am F")).toMatch(/at least two letters/)
    expect(firstError("chords vi = Am F")).toMatch(/vi is a chord/)
  })
})

describe("lengths", () => {
  const AB = "pattern a = { chords: C }\npattern b = { chords: G }\n"

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
    expect(labels("play 1 bars { chords: C|G }")).toEqual(["C"])
    expect(durations("play 3 bars { chords: C|G }")).toEqual([6])
    expect(labels("play 3 bars { chords: C|G }")).toEqual(["C", "G"])
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
    const poly = "pattern poly = {\n  kick: x---\n  floor: x--\n  snare: x----\n}\nplay poly"
    expect(durations(poly)).toEqual([7.5])
    expect(durations("play kick: x--")).toEqual([0.375])
    const odd =
      "pattern odd = {\n  kick: x------\n  snare: x--------\n  hat: x----------\n  tom: x------------\n}\nplay odd"
    expect(firstError(odd)).toMatch(
      /What's in odd only lines up again after more than 64 bars. Say how long it is: pattern odd = 4 bars \{/,
    )
  })

  it("don't use for, which would read as a repeat", () => {
    expect(firstError("play for 2 bars")).toMatch(/without for: play 2 bars \{ \.\.\. \}/)
    expect(firstError("pattern g = { kick: x }\nplay g for 3 bars")).toMatch(
      /without for: 3 bars g/,
    )
    expect(firstError("pattern g = {\n  kick: x\n} for 3 bars")).toMatch(/pattern g = 3 bars \{/)
    expect(firstError("play {\n  kick: x\n} for 2 bars")).toMatch(/play 2 bars \{ \.\.\. \}/)
    expect(firstError("play kick: x--- for 2 bars")).toMatch(
      /A length goes in front of what's played/,
    )
    expect(firstError("for = { kick: x }")).toMatch(/for already means something/)
  })

  it("explain lengths that don't work", () => {
    expect(firstError("bars: 3")).toMatch(/pattern groove = 3 bars \{, or play 3 bars \{ \.\.\. \}/)
    expect(firstError("play 0 bars { kick: x- }")).toMatch(/A length is a number of bars/)
    expect(firstError("play 3 bars")).toMatch(/play 3 bars of what\?/)
    expect(firstError("pattern g = { kick: x }\nplay 3 g")).toMatch(/needs bars after it/)
    expect(firstError("pattern g = { kick: x } 3 bars")).toMatch(/pattern g = 3 bars \{/)
    expect(firstError("pattern g = { kick: x } nope")).toMatch(/"nope" isn't defined/)
  })
})

describe("what repeats has to fit", () => {
  const GROOVE = "time 7 over 8\npattern groove = 3 bars {\n  ride.bell: x--\n  kick: x--x---\n}\n"
  const POLY = "  kick: x---\n  floor: x--\n  snare: x----"

  it("a line fits its pattern a whole number of times, or it's a mistake", () => {
    expect(parseSource("pattern g = 3 bars { kick: x-- }\nplay g").errors).toEqual([])
    expect(allErrors("pattern g = 4 bars { kick: x-- }\nplay g")).toEqual([
      "The kick line is 3 steps long, which doesn't fit 4 bars a whole number of times. It lines up every 3 bars",
    ])
    expect(allErrors("pattern g = 2 bars {\n  chords: Am F|C G\n  hat: x-x-x-\n}\nplay g")).toEqual(
      [
        "The hat line is 6 steps long, which doesn't fit 2 bars a whole number of times. The things repeating here line up every 6 bars",
      ],
    )
    expect(allErrors("pattern hats = { hat: x--- }\n" + play("kick: x-x-x-x-x-", "hats"))).toEqual([
      "hats is 4 steps long, which doesn't fit 10 steps a whole number of times. It lines up every bar",
    ])
  })

  it("says where several things line up together", () => {
    expect(allErrors(`pattern poly = 4 bars {\n${POLY}\n}\nplay poly`)).toEqual([
      "The floor line is 3 steps long, which doesn't fit 4 bars a whole number of times. The things repeating here line up every 15 bars",
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
    expect(allErrors(GROOVE + "play 4 bars groove")).toEqual([
      "groove is 3 bars long, which doesn't fit 4 bars a whole number of times. It lines up every 3 bars",
    ])
    expect(firstError(GROOVE + "play 4 bars {\n  crash: 1\n  groove\n}")).toMatch(
      /groove is 3 bars long, which doesn't fit 4 bars/,
    )
    expect(firstError("play 2 bars {\n  { kick: x-x-x- }\n}")).toMatch(
      /This pattern is 6 steps long, which doesn't fit 2 bars/,
    )
    expect(
      firstError("pattern a = { chords: C }\npattern b = { chords: G }\nplay 3 bars (a b)"),
    ).toMatch(/This group is 2 bars long, which doesn't fit 3 bars/)
    expect(firstError("pattern c = 6 bars {\n  kick: 1\n  chords: C|G|F|C|G\n}\nplay c")).toMatch(
      /The chords line is 5 bars long, which doesn't fit 6 bars a whole number of times/,
    )
    // A pattern at its own tempo is measured against the tempo of what it's in.
    const own = (tempo) => `pattern own = {\n  tempo ${tempo}\n  kick: x---\n}\nplay 1 bars own`
    expect(hits(parseSource(own(240)).outputs[0], "kick")).toHaveLength(8)
    expect(firstError(own(100))).toMatch(
      /own sets its own tempo, and doesn't fit 1 bar a whole number of times/,
    )
  })
})

describe("blocks without a name", () => {
  const BODY = "  kick: x---\n  floor: x--\n  snare: x----"
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
    expect(anyError("play {\n  chords: { Am }\n}")).toMatch(
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
  const AB = "pattern a = { chords: C }\npattern b = { chords: G }\n"

  it("repeats every line in a pattern until it ends", () => {
    const o = parseSource(
      "pattern beat = 2 bars {\n  kick: x---\n  snare: 2 4\n  chords: C\n}\nplay beat",
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
      hits(parseSource(play("chords: C|G|F|C", "snare: 2 4")).outputs[0], "snare"),
    ).toHaveLength(2)
  })

  it("repeats a pattern on a line of its own until the play ends", () => {
    const o = parseSource("pattern beat = { kick: x--- }\n" + play("chords: C|G", "beat"))
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

  it("has no loop, and says what to write instead", () => {
    expect(firstError("pattern g = { kick: loop x- }")).toMatch(
      /loop isn't needed: everything in a pattern repeats until the pattern ends/,
    )
    expect(firstError("play 2 bars kick: loop x---")).toMatch(
      /a play's own lines play once. To repeat a line, put it in a pattern/,
    )
    expect(firstError(AB + "play 4 bars loop a")).toMatch(
      /a length in front repeats it for that long: 6 bars groove/,
    )
    expect(firstError(AB + "play loop a")).toMatch(/a pattern on a line of its own repeats/)
    expect(firstError("play loop kick: x---")).toMatch(/loop isn't needed/)
    expect(firstError("play kick: x--- loop x-")).toMatch(/loop isn't needed/)
  })
})

describe("settings", () => {
  it("apply from where they're written", () => {
    expect(durations("play chords: C\ntempo 60\nplay chords: C")).toEqual([2, 4])
  })

  it("carry on into the cells below, and say so", () => {
    const above = parseSource("tempo 90\nsound guitar").state
    const p = parseSource("play chords: C", above)
    expect(p.chords[0].instrument).toBe("guitar")
    expect(p.fromAbove).toEqual(["tempo 90", "sound guitar"])
  })

  it("only take chord instruments for sound", () => {
    expect(firstError("sound kick")).toMatch(/kick: 1 3/)
    expect(firstError("sound banjo")).toMatch(/sound is one of/)
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
    expect(sound("play snare: {\n  x---\n  2 beats rest, X---, 1 beats rest\n}")).toBe(
      sound("play snare: x---x---X---x---"),
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
        "time 7 over 8\npattern g = {\n  kick: x--x---\n  hat: X-x-\n  bar 2 hat.pedal: 4\n}\nplay g",
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
    const o = parseSource("pattern g = {\n  snare: x---\n  bar 2 snare: X---\n}\nplay g").outputs[0]
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
  hat: X-x-
  hat.open: ------------------------X---
  hat.pedal: --------------------------x-`)
    const short = groove(`  kick: x--x---
  snare: 2e 4
  snare.ghost: --x----
  hat: X-x-
  bar 2 {
    snare.ghost: ---- ---- dd-- --
    hat.open:    ---- ---- --X- --
    hat.pedal:   4
  }`)
    expect(played(short)).toEqual(played(long))
    const sugar = groove(`  kick: x--x---
  snare: 2e 4
  snare.ghost: --x----
  hat: X-x-
  bar 2 {
    snare.ghost: 2 beats rest, dd, 1 beats rest
    hat.open:    2 beats rest, --X-, 2 steps rest
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
    expect(firstError(play("kick: x", "bar 2 hat.open: ---- ---- --X-"))).toMatch(
      /The hat.open line is 12 steps long, which doesn't fit 1 bar/,
    )
    expect(firstError("pattern g = {\n  bar 2 nope\n}")).toMatch(/"nope" isn't defined/)
    expect(firstError("pattern bar = { kick: x }")).toMatch(/bar already means something/)
  })
})

describe("drums", () => {
  it("read steps: x hit, X accent, g ghost, d double, - nothing", () => {
    const o = parseSource("play tom: Xxgd-").outputs[0]
    expect(o.drumEvents.filter((e) => !e.hidden).map((e) => e.vel)).toEqual([1, 0.7, 0.3, 0.7])
    expect(o.drumEvents.filter((e) => e.hidden)).toHaveLength(1)
  })

  it("read beats: plain hits on those beats of every bar", () => {
    const o = parseSource(play("crash: 1", "tom: 2 4a")).outputs[0]
    expect(hits(o, "crash").map((e) => e.secStart)).toEqual([0])
    expect(hits(o, "tom").map((e) => [e.secStart, e.vel])).toEqual([
      [0.5, 0.7],
      [1.875, 0.7],
    ])
    const seven = "time 7 over 8\n"
    expect(sound(seven + "pattern g = { snare: 2e 4 }\nplay 2 bars g")).toBe(
      sound(seven + "play snare: -----x------x------x------x-"),
    )
  })

  it("keep beats to plain hits in one bar, and show how to write the rest", () => {
    const seven = "time 7 over 8\n"
    expect(firstError(seven + "play hat.open: -|3& X")).toMatch(
      /Beats are plain hits in one bar, with nothing else on the line. Write this as bar 2 hat.open: ---- ---- --X- --/,
    )
    expect(firstError(seven + "play hat.pedal: -|4")).toMatch(/Write this as bar 2 hat.pedal: 4/)
    expect(firstError("play crash: 1|-|-")).toMatch(/Write this as bar 1 crash: 1/)
    expect(firstError("play tom: 2 accent 4 ghost")).toMatch(
      /Write this as tom: ---- X--- ---- g---/,
    )
    expect(firstError("play kick: 1 3|1 2& 3")).toMatch(
      /Write this as kick: x--- ---- x--- ---- \| x--- --x- x--- ----/,
    )
    // A layer in a block of steps has no bar to name, so it's drawn in full.
    expect(firstError(seven + "play snare.ghost: {\n  --x----\n  -|3 dd\n}")).toMatch(
      /Write this as ---- ---- ---- -- \| ---- ---- dd-- --/,
    )
    expect(firstError("steps burst = dd\nplay snare.ghost: 3 burst")).toMatch(
      /To say how a hit is played, draw the bar in steps \(--X-\). For one bar only, name it: bar 2 snare.ghost: 2 4/,
    )
    expect(firstError("play snare: 2 2")).toMatch(/2 is on this line twice/)
  })

  it("are steps too, so they can be a layer or a name", () => {
    expect(sound("play snare: {\n  2 4\n  ------x-\n}")).toBe(sound("play snare: ----x-x-----x-x-"))
    expect(sound("steps backbeat = 2 4\nplay snare: backbeat")).toBe(
      sound("play snare: ----x-------x---"),
    )
    expect(firstError("backbeat = 2 4")).toMatch(/Put its type in front: steps backbeat = 2 4/)
    expect(firstError("step 1/8\nsteps odd = 2e")).toMatch(
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
    const o = parseSource(play("hat: X-x-X-x-", "hat.open: ----X---")).outputs[0]
    expect(hits(o, "hat").map((e) => e.secStart / 0.125)).toEqual([0, 2, 6])
    expect(hits(o, "hat.open").map((e) => e.secStart / 0.125)).toEqual([4])
    // the same when the open hit comes from another pattern played alongside
    const two = "pattern hats = { hat: X-x- }\npattern lift = { hat.open: ----X--- }\n"
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
    expect(hits(parseSource("play snare.rim: X").outputs[0], "snare.rim")[0].vel).toBe(1)
  })

  it("keep the snare's ghost notes on snare.ghost", () => {
    expect(firstError("play snare: --g-")).toMatch(
      /the snare's ghost notes go on a line of their own: snare\.ghost: --x-/,
    )
    expect(firstError("play snare: 2 4 ghost")).toMatch(/snare\.ghost: --x-/)
    expect(firstError("play snare.ghost: X-")).toMatch(
      /snare\.ghost hits are ghost notes, so they can't be accented/,
    )
    expect(firstError("play snare.ghost: 2 accent")).toMatch(/can't be accented/)
    expect(firstError("play snare.ghost: g-")).toMatch(
      /every hit on snare\.ghost is a ghost note already, so write x/,
    )
  })

  it("point old rests and letters at the new ones", () => {
    expect(firstError("play kick: x..x")).toMatch(/use - for a rest/)
    expect(firstError("play ride: b--")).toMatch(/ride\.bell: x--/)
    expect(firstError("play hat: x-x-x-xo")).toMatch(/hat\.open: x--/)
    expect(firstError("play hat: 4 open")).toMatch(/hat\.open: 1/)
    expect(firstError("play snare.flam: 1")).toMatch(/Drums with a second sound/)
  })

  it("won't accent a ghost note", () => {
    expect(firstError("play hat: G")).toMatch(/ghost note can't be accented/)
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
    expect(sound("play snare: {\n  x-x-\n  --X-\n}")).toBe(sound("play snare: x-X-"))
    expect(sound("play snare: {\n  X-x-\n  x---\n}")).toBe(sound("play snare: x-x-"))
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
    const below = parseSource(play("{ snare: X--- }", "snare: x-x-")).outputs[0]
    expect(hits(below, "snare").map((e) => [e.secStart / 0.125, e.accent])).toEqual([
      [0, false],
      [2, false],
    ])
    const above = parseSource(play("snare: x-x-", "{ snare: X--- }")).outputs[0]
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
    expect(parseSource("play snare.ghost: {\n  --x-\n  --g-\n}").errors).toEqual([
      { line: 3, msg: '"g": every hit on snare.ghost is a ghost note already, so write x' },
    ])
    expect(firstError("play chords: {\n  Am F\n}")).toMatch(
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

  it("has no kit line that names drums by letter", () => {
    expect(firstError("play drums: loop k--ks--")).toMatch(
      /Each drum gets its own line: kick: x--x---, snare: ----x--/,
    )
    expect(firstError("play kick: k--k")).toMatch(/isn't a step. Use x \(hit\)/)
  })
})

describe("chords", () => {
  it("play on sound, piano unless set", () => {
    expect(parseSource("play chords: C").chords[0].instrument).toBe("piano")
    expect(parseSource("sound organ\nplay chords: C").chords[0].instrument).toBe("organ")
  })

  it("read Roman numerals in the key", () => {
    expect(labels("key C\nplay chords: I vi|IV V7|bVII IV|ii7 vii°")).toEqual([
      "C",
      "Am",
      "F",
      "G7",
      "Bb",
      "F",
      "Dm7",
      "Bdim",
    ])
    expect(labels("key Am\nplay chords: V v")).toEqual(["E", "Em"])
  })

  it("keep / in a chord's name, since its two sides aren't numbers", () => {
    expect(labels("play chords: C/E F")).toEqual(["C/E", "F"])
  })

  it("take chords by name", () => {
    expect(labels("chords verse = Am E7|G D\nplay chords: verse verse")).toEqual([
      "Am",
      "E7",
      "G",
      "D",
      "Am",
      "E7",
      "G",
      "D",
    ])
    expect(labels("chords intro = Bb F\nplay chords: intro")).toEqual(["Bb", "F"])
  })

  it("give steps by name to drums", () => {
    const o = parseSource("steps pair = X-x-\nplay hat: pair pair").outputs[0]
    expect(hits(o, "hat").map((e) => e.vel)).toEqual([1, 0.7, 1, 0.7])
  })
})
