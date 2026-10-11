// components/NotebooksPanel.jsx — The notebooks on this device: open, rename, copy, delete,
// and move them as files
import React from "react"

function when(ms) {
  const d = Date.now() - ms
  if (d < 60e3) return "just now"
  if (d < 3600e3) return `${Math.round(d / 60e3)} min ago`
  if (d < 86400e3) return `${Math.round(d / 3600e3)} h ago`
  return new Date(ms).toLocaleDateString()
}

export default function NotebooksPanel({ style, notebooks, onOpened }) {
  const { list, current, open, create, duplicate, rename, remove, exportFile, importFile } = notebooks
  const [renaming, setRenaming] = React.useState(null) // { id, title }
  const [problem, setProblem] = React.useState(null)
  const fileRef = React.useRef(null)

  const openIt = (id) => {
    open(id)
    onOpened()
  }
  const finishRename = () => {
    if (renaming) rename(renaming.id, renaming.title)
    setRenaming(null)
  }
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    try {
      await importFile(file)
      setProblem(null)
      onOpened()
    } catch (err) {
      setProblem(err.message)
    }
  }

  return (
    <div className="notebooks-panel" style={style}>
      <div className="nb-title-bar">
        <h1 className="panel-title">Notebooks</h1>
        <p className="panel-subtitle">Kept on this device, saved as you write</p>
      </div>
      <div className="notebooks-list">
        <div className="notebooks-actions">
          <button type="button" className="tb-btn tb-btn-primary" onClick={() => { create(); onOpened() }}>
            New notebook
          </button>
          <button type="button" className="tb-btn" onClick={() => fileRef.current?.click()} title="A .composer-nb.json file">
            Import a file
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={pick} />
          {problem && <span className="notebooks-problem">{problem}</span>}
        </div>
        {list.map((nb) => (
          <div key={nb.id} className={"notebook-card" + (current?.id === nb.id ? " notebook-card-open" : "")}>
            {renaming?.id === nb.id ? (
              <input
                className="notebook-rename"
                value={renaming.title}
                autoFocus
                onChange={(e) => setRenaming({ id: nb.id, title: e.target.value })}
                onBlur={finishRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishRename()
                  if (e.key === "Escape") setRenaming(null)
                }}
              />
            ) : (
              <button type="button" className="notebook-title" onClick={() => openIt(nb.id)} title="Open it">
                {nb.title}
              </button>
            )}
            <div className="notebook-meta">
              {nb.cells.filter((c) => c.type === "music").length} music cell
              {nb.cells.filter((c) => c.type === "music").length === 1 ? "" : "s"} · {when(nb.updated)}
              {current?.id === nb.id ? " · open" : ""}
            </div>
            <div className="notebook-actions">
              {current?.id !== nb.id && (
                <button type="button" className="icon-btn" onClick={() => openIt(nb.id)}>
                  Open
                </button>
              )}
              <button type="button" className="icon-btn" onClick={() => setRenaming({ id: nb.id, title: nb.title })}>
                Rename
              </button>
              <button type="button" className="icon-btn" onClick={() => { duplicate(nb.id); onOpened() }}>
                Copy
              </button>
              <button type="button" className="icon-btn" onClick={() => exportFile(nb.id)} title="Download it as a file">
                Export
              </button>
              <button
                type="button"
                className="icon-btn icon-btn-danger"
                onClick={() => {
                  if (window.confirm(`Delete "${nb.title}"? This can't be undone.`)) remove(nb.id)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
