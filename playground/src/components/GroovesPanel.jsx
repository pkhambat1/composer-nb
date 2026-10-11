// components/GroovesPanel.jsx — The grooves library: transcriptions to open in the notebook
// or send as a link
import React from "react"
import { APP_CONSTANTS } from "../shared/constants.js"
import { shareCellUrl } from "../shared/embed.js"

// The starters and the rudiments come in pairs: a text cell with a ## title, then the
// music cell.
export function pairsOf(cells) {
  const out = []
  for (let i = 0; i + 1 < cells.length; i++) {
    const [text, music] = [cells[i], cells[i + 1]]
    if (text.type !== "text" || music.type !== "music") continue
    const title = /^##\s+(.+)$/m.exec(text.source)?.[1]
    if (!title) continue
    const byline = text.source
      .split("\n")
      .find((l) => l.startsWith("**") || /^An? /.test(l))
    // The groove's page of its own, made at build time by scripts/grooves.js
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    out.push({ title, slug, byline: (byline || "").replace(/[*]/g, ""), text, music })
  }
  return out
}

export default function GroovesPanel({ style, onOpen }) {
  const [copied, setCopied] = React.useState(null)
  const sections = React.useMemo(
    () => [
      { title: "Transcriptions", grooves: pairsOf(APP_CONSTANTS.STARTER_CELLS) },
      { title: "Rudiments", grooves: pairsOf(APP_CONSTANTS.RUDIMENTS) },
    ],
    [],
  )
  const copy = async (g) => {
    await navigator.clipboard.writeText(shareCellUrl(g.music.source))
    setCopied(g.title)
    setTimeout(() => setCopied(null), 1500)
  }
  return (
    <div className="grooves-panel" style={style}>
      <div className="nb-title-bar">
        <h1 className="panel-title">Grooves</h1>
        <p className="panel-subtitle">Transcriptions and rudiments to start from</p>
      </div>
      <div className="grooves-list">
        {sections.map((s) => (
          <React.Fragment key={s.title}>
            <h2 className="grooves-section">{s.title}</h2>
            {s.grooves.map((g) => (
          <div key={g.title} className="groove-card">
            <div className="groove-title">{g.title}</div>
            {g.byline && <div className="groove-byline">{g.byline}</div>}
            <pre className="groove-code">{g.music.source}</pre>
            <div className="groove-actions">
              <button type="button" className="icon-btn" onClick={() => onOpen(g)} title="Adds it to the end of the notebook and plays it">
                Open in the notebook
              </button>
              <button type="button" className="icon-btn" onClick={() => copy(g)} title="A link that opens the playground on this groove, playing">
                {copied === g.title ? "Link copied" : "Copy link"}
              </button>
              {!import.meta.env.DEV && (
                <a className="icon-btn" href={`/grooves/${g.slug}/`} target="_blank" rel="noreferrer" title="Its page, to read and send">
                  Page
                </a>
              )}
            </div>
          </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
