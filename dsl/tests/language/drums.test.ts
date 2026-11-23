import { describe, it, expect, vi } from "vitest"
import { play, firstError, notes, hits, durations, played, sound } from "./helpers.ts"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../src/music-engine.ts")
const { LANES } = await import("../../src/language.ts")
const { gridRows } = await import("../../src/grid.ts")
const { prepareKit } = await import("../../src/drums.ts")

describe("kit step words", () => {
  it("counts silence and repeats groups in a finite block", () => {
    expect(sound("play snare: 8*- dd 6*-")).toBe(sound("play snare: --------dd------"))
    expect(sound("steps pair = x-\nplay hat: 4*pair dd--")).toBe(sound("play hat: x-x-x-x-dd--"))
    expect(sound("play hat: 2*(x- --^) -")).toBe(sound("play hat: x---^x---^-"))
    expect(sound("play snare: { x---, 8*- ^--- 4*- }")).toBe(sound("play snare: x-------^-------"))
  })
  it("rejects kit lengths, beats, rest and commas", () => {
    for (const value of ["2 beats rest, dd", "2 4", "rest", "x-, --^", "1 bars x-"]) {
      expect(parseSource("play snare: " + value).errors.length, value).toBeGreaterThan(0)
    }
  })
  it("requires a whole repeat count of at least two and bounds expansion", () => {
    for (const value of ["0*x", "1*x", "2.5*x", "2*()", "2*(x-", "999999999*x", "2*(...x)"]) {
      expect(parseSource("play hat: " + value).errors.length, value).toBeGreaterThan(0)
    }
    expect(parseSource("pattern beat = { hat: 8*x- }\nplay beat").drumEvents).toHaveLength(8)
  })
})

