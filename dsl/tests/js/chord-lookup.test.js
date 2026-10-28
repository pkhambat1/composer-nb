import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

async function loadLib() {
  const lib = await import("../../js/chord-lookup.ts")
  await lib.load()
  return lib
}

describe("lookupPosition", () => {
  it("picks a C9 voicing that includes Bb (rejects the Cadd9 mis-label)", async () => {
    const { lookupPosition } = await loadLib()
    const pos = lookupPosition("C9")
    expect(pos).toBeTruthy()
    // Compute pitch classes from frets + standard tuning. baseFret offsets fretted notes.
    const tuning = [40, 45, 50, 55, 59, 64] // E A D G B e
    const pcs = new Set()
    pos.frets.forEach((f, i) => {
      if (f < 0) return
      const abs = f > 0 ? f + (pos.baseFret || 1) - 1 : 0
      pcs.add((tuning[i] + abs) % 12)
    })
    // C9 must contain Bb (pc 10). The pre-fix code returned the open
    // [0,3,2,0,3,0] shape which has no Bb.
    expect(pcs.has(10)).toBe(true)
  })

  it("Cadd9 still resolves (no 7th required, so all open shapes are valid)", async () => {
    const { lookupPosition } = await loadLib()
    const pos = lookupPosition("Cadd9")
    expect(pos).toBeTruthy()
  })

  it("Cadd9 picks the canonical x32030 voicing (3rd in body), not x30030", async () => {
    const { lookupPosition } = await loadLib()
    const pos = lookupPosition("Cadd9")
    expect(pos).toBeTruthy()
    // x32030 has fret 2 on the D string (4th string from low, index 2);
    // x30030 leaves it open. The canonical Cadd9 voices E (3rd) there.
    expect(pos.frets).toEqual([-1, 3, 2, 0, 3, 0])
  })
})

// The pitch classes a guitar shape sounds, named with flats
const PC = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
const sounds = (pos) => [...new Set(pos.midi.map((m) => PC[m % 12]))].sort()

describe("a chord's guitar shape sounds that chord", () => {
  it("a minor-major seventh keeps its minor third", async () => {
    const { lookupPosition } = await loadLib()
    expect(sounds(lookupPosition("CmMaj7"))).toEqual(["B", "C", "Eb", "G"])
    expect(sounds(lookupPosition("CmMaj9"))).toEqual(expect.arrayContaining(["B", "C", "Eb"]))
  })

  it("9#5 and M7b5 find the database's aug9 and maj7b5 shapes", async () => {
    const { lookupPosition } = await loadLib()
    expect(sounds(lookupPosition("C9#5"))).toEqual(["Ab", "Bb", "C", "D", "E"])
    expect(sounds(lookupPosition("CM7b5"))).toEqual(["B", "C", "E", "Gb"])
  })

  it("a minor chord over a bass stays minor", async () => {
    const { lookupPosition } = await loadLib()
    expect(sounds(lookupPosition("Em/B"))).toEqual(["B", "E", "G"])
    expect(sounds(lookupPosition("Am/E"))).toEqual(["A", "C", "E"])
  })

  it("a seventh over a bass has no triad shape, so tonal's notes play", async () => {
    const { lookupPosition } = await loadLib()
    expect(lookupPosition("C7/G")).toBeNull()
  })

  it("prefers a shape with no stray notes", async () => {
    const { lookupPosition } = await loadLib()
    // The database's AbM7b5 at the 6th fret rings the open E and A strings
    expect(sounds(lookupPosition("AbM7b5"))).toEqual(["Ab", "C", "D", "G"])
  })

  it("has no shape when none sounds the chord's root", async () => {
    const { lookupPosition } = await loadLib()
    // Every Emadd9 in the database leaves out the E
    expect(lookupPosition("Emadd9")).toBeNull()
  })
})

describe("the chord library", () => {
  it("lists only names the language plays, drawn with the shape a cell plays", async () => {
    const { buildCatalog, lookupPosition } = await loadLib()
    const { parseSource } = await import("../../js/music-engine.js")
    const catalog = buildCatalog()
    expect(catalog.length).toBeGreaterThan(400)
    for (const { label, position } of catalog) {
      expect(parseSource(`play guitar: chords ${label}`).errors, label).toEqual([])
      expect(position, label).toEqual(lookupPosition(label))
    }
  })

  it("names the database's chords as a cell writes them", async () => {
    const { buildCatalog } = await loadLib()
    const labels = new Set(buildCatalog().map((c) => c.label))
    for (const l of ["CmMaj7", "C9#5", "CM7b5", "Em/B", "F/Eb", "E/G#"]) expect(labels.has(l), l).toBe(true)
    for (const l of ["Cmmaj7", "Caug9", "Cmaj7b5", "Calt", "C7sg", "F/D#"]) expect(labels.has(l), l).toBe(false)
  })
})
