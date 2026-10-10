// components/DrumSheet.jsx — Drum hits as sheet music, a staff per block, with a playhead
import React from "react"
import abcjs from "abcjs"
import { sheetAbc } from "composer-nb/sheet"

function SheetBlock({ block, index, setTimings }) {
  const mountRef = React.useRef(null)
  const abc = React.useMemo(() => sheetAbc(block), [block])

  React.useLayoutEffect(() => {
    const el = mountRef.current
    if (!el || !abc) return
    const [tune] = abcjs.renderAbc(el, abc, {
      responsive: "resize",
      staffwidth: Math.max(el.clientWidth, 320),
      wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 },
      paddingtop: 0,
      paddingbottom: 0,
      paddingleft: 0,
      paddingright: 0,
      foregroundColor: "currentColor",
    })
    // When each note sounds, at the tempo in the ABC, so the playhead can find it
    tune.setTiming(0, 0)
    setTimings(index, tune.noteTimings.filter((t) => t.type === "event"))
    return () => setTimings(index, null)
  }, [abc, index, setTimings])

  return (
    <div className="ds-block">
      <div className="dg-head">
        time {block.time} · tempo {block.tempo} · {block.bars} bar{block.bars === 1 ? "" : "s"}
      </div>
      <div ref={mountRef} className="ds-staff" />
    </div>
  )
}

function DrumSheet({ blocks, getTime, playing }) {
  const rootRef = React.useRef(null)
  const timingsRef = React.useRef(new Map())
  const setTimings = React.useCallback((index, timings) => {
    if (timings) timingsRef.current.set(index, timings)
    else timingsRef.current.delete(index)
  }, [])

  // Move the playhead with direct DOM updates, as the grid does.
  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let raf = 0
    let last = null
    const paint = () => {
      const t = getTime()
      let now = null
      const playingAt = (b) => b.plays.find((at) => t >= at && t < at + b.durSec)
      const bi = blocks.findIndex((b) => playingAt(b) !== undefined)
      if (bi >= 0 && (playing || t > 0)) {
        const ms = (t - playingAt(blocks[bi])) * 1000
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

  return (
    <div className="drum-sheet" ref={rootRef}>
      {blocks.map((b, i) =>
        b.drumEvents.length ? <SheetBlock key={i} block={b} index={i} setTimings={setTimings} /> : null,
      )}
    </div>
  )
}

export default React.memo(DrumSheet)