describe("automatic trailing silence", () => {
  it("pads short lines, including named values, without a fill", () => {
    expect(sound("steps pickup = -xx\nplay({ kick: x---x-x-, snare.ghost: pickup })")).toBe(
      sound(play("kick: x---x-x-", "snare.ghost: -xx")),
    )
    expect(durations("play(snare.ghost: -xx)")).toEqual([2])
    expect(durations("play(snare.ghost: -xx) for 2 bars")).toEqual([4])
  })
  it("rejects removed rest fills with an explanation", () => {
    for (const source of [
      "play(snare: -xx ...-)",
      "steps pickup = -xx ...-",
      "play({ piano: notes 1 ..._ })",
    ])
      expect(firstError(source)).toMatch(/automatically fill with silence/)
  })
  it("still supports musical fills that need an explicit end", () => {
    expect(firstError("play(snare: ...x-)")).toMatch(/nothing says how long/)
    expect(durations("play(snare: ...x-) for 2 bars")).toEqual([4])
    expect(firstError("steps pickup = -xx ...x")).toMatch(/length of their own/)
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

describe("hits spread over steps: 3 in 8", () => {
  it("spreads hits and composes with neighboring step words", () => {
    expect(sound("play kick: 3 in 8")).toBe(sound("play kick: x--x--x-"))
    expect(sound("play kick: 5 in 8")).toBe(sound("play kick: x-xx-xx-"))
    expect(sound("play kick: x-- 3 in 8")).toBe(sound("play kick: x--x--x--x-"))
    expect(sound("steps tresillo = 3 in 8\nplay kick: tresillo")).toBe(sound("play kick: x--x--x-"))
    expect(sound("play kick: 4 in 4")).toBe(sound("play kick: xxxx"))
  })
  it("requires a valid hit and step count", () => {
    for (const source of ["play kick: 9 in 8", "play kick: 3 in 65", "play kick: x in 8"]) {
      expect(parseSource(source).errors.length, source).toBeGreaterThan(0)
    }
  })
})

describe("drums", () => {
  it("read steps: x hit, ^ accent, ~ ghost, d double, - nothing", () => {
    const o = parseSource("play tom.high: ^x~d-").outputs[0]
    expect(o.drumEvents.filter((e) => !e.hidden).map((e) => e.vel)).toEqual([1, 0.7, 0.3, 0.7])
    expect(o.drumEvents.filter((e) => e.hidden)).toHaveLength(1)
  })

  it("counts sparse hits as steps in any meter", () => {
    const o = parseSource(play("crash: x 15*-", "tom.high: 4*- x 10*- x")).outputs[0]
    expect(hits(o, "crash").map((e) => e.secStart)).toEqual([0])
    expect(hits(o, "tom.high").map((e) => e.secStart)).toEqual([0.5, 1.875])
    const seven = "set time 7 over 8\n"
    expect(sound(seven + "pattern gg = { snare: 5*- x- }\nplay gg for 2 bars")).toBe(
      sound(seven + "pattern hh = { snare: -----x- }\nplay hh for 2 bars"),
    )
  })

  it("plays accents ghosts and doubles in counted step words", () => {
    const o = parseSource("play tom.high: x 3*- ^ 3*- ~ 3*- d 3*-").outputs[0]
    expect(o.drumEvents.filter((e) => !e.hidden).map((e) => e.vel)).toEqual([0.7, 1, 0.3, 0.7])
    expect(sound("steps backbeat = 4*- x 7*- ^ 3*-\nplay snare: backbeat")).toBe(
      sound("play snare: ----x-------^---"),
    )
    expect(firstError("steps d3 = x-")).toMatch(/pick another name/)
  })

  it("rejects beat lists on kit lines", () => {
    for (const value of ["1 3", "2e ^4", "x4", "2 accent", "1|3"]) {
      expect(parseSource("play kick: " + value).errors.length, value).toBeGreaterThan(0)
    }
  })

  it("composes named step words and comma-separated layers", () => {
    expect(sound("play snare: { 4*- x 3*-, ------x- }")).toBe(sound("play snare: ----x-x-"))
    expect(sound("steps backbeat = 4*- x 7*- x 3*-\nplay snare: backbeat")).toBe(
      sound("play snare: ----x-------x---"),
    )
  })

  it("take | in steps where a bar ends, for the eye", () => {
    expect(sound("play kick: x---x---x---x--- | x---x---x-x-----")).toBe(
      sound("play kick: x---x---x---x---x---x---x-x-----"),
    )
    expect(sound("steps two = x--- ---- ---- ---- | x--- ---- x--- ----\nplay kick: two")).toBe(
      sound("play kick: x---------------x-------x-------"),
    )
    expect(sound("play kick: x---x---x-x-|x---")).toBe(sound("play kick: x---x---x-x-----|x---"))
    expect(sound("play kick: { x---|x-x- }")).toBe(sound("play kick: x 15*- | x-x-"))
  })

  it("play a variation on its own lane, with the drum's sound", () => {
    const o = parseSource(play("hat: x-x-x-xx", "hat.open: 14*- x-", "ride.bell: x")).outputs[0]
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
    expect(hits(p, "hat").map((e) => e.secStart / 0.125)).toEqual([0, 2])
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
    expect(firstError("play snare: 4*- ~ 7*- x 3*-")).toMatch(/snare\.ghost: --x-/)
    expect(firstError("play snare.ghost: ^-")).toMatch(
      /snare\.ghost hits are ghost notes, so they can't be accented/,
    )
    expect(firstError("play snare.ghost: 4*- ^ 11*-")).toMatch(/can't be accented/)
    expect(firstError("play snare.ghost: ~-")).toMatch(
      /every hit on snare\.ghost is a ghost note already, so write x/,
    )
  })

  it("play three toms, each a line of its own", () => {
    const o = parseSource(play("tom.high: x 15*-", "tom.low: 4*- x 11*-", "tom.floor: 8*- x 7*-"))
      .outputs[0]
    expect(o.drumEvents.map((e) => [e.lane, e.inst, e.art, e.secStart])).toEqual([
      ["tom.high", "tom", "high", 0],
      ["tom.low", "tom", "low", 0.5],
      ["tom.floor", "tom", "floor", 1],
    ])
    // Hit together, all three sound: none of them takes another's place
    const fill = parseSource(play("tom.high: x 15*-", "tom.low: x 15*-", "tom.floor: x 15*-"))
      .outputs[0]
    expect(fill.drumEvents.map((e) => e.lane).sort()).toEqual(["tom.floor", "tom.high", "tom.low"])
    expect(firstError(play("tom.high: x 15*-", "tom.high: 8*- x 7*-"))).toMatch(
      /tom.high already has a line/,
    )
  })

  it("play each tom from its own sample", async () => {
    // With nothing fetched, every sample the hits need comes back as missing, by name.
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 404 }))
    const o = parseSource(play("tom.high: x 15*-", "tom.low: 4*- x 11*-", "tom.floor: 8*- x 7*-"))
      .outputs[0]
    expect((await prepareKit(o.drumEvents)).missing).toEqual([
      "Tom1-Med",
      "Tom2-Med",
      "TomFloor-Med",
    ])
    vi.unstubAllGlobals()
  })

  it("draw the toms high to low, between the hi-hat and the snare", () => {
    const lanes = LANES.filter((l) => l.startsWith("tom") || l === "hat.pedal" || l === "snare")
    expect(lanes).toEqual(["hat.pedal", "tom.high", "tom.low", "tom.floor", "snare"])
  })

  it("say which toms there are", () => {
    expect(firstError("play tom: x--")).toBe(
      '"tom" isn\'t a drum. The toms are tom.high, tom.low and tom.floor',
    )
    expect(firstError("play snare.flam: x 15*-")).toBe(
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
      "set time 7 over 8\npattern gg = 3 bars {\n  kick: x--x---,\n  ride.bell: x--\n}\nplay gg",
    ).outputs[0]
    expect(hits(o, "kick")).toHaveLength(6)
    expect(hits(o, "ride.bell")).toHaveLength(3)
  })

  it("layers a drum in a block of steps, each layer repeating until they line up", () => {
    const o = parseSource(
      "pattern gg = {\n  snare.ghost: {\n    --x-,\n    ------------dd--\n  }\n}\nplay gg",
    ).outputs[0]
    expect(o.durSec).toBe(2)
    expect(hits(o, "snare.ghost").map((e) => e.secStart / 0.125)).toEqual([2, 12, 13])
  })

  it("lets a lower layer win where two hit the same step, and never a rest", () => {
    expect(sound("play snare: {\n  x-xx,\n  --^-\n}")).toBe(sound("play snare: x-^x"))
    expect(sound("play snare: {\n  ^-x-,\n  x---\n}")).toBe(sound("play snare: x-x-"))
    // A double's second stroke goes with its first.
    expect(sound("play snare: {\n  d---,\n  x---\n}")).toBe(sound("play snare: x---"))
    expect(sound("play snare: {\n  x---,\n  d---\n}")).toBe(sound("play snare: d---"))
  })

  it("makes a block of steps steps, to name, put in a row or nest", () => {
    const want = sound("play snare.ghost: --x---------dd--")
    expect(sound("play snare.ghost: {\n  --x-,\n  ------------dd--\n}")).toBe(want)
    expect(
      sound("steps ghosts = {\n  --x-,\n  ------------dd--\n}\nplay snare.ghost: ghosts"),
    ).toBe(want)
    expect(sound("steps fig = {\n  x-,\n  -x\n}\nplay hat: x--- fig")).toBe(
      sound("play hat: x---xx 14*-"),
    )
    expect(sound("steps pair = x-\nplay hat: {\n  {\n    pair,\n    -x\n  },\n  ----\n}")).toBe(
      sound("play hat: xx"),
    )
  })

  it("gives a block the whole line, so steps go in a row with one by name", () => {
    // Otherwise a newline between two blocks would be all that told together from in order
    expect(firstError("play hat: x--- {\n  x-,\n  -x\n}")).toBe(
      "A block is everything hat plays, so nothing goes beside it. " +
        "To put steps in a row with a block, name it: steps fig = { ... } and hat: x--- fig",
    )
    expect(firstError("play hat: {\n  { x--- } { --x- }\n}")).toMatch(/everything in its layer/)
    expect(firstError("steps roll = x--- { x- }")).toMatch(
      /everything roll holds.*steps fig = \{ \.\.\. \} and steps roll = x--- fig/,
    )
  })

  it("lets a lower line win where two lines hit the same drum at once", () => {
    const below = parseSource(play("pattern { snare: ^--- }", "snare: x-xx")).outputs[0]
    expect(hits(below, "snare").map((e) => [e.secStart / 0.125, e.accent])).toEqual([
      [0, false],
      [2, false],
      [3, false],
    ])
    const above = parseSource(play("snare: x-xx", "pattern { snare: ^--- }")).outputs[0]
    expect(hits(above, "snare").map((e) => [e.secStart / 0.125, e.accent])).toEqual([
      [0, true],
      [2, false],
      [3, false],
    ])
  })

  it("explains what a block of steps can't hold", () => {
    expect(firstError("play snare: {\n  kick: x---\n}")).toMatch(
      /A block of steps holds step layers separated by commas.*kick: x--- is an instrument's line/,
    )
    // said on the layer's own line
    expect(parseSource("play snare.ghost: {\n  --x-,\n  --~-\n}").errors).toEqual([
      {
        line: 3,
        col: 4,
        endLine: 3,
        endCol: 5,
        msg: '"~": every hit on snare.ghost is a ghost note already, so write x',
      },
    ])
    expect(firstError("play piano: chords {\n  Am F\n}")).toMatch(
      /Chords play one at a time, so they can't be layered in a block/,
    )
    expect(firstError("chords verse = {\n  Am F\n}")).toMatch(/Chords play one at a time/)
    expect(firstError("ghosts = {\n  --x-\n}")).toMatch(
      /Put its type in front: steps ghosts = \{ \.\.\. \}/,
    )
    expect(firstError("pattern gg = {\n  --x-\n}")).toMatch(/\{ \.\.\. \} is steps, not a pattern/)
    expect(durations("play kick: { x------, x--------, x----------, x------------ }")).toEqual([2])
  })
})

describe("the grid", () => {
  const grid = (src: string) => {
    const p = parseSource(src)
    expect(p.errors).toEqual([])
    return gridRows(p.outputs[0].blocks[0])
  }
  const cells = (row: ReturnType<typeof gridRows>["rows"][number]) =>
    [...row.cells].sort((a, b) => a[0] - b[0])

  it("gives a pitched instrument a row above the drums, a note's name in its cell", () => {
    const { per, rows } = grid(play("kick: x---", "every 1/4 beats guitar: notes F-_^G"))
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
    const { rows } = grid("play piano: {\n  notes C4 E4--,\n  notes G4---\n}")
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
    expect(grid("play piano: notes C-E-G-E-").per).toBe(4)
    expect(grid("play piano: notes C_E-G-E-").per).toBe(8)
  })

  it("leaves chords to the chart above it", () => {
    const { rows } = grid(play("piano: chords Am F", "kick: x 7*- x 7*-"))
    expect(rows.map((r) => r.label)).toEqual(["kick"])
  })
})
