import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.js")

const BREAKDOWN = `-- What Happens Now? (Porcupine Tree), breakdown
time: 7/8
tempo: 120
step: 1/16

crash: 1
ride:  b . .
kick:  x . . x . . .
snare: . . . . x . .`

const firstError = (src) => parseSource(src).errors[0]?.msg
const labels = (src) => parseSource(src).chords.map((e) => e.label)

describe("lines", () => {
  it("ignores comments", () => {
    const p = parseSource("-- a note\npiano: C -- and another")
    expect(p.errors).toEqual([])
    expect(labels("-- a note\npiano: C -- and another")).toEqual(["C"])
  })

  it("points the old @ syntax at the new one", () => {
    expect(firstError("@key Am\npiano: C")).toMatch(/old syntax.*key: Am/)
  })

  it("explains the line shapes when a line is none of them", () => {
    expect(firstError("hello there")).toMatch(/chords on their own/)
  })

  it("suggests a close name", () => {
    expect(firstError("tempp: 120")).toMatch(/Did you mean tempo/)
  })

  it("explains the renamed kit pieces", () => {
    expect(firstError("ride bell: x . .")).toMatch(/ride, with b steps/)
  })

  it("allows one line per instrument in a block", () => {
    expect(firstError("kick: 1\nkick: 3")).toMatch(/already has a line/)
  })

  it("continues a line that starts with |", () => {
    expect(labels("guitar: Am | G\n      | F | E")).toEqual(["Am", "G", "F", "E"])
  })
})

describe("settings", () => {
  it("reads added-up time", () => {
    expect(parseSource("time: (3+4)/4\nkick: 7").blocks[0].barTicks).toBe(7 * 96)
  })

  it("asks for brackets on added-up time", () => {
    expect(firstError("time: 3+4/4")).toMatch(/\(3\+4\)\/4/)
  })

  it("applies to the whole block, wherever it's written", () => {
    expect(parseSource("kick: 1\ntempo: 60").blocks[0].tempo).toBe(60)
  })

  it("carries settings and words into the next cell", () => {
    const above = parseSource("tempo: 90\ntime: 7/8\npair = x .")
    const p = parseSource("hat: pair", above.state)
    expect(p.errors).toEqual([])
    expect(p.blocks[0].tempo).toBe(90)
    expect(p.blocks[0].time).toBe("7/8")
    expect(p.fromAbove).toEqual(["time 7/8", "tempo 90"])
  })

  it("keeps bars: to its own block", () => {
    expect(parseSource("bars: 3\nkick: 1\n\nsnare: 2").blocks.map((b) => b.bars)).toEqual([3, 1])
  })

  it("plays blocks one after another, each at its own tempo", () => {
    const p = parseSource("kick: 1\n\ntempo: 60\nsnare: 1")
    expect(p.blocks.map((b) => b.startSec)).toEqual([0, 2])
    expect(p.totalSec).toBe(6)
  })
})

describe("sound", () => {
  const instruments = (p) => [...new Set(p.chords.map((e) => e.instrument))]

  it("plays a line of just chords on piano by default", () => {
    const p = parseSource("Am F | C G")
    expect(p.errors).toEqual([])
    expect(instruments(p)).toEqual(["piano"])
    expect(p.chords.map((e) => e.label)).toEqual(["Am", "F", "C", "G"])
  })

  it("plays chord lines on the sound setting, wherever it is in the block", () => {
    expect(instruments(parseSource("sound: guitar\nAm F"))).toEqual(["guitar"])
    expect(instruments(parseSource("Am F\nsound: organ"))).toEqual(["organ"])
  })

  it("carries the sound into the cells below", () => {
    const above = parseSource("sound: guitar\nAm")
    const p = parseSource("C G", above.state)
    expect(instruments(p)).toEqual(["guitar"])
    expect(p.fromAbove).toContain("sound guitar")
  })

  it("lets chord lines next to each other carry on, a new bar per line", () => {
    const p = parseSource("Am E7 | G D\nF C | Dm E7")
    expect(p.errors).toEqual([])
    expect(p.blocks[0].bars).toBe(4)
    expect(p.chords.map((e) => e.label)).toEqual(["Am", "E7", "G", "D", "F", "C", "Dm", "E7"])
  })

  it("plays chord words on a line of their own", () => {
    expect(labels("intro = Am E7 | G D\nintro intro")).toEqual(["Am", "E7", "G", "D", "Am", "E7", "G", "D"])
  })

  it("puts the capo on guitar chords that have no line name", () => {
    const p = parseSource("sound: guitar\ncapo: 2\nC")
    expect(p.chords[0].capo).toBe(2)
  })

  it("layers another instrument named on its own line", () => {
    const p = parseSource("sound: piano\nC | G\nbass: C | G")
    expect(p.errors).toEqual([])
    expect(instruments(p).sort()).toEqual(["bass", "piano"])
  })

  it("won't play the same instrument from a named line and unnamed ones", () => {
    expect(firstError("sound: guitar\nC\nguitar: G")).toMatch(/lines without a name play guitar too/)
  })

  it("only takes chord instruments", () => {
    expect(firstError("sound: kick\nC")).toMatch(/kick: 1 3/)
    expect(firstError("sound: banjo\nC")).toMatch(/sound is one of/)
  })

  it("points inst at sound", () => {
    expect(firstError("inst: guitar\nC")).toMatch(/Use sound: guitar/)
  })
})

