// components/Sidebar.tsx — The left side: the notebooks, the reference, and at the foot the
// signed-in account with its menu (dark mode, keyboard shortcuts, sign out). The MCP App
// draws the same sidebar inside an assistant, where the host owns the account and the
// theme: it passes no account, and leaves out what it can't do.
//
// On a phone or in a narrow window the sidebar is a drawer: it slides in from the left
// over the notebook when the menu button at the top left is pressed, and slides away when
// a notebook is picked, the dimmed page is tapped or Escape is pressed.
import React from "react"
import { APP_CONSTANTS } from "../shared/constants.ts"

// What the sidebar needs of a notebook
type NotebookTab = { id: string; title: string }

// Matches the `max-width: 760px` block in app.css, where the sidebar becomes a drawer
const NARROW = "(max-width: 760px)"

function useNarrow(): boolean {
  const query = () => typeof window !== "undefined" && window.matchMedia(NARROW).matches
  const [narrow, setNarrow] = React.useState(query)
  React.useEffect(() => {
    const media = window.matchMedia(NARROW)
    const update = () => setNarrow(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  return narrow
}

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

  // The drawer, on narrow screens. Closed, it is inert, so Tab can't reach what's off screen.
  const narrow = useNarrow()
  const [open, setOpen] = React.useState(false)
  const drawerOpen = narrow && open
  const asideRef = React.useRef<HTMLElement>(null)
  const toggleRef = React.useRef<HTMLButtonElement>(null)
  const close = React.useCallback((refocus = false) => {
    setOpen(false)
    if (refocus) toggleRef.current?.focus()
  }, [])
  React.useEffect(() => {
    if (!narrow) setOpen(false)
  }, [narrow])
  React.useEffect(() => {
    if (asideRef.current) asideRef.current.inert = narrow && !open
  }, [narrow, open])
  React.useEffect(() => {
    if (!drawerOpen) return
    asideRef.current?.querySelector<HTMLElement>(".lhs-tab-active, .lhs-tab")?.focus()
    // Escape closes the drawer, unless it is closing something inside it first: the
    // account menu, or a notebook name being edited
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (asideRef.current?.querySelector(".account-menu, .lhs-tab-rename")) return
      close(true)
    }
    const root = document.documentElement
    const overflow = root.style.overflow
    root.style.overflow = "hidden"
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      root.style.overflow = overflow
    }
  }, [drawerOpen, close])

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="btn btn-ghost btn-icon lhs-toggle"
        onClick={() => setOpen(true)}
        aria-label="Open the sidebar"
        aria-expanded={drawerOpen}
        aria-controls="app-lhs"
        title="Notebooks"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M3 5h12M3 9h12M3 13h12" />
        </svg>
      </button>
      <div
        className={"lhs-scrim" + (drawerOpen ? " lhs-scrim-open" : "")}
        onClick={() => close(true)}
        aria-hidden="true"
      />
      <aside
        ref={asideRef}
        id="app-lhs"
        className={"app-lhs" + (drawerOpen ? " app-lhs-open" : "")}
        aria-label="Workspace"
      >
        <div className="lhs-brand">
          <button type="button" className="lhs-brand-link" title="composer-nb">
            <img className="lhs-brand-logo" src={logo} width="28" height="28" alt="" />
            <span className="lhs-brand-title">
              Composer<span className="lhs-brand-ext">.nb</span>
            </span>
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon lhs-close"
            onClick={() => close(true)}
            aria-label="Close the sidebar"
            title="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>

        <nav className="lhs-nav">
          {/* The notebooks kept on this device, the open one marked */}
          <div className="lhs-section">
            <span className="lhs-section-label">Notebooks</span>
            <button
              type="button"
              className="btn btn-ghost btn-icon lhs-section-btn"
              onClick={() => {
                close()
                onNewNotebook()
              }}
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
                onClick={() => {
                  close()
                  onOpenNotebook(nb.id)
                }}
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
    </>
  )
}
