// components/DrumGrid.jsx — Drum hits and notes bar by bar, counted 1 e & a, with a playhead
import React from "react"
import { TPQ } from "composer-nb/language"
import { gridRows } from "composer-nb/grid"

const SAY = { 1: [""], 2: ["", "&"], 3: ["", "&", "a"], 4: ["", "e", "&", "a"] }
const COUNTING = { 1: "1 2 3", 2: "1 & 2 &", 3: "1 & a", 4: "1 e & a" }

function DrumBlock({ block, index }) {
  const { per, rows } = gridRows(block)
  // Wide enough for the longest line name, e.g. guitar.electric
  const labels = Math.max(...rows.map((r) => r.label.length), 5) + 1

  // Shade alternate groups for added-up meters like (3+4)/4, otherwise alternate beats.
  const groupEnds = []
  let acc = 0
  for (const g of block.groups) groupEnds.push((acc += (g * 4) / block.unit))
  const shaded = (col) => {
    const q = col / block.res
    return block.groups.length > 1
      ? groupEnds.findIndex((end) => q < end - 1e-9) % 2 === 1
      : Math.floor(q) % 2 === 1
  }

  return (
    <div className="dg-block">
      <div className="dg-head">
        time {block.time} · tempo {block.tempo} · {block.bars} bar{block.bars === 1 ? "" : "s"} · counting{" "}
        {COUNTING[block.res] || "in small steps"}
      </div>
      {Array.from({ length: block.bars }, (_, bar) => (
        <div
          key={bar}
          className="dg-bar"
          style={{ gridTemplateColumns: `${labels}ch repeat(${per}, minmax(0, 1fr))` }}
        >
          {rows.map((row) => (
            <React.Fragment key={row.key}>
              <div className="dg-lane">{row.label}</div>
              {Array.from({ length: per }, (_, col) => {
                const e = row.cells.get(bar * per + col)
                let cls = "dg-cell" + (shaded(col) ? " dg-alt" : "")
                if (e?.hit) {
                  cls += " dg-hit"
                  if (e.accent) cls += " dg-acc"
                  if (e.ghost) cls += " dg-ghost"
                  if (e.double) cls += " dg-dbl"
                } else if (e?.held) cls += " dg-held"
                return (
                  <div key={col} className={cls} data-k={`${index}-${bar}-${col}`}>
                    {e?.text}
                  </div>
                )
              })}
            </React.Fragment>
          ))}
          <div className="dg-lane dg-bar-num">{block.bars > 1 ? `bar ${bar + 1}` : ""}</div>
          {Array.from({ length: per }, (_, col) => {
            const sub = col % block.res
            return (
              <div
                key={col}
                className={"dg-count" + (sub ? "" : " dg-count-beat")}
                data-k={`${index}-${bar}-${col}`}
              >
                {sub ? (SAY[block.res]?.[sub] ?? "·") : Math.floor(col / block.res) + 1}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function DrumGrid({ blocks, getTime, playing }) {
  const rootRef = React.useRef(null)

  // Move the playhead with direct DOM updates so playback doesn't re-render the grid.
  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let raf = 0
    let lastKey
    const paint = () => {
      const t = getTime()
      let key = null
      // A block that plays more than once is drawn once; the playhead goes round it each time.
      const playingAt = (b) => b.plays.find((at) => t >= at && t < at + b.durSec)
      const bi = blocks.findIndex((b) => playingAt(b) !== undefined)
      if (bi >= 0 && (playing || t > 0)) {
        const b = blocks[bi]
        const tick = (t - playingAt(b)) / b.secPerTick
        const bar = Math.floor(tick / b.barTicks)
        const col = Math.floor((tick - bar * b.barTicks) / (TPQ / b.res))
        key = `${bi}-${bar}-${col}`
      }
      if (key !== lastKey) {
        root.querySelectorAll(".dg-now").forEach((el) => el.classList.remove("dg-now"))
        if (key) root.querySelectorAll(`[data-k="${key}"]`).forEach((el) => el.classList.add("dg-now"))
        lastKey = key
      }
      if (playing) raf = requestAnimationFrame(paint)
    }
    paint()
    return () => cancelAnimationFrame(raf)
  }, [blocks, getTime, playing])

  return (
    <div className="drum-grid" ref={rootRef}>
      {blocks.map((b, i) =>
        b.drumEvents.length || b.noteEvents.length ? <DrumBlock key={i} block={b} index={i} /> : null,
      )}
    </div>
  )
}

export default React.memo(DrumGrid)
