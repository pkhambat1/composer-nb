// components/ChordBrowser.jsx — Chord library browser panel

function chordStubFromLabel(label) {
  const head = label.split("/")[0]
  if (typeof Tonal !== "undefined") {
    const ch = Tonal.Chord.get(head)
    if (!ch.empty && ch.tonic) {
      const pc = Tonal.Note.chroma(ch.tonic)
      return {
        label,
        rootPc: pc != null ? pc : 0,
        notesMidi: [],
        noteNames: ch.notes || [],
      }
    }
  }
  const m = /^([A-G][#b]?)/.exec(head)
  const names = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 }
  return { label, rootPc: m ? names[m[1]] ?? 0 : 0, notesMidi: [], noteNames: [] }
}

const CHORD_SAMPLE_ESSENTIALS = [
  "C",
  "Am",
  "G",
  "Em",
  "F",
  "Dm",
  "D",
  "A",
  "E",
  "Bm",
  "G7",
  "Cmaj7",
  "D7",
  "E7",
  "A7",
  "F#m",
  "Bb",
  "Eb",
]

function sampleItems(items, count) {
  const byLabel = new Map(items.map((item) => [item.label, item]))
  const pinned = []
  const seen = new Set()
  for (const label of CHORD_SAMPLE_ESSENTIALS) {
    const item = byLabel.get(label)
    if (item) {
      pinned.push(item)
      seen.add(label)
    }
  }
  const pool = items.filter((item) => !seen.has(item.label))
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = pool[i]
    pool[i] = pool[j]
    pool[j] = t
  }
  const rest = pool.slice(0, Math.max(0, count - pinned.length))
  return [...pinned, ...rest]
}

function ChordBrowserPanel({ theme, accent }) {
  const [catalog, setCatalog] = useState(null)
  const [sample, setSample] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [filter, setFilter] = useState("")
  const catalogRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    if (!window.ChordLookup) {
      setLoadError("ChordLookup not loaded")
      return
    }

    ChordLookup.load()
      .then(() => {
        if (cancelled) return
        const all = ChordLookup.buildCatalog()
        catalogRef.current = all
        setCatalog(all)
        setSample(sampleItems(all, 100))
      })
      .catch((err) => {
        if (!cancelled) setLoadError(String(err.message || err))
      })

    return () => {
      cancelled = true
    }
  }, [])

  const reshuffle = useCallback(() => {
    if (catalogRef.current) setSample(sampleItems(catalogRef.current, 100))
  }, [])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return sample
    if (!catalog) return []
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
    return matches.slice(0, 120)
  }, [sample, filter, catalog])

  return (
    <div className="chord-browser">
      <header className="cb-header">
        <div>
          <h1 className="cb-title">Chord library</h1>
          <p className="cb-subtitle">
            {catalog
              ? filter.trim()
                ? `${filtered.length} match${filtered.length === 1 ? "" : "es"} · ${catalog.length} total`
                : `${sample.length} random of ${catalog.length} — search to find any chord`
              : "Loading fingerings…"}
          </p>
        </div>
        <div className="cb-actions">
          <input
            type="search"
            className="cb-search"
            placeholder="Search all chords (e.g. Am, G7)…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button type="button" className="cb-btn" onClick={reshuffle} disabled={!catalog}>
            Reshuffle 100
          </button>
        </div>
      </header>

      {loadError && <div className="cb-error">Could not load chord data: {loadError}</div>}

      <div className="cb-grid">
        {filtered.map((item) => (
          <div key={item.label} className="cb-card">
            <div className="cb-card-label">{item.label}</div>
            <GuitarDiagram
              chord={{ ...chordStubFromLabel(item.label), position: item.position }}
            />
          </div>
        ))}
      </div>

      {!loadError && catalog && filtered.length === 0 && (
        <p className="cb-empty">No chords match your filter.</p>
      )}
    </div>
  )
}
