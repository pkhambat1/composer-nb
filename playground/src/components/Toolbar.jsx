// components/Toolbar.jsx — Top bar controls
import React from "react"
import { GROOVES, SECTIONS, plain } from "composer-nb/grooves"

// The + menu: a blank cell, or a starter from the library, which goes in with its words above it
function AddCellDropdown({ onAddCode, onAddText, onAddStarter }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef(null)

  React.useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", handler)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", handler)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const pick = (fn) => () => {
    fn()
    setOpen(false)
  }

  return (
    <div className="tb-dropdown-wrap" ref={ref}>
      <button
        className={"tb-btn" + (open ? " tb-btn-open" : "")}
        title="Add a cell at the end, or a starter from the library"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ fontWeight: 700, fontSize: 16, lineHeight: "14px" }}>+</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style={{ marginLeft: 2 }}>
          <path d="M1 2.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="tb-dropdown tb-dropdown-add" role="menu">
          <button className="tb-dropdown-item" onClick={pick(onAddCode)}>
            Music cell
          </button>
          <button className="tb-dropdown-item" onClick={pick(onAddText)}>
            Text cell
          </button>
          {SECTIONS.map((section) => (
            <React.Fragment key={section}>
              <div className="tb-dropdown-label">{section}</div>
              {GROOVES.filter((g) => g.section === section).map((g) => (
                <button
                  key={g.title}
                  className="tb-dropdown-item tb-dropdown-starter"
                  onClick={pick(() => onAddStarter(g))}
                  title="Goes in at the end of the notebook, and plays"
                >
                  <span className="starter-title">{g.title}</span>
                  <span className="starter-byline">{plain(g.byline)}</span>
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Toolbar({
  onAddCode,
  onAddText,
  onAddStarter,
  onRunAll,
  onStop,
  onShare,
  shared,
  onKeep,
  kernelStatus,
}) {
  const Icon = (children, viewBox = "0 0 16 16") => (
    <svg width="14" height="14" viewBox={viewBox} fill="currentColor">
      {children}
    </svg>
  )
  const btn = (title, onClick, children, opts = {}) => (
    <button
      className={
        "tb-btn" + (opts.primary ? " tb-btn-primary" : "") + (opts.danger ? " tb-btn-danger" : "")
      }
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )

  return (
    <div className="panel-header toolbar">
      <div className="toolbar-left">
        <div className="tb-group">
          <AddCellDropdown onAddCode={onAddCode} onAddText={onAddText} onAddStarter={onAddStarter} />
        </div>
        <div className="tb-group">
          {kernelStatus === "busy"
            ? btn(
                "Rendering — click to stop",
                onStop,
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle
                      cx="7"
                      cy="7"
                      r="5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeDasharray="6 6"
                      strokeLinecap="round"
                    >
                      <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from="0 7 7"
                        to="360 7 7"
                        dur="0.9s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Rendering&hellip;</span>
                </span>,
                { primary: true },
              )
            : btn(
                "Play every cell, top to bottom",
                onRunAll,
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {Icon(
                    <>
                      <polygon points="2,2 7,8 2,14" />
                      <polygon points="8,2 13,8 8,14" />
                    </>,
                  )}
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Play all</span>
                </span>,
                { primary: true },
              )}
        </div>
        <div className="tb-group">
          {btn(
            "Copy a link that opens this notebook",
            onShare,
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {Icon(
                <path
                  d="M6.5 9.5l3-3M7 11l-1.5 1.5a2.1 2.1 0 0 1-3-3L4 8M9 5l1.5-1.5a2.1 2.1 0 0 1 3 3L12 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />,
              )}
              <span style={{ fontSize: 12, fontWeight: 600 }}>{shared ? "Link copied" : "Share"}</span>
            </span>,
          )}
        </div>
        {onKeep && (
          <div className="tb-group">
            {btn(
              "Keep this notebook on this device",
              onKeep,
              <span style={{ fontSize: 12, fontWeight: 600 }}>Keep</span>,
            )}
          </div>
        )}
      </div>
    </div>
  )
}
