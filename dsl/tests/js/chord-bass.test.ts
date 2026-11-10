import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource, playChord } = await import("../../js/music-engine.ts")

// The notes a chord triggers, in the order they sound
function sounded(source: string): string[] {
  const { chords } = parseSource(source)
  const notes: [number, string][] = []
  const synth = {
    triggerAttackRelease: (note: string, _dur: number, at: number) => notes.push([at, note]),
  }
  playChord(synth as never, { ...chords[0], secStart: 0, secDur: 1 } as never)
  return notes.sort((a, b) => a[0] - b[0]).map((n) => n[1])
}

describe("a chord's bass note", () => {
  it("a plain chord sounds its tones and nothing under them", () => {
    expect(sounded("play piano: chords C")).toEqual(["C3", "E3", "G3"])
    expect(sounded("play piano: chords 6m")).toEqual(["A3", "C4", "E4"])
    expect(sounded("play organ: chords Cm7")).toHaveLength(4)
  })

  it("a chord written over a bass sounds that bass first", () => {
    expect(sounded("play piano: chords C/E")).toEqual(["E2", "C3", "E3", "G3"])
    expect(sounded("play piano: chords 1/3")).toEqual(["E2", "C3", "E3", "G3"])
    expect(sounded("play piano: chords fifth(1/3)")[0]).toBe("B2")
  })
})
