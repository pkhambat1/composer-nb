import { describe, it, expect, vi, beforeAll } from "vitest"

vi.mock("tone", () => ({}))

// Real chords-db payload, fetched once for all tests.
let dbPayload
beforeAll(async () => {
  const res = await fetch(
    "https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@0.5.1/lib/guitar.json",
  )
  dbPayload = await res.json()
})

async function loadLib() {
  const lib = await import("../src/lib/chord-lookup.js")
  // Stub global fetch so load() returns our fixed payload.
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => dbPayload })
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
