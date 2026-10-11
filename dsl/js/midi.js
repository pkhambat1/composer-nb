/* A play's output as a Standard MIDI File (format 1), for a DAW or a notation program:
   a tempo track, the drums on channel 10 with General MIDI drum notes, and a track per
   pitched instrument. Times come from the events' seconds, so what swings in the audio
   swings here too. Pure, like grid.js. */
import { parseKey } from "./chords.js"
import { TPQ } from "./language.js"

// General MIDI drum notes for the kit pieces
const DRUM_NOTES = {
  kick: 36,
  snare: 38,
  "snare.ghost": 38,
  "snare.rim": 40,
  "snare.cross": 37,
  hat: 42,
  "hat.open": 46,
  "hat.pedal": 44,
  ride: 51,
  "ride.bell": 53,
  crash: 49,
  "tom.high": 50,
  "tom.low": 47,
  "tom.floor": 43,
}
// General MIDI programs for the instruments, by the name's first word
const PROGRAMS = {
  guitar: 25, // steel-string acoustic
  "guitar.electric": 27, // clean electric
  piano: 0,
  "piano.electric": 4,
  organ: 16,
  pad: 88,
  bass: 33, // fingered electric bass
}
const DRUM_CHANNEL = 9 // channel 10, counted from 0

// A variable-length quantity, as MIDI writes delta times.
function varLen(n) {
  const out = [n & 0x7f]
  while ((n >>= 7) > 0) out.unshift((n & 0x7f) | 0x80)
  return out
}

const be32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
const be16 = (n) => [(n >>> 8) & 0xff, n & 0xff]
const ascii = (s) => [...s].map((c) => c.charCodeAt(0))

// `events` are { tick, bytes } in any order; returns the track's bytes, with an end.
function track(events) {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order)
  const body = []
  let at = 0
  for (const e of sorted) {
    body.push(...varLen(Math.max(0, e.tick - at)), ...e.bytes)
    at = Math.max(at, e.tick)
  }
  body.push(0x00, 0xff, 0x2f, 0x00)
  return [...ascii("MTrk"), ...be32(body.length), ...body]
}

// Where a moment in seconds falls, in MIDI ticks: each span of the output has its own
// tempo, and the ticks run on from span to span.
function clock(spans) {
  const starts = []
  let tick = 0
  for (const s of spans) {
    starts.push({ ...s, tick })
    tick += Math.round(s.durSec / s.secPerTick)
  }
  return (sec) => {
    const s = starts.findLast((x) => sec >= x.startSec - 1e-9) || starts[0]
    return s.tick + Math.round((sec - s.startSec) / s.secPerTick)
  }
}

// `outputs` is a parsed cell's `outputs` (or one of them), which play one after another.
// Returns the file's bytes.
export function midiFile(outputs) {
  const plays = Array.isArray(outputs) ? outputs : [outputs]
  const meta = []
  const drums = []
  const byInstrument = new Map() // instrument → its note and chord events, with ticks
  let base = 0 // where this play starts, in ticks
  let order = 0
  for (const output of plays) {
    const spans = output.blocks.length
      ? output.blocks
      : [{ startSec: 0, durSec: output.durSec, tempo: 120, secPerTick: 60 / (120 * TPQ), groups: [4], unit: 4 }]
    const at = clock(spans)
    const when = (sec) => base + at(sec)
    // The tempo and time signature of each span
    for (const s of spans) {
      const tick = when(s.startSec)
      const usPerQuarter = Math.round(60e6 / s.tempo)
      meta.push({ tick, order: order++, bytes: [0xff, 0x51, 0x03, ...be32(usPerQuarter).slice(1)] })
      const count = s.groups.reduce((a, b) => a + b, 0)
      meta.push({ tick, order: order++, bytes: [0xff, 0x58, 0x04, count, Math.log2(s.unit), 24, 8] })
      // The key signature: sharps (or flats, as a negative count) and whether it's minor
      const key = parseKey(s.key) || parseKey("C")
      const minor = key.mode === "minor" || key.mode === "aeolian" ? 1 : 0
      meta.push({ tick, order: order++, bytes: [0xff, 0x59, 0x02, key.sharps & 0xff, minor] })
    }
    for (const e of output.drumEvents) {
      const note = DRUM_NOTES[e.lane]
      if (!note) continue
      const tick = when(e.secStart + (e.secSwing || 0))
      const vel = Math.max(1, Math.min(127, Math.round(e.vel * 127)))
      drums.push({ tick, order: 1, bytes: [0x90 | DRUM_CHANNEL, note, vel] })
      drums.push({ tick: tick + Math.round(TPQ / 8), order: 0, bytes: [0x80 | DRUM_CHANNEL, note, 0] })
    }
    for (const e of output.events) {
      if (!e.note && !e.chord) continue
      if (!byInstrument.has(e.instrument)) byInstrument.set(e.instrument, [])
      const start = when(e.secStart + (e.secSwing || 0))
      const end = Math.max(start + 1, when(e.secStart + (e.secSwing || 0) + e.secDur))
      byInstrument.get(e.instrument).push({ e, start, end })
    }
    base = when(output.durSec)
  }

  const tracks = [track(meta)]
  if (drums.length) {
    drums.push({ tick: 0, order: -1, bytes: [0xff, 0x03, ...varLen(5), ...ascii("drums")] })
    tracks.push(track(drums))
  }
  // A track and a channel per pitched instrument, skipping channel 10
  let channel = 0
  for (const [inst, notes] of byInstrument) {
    if (channel === DRUM_CHANNEL) channel++
    const ch = channel++ & 0x0f
    const program = PROGRAMS[inst] ?? PROGRAMS[inst.split(".")[0]] ?? 0
    const out = [
      { tick: 0, order: -2, bytes: [0xff, 0x03, ...varLen(inst.length), ...ascii(inst)] },
      { tick: 0, order: -1, bytes: [0xc0 | ch, program] },
    ]
    for (const { e, start, end } of notes) {
      const midis = e.note ? [e.note.midi] : e.chord.notesMidi || []
      const vel = Math.max(1, Math.min(127, Math.round((e.vel ?? 0.7) * 127)))
      for (const m of midis) {
        out.push({ tick: start, order: 1, bytes: [0x90 | ch, m, vel] })
        out.push({ tick: end, order: 0, bytes: [0x80 | ch, m, 0] })
      }
    }
    tracks.push(track(out))
  }

  const header = [...ascii("MThd"), ...be32(6), ...be16(1), ...be16(tracks.length), ...be16(TPQ)]
  return new Uint8Array([...header, ...tracks.flat()])
}
