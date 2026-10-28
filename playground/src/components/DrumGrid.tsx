// components/DrumGrid.tsx — Drum hits and notes bar by bar, counted 1 e & a, with a playhead
import React from "react"
import { TPQ, type GridBlock } from "composer-nb/language"
import { countingOf, gridCounts, gridRows } from "composer-nb/grid"

// A view of a play's blocks with a playhead: where the audio is (`getTime`, in seconds), and
// whether it's playing
export type Follows = { blocks: GridBlock[]; getTime: () => number; playing: boolean }

function DrumBlock({ block, index }: { block: GridBlock; index: number }) {
  const { per, rows } = gridRows(block)
  // Wide enough for the longest line name, e.g. guitar.electric
  const labels = Math.max(...rows.map((r) => r.label.length), 5) + 1
  // How the cells are counted, and which groups of beats are shaded
  const counts = gridCounts(block)
  const shaded = (col: number) => counts[col].shaded

  return (
    <div className="dg-block">
      <div className="dg-head">
        time {block.time} · tempo {block.tempo}{block.swing ? " · swing" : ""} · key {block.key} {block.mode} · {block.bars} bar{block.bars === 1 ? "" : "s"} · counting{" "}
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
              <div className="dg-lane">{row.label}</div>
              {Array.from({ length: per }, (_, col) => {
                const e = row.cells.get(bar * per + col)
                let cls = "dg-cell" + (shaded(col) ? " dg-alt" : "") + (e?.note ? " dg-note" : "")
                if (e?.sticking) cls += " dg-stk"
                else if (e?.hit) {
                  cls += " dg-hit"
                  if (e.accent) cls += " dg-acc"
                  if (e.ghost) cls += " dg-ghost"
                  if (e.double) cls += " dg-dbl"
                } else if (e?.held) cls += " dg-held"
                return (
                  <div key={col} className={cls}>
                    {e?.text}
                  </div>
                )
              })}
            </React.Fragment>
          ))}
          {/* The playhead: one outline around the step playing now, over every row. It sits
              in the bar's grid, and DrumGrid puts it in the step's column */}
          <div className="dg-now-col" data-bar={`${index}-${bar}`} style={{ gridRow: `1 / ${rows.length + 1}` }} />
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

function DrumGrid({ blocks, getTime, playing }: Follows) {
  const rootRef = React.useRef<HTMLDivElement>(null)

  // Move the playhead with direct DOM updates so playback doesn't re-render the grid.
  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let raf = 0
    let lastKey: string | null | undefined
    const paint = () => {
      const t = getTime()
      // The step playing now: its block, its bar and its column
      let now: { bi: number; bar: number; col: number } | null = null
      // A block that plays more than once is drawn once; the playhead goes round it each time.
      const playingAt = (b: GridBlock) => b.plays.find((at) => t >= at && t < at + b.durSec)
      const bi = blocks.findIndex((b) => playingAt(b) !== undefined)
      if (bi >= 0 && (playing || t > 0)) {
        const b = blocks[bi]
        const tick = (t - playingAt(b)!) / b.secPerTick
        const bar = Math.floor(tick / b.barTicks)
        const col = Math.floor((tick - bar * b.barTicks) / (TPQ / b.res))
        now = { bi, bar, col }
      }
      const key = now && `${now.bi}-${now.bar}-${now.col}`
      if (key !== lastKey) {
        root.querySelectorAll(".dg-now").forEach((el) => el.classList.remove("dg-now"))
        if (now) {
          // The step's count, and the outline, moved to the step's column (the first is the
          // names). Positioned out of the flow, it needs its end line too, or it runs to the edge.
          root.querySelector(`[data-k="${key}"]`)?.classList.add("dg-now")
          const outline = root.querySelector<HTMLElement>(`[data-bar="${now.bi}-${now.bar}"]`)
          if (outline) {
            outline.style.gridColumn = `${now.col + 2} / span 1`
            outline.classList.add("dg-now")
          }
        }
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
