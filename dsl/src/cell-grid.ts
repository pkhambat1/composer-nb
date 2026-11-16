/* What a cell's plays are drawn from: the blocks of a play's output, as the grid and the
   sheet show them, and the output itself. */
import {
  type ChordSound,
  type HitEvent,
  type NoteSound,
  type SoundEvent,
  type Span,
} from "./clips.ts"
import { TPQ } from "./time.ts"

// What one play plays
// One block of a play's output, as the grid and the sheet draw it
export type GridBlock = ReturnType<typeof gridBlocks>[number]

export type Output = {
  line: number
  label: string
  durSec: number
  totalSec: number
  events: SoundEvent[]
  chords: ChordSound[]
  notes: NoteSound[]
  drumEvents: HitEvent[]
  blocks: ReturnType<typeof gridBlocks>
  // Set once its audio is rendered: what couldn't be loaded
  warnings?: string[]
}

// Grid cells per quarter note: the coarsest that still shows every hit, and where every
// note stops.
function gridResolution(drumEvents: HitEvent[], noteEvents: NoteSound[], barTicks: number): number {
  const ticks = [
    ...drumEvents.filter((e) => !e.hidden).map((e) => e.tick),
    ...noteEvents.flatMap((e) => [e.tick, e.tick + e.ticks]),
  ]
  for (const res of [1, 2, 4, 3, 6, 8, 12]) {
    const cell = TPQ / res
    if (barTicks % cell === 0 && ticks.every((t) => t % cell === 0)) return res
  }
  return 24
}

// Joins neighbouring spans in the same meter, then gives each its drum hits, notes and
// chords as ticks from its start — the shape the grid and the sheet draw.
export function gridBlocks(
  spans: Span[],
  drumEvents: HitEvent[],
  noteEvents: NoteSound[],
  chordEvents: ChordSound[] = [],
) {
  const merged: Span[] = []
  for (const s of [...spans].sort((a, b) => a.startSec - b.startSec)) {
    const last = merged[merged.length - 1]
    if (
      last &&
      last.time === s.time &&
      last.tempo === s.tempo &&
      last.swing === s.swing &&
      last.key === s.key &&
      last.mode === s.mode &&
      Math.abs(last.startSec + last.durSec - s.startSec) < 1e-6
    ) {
      last.durSec += s.durSec
    } else merged.push({ ...s })
  }
  return merged.map((s) => {
    const inside = drumEvents
      .filter((e) => e.secStart >= s.startSec - 1e-9 && e.secStart < s.startSec + s.durSec - 1e-9)
      .map((e) => ({ ...e, tick: Math.round((e.secStart - s.startSec) / s.secPerTick) }))
    const within = <E extends SoundEvent>(events: E[]): E[] =>
      events
        .filter((e) => e.secStart >= s.startSec - 1e-9 && e.secStart < s.startSec + s.durSec - 1e-9)
        .map((e) => ({
          ...e,
          tick: Math.round((e.secStart - s.startSec) / s.secPerTick),
          ticks: Math.round(e.secDur! / s.secPerTick),
        }))
    const notes = within(noteEvents)
    const barSec = s.barTicks * s.secPerTick
    return {
      ...s,
      bars: Math.ceil(s.durSec / barSec - 1e-6), // a part bar still gets a row
      plays: [s.startSec],
      times: 1,
      drumEvents: inside,
      noteEvents: notes,
      chordEvents: within(chordEvents),
      res: gridResolution(inside, notes, s.barTicks),
    }
  })
}
