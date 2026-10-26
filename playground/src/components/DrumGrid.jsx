// components/DrumGrid.jsx — Drum hits and notes bar by bar, counted 1 e & a, with a playhead
import React from "react"
import { TPQ } from "composer-nb/language"
import { countingOf, gridCounts, gridRows } from "composer-nb/grid"
import { quietens } from "../shared/mute.js"

// Whether a row of the grid is muted: a drum's by its lane, an instrument's by its name
const quietRow = (muted, row) =>
  row.key.includes(" ") ? quietens(muted, null, row.key.split(" ")[0]) : quietens(muted, row.key)

function DrumBlock({ block, index, muted }) {
  const { per, rows } = gridRows(block)
  // Wide enough for the longest line name, e.g. guitar.electric
  const labels = Math.max(...rows.map((r) => r.label.length), 5) + 1
  // How the cells are counted, and which groups of beats are shaded
  const counts = gridCounts(block)
  const shaded = (col) => counts[col].shaded

  return (
    <div className="dg-block">
      <div className="dg-head">
        time {block.time} · tempo {block.tempo} · key {block.key} · {block.bars} bar{block.bars === 1 ? "" : "s"} · counting{" "}
        {countingOf(block)}
      </div>
      {Array.from({ length: block.bars }, (_, bar) => (
        <div
          key={bar}
          className="dg-bar"
          style={{ gridTemplateColumns: `${labels}ch repeat(${per}, minmax(0, 1fr))` }}
        >
          {rows.map((row) => (
            <React.Fragment key={row.key}>
              <div className={"dg-lane" + (quietRow(muted, row) ? " dg-muted" : "")}>{row.label}</div>
              {Array.from({ length: per }, (_, col) => {
                const e = row.cells.get(bar * per + col)
                let cls = "dg-cell" + (shaded(col) ? " dg-alt" : "") + (e?.note ? " dg-note" : "")
                if (quietRow(muted, row)) cls += " dg-muted"
                if (e?.sticking) cls += " dg-stk"
                else if (e?.hit) {
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
          {counts.map((c, col) => (
            <div
              key={col}
              className={"dg-count" + (c.beat ? " dg-count-beat" : "")}
              data-k={`${index}-${bar}-${col}`}
            >
              {c.label === "." ? "·" : c.label}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function DrumGrid({ blocks, muted = new Set(), getTime, playing }) {
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
        b.drumEvents.length || b.noteEvents.length ? <DrumBlock key={i} block={b} index={i} muted={muted} /> : null,
      )}
    </div>
  )
}

export default React.memo(DrumGrid)