describe("repeat", () => {
  const hits = (p) => p.drumEvents.map((e) => `${e.inst}@${e.secStart}`)

  it("plays the lines indented under it again", () => {
    const p = parseSource("time: 7/8\nrepeat 2:\n  crash: 1 | . | .\n  ride: b . .\n  kick: x . . x . . .")
    expect(p.errors).toEqual([])
    expect(p.blocks).toHaveLength(1)
    expect(p.blocks[0].bars).toBe(3)
    expect(p.blocks[0].times).toBe(2)
    expect(p.totalSec).toBe(10.5)
    expect(p.drumEvents.filter((e) => e.inst === "crash").map((e) => e.secStart)).toEqual([0, 5.25])
  })

  it("stops at the first line that isn't indented under it", () => {
    const p = parseSource("repeat 2:\n  kick: 1\nsnare: 1")
    expect(p.errors).toEqual([])
    expect(p.blocks.map((b) => b.times)).toEqual([2, 1])
    expect(hits(p)).toEqual(["kick@0", "kick@2", "snare@4"])
  })

  it("nests with deeper indentation", () => {
    const p = parseSource(
      "time: 7/8\nrepeat 2:\n  repeat 3:\n    kick: x . . x . . .\n  crash: 1\n  snare: 2 4\nsnare: 1 2 3 4",
    )
    expect(p.errors).toEqual([])
    expect(p.blocks.map((b) => b.times)).toEqual([6, 2, 1])
    expect(p.totalSec).toBe(15.75)
    expect(p.drumEvents.filter((e) => e.inst === "crash").map((e) => e.secStart)).toEqual([5.25, 12.25])
  })

  it("repeats every block inside it, one after another", () => {
    const p = parseSource("repeat 2:\n  kick: 1\n\n  snare: 1")
    expect(hits(p)).toEqual(["kick@0", "snare@2", "kick@4", "snare@6"])
  })

  it("repeats a block as written instead of letting its lines run on", () => {
    expect(labels("repeat 2:\n  bars: 3\n  C | G")).toEqual(["C", "G", "C", "C", "G", "C"])
    expect(labels("bars: 6\nC | G")).toEqual(["C", "G", "C", "G", "C", "G"])
  })

  it("marks chords in the repeats so diagrams aren't shown twice", () => {
    const p = parseSource("repeat 3:\n  Am | F")
    expect(p.chords.filter((e) => !e.repeat).map((e) => e.label)).toEqual(["Am", "F"])
    expect(p.chords).toHaveLength(6)
  })

  it("carries settings from inside a repeat on after it", () => {
    const p = parseSource("repeat 2:\n  tempo: 60\n  C\nD")
    expect(p.blocks.map((b) => b.tempo)).toEqual([60, 60])
  })

  it("keeps | continuation lines with the line they continue", () => {
    const p = parseSource("repeat 2:\n  kick: 1\n  | 2")
    expect(p.errors).toEqual([])
    expect(p.drumEvents).toHaveLength(4)
  })

  it("counts tabs as indentation", () => {
    expect(parseSource("repeat 2:\n\tkick: 1").blocks[0].times).toBe(2)
  })

  it("doesn't mind a cell that's indented all over", () => {
    expect(parseSource("  kick: 1\n  snare: 2").errors).toEqual([])
  })

  it("needs the lines to repeat indented under it", () => {
    expect(firstError("repeat 2:\nkick: 1")).toMatch(/Indent the lines to repeat under repeat 2:/)
  })

  it("points the old repeat: setting at the new shape", () => {
    expect(firstError("repeat: 2\nkick: 1")).toMatch(/repeat 2: on its own line/)
  })

  it("flags an indented line with no repeat above it", () => {
    expect(firstError("kick: 1\n  snare: 2")).toMatch(/no repeat above it/)
  })

  it("takes a count from 1 to 16", () => {
    expect(firstError("repeat 0:\n  C")).toMatch(/from 1 to 16/)
    expect(firstError("repeat twice:\n  C")).toMatch(/from 1 to 16/)
    expect(firstError("repeat 17:\n  C")).toMatch(/from 1 to 16/)
  })

  it("refuses a cell over 10 minutes long", () => {
    const p = parseSource("tempo: 20\nrepeat 16:\n  repeat 16:\n    C")
    expect(p.errors[0].msg).toMatch(/over 10 minutes/)
    expect(p.events).toEqual([])
  })
})

