// components/Sidebar.jsx — Left sidebar navigation + theme popover
import React from "react"

const SIDE_TABS = [
  { id: "notebook", label: "Notebook", hint: "Cells & playback" },
  { id: "chords", label: "Chord library", hint: "Browse chord shapes" },
  { id: "docs", label: "Language", hint: "DSL reference" },
]

const THEMES = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
]

export default function Sidebar({ sideTab, onTabChange, theme, onSetTheme }) {
  const [themeOpen, setThemeOpen] = React.useState(false)
  const popRef = React.useRef(null)
  const btnRef = React.useRef(null)

  React.useEffect(() => {
    if (!themeOpen) return
    const handler = (e) => {
      if (
        popRef.current && !popRef.current.contains(e.target) &&
        btnRef.current && !btnRef.current.contains(e.target)
      ) {
        setThemeOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [themeOpen])

  return (
    <aside className="app-lhs" aria-label="Workspace">
      <div className="lhs-brand">
        <button
          type="button"
          className="lhs-brand-link"
          onClick={() => onTabChange("notebook")}
          title="Go to notebook"
        >
          <svg className="lhs-brand-logo" width="22" height="22" viewBox="0 0 24 24">
            <circle cx="9" cy="17" r="3" fill="var(--accent)" />
            <circle cx="18" cy="14" r="3" fill="var(--accent)" />
            <path d="M12 17V5l9-2v12" stroke="var(--accent)" strokeWidth="2" fill="none" />
          </svg>
          <span className="lhs-brand-title">Composer<span className="lhs-brand-ext">.nb</span></span>
        </button>
        <div className="lhs-theme-wrap">
          <button
            ref={btnRef}
            type="button"
            className={"lhs-theme-btn" + (themeOpen ? " lhs-theme-btn-open" : "")}
            onClick={() => setThemeOpen((v) => !v)}
            title="Appearance"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="5" r="2.5" />
              <path d="M1 14l4-6 3 4 2-2 5 4H1z" />
            </svg>
          </button>
          {themeOpen && (
            <div className="theme-popover" ref={popRef}>
              <div className="theme-popover-label">Appearance</div>
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={"theme-opt" + (theme === t.id ? " theme-opt-active" : "")}
                  onClick={() => { onSetTheme(t.id); setThemeOpen(false) }}
                >
                  {t.id === "light" ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="8" cy="8" r="3" />
                      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13.5 8.5a5.5 5.5 0 1 1-6-6 4 4 0 0 0 6 6z" />
                    </svg>
                  )}
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <nav className="lhs-nav">
        {SIDE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={"lhs-tab" + (sideTab === tab.id ? " lhs-tab-active" : "")}
            onClick={() => onTabChange(tab.id)}
            title={tab.hint}
          >
            <span className="lhs-tab-label">{tab.label}</span>
            <span className="lhs-tab-hint">{tab.hint}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
