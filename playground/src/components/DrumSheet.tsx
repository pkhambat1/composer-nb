// components/DrumSheet.tsx — A play's output as sheet music, a system per block, with a playhead
import React from "react"
import abcjs, { type NoteTimingEvent, type TuneObject } from "abcjs"
import type { GridBlock } from "composer-nb/language"
import { sheetAbc } from "composer-nb/sheet"
import type { Follows } from "./DrumGrid.tsx"

// Keeps when each note of a block sounds, or forgets them (null)
type SetTimings = (index: number, timings: NoteTimingEvent[] | null) => void
// abcjs gives a tune its timings once it's timed
type TimedTune = TuneObject & { noteTimings: NoteTimingEvent[] }

function SheetBlock({
  block,
  index,
  counts,
  setTimings,
}: {
  block: GridBlock
  index: number
  counts: boolean
  setTimings: SetTimings
}) {
  const mountRef = React.useRef<HTMLDivElement>(null)
  const { abc, tablature } = React.useMemo(() => sheetAbc(block, { counts }), [block, counts])

  React.useLayoutEffect(() => {
    const el = mountRef.current
    if (!el || !abc) return
    const [tune] = abcjs.renderAbc(el, abc, {
      responsive: "resize",
      staffwidth: Math.max(el.clientWidth, 320) - 20,
      // Room for what hangs below the last staff (the feet's stems and rests, tab numbers)
      // and past the last bar line
      paddingtop: 8,
      paddingbottom: 36,
      paddingleft: 4,
      paddingright: 16,
      foregroundColor: "currentColor",
      format: { tablabelfont: "Helvetica 11" },
      ...(tablature.some((t) => t.instrument) && { tablature }),
    })
    // When each note sounds, at the tempo in the ABC, so the playhead can find it
    tune.setTiming(0, 0)
    setTimings(
      index,
      (tune as TimedTune).noteTimings.filter((t) => t.type === "event"),
    )
    return () => setTimings(index, null)
  }, [abc, tablature, index, setTimings])

  return (
    <div className="ds-block">
      <div className="dg-head">
        time {block.time} · tempo {block.tempo} · key {block.key} {block.mode} · {block.bars} bar
        {block.bars === 1 ? "" : "s"}
      </div>
      <div ref={mountRef} className="ds-staff" />
    </div>
  )
}

function DrumSheet({ blocks, counts, getTime, playing }: Follows & { counts: boolean }) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const timingsRef = React.useRef(new Map<number, NoteTimingEvent[]>())
  const setTimings = React.useCallback<SetTimings>((index, timings) => {
    if (timings) timingsRef.current.set(index, timings)
    else timingsRef.current.delete(index)
  }, [])

  // Move the playhead with direct DOM updates, as the grid does.
  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let raf = 0
    let last: NoteTimingEvent | null = null
    const paint = () => {
      const t = getTime()
      let now: NoteTimingEvent | null = null
      const playingAt = (b: GridBlock) => b.plays.find((at) => t >= at && t < at + b.durSec)
      const bi = blocks.findIndex((b) => playingAt(b) !== undefined)
      if (bi >= 0 && (playing || t > 0)) {
        const ms = (t - playingAt(blocks[bi])!) * 1000
        const timings = timingsRef.current.get(bi) || []
        for (const ev of timings) if (ev.milliseconds <= ms + 1) now = ev
      }
      if (now !== last) {
        root.querySelectorAll(".ds-now").forEach((el) => el.classList.remove("ds-now"))
        for (const group of now?.elements || []) for (const el of group) el.classList.add("ds-now")
        last = now
      }
      if (playing) raf = requestAnimationFrame(paint)
    }
    paint()
    return () => cancelAnimationFrame(raf)
  }, [blocks, getTime, playing])

  const drawn = (b: GridBlock) =>
    b.drumEvents.length || b.noteEvents.length || b.chordEvents?.length
  return (
    <div className="drum-sheet" ref={rootRef}>
      {blocks.map((b, i) =>
        drawn(b) ? (
          <SheetBlock key={i} block={b} index={i} counts={counts} setTimings={setTimings} />
        ) : null,
      )}
    </div>
  )
}

export default React.memo(DrumSheet)
