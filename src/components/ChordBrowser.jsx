// components/ChordBrowser.jsx — Chord library browser panel
import React from "react"
import { Chord, Note } from "tonal"
import * as ChordLookup from "../lib/chord-lookup.js"
import ChordDiagram from "./ChordDiagram.jsx"

function chordStubFromLabel(label) {
  const head = label.split("/")[0]
  const ch = Chord.get(head)
  if (!ch.empty && ch.tonic) {
    const pc = Note.chroma(ch.tonic)
    return {
      label,
      rootPc: pc != null ? pc : 0,
      notesMidi: [],
      noteNames: ch.notes || [],
    }
  }
  const m = /^([A-G][#b]?)/.exec(head)
  const names = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 }
  return { label, rootPc: m ? names[m[1]] ?? 0 : 0, notesMidi: [], noteNames: [] }
}

const PAGE_SIZE = 50

const ChordBrowserPanel = React.memo(function ChordBrowserPanel({ style }) {
  const [catalog, setCatalog] = React.useState(null)
  const [loadError, setLoadError] = React.useState(null)
  const [filter, setFilter] = React.useState("")
  const [page, setPage] = React.useState(0)
  const gridRef = React.useRef(null)

  React.useEffect(() => {
    let cancelled = false
    ChordLookup.load()
      .then(() => {
        if (cancelled) return
        setCatalog(ChordLookup.buildCatalog())
      })
      .catch((err) => {
        if (!cancelled) setLoadError(String(err.message || err))
      })
    return () => { cancelled = true }
  }, [])

  const filtered = React.useMemo(() => {
    if (!catalog) return []
    const q = filter.trim().toLowerCase()
    if (!q) return catalog
    const matches = catalog.filter((item) => item.label.toLowerCase().includes(q))
    matches.sort((a, b) => {
      const aLabel = a.label.toLowerCase()
      const bLabel = b.label.toLowerCase()
      const aExact = aLabel === q ? 0 : 1
      const bExact = bLabel === q ? 0 : 1
      if (aExact !== bExact) return aExact - bExact
      const aStart = aLabel.startsWith(q) ? 0 : 1
      const bStart = bLabel.startsWith(q) ? 0 : 1
      if (aStart !== bStart) return aStart - bStart
      return aLabel.length - bLabel.length
    })
    return matches
  }, [filter, catalog])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageItems = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  React.useEffect(() => {
    if (gridRef.current) gridRef.current.scrollTop = 0
  }, [safePage])

  return (
    <div className="chord-browser" style={style}>
      <header className="panel-header">
        <div>
          <h1 className="panel-title">Chord library</h1>
          <p className="panel-subtitle">
            {catalog
              ? filter.trim()
                ? `${filtered.length} match${filtered.length === 1 ? "" : "es"} of ${catalog.length}`
                : `${catalog.length} chords`
              : "Loading fingerings\u2026"}
          </p>
        </div>
        <div className="cb-actions">
          <input
            type="search"
            className="cb-search"
            placeholder="Search chords (e.g. Am, G7)\u2026"
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setPage(0) }}
          />
        </div>
      </header>

      {loadError && <div className="cb-error">Could not load chord data: {loadError}</div>}

      <div className="cb-grid" ref={gridRef}>
        {pageItems.map((item) => {
          const chord = { ...chordStubFromLabel(item.label), position: item.position }
          return (
            <div key={item.label} className="chord-chip">
              <span className="chord-label">{chord.label}</span>
              <ChordDiagram chord={chord} instrument="guitar" />
              <span className="chord-notes">{chord.noteNames.map((n) => n.replace(/\d+$/, "")).join(" ")}</span>
            </div>
          )
        })}
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="cb-pagination">
          <button
            className="cb-page-btn"
            disabled={safePage === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="cb-page-info">
            {safePage * PAGE_SIZE + 1}&ndash;{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <button
            className="cb-page-btn"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}

      {!loadError && catalog && filtered.length === 0 && (
        <p className="cb-empty">No chords match your filter.</p>
      )}
    </div>
  )
}, (prev, next) => prev.style?.display === next.style?.display)
export default ChordBrowserPanel
