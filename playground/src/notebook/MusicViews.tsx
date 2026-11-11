/* One renderer for bricks, sheet music, chord diagrams and diagnostics in every host. */
import { NotebookTarget } from "./SelectionContext.tsx"
import React from "react"
import { pianoRange } from "./pianoRange.ts"
import type { GridBlock, Parsed } from "composer-nb/language"
import type { DrumView } from "../shared/types.ts"
import type { PlayerProps } from "./types.ts"
import DrumGrid from "../components/DrumGrid.tsx"
import PrintedValues from "./PrintedValues.tsx"
const VIEWS: DrumView[] = ["bricks", "sheet"]
const noTime = () => 0
// Loaded when first shown: the chord shapes for the diagrams, abcjs for the sheet music
const ChordDiagram = React.lazy(() => import("../components/ChordDiagram.tsx"))
const DrumSheet = React.lazy(() => import("../components/DrumSheet.tsx"))

// Everything below the playback row: settings summary, the drums and notes as a grid of
// bricks or as sheet music, chord diagrams, errors.
export default function MusicViews({
  parsed,
  accent,
  drumView,
  onSetDrumView,
  sheetCounts: _sheetCounts,
  onSetSheetCounts: _onSetSheetCounts,
  getTime = noTime,
  playing = false,
}: Pick<
  PlayerProps,
  "accent" | "drumView" | "onSetDrumView" | "sheetCounts" | "onSetSheetCounts"
> & {
  parsed: Parsed
  getTime?: () => number
  playing?: boolean
}) {
  const chords = parsed.chords.filter((e) => !e.repeat)
  const drawn = (b: GridBlock) =>
    b.drumEvents.length > 0 || b.noteEvents.length > 0 || b.chordEvents.length > 0
  const hasSteps = parsed.blocks.some((b) => b.drumEvents.length > 0 || b.noteEvents.length > 0)
  const range = pianoRange(
    chords.filter((e) => e.instrument.split(".")[0] !== "guitar").map((e) => e.chord),
  )
  const sheet = !hasSteps || drumView === "sheet"
  const meta = parsed.blocks
    .filter((b) => !drawn(b))
    .map(
      (b) =>
        `time ${b.time} · tempo ${b.tempo}${b.swing ? " · swing" : ""} · key ${b.key} ${b.mode} · ${b.bars} bar${b.bars === 1 ? "" : "s"}`,
    )
  if (parsed.outputs.length > 1) meta.unshift(`${parsed.outputs.length} plays, one after another`)
  if (parsed.fromAbove.length) meta.push(`from cells above: ${parsed.fromAbove.join(", ")}`)
  return (
    <>
      <PrintedValues prints={parsed.prints} />
      {meta.length > 0 && <div className="music-meta">{meta.join("  ·  ")}</div>}
      {parsed.warnings?.map((w) => (
        <div key={w} className="music-meta music-warning">
          {w}
        </div>
      ))}

      {parsed.blocks.some(drawn) && (
        <div className="out-section">
          <div className="out-section-label out-section-row">
            <span>{sheet ? "Sheet music" : parsed.notes.length ? "Steps" : "Drums"}</span>
            {hasSteps && (
              <span className="view-toggle" role="group" aria-label="How the hits are drawn">
                {VIEWS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={"view-btn" + (drumView === v ? " view-btn-on" : "")}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSetDrumView(v)
                    }}
                  >
                    {v}
                  </button>
                ))}
              </span>
            )}
          </div>
          {sheet ? (
            <React.Suspense fallback={<div className="dg-head">Drawing the staff…</div>}>
              <div className="sheet-print">
                <DrumSheet
                  blocks={parsed.blocks}
                  counts
                  getTime={getTime}
                  playing={playing}
                />
              </div>
            </React.Suspense>
          ) : (
            <DrumGrid blocks={parsed.blocks} getTime={getTime} playing={playing} />
          )}
        </div>
      )}

      {chords.length > 0 && (
        <div className="out-section">
          <div className="out-section-label">Chord diagrams</div>
          <div className="chord-strip">
            <React.Suspense fallback={null}>
              {chords.map((e, i) => (
                <NotebookTarget
                  key={i}
                  className="chord-chip"
                  kind="chord"
                  label={`Chord ${e.chord.label}, ${e.instrument}`}
                >
                  <span className="chord-label">{e.chord.label}</span>
                  <ChordDiagram
                    chord={e.chord}
                    instrument={e.instrument}
                    accent={accent}
                    range={range}
                  />
                  <span className="chord-notes">
                    {e.chord.noteNames.map((n) => n.replace(/\d+$/, "")).join(" ")}
                  </span>
                </NotebookTarget>
              ))}
            </React.Suspense>
          </div>
        </div>
      )}

      {parsed.errors && parsed.errors.length > 0 && (
        <div className="parse-errors">
          <span className="pe-icon">!</span>
          <div className="pe-list">
            {parsed.errors.slice(0, 4).map((e, i) => (
              <div key={i} className="pe-row">
                <span className="pe-line">line {e.line}</span>
                <span className="pe-msg">{e.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
