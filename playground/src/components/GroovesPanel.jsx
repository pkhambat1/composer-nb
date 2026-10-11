// components/GroovesPanel.jsx — The grooves library: transcriptions and rudiments to open in
// the notebook or send as a link
import React from "react"
import { GROOVES, SECTIONS, grooveText, plain, slugOf } from "composer-nb/grooves"
import { shareCellUrl } from "../shared/embed.js"

export default function GroovesPanel({ style, onOpen }) {
  const [copied, setCopied] = React.useState(null)
  const copy = async (g) => {
    await navigator.clipboard.writeText(shareCellUrl(g.source))
    setCopied(g.title)
    setTimeout(() => setCopied(null), 1500)
  }
  // Opening a groove adds its text cell and its music cell to the notebook
  const open = (g) =>
    onOpen({ title: g.title, text: { source: grooveText(g) }, music: { source: g.source } })
  return (
    <div className="grooves-panel" style={style}>
      <div className="nb-title-bar">
        <h1 className="panel-title">Grooves</h1>
        <p className="panel-subtitle">Transcriptions and rudiments to start from</p>
      </div>
      <div className="grooves-list">
        {SECTIONS.map((section) => (
          <React.Fragment key={section}>
            <h2 className="grooves-section">{section}</h2>
            {GROOVES.filter((g) => g.section === section).map((g) => (
              <div key={g.title} className="groove-card">
                <div className="groove-title">{g.title}</div>
                <div className="groove-byline">{plain(g.byline)}</div>
                <pre className="groove-code">{g.source}</pre>
                <div className="groove-actions">
                  <button type="button" className="icon-btn" onClick={() => open(g)} title="Adds it to the end of the notebook and plays it">
                    Open in the notebook
                  </button>
                  <button type="button" className="icon-btn" onClick={() => copy(g)} title="A link that opens the playground on this groove, playing">
                    {copied === g.title ? "Link copied" : "Copy link"}
                  </button>
                  {!import.meta.env.DEV && (
                    <a className="icon-btn" href={`/grooves/${slugOf(g.title)}/`} target="_blank" rel="noreferrer" title="Its page, to read and send">
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
