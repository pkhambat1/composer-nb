import { describe, it, expect, vi } from "vitest"

vi.mock("tone", () => ({}))

const { parseSource } = await import("../../js/music-engine.ts")
const { midiFile } = await import("../../js/midi.ts")

const file = (src) => {
  const p = parseSource(src)
  expect(p.errors).toEqual([])
  return midiFile(p.outputs[0])
}
const text = (bytes, from, n) => String.fromCharCode(...bytes.slice(from, from + n))
const be16 = (b, i) => (b[i] << 8) | b[i + 1]

// Splits the file into its chunks: [{ id, body }]
function chunks(bytes) {
  const out = []
  let i = 0
  while (i < bytes.length) {
    const id = text(bytes, i, 4)
    const len = (bytes[i + 4] << 24) | (bytes[i + 5] << 16) | (bytes[i + 6] << 8) | bytes[i + 7]
    out.push({ id, body: bytes.slice(i + 8, i + 8 + len) })
    i += 8 + len
  }
  return out
}
// The events of a track as [delta, status, data...], reading the delta-times
function events(body) {
  const out = []
  let i = 0
  while (i < body.length) {
    let delta = 0
    while (body[i] & 0x80) delta = (delta << 7) | (body[i++] & 0x7f)
    delta = (delta << 7) | (body[i++] & 0x7f)
    const status = body[i++]
    if (status === 0xff) {
      const type = body[i++]
      const len = body[i++]
      out.push([delta, status, type, ...body.slice(i, i + len)])
      i += len
    } else if ((status & 0xf0) === 0xc0) out.push([delta, status, body[i++]])
    else out.push([delta, status, body[i++], body[i++]])
  }
  return out
}

describe("MIDI export", () => {
  it("writes a format 1 file at 96 ticks a quarter, with a tempo track and the drums on channel 10", () => {
    const bytes = file("set tempo 100\nplay {\n  kick: 1 bars x---\n  hat: 1 bars x-\n}")
    const [head, tempo, drums] = chunks(bytes)
    expect(head.id).toBe("MThd")
    expect(be16(head.body, 0)).toBe(1) // format
    expect(be16(head.body, 2)).toBe(2) // tracks
    expect(be16(head.body, 4)).toBe(96) // ticks a quarter
    expect(tempo.id).toBe("MTrk")
    const meta = events(tempo.body)
    // 600,000 microseconds a quarter is 100 a minute; 4/4 is 4 over 2^2
    expect(meta[0]).toEqual([0, 0xff, 0x51, 0x09, 0x27, 0xc0])
    expect(meta[1]).toEqual([0, 0xff, 0x58, 4, 2, 24, 8])
    const hits = events(drums.body).filter((e) => (e[1] & 0xf0) === 0x90)
    expect(hits.every((e) => e[1] === 0x99)).toBe(true) // channel 10
    // a play's lines play once: the kick on each beat, the hat on each eighth
    expect(hits.map((e) => e[2])).toEqual([36, 42, 42, 36, 42, 42, 36, 42, 42, 36, 42, 42])
  })

  it("puts each pitched instrument on its own track with its program, as long as it sounds", () => {
    const bytes = file("play {\n  guitar: notes C---E---\n  bass: notes C-------\n}")
    const [, , g, b] = chunks(bytes)
    const guitar = events(g.body)
    expect(String.fromCharCode(...guitar[0].slice(3))).toBe("guitar")
    expect(guitar[1]).toEqual([0, 0xc0, 25]) // steel-string guitar on channel 1
    const notes = guitar.filter((e) => (e[1] & 0xf0) === 0x90 || (e[1] & 0xf0) === 0x80)
    // C3 on at 0, off at 96 ticks, E3 on, off: delta times
    expect(notes.map((e) => [e[0], e[1] & 0xf0, e[2]])).toEqual([
      [0, 0x90, 48],
      [96, 0x80, 48],
      [0, 0x90, 52],
      [96, 0x80, 52],
    ])
    const bass = events(b.body)
    expect(bass[1]).toEqual([0, 0xc1, 33])
  })

  it("plays a chord chart's notes together, and swings what swings", () => {
    const chart = chunks(file("play piano: chords C G"))[2]
    const on = events(chart.body).filter((e) => (e[1] & 0xf0) === 0x90)
    expect(on.length).toBeGreaterThanOrEqual(6)
    expect(on.slice(0, 3).every((e) => e[0] === 0)).toBe(true) // the first chord's notes at once
    const straight = events(chunks(file("play hat: 4 steps x-"))[2].body).filter((e) => (e[1] & 0xf0) === 0x90)
    const swung = events(chunks(file("set swing on\nplay hat: 4 steps x-"))[2].body).filter((e) => (e[1] & 0xf0) === 0x90)
    expect(straight[1][0]).toBe(48 - 12) // the & at 48 ticks, after the first hit's 12-tick note-off
    expect(swung[1][0]).toBe(64 - 12) // two thirds of the way through the beat
  })
})

describe("the key signature", () => {
  it("is in the tempo track: sharps, or flats as a negative count, and minor", () => {
    const meta = (src) => {
      const p = parseSource(src)
      expect(p.errors).toEqual([])
      const bytes = [...midiFile(p.outputs)]
      const at = bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0x59)
      return bytes.slice(at, at + 5)
    }
    expect(meta("set key D\nplay kick: x---")).toEqual([0xff, 0x59, 0x02, 2, 0])
    expect(meta("set key G\nset mode minor\nplay kick: x---")).toEqual([0xff, 0x59, 0x02, 0xfe, 1])
    expect(meta("set key D\nset mode dorian\nplay kick: x---")).toEqual([0xff, 0x59, 0x02, 0, 0])
  })
})