describe("drums", () => {
  it("reads loop steps typed without spaces", () => {
    const hits = (src) => parseSource(src).drumEvents.map((e) => `${e.inst}${e.tick}${e.art}${e.accent}`)
    expect(parseSource("time: 7/8\ncrash: 1|.|.\nride: b..\nkick: x..x...\nsnare: ....x..").errors).toEqual([])
    expect(hits("ride: b..\nkick: X..x")).toEqual(hits("ride: b . .\nkick: X . . x"))
    expect(hits("pair = X.x.\nhat: pair pair")).toEqual(hits("hat: X . x . X . x ."))
  })

  it("keeps Bb a chord in a chord word, though B and b are steps too", () => {
    expect(labels("intro = Bb F\nintro")).toEqual(["Bb", "F"])
  })

  it("plays the What Happens Now? breakdown for 3 bars", () => {
    const p = parseSource(BREAKDOWN)
    expect(p.errors).toEqual([])
    expect(p.blocks).toHaveLength(1)
    expect(p.blocks[0].bars).toBe(3)
    expect(p.blocks[0].res).toBe(4) // counted 1 e & a
    const count = (inst) => p.drumEvents.filter((e) => e.inst === inst).length
    expect(count("ride")).toBe(14)
    expect(count("kick")).toBe(12)
    expect(count("snare")).toBe(6)
    expect(count("crash")).toBe(3)
    expect(p.drumEvents.filter((e) => e.inst === "ride").every((e) => e.art === "bell")).toBe(true)
    expect(p.totalSec).toBeCloseTo(5.25)
  })

  it("counts beats in quarter notes", () => {
    const p = parseSource("kick: 1 2& 3e 4a")
    expect(p.drumEvents.map((e) => e.tick / 96)).toEqual([0, 1.5, 2.25, 3.75])
  })

  it("rejects beats past the end of the bar", () => {
    expect(firstError("time: 7/8\nkick: 4&")).toMatch(/ends on 4e/)
  })

  it("reads modifier words after beats", () => {
    const p = parseSource("hat: 1 accent 2 open 2& pedal\nride: 3 bell\nsnare: 4 ghost double")
    expect(p.errors).toEqual([])
    const hat = p.drumEvents.filter((e) => e.inst === "hat")
    expect(hat.map((e) => e.art)).toEqual(["hit", "open", "pedal"])
    expect(hat[0].vel).toBe(1)
    const snare = p.drumEvents.filter((e) => e.inst === "snare")
    expect(snare).toHaveLength(2) // the double adds a second stroke
    expect(snare[0].vel).toBe(0.3)
  })

  it("keeps open, pedal and bell on the right drum", () => {
    expect(firstError("snare: 1 open")).toMatch(/open only works on hat/)
    expect(firstError("hat: b . .")).toMatch(/bell only works on ride/)
  })

  it("reads loop letters", () => {
    const p = parseSource("hat: X o p g")
    expect(p.errors).toEqual([])
    const first = p.drumEvents.slice(0, 4)
    expect(first.map((e) => e.art)).toEqual(["hit", "open", "pedal", "hit"])
    expect(first.map((e) => e.vel)).toEqual([1, 0.7, 0.7, 0.3])
  })

  it("won't mix beats and loop steps on one line", () => {
    expect(firstError("kick: 1 x")).toMatch(/loop step/)
  })

  it("expands words in loops", () => {
    const p = parseSource("pair = X . x .\nhat: pair pair")
    expect(p.errors).toEqual([])
    expect(p.drumEvents.slice(0, 4).map((e) => e.tick / 24)).toEqual([0, 2, 4, 6])
  })

  it("asks for bars: when lines take too long to line up", () => {
    expect(firstError("kick: x . . . .\nsnare: x . . . . . .\nhat: x . . . . . . . . . .")).toMatch(
      /Add bars:/,
    )
  })
})

describe("chords", () => {
  it("lets a chord word cover whole bars", () => {
    const p = parseSource("intro = Am E7 | G D\nguitar: intro intro")
    expect(p.chords.map((e) => e.label)).toEqual(["Am", "E7", "G", "D", "Am", "E7", "G", "D"])
  })

  it("doesn't mistake an undefined word for a Roman numeral", () => {
    expect(firstError("guitar: intro")).toMatch(/isn't a word defined above/)
  })

  it("uses case for Roman numeral quality", () => {
    expect(labels("key: C\npiano: I ii IV v")).toEqual(["C", "Dm", "F", "Gm"])
  })

  it("plays bVII as a major chord", () => {
    expect(labels("key: C\npiano: bVII")).toEqual(["Bb"])
  })

  it("makes V major in a minor key", () => {
    expect(labels("key: Am\npiano: V v")).toEqual(["E", "Em"])
  })

  it("spells diminished chords", () => {
    expect(labels("key: C\npiano: vii° viio viiø7 vii°7")).toEqual(["Bdim", "Bdim", "Bm7b5", "Bdim7"])
  })

  it("repeats a shorter chord line to fill the block", () => {
    const p = parseSource("piano: C | G\nkick: 1 | 1 | 1 | 1")
    expect(p.chords.map((e) => e.label)).toEqual(["C", "G", "C", "G"])
    expect(p.chords.filter((e) => !e.repeat)).toHaveLength(2)
  })
})
