// components/Sidebar.tsx — The left side: a notebook opened from a link, the notebooks on this
// device, the reference panels, and the one-click theme toggle
import React from "react"
import { APP_CONSTANTS } from "../shared/constants.ts"
import type { Notebook, Theme } from "../shared/types.ts"

export default function Sidebar({
  notebooks,
  onOpenNotebook,
  onNewNotebook,
  onRenameNotebook,
  theme,
  onSetTheme,
  accountEmail,
  onSignOut,
}: {
  notebooks: { list: Notebook[]; current: Notebook | null }
  onOpenNotebook: (id: string) => void
  onNewNotebook: () => void
  onRenameNotebook: (id: string, title: string) => void
  theme: Theme
  onSetTheme: (theme: Theme) => void
  accountEmail: string
  onSignOut: () => void
}) {
  const [renaming, setRenaming] = React.useState<{ id: string; title: string } | null>(null)
  const { list, current } = notebooks
  const finishRename = () => {
    if (renaming) onRenameNotebook(renaming.id, renaming.title)
    setRenaming(null)
  }

  return (
    <aside className="app-lhs" aria-label="Workspace">
      <div className="lhs-brand">
        <button type="button" className="lhs-brand-link" title="composer-nb">
          <img className="lhs-brand-logo" src="/composer-mark.png" width="28" height="28" alt="" />
          <span className="lhs-brand-title">
            Composer<span className="lhs-brand-ext">.nb</span>
          </span>
        </button>
        <div className="lhs-theme-wrap">
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => onSetTheme(theme === "light" ? "dark" : "light")}
            title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          >
            {theme === "light" ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M13.5 8.5a5.5 5.5 0 1 1-6-6 4 4 0 0 0 6 6z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
                <circle cx="8" cy="8" r="3" />
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <nav className="lhs-nav">
        {/* The notebooks kept on this device, the open one marked */}
        <div className="lhs-section">
          <span className="lhs-section-label">Notebooks</span>
          <button
            type="button"
            className="btn btn-ghost btn-icon lhs-section-btn"
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
        {list.map((nb) =>
          renaming?.id === nb.id ? (
            <input
              key={nb.id}
              className="lhs-tab lhs-tab-rename"
              aria-label="Notebook name"
              value={renaming.title}
              autoFocus
              onFocus={(event) => event.target.select()}
              onChange={(event) => setRenaming({ id: nb.id, title: event.target.value })}
              onBlur={finishRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") finishRename()
                if (event.key === "Escape") setRenaming(null)
              }}
            />
          ) : (
            <button
              key={nb.id}
              type="button"
              className={
                "lhs-tab lhs-tab-notebook" + (current?.id === nb.id ? " lhs-tab-active" : "")
              }
              onClick={() => onOpenNotebook(nb.id)}
              onDoubleClick={(event) => {
                event.preventDefault()
                setRenaming({ id: nb.id, title: nb.title })
              }}
              title={`${nb.title} — double-click to rename`}
            >
              <span className="lhs-tab-label">{nb.title}</span>
            </button>
          ),
        )}

        <div className="lhs-section">
          <span className="lhs-section-label">Reference</span>
        </div>
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
      <div className="lhs-account">
        <span className="lhs-account-email" title={accountEmail}>{accountEmail}</span>
        <button
          type="button"
          className="btn btn-secondary lhs-signout"
          onClick={() => {
            if (window.confirm("Sign out of Composer.nb?")) onSignOut()
          }}
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
