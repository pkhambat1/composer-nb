import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../src/lib/music-engine.js")

describe("dotted duration suffixes", () => {
  it(".q. = 1.5 beats", () => {
    const { events } = parseSource("@beats 4\nC.q. Dm.q. Em.q") // 1.5 + 1.5 + 1 = 4
    const beats = events.filter((e) => e.chord).map((e) => e.beats)
    expect(beats).toEqual([1.5, 1.5, 1])
  })

  it(".h. = 3 beats", () => {
    const { events } = parseSource("@beats 4\nC.h. Dm.q")
    const beats = events.filter((e) => e.chord).map((e) => e.beats)
    expect(beats).toEqual([3, 1])
  })

  it(".q.. = 1.75 beats (double-dotted)", () => {
    const { events } = parseSource("@beats 4\nC.q..")
    expect(events[0].beats).toBe(1.75)
  })

  it(".e. = 0.75 beats", () => {
    const { events } = parseSource("@beats 4\nC.e.")
    expect(events[0].beats).toBe(0.75)
  })

  it("undotted durations still work", () => {
    const { events } = parseSource("@beats 4\nC.w")
    expect(events[0].beats).toBe(4)
  })
})
