// components/Sidebar.tsx — The left side: a notebook opened from a link, the notebooks on this
// device, the reference panels, and the theme popover
import React from "react"
import { APP_CONSTANTS } from "../shared/constants.ts"
import type { Notebook, Theme } from "../shared/types.ts"

// What the main panel shows: the open notebook, or the chord library
export type SideTab = "notebook" | "chords"

const THEMES: { id: Theme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
]

export default function Sidebar({
  notebooks,
  onOpenNotebook,
  onNewNotebook,
  sideTab,
  onTabChange,
  theme,
  onSetTheme,
}: {
  notebooks: { list: Notebook[]; current: Notebook | null }
  onOpenNotebook: (id: string) => void
  onNewNotebook: () => void
  sideTab: SideTab
  onTabChange: (tab: SideTab) => void
  theme: Theme
  onSetTheme: (theme: Theme) => void
}) {
  const [themeOpen, setThemeOpen] = React.useState(false)
  const popRef = React.useRef<HTMLDivElement>(null)
  const btnRef = React.useRef<HTMLButtonElement>(null)
  const { list, current } = notebooks
  const onNotebook = sideTab === "notebook"

  React.useEffect(() => {
    if (!themeOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        popRef.current &&
        !popRef.current.contains(target) &&
        btnRef.current &&
        !btnRef.current.contains(target)
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
          title="Go to the notebook"
        >
          <svg className="lhs-brand-logo" width="22" height="22" viewBox="0 0 24 24">
            <circle cx="9" cy="17" r="3" fill="var(--accent)" />
            <circle cx="18" cy="14" r="3" fill="var(--accent)" />
            <path d="M12 17V5l9-2v12" stroke="var(--accent)" strokeWidth="2" fill="none" />
          </svg>
          <span className="lhs-brand-title">
            Composer<span className="lhs-brand-ext">.nb</span>
          </span>
        </button>
        <div className="lhs-theme-wrap">
          <button
            ref={btnRef}
            type="button"
            className={"lhs-theme-btn" + (themeOpen ? " lhs-theme-btn-open" : "")}
            onClick={() => setThemeOpen((v) => !v)}
            title="Appearance"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
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
                  onClick={() => {
                    onSetTheme(t.id)
                    setThemeOpen(false)
                  }}
                >
                  {t.id === "light" ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="8" cy="8" r="3" />
                      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
                    </svg>
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
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
        {/* The notebooks kept on this device, the open one marked */}
        <div className="lhs-section">
          <span className="lhs-section-label">Notebooks</span>
          <button
            type="button"
            className="lhs-section-btn"
            onClick={onNewNotebook}
            title="New notebook"
            aria-label="New notebook"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M6 1.5v9M1.5 6h9" />
            </svg>
          </button>
        </div>
        {list.map((nb) => (
          <button
            key={nb.id}
            type="button"
            className={
              "lhs-tab lhs-tab-notebook" +
              (onNotebook && current?.id === nb.id ? " lhs-tab-active" : "")
            }
            onClick={() => onOpenNotebook(nb.id)}
            title={nb.title}
          >
            <span className="lhs-tab-label">{nb.title}</span>
          </button>
        ))}

        <div className="lhs-section">
          <span className="lhs-section-label">Reference</span>
        </div>
        <button
          type="button"
          className={"lhs-tab lhs-tab-ref" + (sideTab === "chords" ? " lhs-tab-active" : "")}
          onClick={() => onTabChange("chords")}
          title="Guitar chord shapes: click one to copy its name"
        >
          <span className="lhs-tab-label">Chord library</span>
        </button>
        <a
          className="lhs-tab lhs-tab-ref"
          href={APP_CONSTANTS.DOCS_URL}
          target="_blank"
          rel="noreferrer"
          title="The language reference, on the docs site"
        >
          <span className="lhs-tab-label">Docs ↗</span>
        </a>
      </nav>
    </aside>
  )
}
