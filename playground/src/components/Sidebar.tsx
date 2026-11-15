// components/Sidebar.tsx — The left side: the notebooks, the reference, and at the foot the
// signed-in account with its menu (dark mode, keyboard shortcuts, sign out). The MCP App
// draws the same sidebar inside an assistant, where the host owns the account and the
// theme: it passes no account, and leaves out what it can't do.
import React from "react"
import { APP_CONSTANTS } from "../shared/constants.ts"

// What the sidebar needs of a notebook
type NotebookTab = { id: string; title: string }

export default function Sidebar({
  notebooks,
  onOpenNotebook,
  onNewNotebook,
  onRenameNotebook,
  onMoreNotebooks,
  logo = "/composer-mark.png",
  footer,
}: {
  notebooks: { list: NotebookTab[]; current: NotebookTab | null }
  onOpenNotebook: (id: string) => void
  onNewNotebook: () => void
  /** Without it, a notebook's name can't be changed here */
  onRenameNotebook?: (id: string, title: string) => void
  /** When the list has more notebooks than it shows */
  onMoreNotebooks?: () => void
  logo?: string
  /** What sits at the foot: the account menu, on the website */
  footer?: React.ReactNode
}) {
  const [renaming, setRenaming] = React.useState<{ id: string; title: string } | null>(null)
  const { list, current } = notebooks
  const finishRename = () => {
    if (renaming) onRenameNotebook?.(renaming.id, renaming.title)
    setRenaming(null)
  }

  return (
    <aside className="app-lhs" aria-label="Workspace">
      <div className="lhs-brand">
        <button type="button" className="lhs-brand-link" title="composer-nb">
          <img className="lhs-brand-logo" src={logo} width="28" height="28" alt="" />
          <span className="lhs-brand-title">
            Composer<span className="lhs-brand-ext">.nb</span>
          </span>
        </button>
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
                if (!onRenameNotebook) return
                event.preventDefault()
                setRenaming({ id: nb.id, title: nb.title })
              }}
              title={onRenameNotebook ? `${nb.title} — double-click to rename` : nb.title}
            >
              <span className="lhs-tab-label">{nb.title}</span>
            </button>
          ),
        )}
        {onMoreNotebooks && (
          <button type="button" className="lhs-tab" onClick={onMoreNotebooks}>
            <span className="lhs-tab-label">More notebooks…</span>
          </button>
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
      {footer}
    </aside>
  )
}
